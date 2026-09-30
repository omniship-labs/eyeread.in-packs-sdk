// `submit` against real git repos (with a local bare repo as origin), a fake
// download and a fake `gh`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { buildPack } from '../src/build.js';
import {
  githubRepo,
  httpsRemote,
  manualLink,
  releaseAssetUrl,
  submit,
  SubmitError,
} from '../src/submit.js';

const REPO_URL = 'https://github.com/ada/hello';
const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
    cwd,
    stdio: 'pipe',
  })
    .toString()
    .trim();

const cleanups = [];
after(() => Promise.all(cleanups.map((f) => f())));

function manifest(version = '1.0.0') {
  return {
    apiVersion: 1,
    id: 'com.example.hello',
    name: 'Hello',
    version,
    description: 'Says hello.',
    author: { name: 'Ada Example' },
    license: 'MIT',
    main: 'main.js',
  };
}

/** A repo with the pack at `sub`, committed, tagged v1.0.0 and pushed to a bare origin. */
async function makeRepo(sub = '.') {
  const base = await mkdtemp(join(tmpdir(), 'eyeread-submit-test-'));
  cleanups.push(() => rm(base, { recursive: true, force: true }));
  const origin = join(base, 'origin.git');
  const work = join(base, 'work');
  git(base, 'init', '--quiet', '--bare', origin);
  git(base, 'init', '--quiet', '-b', 'main', work);
  git(work, 'remote', 'add', 'origin', origin);
  const packDir = join(work, sub);
  await mkdir(packDir, { recursive: true });
  await writeFile(join(packDir, 'pack.json'), JSON.stringify(manifest(), null, 2) + '\n');
  await writeFile(join(packDir, 'main.js'), 'eyeread.log("hello");\n');
  git(work, 'add', '-A');
  git(work, 'commit', '--quiet', '-m', 'pack');
  git(work, 'tag', '-a', 'v1.0.0', '-m', 'v1.0.0');
  git(work, 'push', '--quiet', 'origin', 'main', 'v1.0.0');
  return { work, packDir, commit: git(work, 'rev-parse', 'HEAD') };
}

const zipUrl = releaseAssetUrl('ada/hello', 'v1.0.0', 'com.example.hello-1.0.0.zip');

/** Deps that serve `zip` at the release URL and record `gh` calls. */
function fakes(zip, { ghLoggedIn = false, ghResponses = {} } = {}) {
  const calls = [];
  const lines = [];
  return {
    calls,
    lines,
    deps: {
      repoUrl: REPO_URL,
      log: (l) => lines.push(l),
      sleep: async () => {},
      fetch: async (url) =>
        url === zipUrl ? new Response(zip) : new Response('not found', { status: 404 }),
      gh: async (args) => {
        calls.push(args);
        const key = args.slice(0, 2).join(' ');
        if (key === 'auth status' && !ghLoggedIn) throw new Error('not logged in');
        for (const [prefix, value] of Object.entries(ghResponses)) {
          if (args.join(' ').startsWith(prefix)) {
            if (value instanceof Error) throw value;
            return value;
          }
        }
        return '';
      },
    },
  };
}

test('httpsRemote turns common remotes into clonable https URLs', () => {
  assert.equal(httpsRemote('git@github.com:ada/hello.git'), REPO_URL);
  assert.equal(httpsRemote('https://github.com/ada/hello.git'), REPO_URL);
  assert.equal(httpsRemote('ssh://git@github.com/ada/hello.git'), REPO_URL);
  assert.equal(
    httpsRemote('https://gitlab.com/ada/hello.git'),
    'https://gitlab.com/ada/hello.git'
  );
  assert.equal(httpsRemote('/tmp/origin.git'), null);
  assert.equal(httpsRemote('file:///tmp/origin.git'), null);
  assert.equal(githubRepo(REPO_URL), 'ada/hello');
  assert.equal(githubRepo('https://gitlab.com/ada/hello.git'), null);
});

test('dry run at a repo root: prints the entry and a link to add it by hand', async () => {
  const { packDir, commit } = await makeRepo();
  const { bytes, bundle } = await buildPack(packDir);
  const f = fakes(bytes);
  const { entry, pullRequest } = await submit(packDir, { dryRun: true }, f.deps);
  assert.equal(pullRequest, null);
  assert.deepEqual(entry, {
    repo: REPO_URL,
    tag: 'v1.0.0',
    commit,
    path: '.',
    url: zipUrl,
    packHash: bundle.top.packHash,
  });
  const out = f.lines.join('\n');
  assert.match(out, /packs\/com.example.hello\/1.0.0\/entry.json:/);
  assert.ok(out.includes(manualLink('com.example.hello', '1.0.0', entry)));
  assert.equal(f.calls.length, 0, 'dry run never calls gh');
});

test('a pack in a subfolder records its path', async () => {
  const { packDir } = await makeRepo('packs/hello');
  const { bytes } = await buildPack(packDir);
  const { entry } = await submit(packDir, { dryRun: true }, fakes(bytes).deps);
  assert.equal(entry.path, 'packs/hello');
});

test('opens the pull request with gh', async () => {
  const { packDir } = await makeRepo();
  const { bytes } = await buildPack(packDir);
  const f = fakes(bytes, {
    ghLoggedIn: true,
    ghResponses: {
      'api repos/omniship-labs/eyeread.in-packs/contents/': new Error('HTTP 404'),
      'api user': 'ada',
      'api repos/omniship-labs/eyeread.in-packs/git/ref/heads/main': 'abc123',
      'pr create': 'https://github.com/omniship-labs/eyeread.in-packs/pull/7',
    },
  });
  const { pullRequest } = await submit(packDir, {}, f.deps);
  assert.equal(pullRequest, 'https://github.com/omniship-labs/eyeread.in-packs/pull/7');

  const put = f.calls.find((c) => c.includes('PUT'));
  assert.ok(
    put.includes('repos/ada/eyeread.in-packs/contents/packs/com.example.hello/1.0.0/entry.json')
  );
  const content = put.find((a) => a.startsWith('content=')).slice('content='.length);
  assert.equal(JSON.parse(Buffer.from(content, 'base64').toString()).path, '.');
  const pr = f.calls.find((c) => c[0] === 'pr');
  assert.ok(pr.includes('ada:pack/com.example.hello-1.0.0'));
  assert.ok(pr.includes('Add com.example.hello@1.0.0'));
});

test('--release uploads the zip before checking it', async () => {
  const { packDir } = await makeRepo();
  const { bytes } = await buildPack(packDir);
  const f = fakes(bytes, {
    ghLoggedIn: true,
    ghResponses: {
      'release view': new Error('release not found'),
      'api repos/omniship-labs/eyeread.in-packs/contents/': new Error('HTTP 404'),
      'pr create': 'https://github.com/omniship-labs/eyeread.in-packs/pull/8',
    },
  });
  await submit(packDir, { release: true }, f.deps);
  const create = f.calls.find((c) => c[0] === 'release' && c[1] === 'create');
  assert.ok(create.includes('ada/hello'));
  assert.ok(create.some((a) => a.endsWith('com.example.hello-1.0.0.zip')));
});

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof SubmitError, err.stack);
    assert.match(err.message, pattern);
    return true;
  });
}

test('stops on uncommitted changes, a missing tag, or a folder that differs from the tag', async () => {
  const { work, packDir } = await makeRepo();
  const { bytes } = await buildPack(packDir);
  const { deps } = fakes(bytes);

  await rejects(
    submit(packDir, { dryRun: true, tag: 'v9.9.9' }, deps),
    /Tag v9.9.9 isn't on origin/
  );

  await writeFile(join(packDir, 'main.js'), 'eyeread.log("changed");\n');
  await rejects(submit(packDir, { dryRun: true }, deps), /uncommitted changes/);

  git(work, 'commit', '--quiet', '-am', 'change');
  await rejects(submit(packDir, { dryRun: true }, deps), /differs from tag v1.0.0/);
});

test("stops when the released zip isn't the same pack", async () => {
  const { packDir } = await makeRepo();
  const other = await mkdtemp(join(tmpdir(), 'eyeread-other-'));
  cleanups.push(() => rm(other, { recursive: true, force: true }));
  await writeFile(join(other, 'pack.json'), JSON.stringify(manifest(), null, 2) + '\n');
  await writeFile(join(other, 'main.js'), 'eyeread.log("other");\n');
  const { bytes } = await buildPack(other);
  await rejects(submit(packDir, { dryRun: true }, fakes(bytes).deps), /is a different pack/);
});

test('stops when the version is already submitted', async () => {
  const { packDir } = await makeRepo();
  const { bytes } = await buildPack(packDir);
  const f = fakes(bytes, {
    ghLoggedIn: true,
    ghResponses: { 'api repos/omniship-labs/eyeread.in-packs/contents/': 'sha' },
  });
  await rejects(submit(packDir, {}, f.deps), /already in omniship-labs\/eyeread.in-packs/);
});
