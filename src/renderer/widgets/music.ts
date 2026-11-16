import { h, frame, whileVisible } from '../dom'
import type { Mount } from '../dom'
import type { MusicAction, MusicState } from '../../shared/types'

const fmt = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Brighten dark covers a little so the accent stays readable on the dark glass. */
const accentCss = (rgb: [number, number, number]): string => {
  const k = Math.max(1, 170 / Math.max(rgb[0], rgb[1], rgb[2], 1))
  return `rgb(${rgb.map((c) => Math.min(255, Math.round(c * k))).join(',')})`
}

const MESSAGES: Record<string, { text: string; button?: string }> = {
  'no-client-id': { text: 'Vul je Spotify Client ID in bij Instellingen.', button: 'Instellingen' },
  disconnected: { text: 'Spotify is niet verbonden.', button: 'Verbinden…' },
  reauth: { text: 'De Spotify-sessie is verlopen of ingetrokken.', button: 'Opnieuw verbinden…' },
  'no-device': { text: 'Open Spotify op een apparaat.' },
  idle: { text: 'Er speelt niets.' }
}

export const mountMusic: Mount = (root, ctx) => {
  const { el, body } = frame('Muziek', { dragAll: true })
  el.classList.add('music')
  el.querySelector('.bar')?.remove()
  root.append(el)

  const backdrop = h('div', { class: 'art-bg' })
  const cover = h('div', { class: 'cover', text: '♪' })
  const title = h('div', { class: 't' })
  const artist = h('div', { class: 'a' })
  const fill = h('div', { class: 'fill' })
  const elapsed = h('span')
  const total = h('span')
  const btn = (label: string, glyph: string, action: () => void, cls = ''): HTMLButtonElement =>
    h('button', { class: cls, text: glyph, title: label, 'aria-label': label, onClick: action })
  const prev = btn('Vorige', '⏮', () => act('previous'))
  const play = btn('Afspelen of pauzeren', '⏵', () => act(state.track?.isPlaying ? 'pause' : 'play'), 'main')
  const next = btn('Volgende', '⏭', () => act('next'))
  const notice = h('div', { class: 'notice' })
  const player = h('div', { class: 'row' },
    cover,
    h('div', { class: 'info' }, title, artist,
      h('div', { class: 'track' }, fill),
      h('div', { class: 'times' }, elapsed, total),
      h('div', { class: 'controls' }, prev, play, next),
      notice))
  const msg = h('div', { class: 'msg' })
  body.append(backdrop, player, msg)

  let state: MusicState = { status: 'disconnected' }

  /** Progress is interpolated locally between polls (the player is only polled every few seconds). */
  const currentProgress = (): number => {
    const t = state.track
    if (!t) return 0
    return Math.min(t.durationMs, t.progressMs + (t.isPlaying ? Date.now() - t.fetchedAt : 0))
  }

  function act(action: MusicAction): void {
    if (state.track && (action === 'play' || action === 'pause')) { // optimistic: flip the icon at once
      state = { ...state, track: { ...state.track, isPlaying: action === 'play', progressMs: currentProgress(), fetchedAt: Date.now() } }
      draw()
    }
    ctx.api.musicControl(action).then(render).catch(() => { notice.textContent = 'Bediening mislukt.' })
  }

  function drawProgress(): void {
    const t = state.track
    if (!t) return
    const p = currentProgress()
    fill.style.width = t.durationMs ? `${(p / t.durationMs) * 100}%` : '0%'
    elapsed.textContent = fmt(p)
    total.textContent = fmt(t.durationMs)
  }

  function draw(): void {
    const t = state.track
    const showing = state.status === 'playing' && t !== undefined
    player.style.display = showing ? '' : 'none'
    msg.style.display = showing ? 'none' : ''
    el.style.setProperty('--accent-m', t?.accent ? accentCss(t.accent) : 'var(--accent)')
    backdrop.style.backgroundImage = t?.artDataUrl ? `url("${t.artDataUrl}")` : 'none'
    backdrop.style.opacity = t?.artDataUrl ? '0.4' : '0'
    if (showing && t) {
      title.textContent = t.title
      title.title = `${t.title} – ${t.artist}`
      artist.textContent = t.artist
      cover.style.backgroundImage = t.artDataUrl ? `url("${t.artDataUrl}")` : 'none'
      cover.textContent = t.artDataUrl ? '' : '♪'
      play.textContent = t.isPlaying ? '⏸' : '⏵'
      notice.textContent = state.notice ?? ''
      drawProgress()
      return
    }
    const m = state.status === 'error' ? { text: state.message ?? 'Spotify gaf een fout.' } : (MESSAGES[state.status] ?? { text: '' })
    msg.replaceChildren(h('div', { text: m.text }), ...('button' in m && m.button ? [h('button', { text: m.button, onClick: () => ctx.api.openSettings() })] : []))
    if (state.notice) msg.append(h('div', { class: 'notice', text: state.notice }))
  }

  function render(s: MusicState): void {
    state = s
    draw()
  }

  ctx.api.onMusic(render)
  void ctx.api.getMusic().then(render)
  whileVisible(500, drawProgress)
}
