# App ↔ sandbox protocol (apiVersion 1)

How the app's **pack host** talks to a pack's sandboxed frame. Pack authors never use this
directly: the runtime script the host injects implements `eyeread.*` on top of it. It's specified
so the host (omniship-labs/eyeread.in#122) and the runtime can be built and tested independently.

## Sandboxes

- The pack host is a hidden webview with **no Tauri capabilities**.
- Each sandbox is an isolated frame (opaque origin) that serves only that pack's own files, under a
  strict CSP: no `connect-src`, no remote images, fonts or scripts, no pop-ups, no navigation.
- The host starts one sandbox per permission that has internet access, and one shared sandbox for
  all offline permissions. Every sandbox loads the same `main` script.
- Sandboxes never talk to each other. The only channel is `postMessage` with the host.

## Envelope

Every message is a JSON-serializable object:

```jsonc
{ "v": 1, "type": "<type>" /* type-specific fields */ }
```

Unknown `type`s, or messages with `v !== 1`, are ignored and logged. Messages from anything other
than the host frame are ignored.

## Startup

1. **host → sandbox: `init`**
   ```jsonc
   {
     "v": 1,
     "type": "init",
     "pack": { "id": "com.example.foot-pedal", "version": "1.2.0", "name": "Foot Pedal" },
     "permissions": ["prompter:control"], // active AND allowed in THIS sandbox
     "network": false, // true only if this sandbox's permission has internet granted
     "settings": { "skipWords": 5 },
   }
   ```
2. The runtime defines `eyeread`, then runs `main`. `main` must call `eyeread.on(...)`
   synchronously while it loads.
3. **sandbox → host: `ready`**, listing the permissions `main` registered handlers for:
   ```jsonc
   { "v": 1, "type": "ready", "handlers": ["prompter:control"] }
   ```
4. The runtime calls each registered handler whose permission is in `init.permissions`. Handlers
   registered for other permissions are never called in this sandbox.

If `ready` doesn't arrive within 5 s, the host treats the sandbox as crashed (see Lifecycle).

## Calls (sandbox → host)

```jsonc
{
  "v": 1,
  "type": "call",
  "id": "c17",
  "permission": "prompter:control",
  "method": "prompter.control",
  "params": { "action": "toggle" },
}
```

- `id` is unique per sandbox. `permission` must be one of this sandbox's `init.permissions`, and
  `method` must belong to it (below); otherwise the host answers `permission_denied`.
- The host re-checks the user's current grants on **every** call, so a revoke takes effect
  immediately.

**host → sandbox: `result`**

```jsonc
{ "v": 1, "type": "result", "id": "c17", "ok": true, "value": { } }
{ "v": 1, "type": "result", "id": "c17", "ok": false, "error": { "code": "no_active_session", "message": "…" } }
```

`error.code` is an `ErrorCode` from `eyeread.d.ts`.

### Methods

| Permission         | Method               | params          | value                                     |
| ------------------ | -------------------- | --------------- | ----------------------------------------- |
| `scripts:write`    | `scripts.create`     | `ScriptInput`   | `{ scriptId }`                            |
| `prompter:load`    | `prompter.load`      | `ScriptInput`   | `{ scriptId }`                            |
| `prompter:control` | `prompter.control`   | `ControlAction` | `null`                                    |
| `prompter:events`  | `prompter.state`     | none            | `PrompterState`                           |
| `prompter:events`  | `prompter.subscribe` | none            | `null` (then `state` events)              |
| `files:import`     | `files.pick`         | none            | `ImportedFile` data or `null`             |
| any, with network  | `net.fetch`          | `{ url, init }` | `{ status, headers, body }` (body base64) |

For `files.pick`, the value is `{ name, type, size, body }` with `body` base64; the runtime wraps
it in `ImportedFile`. The file size is capped by `limits.json` `maxFileBytes`.

## Events (host → sandbox)

```jsonc
{ "v": 1, "type": "event", "event": "state", "data": { /* PrompterState */ } }
{ "v": 1, "type": "event", "event": "settings", "data": { "skipWords": 7 } }
```

- `state` is sent only to sandboxes that called `prompter.subscribe`, debounced to about 150 ms.
- `settings` is sent to every sandbox of the pack when the user changes a setting.

## Logging

```jsonc
{ "v": 1, "type": "log", "level": "info" | "warn" | "error", "message": "…" }
```

The runtime forwards `console.*` and unhandled rejections here. Shown in Developer mode (#126).

## Lifecycle

- Turning a pack off, revoking a permission, or changing its internet grant **destroys** the
  affected sandboxes. They're recreated with a fresh `init` if still allowed. There is no in-place
  update, so no permission ever outlives a revoke.
- A sandbox that doesn't send `ready`, stops answering a periodic `ping` within 5 s, or crashes
  three times within 10 minutes is stopped, and the pack is marked **crashed** in Settings.

```jsonc
{ "v": 1, "type": "ping", "id": "p3" }   // host → sandbox
{ "v": 1, "type": "pong", "id": "p3" }   // sandbox → host
```
