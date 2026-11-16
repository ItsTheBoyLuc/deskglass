# HANDOFF

Last updated: 2026-11-16 · branch `main` · version 1.0.0 (not tagged, not released)

## Status per widget

| Widget | Status | Verified how |
|---|---|---|
| Klok | works | seen on desktop (dev, unpacked, installed, portable); Dutch date, optional seconds |
| Systeem | works | CPU/RAM/disk at once, GPU (NVIDIA via `nvidia-smi`) after ~10 s, network after ~30 s (first `systeminformation` call is slow). CPU temp is `n/a` here (needs admin/WMI), by design |
| Weer | works | live Open-Meteo, cache + offline hint, TTL 14 min |
| Agenda/taken | works | tasks CRUD persisted; ICS via local mock server (recurrence, all-day, EXDATE); invalid URL / size cap / https downgrade covered by unit tests. **Not tried with a real Google iCal URL** |
| AI-chat | works | streaming verified against a local OpenAI-compatible mock (Bearer key sent); history race, empty reply, timeouts covered by tests. **Not tried against the real Anthropic API** (no key available) |
| Settings window | works | all groups render; secrets are write-only (placeholder shows "ingesteld") |
| Tray | works | seen on screen: toggles, lock, settings, autostart, quit |

## Shipped desktop mode
`auto` → **embedded in the desktop layer (Progman child via koffi)**. Verified on this PC (Win11 build 26300): widgets stay behind all windows,
survive **Win+D**, mouse input and dragging work. Cost: embedded child windows get **no acrylic blur** (OS limitation), so a darker CSS tint is used (`body.flat`).
Fallback / option `bottom`: top-level window pinned to HWND_BOTTOM with real acrylic, but **Win+D hides it** (tested).

## Verified (packaged builds, not just dev)
Installer (per-user silent install → shortcuts, app starts, embeds) · uninstall leaves nothing (folder, Start Menu, Run key, uninstall entry) ·
portable exe starts, 5 widgets · autostart on/off writes/removes `HKCU\...\Run` · single instance · positions persist and are clamped on restart ·
idle ≈ 0.2 % of 32 cores, ~800 MB working set summed over 9 Chromium processes · `npm audit --omit=dev`: 0 vulnerabilities ·
65 unit tests pass · code review + security review findings fixed.

## Known issues / unverified
1. **Multi-monitor**: per-monitor positions and clamping are unit-tested, but not tried on real hardware. Embedded windows use Progman-client coordinates: with a monitor left of/above the primary, positions may be offset. If so, set desktop mode to *Onderaan* and report it.
2. Not tested: mixed-DPI setups, GPU util on AMD/Intel (shows `n/a`; only NVIDIA via `nvidia-smi`), the real Anthropic API, a real Google Calendar URL.
3. Unsigned exe → SmartScreen warning (documented in README). No auto-update.
4. The GitHub Actions release workflow is written but **has never run**.
5. RAM: one Chromium renderer per widget (~90-120 MB each). Acceptable, could be trimmed.
6. Dev and installed app share `%APPDATA%\DeskGlass`.

## Next 3 steps
1. Try the installer on your own desktop (multi-monitor if you have one); report anything off.
2. Add a real Anthropic key + your Google ICS URL in Settings and confirm both.
3. When happy: `git tag v1.0.0 && git push --tags` (workflow builds and attaches both exes to a Release). I did **not** tag.

## How to resume
```bash
git clone https://github.com/ItsTheBoyLuc/deskglass.git && cd deskglass
npm ci && npm run dev      # app with HMR
npm test && npm run typecheck
npm run dist               # dist/DeskGlass-Setup-1.0.0.exe + DeskGlass-1.0.0-portable.exe
```
Install the ECC plugin + rules (`common`, `typescript`) on the machine. Context: `CLAUDE.md`. Requirements: `SPEC.md`. Look: `DESIGN.md`.
