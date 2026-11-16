import { secrets, store } from '../store'
import type { EventsResult } from '../../shared/types'
import { IcsError, fetchIcs, parseEvents } from './ics'

const TTL_MS = 10 * 60_000
const WINDOW_DAYS = 14

/** Upcoming events from the (secret) ICS URL. Cached; on failure the cached events are shown with an error. */
export async function getEvents(force: boolean): Promise<EventsResult> {
  const url = await secrets.get('icsUrl')
  if (!url) return { events: [], configured: false }
  const cached = store.get('eventsCache')
  if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { events: cached.events, configured: true, fetchedAt: cached.fetchedAt }
  }
  try {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const to = new Date(from.getTime() + WINDOW_DAYS * 86_400_000)
    const events = parseEvents(await fetchIcs(url), from, to)
    const fetchedAt = Date.now()
    store.set('eventsCache', { events, fetchedAt })
    return { events, configured: true, fetchedAt }
  } catch (e) {
    const error = e instanceof IcsError ? e.message : 'Agenda ophalen mislukt'
    return { events: cached?.events ?? [], configured: true, error, stale: Boolean(cached), fetchedAt: cached?.fetchedAt }
  }
}

export const clearEventsCache = (): void => store.delete('eventsCache')
