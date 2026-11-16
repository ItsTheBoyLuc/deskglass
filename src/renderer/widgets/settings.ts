import { h } from '../dom'
import type { Ctx, Mount } from '../dom'
import { WIDGET_IDS, WIDGET_TITLES } from '../../shared/types'
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

  const provider = h('select', {}, h('option', { value: 'anthropic', text: 'Anthropic (API-sleutel)' }), h('option', { value: 'openai-compat', text: 'OpenAI-compatibel (Ollama, gateway…)' }))
  provider.value = s().chat.provider
  const model = h('input', { type: 'text', value: s().chat.model, maxLength: 120 })
  const baseUrl = h('input', { type: 'url', value: s().chat.baseUrl })
  const urlField = field('Base-URL (alleen OpenAI-compatibel)', baseUrl)
  const anthropicKey = secretField(ctx, 'chatApiKey', 'Anthropic API-sleutel', 'sk-ant-…')
  const compatKey = secretField(ctx, 'compatApiKey', 'API-sleutel voor je endpoint (voor Ollama vaak leeg; alleen via https of localhost)', 'optioneel')
  const syncVisibility = (): void => {
    const compat = provider.value === 'openai-compat'
    urlField.style.display = compat ? '' : 'none'
    compatKey.style.display = compat ? '' : 'none'
    anthropicKey.style.display = compat ? 'none' : ''
  }
  provider.addEventListener('change', syncVisibility)
  syncVisibility()
  const aiMsg = h('div', { class: 'small' })
  const saveAi = async (): Promise<void> => {
    const st = await ctx.api.setSettings({ chat: { provider: provider.value as ChatProvider, model: model.value, baseUrl: baseUrl.value } }).catch(() => null)
    const wantedUrl = baseUrl.value.trim().replace(/\/+$/, '')
    const urlDropped = provider.value === 'openai-compat' && st !== null && st.settings.chat.baseUrl !== wantedUrl
    aiMsg.className = st && !urlDropped ? 'small dim' : 'small error'
    aiMsg.textContent = !st ? 'Opslaan mislukt' : urlDropped ? 'Ongeldige Base-URL (alleen http/https, zonder gebruikersnaam of wachtwoord).' : 'Opgeslagen.'
  }
  const ai = h('div', { class: 'group' }, h('div', { class: 'group-title', text: 'AI-chat' }),
    field('Provider', provider), field('Model', model), urlField,
    h('div', { class: 'inline' }, h('button', { text: 'Opslaan', onClick: () => void saveAi() }), aiMsg),
    anthropicKey, compatKey)

  const mode = h('select', {}, h('option', { value: 'auto', text: 'Automatisch (bureaublad-laag proberen)' }), h('option', { value: 'bottom', text: 'Onderaan houden (echte blur, verdwijnt bij Win+D)' }), h('option', { value: 'workerw', text: 'Bureaublad-laag (WorkerW)' }))
  mode.value = s().desktopMode
  mode.addEventListener('change', () => set({ desktopMode: mode.value as DesktopMode }))
  const system = h('div', { class: 'group' }, h('div', { class: 'group-title', text: 'Systeem' }),
    checkbox(ctx, 'Starten met Windows', () => ctx.state().autostart, (v) => void ctx.api.setAutostart(v)),
    field('Positie op het bureaublad (herstart nodig)', mode),
    h('div', { class: 'hint', text: `Actief: ${ctx.state().desktopMode === 'workerw' ? 'bureaublad-laag' : 'onderaan'} · versie ${ctx.state().version}` }))

  page.append(widgets, weather, agenda, ai, system)
}
