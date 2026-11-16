# DeskGlass

Donkere glas-widgets die **op je bureaublad** leven (achter al je vensters) voor Windows 11:
klok + datum, systeemstatistieken, weer, agenda/taken en een AI-chat. UI in het Nederlands.

| Widget | Wat |
|---|---|
| Klok | Grote klok + Nederlandse datum, optioneel seconden |
| Systeem | CPU, RAM, GPU (NVIDIA), schijf, netwerk ↑↓, CPU-temp (of `n/a`) |
| Weer | Open-Meteo (geen sleutel), huidig + 3 dagen, 15 min verversen, offline-cache |
| Agenda & taken | Lokale takenlijst + afspraken uit een (geheim) ICS-adres, alleen lezen |
| AI-chat | Streaming chat via Anthropic (API-sleutel) of een OpenAI-compatibel endpoint (bijv. Ollama) |

## Installeren (zonder dev-tools)

Download van de [Releases-pagina](https://github.com/ItsTheBoyLuc/deskglass/releases):

- `DeskGlass-Setup-<versie>.exe` – installer (per gebruiker, geen admin nodig, snelkoppelingen, nette uninstall)
- `DeskGlass-<versie>-portable.exe` – één los exe-bestand, geen installatie

> **SmartScreen-waarschuwing:** de exe is niet digitaal ondertekend, dus Windows toont "Windows heeft uw pc beveiligd".
> Klik op **Meer info → Toch uitvoeren**. Code signing is een optionele latere stap (zie onder).

Na het starten staat er een tray-icoon: widgets aan/uit, vergrendelen, instellingen, starten met Windows, afsluiten.
Tot je vergrendelt kun je elke widget verslepen; de plek wordt per widget en per monitor onthouden.

## Instellingen

Tray → **Instellingen…**

- **Weer:** plaatsnaam. **Agenda:** plak het geheime iCal-adres (Google Agenda → *Instellingen → Geheim adres in iCal-indeling*).
- **AI:** kies Anthropic (API-sleutel) of OpenAI-compatibel (Base-URL + model, sleutel optioneel; bijv. `http://localhost:11434/v1` voor Ollama).
- Sleutels en het ICS-adres worden **versleuteld** opgeslagen (Windows DPAPI via Electron `safeStorage`), nooit in platte JSON en nooit gelogd.
  Een API-sleutel gaat alleen naar `api.anthropic.com`, of naar jouw endpoint via https/localhost.

## Bureaublad-laag (belangrijk)

| Modus | Gedrag |
|---|---|
| **Bureaublad-laag** (standaard, `auto`) | Widgets worden onderdeel van het bureaublad zelf: altijd achter alle vensters, overleven **Win+D**. Een Windows-limiet: zo'n venster krijgt **geen** echte acrylic-blur, dus de tint is donkerder. |
| **Onderaan** | Normaal venster vastgepind onderaan, mét echte acrylic-blur, maar **Win+D verbergt de widgets**. Te kiezen in Instellingen (herstart nodig). |

`auto` probeert de bureaublad-laag en valt terug op *onderaan* als dat niet lukt.

## Ontwikkelen

Vereist Node ≥ 22 (en Windows 11 voor de volledige ervaring).

```bash
npm ci          # dependencies
npm run dev     # app met hot reload
npm test        # unit tests (vitest)
npm run typecheck
npm run dist    # bouwt installer + portable exe in dist/
```

`npm run dist` maakt in `dist/`: `DeskGlass-Setup-<versie>.exe` en `DeskGlass-<versie>-portable.exe`.
Stack: Electron + TypeScript, electron-vite (Vite + gewone CSS), electron-builder, electron-store, systeminformation, koffi, node-ical.
Zie [SPEC.md](SPEC.md), [DESIGN.md](DESIGN.md) en [CLAUDE.md](CLAUDE.md).

## Release maken

Een release wordt automatisch gebouwd door GitHub Actions (`.github/workflows/release.yml`) zodra je een versietag pusht.
De tag moet overeenkomen met `version` in `package.json`.

```bash
git tag v1.0.0
git push --tags
```

De workflow draait `npm ci`, typecheck, tests en `npm run dist` op `windows-latest` en hangt beide exe-bestanden aan een GitHub Release.
Geen auto-update in v1. Optioneel later: code signing (certificaat + `CSC_LINK`/`CSC_KEY_PASSWORD` als GitHub secrets) om SmartScreen te verminderen.

## Continue on another PC

```bash
git clone https://github.com/ItsTheBoyLuc/deskglass.git
cd deskglass
npm ci
npm run dev
```

Lees daarna `HANDOFF.md` (status, wat werkt/kapot is, volgende stappen) en `CLAUDE.md` (projectcontext).
Voor werken met Claude Code moet op die machine ook de **ECC-plugin** met de regels **`common` + `typescript`** geïnstalleerd zijn.

## Privacy

Alles draait lokaal. Netwerkverkeer: Open-Meteo (plaatsnaam → weer), je ICS-adres, en je gekozen AI-endpoint.
Geen telemetrie. Instellingen staan in `%APPDATA%\DeskGlass`. Dev- en geïnstalleerde versie delen die map.

## Licentie

MIT
