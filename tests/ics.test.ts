import { describe, expect, it } from 'vitest'
import { IcsError, fetchIcs, normalizeIcsUrl, parseEvents } from '../src/main/services/ics'

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN',
  'BEGIN:VEVENT', 'UID:a1', 'DTSTAMP:20261101T000000Z', 'DTSTART:20261117T090000Z', 'DTEND:20261117T100000Z', 'SUMMARY:Standup', 'LOCATION:Kantoor', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:a2', 'DTSTAMP:20261101T000000Z', 'DTSTART;VALUE=DATE:20261118', 'DTEND;VALUE=DATE:20261119', 'SUMMARY:Vrije dag', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:a3', 'DTSTAMP:20261101T000000Z', 'DTSTART:20261102T120000Z', 'DTEND:20261102T130000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE:20261123T120000Z', 'SUMMARY:Wekelijks', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:a4', 'DTSTAMP:20261101T000000Z', 'DTSTART:20261110T090000Z', 'DTEND:20261110T100000Z', 'SUMMARY:Verleden', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:a5', 'DTSTAMP:20261101T000000Z', 'DTSTART:20261115T200000Z', 'DTEND:20261117T020000Z', 'SUMMARY:Doorlopend', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:a6', 'DTSTAMP:20261101T000000Z', 'DTSTART:20261201T090000Z', 'DTEND:20261201T100000Z', 'SUMMARY:Te ver weg', 'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n')

const from = new Date('2026-11-16T00:00:00Z')
const to = new Date('2026-11-30T00:00:00Z')

describe('parseEvents', () => {
  const events = parseEvents(ICS, from, to)
  const titles = events.map((e) => e.title)

  it('returns upcoming events sorted by start, including recurrences and ongoing ones', () => {
    expect(titles).toEqual(['Doorlopend', 'Wekelijks', 'Standup', 'Vrije dag'])
  })
  it('drops past events, events beyond the window, and EXDATE occurrences', () => {
    expect(titles).not.toContain('Verleden')
    expect(titles).not.toContain('Te ver weg')
    expect(titles.filter((t) => t === 'Wekelijks')).toHaveLength(1)
  })
  it('flags all-day events and keeps location', () => {
    expect(events.find((e) => e.title === 'Vrije dag')?.allDay).toBe(true)
    expect(events.find((e) => e.title === 'Standup')?.allDay).toBe(false)
    expect(events.find((e) => e.title === 'Standup')?.location).toBe('Kantoor')
  })
  it('emits ISO strings (serialisable over IPC)', () => {
    expect(events.find((e) => e.title === 'Standup')?.start).toBe('2026-11-17T09:00:00.000Z')
  })
  it('throws IcsError for content that is not a calendar', () => {
    expect(() => parseEvents('<html>login</html>', from, to)).toThrow(IcsError)
    expect(() => parseEvents('', from, to)).toThrow(IcsError)
  })
})

describe('normalizeIcsUrl', () => {
  it('maps webcal:// to https:// and trims', () => {
    expect(normalizeIcsUrl('  webcal://example.com/a.ics ')).toBe('https://example.com/a.ics')
  })
  it('keeps http(s) URLs', () => {
    const u = 'https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics'
    expect(normalizeIcsUrl(u)).toBe(u)
  })
  it.each(['', 'not a url', 'file:///c:/x.ics', 'javascript:alert(1)', 'ftp://x/y.ics'])('rejects %j', (bad) => {
    expect(() => normalizeIcsUrl(bad)).toThrow(IcsError)
  })
})

describe('fetchIcs', () => {
  const resp = (body: BodyInit, url = 'https://example.com/a.ics') => {
    const r = new Response(body, { status: 200 })
    Object.defineProperty(r, 'url', { value: url })
    return r
  }
  it('returns the body text', async () => {
    expect(await fetchIcs('https://example.com/a.ics', undefined, (async () => resp('BEGIN:VCALENDAR')) as typeof fetch)).toBe('BEGIN:VCALENDAR')
  })
  it('stops reading at the size cap even without Content-Length (chunked)', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ < 8) c.enqueue(chunk); else c.close() } })
    await expect(fetchIcs('https://example.com/a.ics', undefined, (async () => resp(body)) as typeof fetch)).rejects.toThrow(/te groot/)
    expect(sent).toBeLessThan(8)
  })
  it('rejects an https -> http downgrade after redirects', async () => {
    await expect(fetchIcs('https://example.com/a.ics', undefined, (async () => resp('x', 'http://evil.test/a.ics')) as typeof fetch)).rejects.toThrow(/doorverwijzing/)
  })
  it('maps network failures to an IcsError without leaking the URL', async () => {
    const f = (async () => { throw new Error('connect ECONNREFUSED https://example.com/secret-token') }) as typeof fetch
    await expect(fetchIcs('https://example.com/secret-token', undefined, f)).rejects.toThrow(IcsError)
    await expect(fetchIcs('https://example.com/secret-token', undefined, f)).rejects.not.toThrow(/secret-token/)
  })
})
