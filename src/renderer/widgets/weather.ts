import { h, frame, whileVisible } from '../dom'
import type { Mount } from '../dom'
import { fmtWeekdayShort, weatherInfo } from '../format'
import type { WeatherResult } from '../../shared/types'

export const mountWeather: Mount = (root, ctx) => {
  const { el, body, dot } = frame('Weer', { dragAll: true })
  root.append(el)

  const render = (r: WeatherResult): void => {
    body.replaceChildren()
    dot.className = r.data && !r.stale ? 'dot' : r.data ? 'dot off' : 'dot bad'
    if (!r.data) {
      body.append(h('div', { class: 'error', text: r.error ?? 'Geen weerdata' }))
      return
    }
    const { current: c, days, city } = r.data
    const info = weatherInfo(c.code)
    body.append(
      h('div', { class: 'now' },
        h('div', { class: 'emoji', text: info.emoji }),
        h('div', {},
          h('div', { class: 'temp', text: `${c.temp}°` }),
          h('div', { class: 'meta', text: `${city} · ${info.label}` }),
          h('div', { class: 'meta', text: `Voelt als ${c.feelsLike}° · wind ${c.wind} km/u` }))),
      h('div', { class: 'days' }, ...days.map((d) => {
        const di = weatherInfo(d.code)
        return h('div', { class: 'day' },
          h('span', { class: 'dim', text: fmtWeekdayShort.format(new Date(`${d.date}T12:00:00`)) }),
          h('span', { text: di.emoji }),
          h('span', { class: 'rain', text: d.rain === null ? '' : `${d.rain}%` }),
          h('span', { text: `${d.min}° / ${d.max}°` }))
      })),
    )
    if (r.error) body.append(h('div', { class: 'hint', text: r.error }))
  }

  // The main process refreshes every 15 min and pushes; we also load on start and when the city changes.
  ctx.api.onWeather(render)
  let city = ctx.state().settings.city
  ctx.onState((s) => {
    if (s.settings.city !== city) { city = s.settings.city; void ctx.api.getWeather().then(render) }
  })
  whileVisible(15 * 60_000, () => void ctx.api.getWeather().then(render))
}
