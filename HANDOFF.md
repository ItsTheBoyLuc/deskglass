# HANDOFF

Last updated: 2026-11-16 · branch `main` · version **1.0.1** (v1.0.0 was released earlier; v1.0.1 release approved by the user, see Releases: https://github.com/ItsTheBoyLuc/deskglass/releases)
Scope now includes the second brief: resizable widgets (S/M/L), Spotify widget (PKCE), web-chat mode (default).

## v1.0.1 (lock fix + clock format)
- **Lock bug fixed.** Cause (reproduced): locking called `setIgnoreMouseEvents(true)` on the clock, stats and weather windows. Electron implements that by switching WS_EX_LAYERED/WS_EX_TRANSPARENT on the HWND, which turned the embedded widgets into **empty grey acrylic blocks drawn over other windows**. That call is gone. Lock now only freezes position and size (pure `gestureBounds` in `positions.ts`, tested), hides outline + resize handles, disables the S/M/L presets (tray "Formaat" greyed, settings buttons disabled), and saves all bounds when locking. No click-through, no z-order or visibility change; all controls stay clickable. The lock state persists.
- **Clock 12h/24h:** `formatClock()` in `src/shared/clock.ts` (tested: midnight 12:00 AM, noon 12:00 PM, no leading zero in 12h, seconds in both). Setting `clockHour12` (default false), Settings select "Klok: tijdnotatie" + tray checkbox, applies live. Seconds render as ":SS", AM/PM small next to the time.
- README rewritten in English (app UI stays Dutch).
- Verified live (dev build, embedded mode): 3 lock/unlock cycles with the Claude window open on top (nothing drawn over it), locked + Win+D (all six widgets visible with content), geometry identical before/after cycles, gestures and presets refused while locked, unlocked gesture starts again, 12/24h and seconds combinations apply live. 126 unit tests.
- **Not verified:** a real mouse drag/resize while locked/unlocked (the mouse tool could not move the cursor; the lock guard is unit-tested and the IPC gesture path was checked via logs); the bottom (non-embedded) mode with lock; multi-monitor.

## Status per widget

| Widget | Status | Verified how |
|---|---|---|
| Klok | works | seen on desktop; scales with size (container queries); Dutch date, optional seconds |
| Systeem | works | CPU/RAM/disk at once, GPU (NVIDIA via `nvidia-smi`) after ~10 s, network after ~30 s, CPU temp `n/a` here (by design). Meters update instantly (an animated bar kept the GPU at ~20 fps, see Perf) |
| Weer | works | live Open-Meteo, cache + offline hint |
| Agenda/taken | works | tasks persisted; ICS tested against a local mock server + unit tests. **Not tried with a real Google iCal URL** |
| Muziek (Spotify) | built, **not tested against real Spotify** | 32 unit tests (PKCE vector, token refresh/rotation/revocation/back-off, 429 Retry-After, 401 retry, 204/404 no device, 403 Premium, loopback flow with wrong state/replay/timeout/port taken). Live: loopback server on 127.0.0.1:8898 listens, wrong state -> 400, other path -> 404, widgets cannot start connect. UI previewed with a fake track at S/M/L. **No real account/Client ID was available** |
| AI-chat | web mode works; API mode tested with a mock | Web: claude.ai loads inside the widget (also while embedded in the desktop layer). **Login on each site not tested** (only the claude.ai login page loaded). API mode: streaming against a local OpenAI-compatible mock |
| Settings, tray | work | tray menu incl. *Formaat* S/M/L seen; settings sections (Formaat, Spotify, AI modus) render |

## Resizing
Edit mode (unlocked): dashed outline + corner handle. Locked: position and size frozen, nothing else changes. Renderer -> IPC start/end, main follows the cursor and `setBounds` (32 ms, only on change), per-widget min/max, clamped to the monitor, saved per widget per monitor (`positions.ts`). S/M/L via tray + settings. Verified while embedded: shrink to min, grow, presets, size persists after restart (packaged build). A **watchdog** ends a gesture if no mouse button is down (lost pointerup, release over the web view).
**Not verified:** a real mouse-driven resize after the watchdog was added (the mouse tool stopped moving the cursor late in the session); the earlier real-cursor resize (before the watchdog) worked. Multi-monitor / mixed DPI untested.

## Shipped desktop mode
`auto` -> embedded in the desktop layer (Progman child via koffi): behind all windows, survives Win+D, input + dragging + resizing work. Cost: no acrylic blur for child windows (darker tint instead). `bottom` mode has real acrylic but Win+D hides the widgets (tested).

## Verified (packaged builds)
Installer install/uninstall clean (earlier build) · portable/unpacked start with 6 widgets + web view, embedded · autostart on/off (registry) · sizes + positions persist · 118 unit tests · typecheck · `npm audit --omit=dev` clean (earlier) · code + security reviews done twice, findings fixed.
Idle (packaged, all widgets, claude.ai login page loaded): ~0.2 % of 32 cores, ~1.4 GB RAM summed over 13 Chromium processes.

## Release notes (2026-11-16)
- First tag push failed in CI: `.gitignore` had `secrets.*`, which also ignored `src/main/secrets.ts` and `tests/secrets.test.ts`, so a fresh clone did not compile (it built locally only because the files existed on disk). Fixed: pattern is now root-only (`/secrets.*`) with explicit un-ignores. Lesson: always verify with a fresh clone (`git clone` + `npm ci` + `npm run typecheck` + `npm test`).
- Secret scan of tracked files: no keys, tokens, ICS URLs or real Client IDs (only fake test fixtures).

## Known issues / unverified
1. Spotify against a real account (Client ID, Premium vs free, device selection); the redirect URI **http://127.0.0.1:8898/callback** must be registered exactly.
2. Embedded login per AI site. Google/Apple sign-in is often refused in embedded browsers; use e-mail login (Claude/ChatGPT). Gemini only has Google login -> may not work. Blocked navigations (e.g. "sign in with Google") open in the system browser after a click.
3. Multi-monitor placement for embedded windows (Progman-client coordinates) and mixed DPI.
4. GPU util only NVIDIA; CPU temp usually `n/a`.
5. Windows media-session fallback for Spotify: skipped.
6. Unsigned exe (SmartScreen). Release workflow never run. `grantFileProtocolExtraPrivileges` fuse left on (renderer uses file://).
7. Dev and installed app share `%APPDATA%\DeskGlass`.

## Perf note (for future UI work)
Do not animate `width`/`height` or run CSS transitions on a widget that updates regularly: each frame re-composites a layered desktop window (GPU ~20-40 % of a core). Use instant updates or, sparingly, `transform` on rarely-changing elements.

## Next 3 steps
1. Install `dist/DeskGlass-Setup-1.0.0.exe`, create a Spotify app (README steps), connect, and confirm now-playing + controls.
2. Log in to Claude/ChatGPT in the chat widget; try resizing every widget with the mouse (also on a second monitor if you have one).
3. Download the exes from the Releases page and try them (SmartScreen: More info > Run anyway). For further releases bump `version` in package.json (and the lockfile), tag `vX.Y.Z` (the tag must match the version) and push the tag.

## How to resume
```bash
git clone https://github.com/ItsTheBoyLuc/deskglass.git && cd deskglass
npm ci && npm run dev
npm test && npm run typecheck
npm run dist      # dist/DeskGlass-Setup-1.0.0.exe + DeskGlass-1.0.0-portable.exe
```
Install the ECC plugin + rules (`common`, `typescript`). Context: `CLAUDE.md`. Requirements: `SPEC.md`. Look: `DESIGN.md`.
