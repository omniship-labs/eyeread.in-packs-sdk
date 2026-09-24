/**
 * The `eyeread.*` API available to pack code (apiVersion 1).
 *
 * A pack's `main` script is loaded once per sandbox. The app runs a separate
 * sandbox for each permission that has internet access, and one shared sandbox
 * for all offline permissions. Only the handlers registered for the
 * permissions active in that sandbox are called, and each handler receives
 * only its own permission's API.
 *
 * Register handlers synchronously at the top level of `main`:
 *
 *   eyeread.on('prompter:control', ({ prompter }) => {
 *     onPedal(() => prompter.control({ action: 'toggle' }));
 *   });
 */

export type Permission =
  'scripts:write' | 'prompter:load' | 'prompter:control' | 'prompter:events' | 'files:import';

/** Error codes a call can reject with (`EyereadError.code`). */
export type ErrorCode =
  /** The user hasn't allowed this permission (or revoked it). */
  | 'permission_denied'
  /** The site isn't declared for this permission in pack.json. */
  | 'network_not_declared'
  /** The site is declared, but the user hasn't turned internet on for this permission. */
  | 'network_not_granted'
  /** No reading session is open (prompter:control). */
  | 'no_active_session'
  | 'invalid_params'
  | 'too_large'
  | 'rate_limited'
  | 'timeout'
  /** The user dismissed a picker or prompt. */
  | 'cancelled'
  /** The app couldn't complete the call (e.g. a window isn't loaded). */
  | 'unavailable';

export interface EyereadError extends Error {
  readonly name: 'EyereadError';
  readonly code: ErrorCode;
}

// ---- shared ---------------------------------------------------------------------

export type Unsubscribe = () => void;

export type SettingValue = boolean | number | string;

export interface Settings {
  /** Current value of a declared setting (the user's choice, or its default). */
  get<T extends SettingValue = SettingValue>(key: string): T;
  all(): Readonly<Record<string, SettingValue>>;
  /** Called when the user changes any of this pack's settings. */
  onChange(listener: (settings: Readonly<Record<string, SettingValue>>) => void): Unsubscribe;
}

export interface NetResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Readonly<Record<string, string>>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  bytes(): Promise<Uint8Array>;
}

export interface NetRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /** Milliseconds; the app caps this. */
  timeout?: number;
}

/**
 * Internet access, proxied and checked by the app. Only https URLs on sites
 * declared for this permission, and only after the user turns internet on for
 * it. Redirects to other hosts are refused. Every request appears in the pack's
 * network log.
 */
export interface Net {
  fetch(url: string, init?: NetRequestInit): Promise<NetResponse>;
}

interface BaseContext {
  readonly permission: Permission;
  readonly settings: Settings;
  /** Present only when this permission declares sites AND the user turned internet on for it. */
  readonly net: Net | null;
}

// ---- per-permission contexts ----------------------------------------------------

export interface ScriptInput {
  /** Required, non-empty. */
  text: string;
  /** Up to 200 characters. Defaults to "From <pack name>". */
  title?: string;
  /** BCP-47 tag for voice tracking, e.g. "en-US". */
  language?: string;
}

export interface ScriptsWriteContext extends BaseContext {
  readonly permission: 'scripts:write';
  readonly scripts: {
    /** Adds a script to the user's library, labeled with this pack as its source. */
    create(input: ScriptInput): Promise<{ scriptId: string }>;
  };
}

export interface PrompterLoadContext extends BaseContext {
  readonly permission: 'prompter:load';
  readonly prompter: {
    /**
     * Saves the script to the library and opens it in the prompter, through the
     * same path as the user pressing Start reading (permissions, placement and
     * screen-share protection all apply).
     */
    load(input: ScriptInput): Promise<{ scriptId: string }>;
  };
}

export type ControlAction =
  | { action: 'play' | 'pause' | 'toggle' | 'restart' | 'close' }
  | { action: 'seek'; wordIndex: number };

export interface PrompterControlContext extends BaseContext {
  readonly permission: 'prompter:control';
  readonly prompter: {
    /** Rejects with `no_active_session` when the prompter isn't open. */
    control(command: ControlAction): Promise<void>;
  };
}

export interface PrompterState {
  readonly sessionActive: boolean;
  readonly playing: boolean;
  /** null when no session is active. */
  readonly scriptId: string | null;
  /** null when no session is active. */
  readonly title: string | null;
  readonly wordIndex: number;
  readonly wordCount: number;
}

export interface PrompterEventsContext extends BaseContext {
  readonly permission: 'prompter:events';
  readonly prompter: {
    state(): Promise<PrompterState>;
    /** Called on every change (debounced by the app). */
    onState(listener: (state: PrompterState) => void): Unsubscribe;
  };
}

export interface ImportedFile {
  readonly name: string;
  /** MIME type as reported by the OS; may be empty. */
  readonly type: string;
  readonly size: number;
  text(): Promise<string>;
  bytes(): Promise<Uint8Array>;
}

export interface FilesImportContext extends BaseContext {
  readonly permission: 'files:import';
  readonly files: {
    /**
     * Shows the app's own file picker, filtered to the extensions declared in
     * pack.json (`permissions["files:import"].accept`). Resolves with the one
     * file the user chose, or null if they cancelled. No paths are exposed.
     */
    pick(): Promise<ImportedFile | null>;
  };
}

export interface ContextFor {
  'scripts:write': ScriptsWriteContext;
  'prompter:load': PrompterLoadContext;
  'prompter:control': PrompterControlContext;
  'prompter:events': PrompterEventsContext;
  'files:import': FilesImportContext;
}

export interface Eyeread {
  /** Version of this API, matching `apiVersion` in pack.json. */
  readonly apiVersion: 1;
  /**
   * Register the code for one permission. Called at most once per permission,
   * when the pack starts in a sandbox where that permission is active and allowed.
   * The handler may return a promise; rejections are logged to the pack's log panel.
   */
  on<P extends Permission>(
    permission: P,
    handler: (context: ContextFor[P]) => void | Promise<void>
  ): void;
}

declare global {
  const eyeread: Eyeread;
}
