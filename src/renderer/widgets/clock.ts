import { h, frame } from '../dom'
import type { Mount } from '../dom'
import { fmtDate } from '../format'

export const mountClock: Mount = (root, ctx) => {
  const { el, body } = frame('Klok', { dragAll: true })
  body.classList.add('clock')
  const time = h('div', { class: 'time' })
  const date = h('div', { class: 'date' })
  body.append(time, date)
  // The clock has no header chrome: hide the title bar, keep the whole card draggable.
  el.querySelector('.bar')?.remove()
  root.append(el)

  let timer: number | undefined
  const render = (): void => {
    const now = new Date()
    const hm = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    const withSeconds = ctx.state().settings.clockSeconds
    time.replaceChildren(hm)
    if (withSeconds) time.append(h('span', { class: 'secs', text: String(now.getSeconds()).padStart(2, '0') }))
    date.textContent = fmtDate.format(now)
    schedule(now, withSeconds)
  }
  // Wake exactly on the next second/minute boundary instead of polling: ~zero idle CPU.
  const schedule = (now: Date, withSeconds: boolean): void => {
    window.clearTimeout(timer)
    if (document.hidden) return
    const wait = withSeconds ? 1000 - now.getMilliseconds() : 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds())
    timer = window.setTimeout(render, wait + 5)
  }
  document.addEventListener('visibilitychange', render)
  ctx.onState(render)
  render()
}
