// `eyeread.in-packs submit`: build the pack, work out its entry for
// omniship-labs/eyeread.in-packs (repo, tag, commit, folder, zip URL, pack
// hash), check the released zip is the same pack, and open the pull request
// with the `gh` CLI. Without `gh`, or with --dry-run, print the entry and a
// link to add it by hand.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MAX_ZIP_BYTES } from './archive.js';
import { buildPack } from './build.js';
import { validateZipBuffer } from './validate.js';

export const PACKS_REPO = 'omniship-labs/eyeread.in-packs';
const PACKS_BRANCH = 'main';

const exec = promisify(execFile);

export class SubmitError extends Error {}

/** Run a command, returning trimmed stdout. */
async function runCmd(cmd, args, opts = {}) {
  const { stdout } = await exec(cmd, args, {
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' },
    ...opts,
  });
  return stdout.trim();
}

const defaultDeps = {
  git: (args, cwd) => runCmd('git', args, { cwd }),
  gh: (args) => runCmd('gh', args),
  fetch: (url) => fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) }),
  log: (line) => console.log(line),
};

/**
 * A git remote as an `https://` URL anyone can clone, or null if it can't be
 * one (a local path, or a transport with no https equivalent).
 */
export function httpsRemote(remote) {
  let host;
  let path;
  const scp = remote.match(/^[^@/\s]+@([^:/\s]+):(.+)$/); // git@github.com:owner/repo.git
  if (scp) {
    [, host, path] = scp;
  } else {
    let url;
    try {
      url = new URL(remote);
    } catch {
      return null;
    }
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    host = url.hostname;
    path = url.pathname;
  }
  path = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!host || !path) return null;
  if (host === 'github.com') path = path.replace(/\.git$/, '');
  return `https://${host}/${path}`;
}

/** `owner/repo` for a github.com URL, else null. */
export function githubRepo(httpsUrl) {
  const m = httpsUrl?.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function releaseAssetUrl(repo, tag, name) {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
}

export function entryPath(id, version) {
  return `packs/${id}/${version}/entry.json`;
}

export function entryBytes(entry) {
  return JSON.stringify(entry, null, 2) + '\n';
}

/** A link that opens GitHub's "new file" page with the entry filled in. */
export function manualLink(id, version, entry) {
  const params = new URLSearchParams({
    filename: entryPath(id, version),
    value: entryBytes(entry),
  });
  return `https://github.com/${PACKS_REPO}/new/${PACKS_BRANCH}?${params}`;
}

export function pullRequestBody(pack, entry) {
  const m = pack.manifest;
  return `<!-- Opened by \`npx @omniship-labs/eyeread.in-packs submit\`. -->

## Pack

- **Pack:** ${m.id}@${m.version}
- **What it does:** ${m.description ?? m.name}
- **Update to a Verified pack?** <!-- yes/no. If yes, what changed and why -->

## Before you submit

- [x] \`npx @omniship-labs/eyeread.in-packs validate\` passes on the pack folder.
- [x] The zip is attached to a release for the tag, from
      \`npx @omniship-labs/eyeread.in-packs build\` at the commit in \`entry.json\`.
- [x] \`packHash\` is the hash \`build\` printed.
- [x] The zip URL downloads directly, is \`https://\`, and will never change.
- [ ] I've read the [content policy](https://github.com/omniship-labs/eyeread.in/blob/main/PACK_POLICY.md),
      and the description says every site the pack sends data to, what it sends and why.
- [ ] If anything is paid, the description says what's free, what's paid and where to buy.

Source: ${entry.repo}/tree/${entry.tag}${entry.path === '.' ? '' : `/${entry.path}`}
`;
}

async function download(url, deps) {
  let res;
  try {
    res = await deps.fetch(url);
  } catch (err) {
    throw new SubmitError(`couldn't download ${url} (${err.cause?.code ?? err.message})`);
  }
  if (!res.ok) throw new SubmitError(`couldn't download ${url} (HTTP ${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_ZIP_BYTES) throw new SubmitError(`${url} is larger than 20 MiB`);
  return bytes;
}

async function ghReady(deps) {
  try {
    await deps.gh(['auth', 'status']);
    return true;
  } catch {
    return false;
  }
}

/** Where the pack is in git, and the commit its tag points to. */
async function readGit(root, tag, deps) {
  const git = (args) => deps.git(args, root);
  let prefix;
  try {
    // The folder's path inside the repo, with a trailing slash ("" at the root).
    prefix = await git(['rev-parse', '--show-prefix']);
  } catch {
    throw new SubmitError(
      `${root} isn't in a git repository. Push the pack to a public repo first.`
    );
  }
  const path = prefix.replace(/\/$/, '') || '.';

  if (await git(['status', '--porcelain', '--', '.'])) {
    throw new SubmitError(
      'The pack folder has uncommitted changes. Commit them, tag the release, and push.'
    );
  }

  let remote;
  try {
    remote = await git(['remote', 'get-url', 'origin']);
  } catch {
    throw new SubmitError('The repo has no "origin" remote. Push it to a public repo first.');
  }
  const repo = deps.repoUrl ?? httpsRemote(remote);
  if (!repo)
    throw new SubmitError(`Can't turn the origin remote (${remote}) into an https:// URL.`);

  let listed;
  try {
    listed = await git([
      'ls-remote',
      '--tags',
      'origin',
      `refs/tags/${tag}`,
      `refs/tags/${tag}^{}`,
    ]);
  } catch (err) {
    throw new SubmitError(`Couldn't reach origin (${err.stderr?.trim() || err.message}).`);
  }
  const refs = new Map(
    listed
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t').reverse())
  );
  const commit = refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`);
  if (!commit) {
    throw new SubmitError(
      `Tag ${tag} isn't on origin. Tag the release and push it:\n  git tag ${tag}\n  git push origin ${tag}`
    );
  }
  // The folder as committed at the tag must be what we just built.
  try {
    await git(['diff', '--quiet', commit, '--', '.']);
  } catch {
    throw new SubmitError(
      `The pack folder differs from tag ${tag} (${commit.slice(0, 12)}). Check out the tag, or tag the current commit as a new version.`
    );
  }
  return { repo, commit, path };
}

/**
 * @param {string} root the pack folder
 * @param {{ tag?: string, url?: string, release?: boolean, dryRun?: boolean }} opts
 * @param {Partial<typeof defaultDeps> & { repoUrl?: string }} [overrides]
 */
export async function submit(root, opts = {}, overrides = {}) {
  const deps = { ...defaultDeps, ...overrides };
  const { log } = deps;

  const { bytes, bundle } = await buildPack(root, undefined);
  const pack = bundle.top;
  const { id, version } = pack.manifest;
  const tag = opts.tag ?? `v${version}`;
  log(`✓ built ${id}@${version}  ${pack.packHash}`);

  const { repo, commit, path } = await readGit(root, tag, deps);
  log(`✓ ${repo} tag ${tag} is ${commit.slice(0, 12)}, folder ${path}`);

  const gh = githubRepo(repo);
  const canUseGh = !opts.dryRun && (await ghReady(deps));

  // The zip: an explicit URL, or the release asset for the tag on GitHub.
  let url = opts.url;
  if (!url && gh) {
    const name = `${id}-${version}.zip`;
    url = releaseAssetUrl(gh, tag, name);
    if (opts.release) {
      if (!canUseGh) throw new SubmitError('--release needs the GitHub CLI (gh), logged in.');
      await publishRelease(gh, tag, name, bytes, deps);
    }
  }
  if (!url) {
    throw new SubmitError(
      'Where is the zip? Pass --url <https://…zip> with the URL where you published it.'
    );
  }

  const released = await validateZipBuffer(await download(url, deps), undefined);
  if (released.top.packHash !== pack.packHash) {
    throw new SubmitError(
      `The zip at ${url} is a different pack (hash ${released.top.packHash}) from the folder at ${tag}. Rebuild it from the tag and upload it again.`
    );
  }
  log(`✓ ${url} matches`);

  const entry = { repo, tag, commit, path, url, packHash: pack.packHash };

  if (!canUseGh) {
    log('');
    log(`${entryPath(id, version)}:`);
    log(entryBytes(entry).trimEnd());
    log('');
    log(
      `Add it to ${PACKS_REPO} in a pull request. This link opens GitHub with the file filled in:`
    );
    log(manualLink(id, version, entry));
    return { entry, pullRequest: null };
  }
  const pullRequest = await openPullRequest(pack, entry, deps);
  log(`✓ opened ${pullRequest}`);
  return { entry, pullRequest };
}

async function publishRelease(repo, tag, name, bytes, deps) {
  const dir = await mkdtemp(join(tmpdir(), 'eyeread-submit-'));
  try {
    const file = join(dir, name);
    await writeFile(file, bytes);
    let exists = true;
    try {
      await deps.gh(['release', 'view', tag, '--repo', repo, '--json', 'tagName']);
    } catch {
      exists = false;
    }
    if (exists) {
      await deps.gh(['release', 'upload', tag, file, '--repo', repo]);
      deps.log(`✓ uploaded ${name} to release ${tag}`);
    } else {
      await deps.gh([
        'release',
        'create',
        tag,
        file,
        '--repo',
        repo,
        '--title',
        tag,
        '--notes',
        '',
        '--verify-tag',
      ]);
      deps.log(`✓ created release ${tag} with ${name}`);
    }
  } catch (err) {
    throw new SubmitError(
      `Couldn't publish the release (${err.stderr?.trim() || err.message}).`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function retry(fn, deps, attempts = 5) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      await (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(2000 * i);
    }
  }
}

async function openPullRequest(pack, entry, deps) {
  const { id, version } = pack.manifest;
  const gh = deps.gh;
  const file = entryPath(id, version);
  try {
    await gh(['api', `repos/${PACKS_REPO}/contents/${file}`, '--jq', '.sha']);
    throw new SubmitError(
      `${id}@${version} is already in ${PACKS_REPO}. Submit a new version instead.`
    );
  } catch (err) {
    if (err instanceof SubmitError) throw err;
    // 404: not there yet.
  }

  try {
    const user = await gh(['api', 'user', '--jq', '.login']);
    const upstreamSha = await gh([
      'api',
      `repos/${PACKS_REPO}/git/ref/heads/${PACKS_BRANCH}`,
      '--jq',
      '.object.sha',
    ]);
    // A fork to push the branch to. Forking again is a no-op; syncing makes
    // sure it has the upstream commit the branch starts from.
    await gh(['repo', 'fork', PACKS_REPO, '--clone=false']);
    const fork = `${user}/${PACKS_REPO.split('/')[1]}`;
    // A new fork takes a few seconds to appear.
    await retry(
      () =>
        gh([
          'api',
          '-X',
          'POST',
          `repos/${fork}/merge-upstream`,
          '-f',
          `branch=${PACKS_BRANCH}`,
        ]),
      deps
    );
    const branch = `pack/${id}-${version}`;
    try {
      await gh([
        'api',
        '-X',
        'POST',
        `repos/${fork}/git/refs`,
        '-f',
        `ref=refs/heads/${branch}`,
        '-f',
        `sha=${upstreamSha}`,
      ]);
    } catch {
      // Left over from an earlier attempt: start it again from upstream.
      await gh([
        'api',
        '-X',
        'PATCH',
        `repos/${fork}/git/refs/heads/${branch}`,
        '-f',
        `sha=${upstreamSha}`,
        '-F',
        'force=true',
      ]);
    }
    await gh([
      'api',
      '-X',
      'PUT',
      `repos/${fork}/contents/${file}`,
      '-f',
      `message=Add ${id}@${version}`,
      '-f',
      `branch=${branch}`,
      '-f',
      `content=${Buffer.from(entryBytes(entry)).toString('base64')}`,
    ]);
    return await gh([
      'pr',
      'create',
      '--repo',
      PACKS_REPO,
      '--base',
      PACKS_BRANCH,
      '--head',
      `${user}:${branch}`,
      '--title',
      `Add ${id}@${version}`,
      '--body',
      pullRequestBody(pack, entry),
    ]);
  } catch (err) {
    throw new SubmitError(
      `Couldn't open the pull request (${err.stderr?.trim() || err.message}).`
    );
  }
}
