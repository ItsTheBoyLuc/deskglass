# DeskGlass – project context for Claude Code

Windows 11 desktop-widgets app (clock, system stats, weather, agenda/tasks, AI chat). UI text Dutch, code and comments English.
Status and next steps: `HANDOFF.md`. Requirements: `SPEC.md`. Visual language: `DESIGN.md`.

## Stack
Electron + TypeScript, `electron-vite` (Vite, plain CSS, no UI framework), `electron-builder` (NSIS + portable), `electron-store`,
`systeminformation`, `koffi` (Win32), `node-ical`, `vitest`. Node >= 22. Main process is ESM, preload is CJS (sandboxed).

## Commands
- `npm ci` – install · `npm run dev` – run with HMR · `npm test` – vitest · `npm run typecheck`
- `npm run build` – compile to `out/` · `npm run dist` – installer + portable exe into `dist/` (gitignored)
- `npm run icon` – regenerate `resources/icon.png` and `build/icon.ico`

## Architecture (one line each)
- One renderer page, `index.html?w=<widget>`; `src/renderer/main.ts` mounts `widgets/<id>.ts`. DOM via `h()` (textContent only, never innerHTML).
- One frameless window per widget (`src/main/windows.ts`); secrets, network and files only in main; renderer sees only `window.deskglass` (`src/shared/ipc.ts`).
- `src/main/desktop.ts`: embeds windows into Progman (desktop layer) via koffi; falls back to HWND_BOTTOM pinning.
- Pure, unit-tested logic: `positions.ts`, `secrets.ts`, `shared/settings.ts`, `services/chat/{sse,providers}.ts`, `services/ics.ts`.

## Decisions worth knowing
- **Desktop layer**: embedding (Progman child) survives Win+D but a child window gets NO acrylic blur, so the CSS tint is raised (`body.flat`). Bottom mode has real acrylic but Win+D hides the widgets. Default `auto` = embed, fall back to bottom.
- Secrets use async `safeStorage` (sync API is deprecated in Electron 45). No plaintext fallback.
- The ICS URL is treated as a secret (encrypted). Keys are never sent to the renderer, only `hasChatKey/hasIcsUrl`.
- Dragging is main-driven (cursor polling), so it works in both desktop modes and with mixed DPI.
- Dev and installed builds share the same userData folder (`%APPDATA%\DeskGlass`).

## Conventions
Conventional commits (feat/fix/chore/docs/test). Commit small, push to `main`. Never commit keys, ICS URLs, `dist/`, `out/`.
TDD only for risky logic (see the pure modules above). Keep files < 800 lines, functions < 50. Immutable updates.
Use ECC (plugin + rules `common` and `typescript`) for plan, review and verification.
