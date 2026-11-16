import ical from 'node-ical'
import type { CalEvent } from '../../shared/types'

export class IcsError extends Error {}

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 10_000

/** Accepts http(s) and webcal; everything else (file:, javascript:, ...) is rejected. */
export function normalizeIcsUrl(input: string): string {
  const raw = input.trim().replace(/^webcal:\/\//i, 'https://')
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new IcsError('Ongeldige agenda-URL')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new IcsError('Alleen http(s)- of webcal-adressen zijn toegestaan')
  return raw
}

/** Parse ICS text into upcoming events (recurrences, EXDATE and ongoing multi-day events handled by node-ical). */
export function parseEvents(text: string, from: Date, to: Date): CalEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new IcsError('Dit is geen geldige agenda (ICS)')
  let parsed: ical.CalendarResponse
  try {
    parsed = ical.parseICS(text)
  } catch {
    throw new IcsError('De agenda kon niet worden gelezen')
  }
  const out: CalEvent[] = []
  for (const item of Object.values(parsed)) {
    if (!item || item.type !== 'VEVENT') continue
    const ev = item as ical.VEvent
    try {
      const instances = ical.expandRecurringEvent(ev, { from, to, expandOngoing: true, maxIterations: 2000 })
      for (const inst of instances) {
        const start = inst.start as Date
        const end = (inst.end as Date | undefined) ?? start
        out.push({
          id: `${ev.uid}@${start.toISOString()}`,
          title: String(inst.summary ?? '(zonder titel)'),
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: Boolean(inst.isFullDay),
          ...(ev.location ? { location: String(ev.location) } : {})
        })
      }
    } catch {
      // One broken/runaway event must not hide the rest of the calendar.
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/** Download the calendar: timeout + size cap, http(s) only. Error text never contains the (secret) URL. */
export async function fetchIcs(url: string, signal?: AbortSignal): Promise<string> {
  const safe = normalizeIcsUrl(url)
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(safe, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: 'follow' })
  } catch {
    throw new IcsError('Agenda ophalen mislukt (geen verbinding of time-out)')
  }
  if (!res.ok) throw new IcsError(`Agenda ophalen mislukt (HTTP ${res.status})`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_BYTES) throw new IcsError('Agenda is te groot')
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > MAX_BYTES) throw new IcsError('Agenda is te groot')
  return new TextDecoder('utf-8').decode(buf)
}
