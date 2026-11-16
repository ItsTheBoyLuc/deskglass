# DeskGlass

Donkere glas-widgets die **op je bureaublad** leven (achter al je vensters) voor Windows 11:
klok + datum, systeemstatistieken, weer, agenda/taken en een AI-chat. UI in het Nederlands.

| Widget | Wat |
|---|---|
| Klok | Grote klok + Nederlandse datum, optioneel seconden |
| Systeem | CPU, RAM, GPU (NVIDIA), schijf, netwerk ↑↓, CPU-temp (of `n/a`) |
| Weer | Open-Meteo (geen sleutel), huidig + 3 dagen, 15 min verversen, offline-cache |
| Agenda & taken | Lokale takenlijst + afspraken uit een (geheim) ICS-adres, alleen lezen |
| Muziek | Spotify: albumhoes, titel, artiest, voortgang, play/pause/vorige/volgende (Authorization Code + PKCE, geen client secret) |
| AI-chat | **Web-chat (standaard)**: claude.ai, chatgpt.com of gemini.google.com in een afgeschermd venster waar je zelf inlogt. Optioneel: eigen API/lokaal (Anthropic-sleutel of OpenAI-compatibel endpoint zoals Ollama) met streaming |

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
- **AI:** kies *Web-chat* (provider: Claude / ChatGPT / Gemini) of *API / lokaal*: Anthropic (API-sleutel) of OpenAI-compatibel (Base-URL + model, sleutel optioneel; bijv. `http://localhost:11434/v1` voor Ollama).
- Sleutels en het ICS-adres worden **versleuteld** opgeslagen (Windows DPAPI via Electron `safeStorage`), nooit in platte JSON en nooit gelogd.
  Een API-sleutel gaat alleen naar `api.anthropic.com`, of naar jouw endpoint via https/localhost.

## Widgets verplaatsen en vergroten

Tray → **Widgets vergrendelen** uit = bewerkmodus: elke widget heeft een stippellijn en een **greep rechtsonder**. Sleep de kop (of de hele widget) om te verplaatsen,
sleep de greep om het formaat te wijzigen. Elke widget heeft een minimum- en maximumformaat; de inhoud schaalt mee.
Snelle formaten **S / M / L** staan in de tray (*Formaat*) en in Instellingen. Positie en formaat worden per widget en per monitor onthouden en
teruggezet binnen het scherm als een monitor verdwijnt.

## Spotify koppelen

DeskGlass gebruikt jouw eigen (gratis) Spotify-app; er zit geen client secret in DeskGlass.

1. Ga naar <https://developer.spotify.com/dashboard> → **Create app** (naam/omschrijving vrij).
2. Kies bij *API/SDKs* de **Web API**.
3. Voeg bij **Redirect URIs** exact toe: `http://127.0.0.1:8898/callback` (dus `127.0.0.1`, geen `localhost`, geen https, poort 8898) en sla op.
4. Kopieer het **Client ID** (32 tekens).
5. DeskGlass → Instellingen → *Muziek (Spotify)*: plak het Client ID, **Opslaan**, dan **Verbinden met Spotify**. Je browser opent; keur goed. Klaar.

Scopes: `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`. Het refresh-token wordt versleuteld opgeslagen
(Windows DPAPI) en nooit gelogd; **Ontkoppelen** verwijdert het.
**Let op:** afspeelbediening (play/pause/volgende/vorige) vereist dat de **eigenaar van de Spotify-app Premium heeft**; zonder Premium blijft de widget alleen-lezen
(met een duidelijke melding). Is er geen actief apparaat, dan toont de widget "Open Spotify op een apparaat". De poort 8898 moet vrij zijn tijdens het verbinden.

## AI-chat (web)

Standaard laadt de chat-widget de site van je keuze (Claude, ChatGPT of Gemini) in een eigen, afgeschermd venster. **Jij logt zelf in op de site**; de sessie wordt onthouden.
DeskGlass gebruikt of leest nooit je inloggegevens of cookies en doet **geen** "inloggen met Claude/ChatGPT"-koppeling (dat is niet toegestaan voor abonnementen).
Het venster mag alleen navigeren binnen de domeinen van de gekozen aanbieder; andere links openen in je gewone browser; alleen het klembord is toegestaan als permissie.
Staat Google- of Apple-inloggen embedded niet toe, log dan in met e-mail (Gemini heeft alleen Google-login; werkt dat niet, gebruik dan Claude of ChatGPT).

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
