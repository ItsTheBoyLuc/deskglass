# DeskGlass – SPEC

Windows 11 desktop-widgets app. Dark-glass widgets live ON the desktop (behind all windows).
UI text Dutch, code/comments English. Plan source: user brief (see HANDOFF.md for status).

## Stack
Electron + TypeScript, `electron-vite` (Vite, plain CSS renderer, no UI framework), `electron-builder` (NSIS + portable),
`electron-store` (settings/positions/tasks), `systeminformation`, `koffi` (WorkerW / HWND_BOTTOM), `node-ical`, `vitest`.
AI streaming = plain `fetch` + one shared SSE parser (no SDK).

## Search-first decisions
| Need | Decision |
|---|---|
| Scaffold | Adopt `electron-vite` (multi-process Vite config, dev HMR) |
| Persistence | Adopt `electron-store` |
| System stats | Adopt `systeminformation` |
| Native Win32 | Adopt `koffi` (no node-gyp, prebuilt) |
| ICS + RRULE | Adopt `node-ical`, thin wrapper only |
| Anthropic/OpenAI | Build thin `fetch` clients (SSE is ~40 lines; avoids 2 SDKs) |
| Weather | Open-Meteo REST (no key) |

## Architecture
- One renderer page, loaded per window as `index.html?w=<id>`; `main.ts` mounts `widgets/<id>.ts`.
- One frameless `BrowserWindow` per widget (`clock|stats|weather|agenda|music|chat`) plus a normal `settings` window.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer talks only via `window.deskglass` (preload, typed in `src/shared/ipc.ts`).
- All network, keys, files live in main. Renderer CSP: `connect-src 'none'`.
- Dragging = pointer events -> IPC -> main moves window (works for both desktop modes).

```
src/main      index, windows, positions(pure), store, secrets, desktop(koffi), tray, ipc, services/{stats,weather,ics,tasks,chat/*}
src/preload   index.ts
src/renderer  index.html, main.ts, widgets/*.ts, styles/*.css
src/shared    types.ts, ipc.ts
tests         positions, secrets, ics, sse/chat parsing
```

## Behavior contracts
- **Positions**: stored per widget *and* per display id (`positions[widget][displayId]={x,y}`); on show / display change, clamp into the nearest display's `workArea`; missing monitor -> primary display.
- **Settings**: electron-store JSON, no secrets. API key encrypted with `safeStorage`, stored as base64 ciphertext; never returned to renderer (only `hasKey`), never logged. If `safeStorage` is unavailable, refuse to save (no plaintext fallback).
- **Stats**: poll 1.5 s only while stats window visible; every metric `number | null`; null -> "n/a". Errors caught per metric.
- **Weather**: Open-Meteo geocoding + forecast, 15 min refresh, last result cached in store, shown (with "offline" hint) on failure.
- **Agenda**: tasks local (CRUD, persisted). ICS URL fetched in main (https/http only, 10 s timeout, 5 MB cap), parsed with node-ical, next 7 days incl. recurrences; invalid URL / network error -> inline Dutch error, cached events still shown.
- **Chat**: providers `anthropic` (key) or `openai-compat` (baseUrl+model, optional key). Streaming via `chat:chunk` events, cancel, per-session history in memory, "nieuwe chat" resets. Keys main-only.
- **Desktop layer**: try WorkerW embed (koffi); verify (parent set, window visible); else fallback `setAlwaysOnBottom` + HWND_BOTTOM every 2 s and re-pin on `blur/minimize/show`. Mode reported in tray + HANDOFF.
- **Lock mode**: tray toggle. Unlocked = outline + draggable; locked = `setIgnoreMouseEvents(true)` where possible (chat/agenda/settings need input -> only click-through the non-interactive widgets; interactive widgets stay clickable but not draggable).
- **Tray**: toggle each widget, lock/unlock, settings, autostart, quit. Single instance lock. Autostart via `app.setLoginItemSettings`.

## v1.1 additions (resize, Spotify, web chat)
- **Resize**: transparent frameless windows cannot be resized natively -> renderer corner handle (edit mode) -> IPC start/end -> main follows the cursor and `setBounds` (32 ms, only on change). Per-widget min/max (`WIDGET_LIMITS`), clamped to the monitor; S/M/L presets (`WIDGET_PRESETS`) via tray + settings. Size persisted per widget per monitor next to the position (`positions.ts`: `clampSize`, `resolveBounds`, `rememberBounds`). Content scales with CSS container queries (`cq*` units).
- **Spotify** (`services/spotify/`): Authorization Code + PKCE, no client secret. `pkce.ts` (verifier/challenge/state/auth URL), `connect.ts` (one-shot loopback server on 127.0.0.1:8898, /callback only, state check, 3 min timeout), `tokens.ts` (refresh with 60 s margin, shared in-flight refresh, invalid_grant => forget token => reconnect prompt, refresh token via safeStorage only), `api.ts` (player + controls; 401 => refresh once; 429 => Retry-After; 403 PREMIUM_REQUIRED => read-only notice; 204/404 => no active device), `art.ts` (cover fetched in main from Spotify CDN hosts only, data: URI + average colour accent), polling 4 s only while the widget is visible; progress interpolated in the renderer.
- **Web chat** (default chat mode): `WebContentsView` (partition `persist:ai-chat`, no preload, sandbox) under a 44 px header and 18 px footer strip. Navigation allowlist per provider (`shared/webproviders.ts`), other links -> system browser, only clipboard permission, normal Chrome UA. We never read or reuse the site's cookies/tokens and implement no OAuth for Claude/ChatGPT/Gemini.
- Not done (v1.1): Windows media-session fallback for Spotify.

## Task list (status in HANDOFF.md)
1. [x] Repo + .gitignore
2. [x] Scaffold electron-vite, vitest, lint/typecheck scripts
3. [x] Core: store, positions (TDD), windows, tray, desktop layer, lock mode, preload/IPC
4. [x] Clock -> Stats -> Weather -> Agenda (ICS TDD) -> Chat (SSE + secrets TDD); review each
5. [x] Settings window (city, ICS URL, AI provider, clock seconds, autostart)
6. [x] Icon, electron-builder (nsis + portable), `npm run dist`
7. [x] Release workflow, README, CLAUDE.md, HANDOFF.md
8. [x] security review, verification loop, packaged smoke test, perf check

## Non-goals (v1)
Auto-update, code signing, macOS/Linux, widget resizing, ICS write access, multi-calendar.
