import { h, frame, whileVisible } from '../dom'
import type { Mount } from '../dom'
import { fmtDayHeading, fmtTime } from '../format'
import type { CalEvent, EventsResult, Task } from '../../shared/types'

const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export const mountAgenda: Mount = (root, ctx) => {
  const { el, body, dot } = frame('Agenda & taken')
  root.append(el)

  const events = h('div', { class: 'list' })
  const status = h('div', { class: 'error' })
  const tasks = h('div', { class: 'list' })
  const input = h('input', { type: 'text', placeholder: 'Nieuwe taak…', maxLength: 200, 'aria-label': 'Nieuwe taak' })
  const add = (): void => {
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    void ctx.api.addTask(text).then(renderTasks)
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add() })
  body.append(
    h('div', { class: 'section-title', text: 'Komende afspraken' }), status, events,
    h('div', { class: 'section-title', text: 'Taken' }), tasks,
    h('div', { class: 'add' }, input, h('button', { text: '+', title: 'Taak toevoegen', 'aria-label': 'Taak toevoegen', onClick: add }))
  )
  events.style.flex = '1 1 0'
  tasks.style.flex = '1 1 0'

  function renderTasks(list: Task[]): void {
    tasks.replaceChildren(...(list.length ? list.map((t) =>
      h('div', { class: `row${t.done ? ' done' : ''}` },
        h('input', { type: 'checkbox', checked: t.done, 'aria-label': t.text, onChange: () => void ctx.api.toggleTask(t.id).then(renderTasks) }),
        h('span', { class: 'grow', text: t.text, title: t.text }),
        h('button', { class: 'x', text: '✕', title: 'Verwijderen', 'aria-label': 'Verwijder taak', onClick: () => void ctx.api.removeTask(t.id).then(renderTasks) }))
    ) : [h('div', { class: 'hint', text: 'Geen taken. Voeg er een toe.' })]))
  }

  function eventRow(e: CalEvent): HTMLElement {
    const start = new Date(e.start)
    const when = e.allDay ? 'hele dag' : fmtTime.format(start)
    return h('div', { class: 'row', title: e.location ?? e.title },
      h('span', { class: 'when', text: when }), h('span', { class: 'grow', text: e.title }))
  }

  function renderEvents(r: EventsResult): void {
    dot.className = r.error ? 'dot bad' : r.configured ? 'dot' : 'dot off'
    status.textContent = r.error ? `${r.error}${r.stale ? ' (oude gegevens)' : ''}` : ''
    if (!r.configured) {
      events.replaceChildren(
        h('div', { class: 'hint', text: 'Geen agenda gekoppeld.' }),
        h('button', { text: 'Agenda koppelen…', onClick: () => ctx.api.openSettings() }))
      return
    }
    if (!r.events.length) { events.replaceChildren(h('div', { class: 'hint', text: 'Geen afspraken de komende 2 weken.' })); return }
    const rows: HTMLElement[] = []
    let last = ''
    for (const e of r.events) {
      const start = new Date(e.start)
      const key = dayKey(start)
      if (key !== last) {
        last = key
        rows.push(h('div', { class: 'faint small', text: fmtDayHeading.format(start) }))
      }
      rows.push(eventRow(e))
    }
    events.replaceChildren(...rows)
  }

  let hadIcs = ctx.state().has.icsUrl
  ctx.onState((s) => {
    if (s.has.icsUrl !== hadIcs) { hadIcs = s.has.icsUrl; void ctx.api.getEvents(true).then(renderEvents) }
  })
  void ctx.api.listTasks().then(renderTasks)
  whileVisible(10 * 60_000, () => void ctx.api.getEvents(false).then(renderEvents))
}
