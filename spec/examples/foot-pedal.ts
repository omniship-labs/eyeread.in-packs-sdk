// Type-level test of spec/eyeread.d.ts: a realistic pack plus misuses that
// must NOT compile (each marked @ts-expect-error). Checked by `npm test`.
import type {} from '../eyeread.d.ts';

declare function onPedal(callback: () => void): void;

eyeread.on('prompter:control', ({ prompter, settings, net }) => {
  const skip = settings.get<number>('skipWords');
  onPedal(() => {
    void prompter.control({ action: 'toggle' });
  });
  void prompter.control({ action: 'seek', wordIndex: skip });

  // @ts-expect-error seek needs a wordIndex
  void prompter.control({ action: 'seek' });
  // @ts-expect-error unknown action
  void prompter.control({ action: 'explode' });
  // net may be null (no internet granted), so it must be checked first
  // @ts-expect-error possibly null
  void net.fetch('https://api.example.com');
});

eyeread.on('scripts:write', async ({ scripts, net }) => {
  if (net) {
    const page = await (
      await net.fetch('https://api.notion.com/v1/pages/x')
    ).json<{
      title: string;
      text: string;
    }>();
    await scripts.create({ title: page.title, text: page.text });
  }
});

eyeread.on('scripts:write', (context) => {
  // @ts-expect-error a scripts:write handler gets no prompter API
  void context.prompter;
});

eyeread.on('prompter:events', ({ prompter }) => {
  const stop = prompter.onState((state) => {
    if (state.sessionActive && state.title !== null) console.log(state.title, state.wordIndex);
  });
  stop();
});

eyeread.on('files:import', async (context) => {
  const file = await context.files.pick();
  if (file) console.log(file.name, (await file.text()).length);
  // @ts-expect-error a files:import handler gets no scripts API
  void context.scripts;
});

// @ts-expect-error unknown permission
eyeread.on('library:read', () => {});
