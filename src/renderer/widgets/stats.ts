import { h, frame } from '../dom'
import type { Mount } from '../dom'
import { formatRate, meterClass } from '../format'
import type { StatsSnapshot } from '../../shared/types'

interface Row { value: HTMLElement; bar: HTMLElement; sub?: HTMLElement }

export const mountStats: Mount = (root, ctx) => {
  const { el, body, dot } = frame('Systeem', { dragAll: true })
  root.append(el)

  const meter = (label: string, withSub = false): Row => {
    const bar = h('i')
    const value = h('span', { class: 'value', text: 'n/a' })
    body.append(h('div', { class: 'stat' }, h('span', { class: 'label', text: label }), h('div', { class: 'meter' }, bar), value))
    const sub = withSub ? h('div', { class: 'sub' }) : undefined
    if (sub) body.append(sub)
    return { value, bar, sub }
  }
  const cpu = meter('CPU')
  const ram = meter('RAM', true)
  const gpu = meter('GPU')
  const disk = meter('Schijf', true)
  const down = h('span', { text: 'n/a' })
  const up = h('span', { text: 'n/a' })
  const temp = h('span', { text: 'n/a' })
  body.append(
    h('div', { class: 'net' }, h('span', { text: '↓ ' }, down), h('span', { text: '↑ ' }, up)),
    h('div', { class: 'net' }, h('span', { text: 'CPU-temp' }), temp)
  )

  const set = (row: Row, pct: number | null, sub?: string | null): void => {
    row.value.textContent = pct === null ? 'n/a' : `${pct}%`
    row.value.classList.toggle('faint', pct === null)
    row.bar.style.width = `${pct ?? 0}%`
    row.bar.className = pct === null ? '' : meterClass(pct)
    if (row.sub) row.sub.textContent = sub ?? ''
  }

  ctx.api.onStats((s: StatsSnapshot) => {
    dot.className = 'dot'
    set(cpu, s.cpu)
    set(ram, s.ram, s.ramText)
    set(gpu, s.gpu)
    set(disk, s.disk, s.diskText)
    down.textContent = formatRate(s.netDown)
    up.textContent = formatRate(s.netUp)
    temp.textContent = s.cpuTemp === null ? 'n/a' : `${s.cpuTemp} °C`
  })
}
