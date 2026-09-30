// Input (keyboard and mouse) rules that the schema can't say. Mirrors the
// app's src-tauri/src/packs/manifest.rs (`InputDecl::too_wide`).

/** A pack that reaches the internet may read input only if it's narrow. */
export const NARROW_MAX_KEYS = 8;
export const NARROW_MAX_BUTTONS = 3;

/**
 * Why this `input` declaration is too wide to share a pack (or bundle) with
 * internet access, or null if it's narrow: it names its keys and buttons, has
 * no wheel or pointer position, and is focused-only.
 */
export function tooWide(input) {
  const { keyboard, mouse, scope } = input ?? {};
  if (keyboard) {
    const keys = keyboard.keys ?? [];
    if (keys.length === 0) return 'keyboard needs a keys list';
    if (keys.length > NARROW_MAX_KEYS) {
      return `keyboard can list at most ${NARROW_MAX_KEYS} keys`;
    }
  }
  if (mouse) {
    const buttons = mouse.buttons ?? [];
    if (buttons.length === 0) return 'mouse needs a buttons list';
    if (buttons.length > NARROW_MAX_BUTTONS) {
      return `mouse can list at most ${NARROW_MAX_BUTTONS} buttons`;
    }
    if (mouse.wheel) return "mouse can't ask for the wheel";
    if (mouse.position) return "mouse can't ask for pointer position";
  }
  if (scope === 'global') return "scope can't be global";
  return null;
}

/** Does this permission declare any internet sites? */
export const hasSites = (decl) => Array.isArray(decl?.network) && decl.network.length > 0;
