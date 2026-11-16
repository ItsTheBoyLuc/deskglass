import { h } from '../dom'
import type { Ctx, Mount } from '../dom'
import { SIZE_PRESETS, WIDGET_IDS, WIDGET_TITLES } from '../../shared/types'
import { PROVIDERS } from '../../shared/webproviders'
import type { ChatProvider, DesktopMode, SecretName } from '../../shared/types'

/** Checkbox that follows the app state, so changes made from the tray show up while this window is open. */
const checkbox = (ctx: Ctx, label: string, get: () => boolean, onChange: (v: boolean) => void): HTMLElement => {
  const box = h('input', { type: 'checkbox', checked: get(), onChange: () => onChange(box.checked) })
  ctx.onState(() => { box.checked = get() })
  return h('label', { class: 'check' }, box, h('span', { text: label }))
}

const field = (label: string, ...kids: Node[]): HTMLElement => h('div', { class: 'field' }, h('label', { text: label }), ...kids)

/** Secret input: the stored value is never shown (only "ingesteld"), saving/clearing goes straight to main. */
function secretField(ctx: Ctx, name: SecretName, label: string, placeholder: string): HTMLElement {
  const isSet = (): boolean => ctx.state().has[name]
  const input = h('input', { type: 'password', autocomplete: 'off', spellcheck: false, placeholder: isSet() ? '•••••• (ingesteld)' : placeholder })
  const msg = h('div', { class: 'small' })
  const save = async (value: string): Promise<void> => {
    const r = await ctx.api.setSecret(name, value).catch(() => ({ ok: false as const, error: 'Opslaan mislukt' }))
    msg.className = r.ok ? 'small dim' : 'small error'
    msg.textContent = r.ok ? (value ? 'Opgeslagen (versleuteld).' : 'Verwijderd.') : r.error
    if (r.ok) input.value = ''
  }
  ctx.onState(() => { input.placeholder = isSet() ? '•••••• (ingesteld)' : placeholder })
  return field(label, input,
    h('div', { class: 'inline' },
      h('button', { text: 'Opslaan', onClick: () => void save(input.value) }),
      h('button', { text: 'Wissen', onClick: () => void save('') }), msg))
}

export const mountSettings: Mount = (root, ctx) => {
  const s = (): ReturnType<Ctx['state']>['settings'] => ctx.state().settings
  const set = (patch: unknown): void => void ctx.api.setSettings(patch)
  const page = h('section', { class: 'glass' }, h('h1', { text: 'DeskGlass instellingen', style: 'font-size:18px;font-weight:600' }))
  root.append(page)

  const widgets = h('div', { class: 'group' }, h('div', { class: 'group-title', text: 'Widgets' }),
    h('div', { class: 'inline wrap' }, ...WIDGET_IDS.map((id) =>
      checkbox(ctx, WIDGET_TITLES[id], () => s().enabled[id], (v) => set({ enabled: { [id]: v } })))),
    checkbox(ctx, 'Widgets vergrendelen (niet te verslepen)', () => s().locked, (v) => set({ locked: v })),
    checkbox(ctx, 'Seconden tonen op de klok', () => s().clockSeconds, (v) => set({ clockSeconds: v })))

  const city = h('input', { type: 'text', value: s().city, maxLength: 80 })
  const weather = h('div', { class: 'group' }, h('div', { class: 'group-title', text: 'Weer' }),
    field('Plaats', city),
    h('button', { text: 'Opslaan', onClick: () => set({ city: city.value }) }))

  const agenda = h('div', { class: 'group' }, h('div', { class: 'group-title', text: 'Agenda' }),
    secretField(ctx, 'icsUrl', 'ICS-adres (bijv. Google Agenda → geheim adres in iCal-indeling)', 'https://…/basic.ics'),
    h('div', { class: 'hint', text: 'Het adres is geheim en wordt versleuteld opgeslagen. Alleen lezen.' }))

  // --- AI chat: embedded website (default) or native API/local chat ---
  const chatMode = h('select', {}, h('option', { value: 'web', text: 'Web-chat (log in op de site zelf)' }), h('option', { value: 'api', text: 'API / lokaal (eigen sleutel of Ollama)' }))
  chatMode.value = s().chat.mode
  const webProvider = h('select', {}, ...Object.entries(PROVIDERS).map(([k, v]) => h('option', { value: k, text: v.label })))
  webProvider.value = s().chat.webProvider
  const webBox = h('div', { class: 'field' }, h('label', { text: 'Website' }), webProvider,
    h('div', { class: 'hint', text: 'Je logt zelf in op de site; de sessie wordt onthouden. Werkt Google/Apple-login niet in dit venster, log dan in met e-mail. DeskGlass gebruikt nooit je inloggegevens.' }))

  const provider = h('select', {}, h('option', { value: 'anthropic', text: 'Anthropic (API-sleutel)' }), h('option', { value: 'openai-compat', text: 'OpenAI-compatibel (Ollama, gateway…)' }))
  provider.value = s().chat.provider
  const model = h('input', { type: 'text', value: s().chat.model, maxLength: 120 })
  const baseUrl = h('input', { type: 'url', value: s().chat.baseUrl })
  const urlField = field('Base-URL (alleen OpenAI-compatibel)', baseUrl)
  const anthropicKey = secretField(ctx, 'chatApiKey', 'Anthropic API-sleutel', 'sk-ant-…')
  const compatKey = secretField(ctx, 'compatApiKey', 'API-sleutel voor je endpoint (voor Ollama vaak leeg; alleen via https of localhost)', 'optioneel')
  const aiMsg = h('div', { class: 'small' })
  const saveAi = async (): Promise<void> => {
    const st = await ctx.api.setSettings({ chat: { provider: provider.value as ChatProvider, model: model.value, baseUrl: baseUrl.value } }).catch(() => null)
    const wantedUrl = baseUrl.value.trim().replace(/\/+$/, '')
    const urlDropped = provider.value === 'openai-compat' && st !== null && st.settings.chat.baseUrl !== wantedUrl
    aiMsg.className = st && !urlDropped ? 'small dim' : 'small error'
    aiMsg.textContent = !st ? 'Opslaan mislukt' : urlDropped ? 'Ongeldige Base-URL (alleen http/https, zonder gebruikersnaam of wachtwoord).' : 'Opgeslagen.'
  }
  const apiBox = h('div', { class: 'field', style: 'gap:12px' },
    field('Provider', provider), field('Model', model), urlField,
    h('div', { class: 'inline' }, h('button', { text: 'Opslaan', onClick: () => void saveAi() }), aiMsg),
    anthropicKey, compatKey)
  const syncVisibility = (): void => {
    const web = chatMode.value === 'web'
    webBox.style.display = web ? '' : 'none'
    apiBox.style.display = web ? 'none' : ''
    const compat = provider.value === 'openai-compat'
    urlField.style.display = compat ? '' : 'none'
    compatKey.style.display = compat ? '' : 'none'
    anthropicKey.style.display = compat ? 'none' : ''
  }
  chatMode.addEventListener('change', () => { syncVisibility(); set({ chat: { mode: chatMode.value } }) })
  webProvider.addEventListener('change', () => set({ chat: { webProvider: webProvider.value } }))
  provider.addEventListener('change', syncVisibility)
  syncVisibility()
  const ai = h('div', { class: 'group' }, h('div', { class: 'group-title', text: 'AI-chat' }), field('Modus', chatMode), webBox, apiBox)

  // --- Spotify (PKCE, no client secret) ---
  const clientId = h('input', { type: 'text', value: s().spotifyClientId, maxLength: 32, spellcheck: false, placeholder: '32 tekens uit het Spotify Developer Dashboard' })
  const spMsg = h('div', { class: 'small' })
  const spStatus = h('div', { class: 'small' })
  const connectBtn = h('button', { text: 'Verbinden met Spotify' })
  const disconnectBtn = h('button', { text: 'Ontkoppelen' })
  const syncSpotify = (): void => {
    const on = ctx.state().has.spotifyRefreshToken
    spStatus.textContent = on ? 'Status: verbonden' : 'Status: niet verbonden'
    disconnectBtn.disabled = !on
  }
  const say = (text: string, ok: boolean): void => { spMsg.className = ok ? 'small dim' : 'small error'; spMsg.textContent = text }
  const saveClientId = async (): Promise<void> => {
    const st = await ctx.api.setSettings({ spotifyClientId: clientId.value }).catch(() => null)
    const bad = st !== null && st.settings.spotifyClientId !== clientId.value.trim()
    say(!st ? 'Opslaan mislukt' : bad ? 'Een Client ID is precies 32 tekens (0-9, a-f).' : 'Client ID opgeslagen.', Boolean(st) && !bad)
  }
  connectBtn.addEventListener('click', () => {
    connectBtn.disabled = true
    connectBtn.textContent = 'Wachten op je browser…'
    say('Rond het inloggen af in de browser die zojuist is geopend.', true)
    void ctx.api.spotifyConnect().catch(() => ({ ok: false as const, error: 'Verbinden mislukt.' })).then((r) => {
      say(r.ok ? 'Verbonden met Spotify.' : r.error, r.ok)
      connectBtn.disabled = false
      connectBtn.textContent = 'Verbinden met Spotify'
    })
  })
  disconnectBtn.addEventListener('click', () => void ctx.api.spotifyDisconnect().then(() => say('Ontkoppeld; de opgeslagen sleutel is verwijderd.', true)))
  ctx.onState(syncSpotify)
  syncSpotify()
  const spotify = h('div', { class: 'group' }, h('div', { class: 'group-title', text: 'Muziek (Spotify)' }),
    field('Client ID (van je eigen Spotify-app)', clientId),
    h('div', { class: 'inline' }, h('button', { text: 'Opslaan', onClick: () => void saveClientId() })),
    h('div', { class: 'hint', text: 'Registreer in het Spotify Developer Dashboard exact deze Redirect URI:' }),
    h('code', { text: 'http://127.0.0.1:8898/callback', style: 'user-select:all;padding:4px 8px;background:var(--bg-card);border-radius:6px' }),
    h('div', { class: 'inline' }, connectBtn, disconnectBtn), spStatus, spMsg,
    h('div', { class: 'hint', text: 'Afspeelbediening werkt alleen als de eigenaar van de Spotify-app Premium heeft; anders blijft de widget alleen-lezen.' }))

  // --- Widget sizes (S / M / L) ---
  const presets = h('div', { class: 'group' }, h('div', { class: 'group-title', text: 'Formaat widgets' }),
    h('div', { class: 'presets' }, ...WIDGET_IDS.flatMap((id) => [
      h('span', { text: WIDGET_TITLES[id] }),
      h('div', { class: 'seg' }, ...SIZE_PRESETS.map((p) => h('button', { text: p, title: WIDGET_TITLES[id] + ' ' + p, onClick: () => void ctx.api.setPreset(id, p) })))
    ])),
    h('div', { class: 'hint', text: 'Of sleep de hoek van een widget terwijl die ontgrendeld is.' }))

  const mode = h('select', {}, h('option', { value: 'auto', text: 'Automatisch (bureaublad-laag proberen)' }), h('option', { value: 'bottom', text: 'Onderaan houden (echte blur, verdwijnt bij Win+D)' }), h('option', { value: 'workerw', text: 'Bureaublad-laag (WorkerW)' }))
  mode.value = s().desktopMode
  mode.addEventListener('change', () => set({ desktopMode: mode.value as DesktopMode }))
  const system = h('div', { class: 'group' }, h('div', { class: 'group-title', text: 'Systeem' }),
    checkbox(ctx, 'Starten met Windows', () => ctx.state().autostart, (v) => void ctx.api.setAutostart(v)),
    field('Positie op het bureaublad (herstart nodig)', mode),
    h('div', { class: 'hint', text: `Actief: ${ctx.state().desktopMode === 'workerw' ? 'bureaublad-laag' : 'onderaan'} · versie ${ctx.state().version}` }))

  page.append(widgets, presets, weather, agenda, spotify, ai, system)
}
