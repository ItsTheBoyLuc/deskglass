import { h, frame } from '../dom'
import type { Mount } from '../dom'
import { fmtDate } from '../format'
import { formatClock } from '../../shared/clock'

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
    const { clockSeconds, clockHour12 } = ctx.state().settings
    const p = formatClock(now, clockHour12, clockSeconds)
    time.replaceChildren(p.time)
    if (p.seconds) time.append(h('span', { class: 'secs', text: `:${p.seconds}` }))
    if (p.period) time.append(h('span', { class: 'ampm', text: p.period }))
    date.textContent = fmtDate.format(now)
    schedule(now, clockSeconds)
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
