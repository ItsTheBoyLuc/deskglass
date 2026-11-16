import type { DeskglassApi } from '../shared/ipc'
import type { AppState, WidgetId } from '../shared/types'

declare global {
  interface Window { deskglass: DeskglassApi }
}

type Kid = Node | string | null | false | undefined
type Props = { class?: string; text?: string; [k: string]: unknown }

/** Tiny hyperscript helper. Text always goes through textContent (never innerHTML), so no injection. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') el.className = String(v)
    else if (k === 'text') el.textContent = String(v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v
    else el.setAttribute(k, String(v))
  }
  for (const kid of kids) if (kid) el.append(kid)
  return el
}

export interface Ctx {
  api: DeskglassApi
  id: WidgetId | 'settings'
  state: () => AppState
  onState: (cb: (s: AppState) => void) => void
}

export type Mount = (root: HTMLElement, ctx: Ctx) => void

/** Standard widget chrome: header (title + drag handle) and a body. */
export function frame(title: string, opts: { dragAll?: boolean; extra?: Node } = {}): { el: HTMLElement; body: HTMLElement; dot: HTMLElement } {
  const dot = h('span', { class: 'dot off' })
  const bar = h('div', { class: 'bar', 'data-drag': opts.dragAll ? undefined : '' }, h('span', { class: 'title', text: title }), opts.extra, dot)
  const body = h('div', { class: 'body' })
  const handle = h('div', { class: 'resize-handle', 'data-resize': '', title: 'Formaat aanpassen', 'aria-hidden': 'true' })
  const el = h('section', { class: 'glass', 'data-drag': opts.dragAll ? '' : undefined }, bar, body, handle)
  return { el, body, dot }
}

/** Run `fn` now and every `ms`, but only while the window is visible (hidden widgets cost nothing). */
export function whileVisible(ms: number, fn: () => void): void {
  let t: number | undefined
  const start = (): void => { fn(); t = window.setInterval(fn, ms) }
  const stop = (): void => { if (t !== undefined) window.clearInterval(t); t = undefined }
  const sync = (): void => { stop(); if (!document.hidden) start() }
  document.addEventListener('visibilitychange', sync)
  sync()
}
