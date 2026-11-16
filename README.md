# DeskGlass

Dark-glass desktop widgets for **Windows 11**. The widgets live *on* your desktop, behind all your other windows, and survive
**Win+D** (Show desktop). The app's interface is in Dutch; this documentation is in English.

| Widget | What it does |
|---|---|
| **Clock** | Large clock with a Dutch date. 24-hour (`14:05`) or 12-hour (`2:05 PM`) format, optional seconds |
| **System** | CPU, RAM, GPU (NVIDIA), disk, network up/down, CPU temperature (shows `n/a` when unreadable) |
| **Weather** | Open-Meteo (no API key), configurable city, current + 3-day forecast, refreshes every 15 min, cached for offline |
| **Agenda & tasks** | Local to-do list plus upcoming events from an ICS URL (for example a Google Calendar secret iCal address), read-only |
| **Music** | Spotify now playing: cover art, title, artist, progress, play/pause/previous/next (Authorization Code + PKCE, no client secret) |
| **AI chat** | *Web mode (default):* claude.ai, chatgpt.com or gemini.google.com inside a locked-down view where you log in yourself. *API/local mode (optional):* streaming chat via the Anthropic API or any OpenAI-compatible endpoint such as Ollama |

## Download and install

Get the latest build from the [Releases page](https://github.com/ItsTheBoyLuc/deskglass/releases):

- `DeskGlass-Setup-<version>.exe` - installer (per user, no admin rights, desktop and Start menu shortcuts, clean uninstall)
- `DeskGlass-<version>-portable.exe` - a single file, no installation

> **SmartScreen warning:** the executables are not code-signed, so Windows shows "Windows protected your PC".
> Click **More info**, then **Run anyway**. Code signing is an optional future step.

After starting, DeskGlass lives in the **tray**: toggle each widget, lock/unlock, widget sizes, 12/24-hour clock, settings,
start with Windows, quit.

## Moving, resizing and locking

- **Unlocked (edit mode):** every widget has a dashed outline and a handle in the bottom-right corner. Drag a widget to move it, drag the handle to resize it
  (each widget has a minimum and maximum size). Size presets **S / M / L** are in the tray ("Formaat") and in Settings.
- **Locked:** position and size are frozen, and the outlines and handles disappear. Nothing else changes: widgets stay behind all other windows,
  survive Win+D, and every control (music buttons, task checkboxes, chat input, Settings) keeps working. Lock/unlock from the tray or Settings.
- Position and size are remembered per widget and per monitor, restored after a restart, and clamped back onto the screen if a monitor disappears.
  The lock state is remembered too.

## Settings

Tray, then **Instellingen...**

- **Clock:** 24-hour or 12-hour (AM/PM), seconds on/off. Changes apply immediately.
- **Weather:** city. **Agenda:** paste your secret iCal address (Google Calendar: *Settings, Integrate calendar, Secret address in iCal format*).
- **AI chat:** *Web chat* (Claude / ChatGPT / Gemini) or *API / local* (Anthropic key, or an OpenAI-compatible base URL and model, for example `http://localhost:11434/v1` for Ollama).
- Keys, tokens and the ICS URL are stored **encrypted** (Windows DPAPI through Electron `safeStorage`), never in plain JSON, never logged.
  An API key is only sent to `api.anthropic.com`, or to your own endpoint over https or localhost.

## Connecting Spotify

DeskGlass uses your own free Spotify developer app, so there is no client secret inside DeskGlass.

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and **Create app** (any name and description).
2. Select the **Web API**.
3. Under **Redirect URIs** add exactly `http://127.0.0.1:8898/callback` (`127.0.0.1`, not `localhost`, no https, port 8898) and save.
4. Copy the **Client ID** (32 characters).
5. In DeskGlass: Settings, *Muziek (Spotify)*: paste the Client ID, **Opslaan**, then **Verbinden met Spotify**. Approve in the browser that opens.

Scopes: `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`. The refresh token is stored encrypted and never logged;
**Ontkoppelen** deletes it.

- **Playback controls need Spotify Premium** for the owner of the Spotify app. Without Premium the widget stays read-only and says so.
- With no active device the widget shows "Open Spotify op een apparaat". Port 8898 must be free while connecting.

## AI chat (web mode)

The chat widget loads the chosen site (Claude, ChatGPT or Gemini) in its own isolated view with its own remembered session. **You log in on the site yourself.**
DeskGlass never reads or reuses your credentials or cookies and does not implement any "Log in with Claude/ChatGPT" OAuth flow.
The view can only navigate within the provider's own domains, other links open in your normal browser, and only clipboard write is allowed.
If Google or Apple sign-in is refused inside the embedded view, log in with e-mail (Gemini only offers Google sign-in, so use Claude or ChatGPT if it does not work).

## Desktop layer (important)

| Mode | Behaviour |
|---|---|
| **Desktop layer** (default, `auto`) | Widgets become part of the desktop itself: always behind all windows and they survive **Win+D**. A Windows limitation: such windows get **no real acrylic blur**, so a darker tint is used. |
| **Bottom** | A normal window pinned to the bottom, with real acrylic blur, but **Win+D hides the widgets**. Selectable in Settings (restart needed). |

`auto` tries the desktop layer and falls back to *bottom* if that fails.

## Build from source

Requires Node 22 or newer (and Windows 11 for the full experience).

```bash
npm ci            # install dependencies
npm run dev       # run with hot reload
npm test          # unit tests (vitest)
npm run typecheck
npm run dist      # build the installer and portable exe into dist/
```

`npm run dist` produces `DeskGlass-Setup-<version>.exe` and `DeskGlass-<version>-portable.exe` in `dist/`.
Stack: Electron + TypeScript, electron-vite (Vite + plain CSS), electron-builder, electron-store, systeminformation, koffi, node-ical.
See [SPEC.md](SPEC.md), [DESIGN.md](DESIGN.md) and [CLAUDE.md](CLAUDE.md).

## Releasing

A release is built automatically by GitHub Actions (`.github/workflows/release.yml`) when you push a version tag. The tag must match `version` in `package.json`.

```bash
git tag v1.0.1
git push --tags
```

The workflow runs `npm ci`, typecheck, tests and `npm run dist` on `windows-latest` and attaches both executables to a GitHub Release.
There is no auto-update. Optional later: code signing (a certificate plus `CSC_LINK` / `CSC_KEY_PASSWORD` as GitHub secrets) to reduce SmartScreen warnings.

## Continue on another PC

```bash
git clone https://github.com/ItsTheBoyLuc/deskglass.git
cd deskglass
npm ci
npm run dev
```

Then read `HANDOFF.md` (status per widget, what works, what is unverified, next steps) and `CLAUDE.md` (project context).
To keep working with Claude Code, the **ECC plugin** with the rules **`common` and `typescript`** must be installed on that machine.

## Privacy

Everything runs locally. Network traffic: Open-Meteo (your city, for the weather), your ICS URL, Spotify (if connected), and the AI service you choose.
No telemetry. Settings live in `%APPDATA%\DeskGlass`; the development build and the installed app share that folder.

## License

MIT
