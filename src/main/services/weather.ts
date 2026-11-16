import { store } from '../store'
import type { WeatherData, WeatherResult } from '../../shared/types'

const TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 14 * 60_000

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Pure mapping of an Open-Meteo forecast response (exported for tests). */
export function mapWeather(city: string, j: any, now = Date.now()): WeatherData {
  const c = j?.current
  const d = j?.daily
  if (!c || !d || !Array.isArray(d.time)) throw new Error('Onverwacht antwoord van de weerdienst')
  const days = (d.time as string[]).slice(1, 4).map((date, i) => ({
    date,
    code: Number(d.weather_code?.[i + 1] ?? 0),
    min: Math.round(Number(d.temperature_2m_min?.[i + 1])),
    max: Math.round(Number(d.temperature_2m_max?.[i + 1])),
    rain: d.precipitation_probability_max?.[i + 1] == null ? null : Number(d.precipitation_probability_max[i + 1])
  }))
  return {
    city,
    updatedAt: now,
    current: {
      temp: Math.round(Number(c.temperature_2m)),
      feelsLike: Math.round(Number(c.apparent_temperature)),
      code: Number(c.weather_code ?? 0),
      wind: Math.round(Number(c.wind_speed_10m))
    },
    days
  }
}

async function locate(city: string): Promise<{ lat: number; lon: number; name: string }> {
  const cached = store.get('geoCache')
  if (cached && cached.city === city) return cached
  const j = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=nl&format=json`
  )
  const r = j?.results?.[0]
  if (!r) throw new Error(`Plaats "${city}" niet gevonden`)
  const geo = { city, lat: Number(r.latitude), lon: Number(r.longitude), name: String(r.name) }
  store.set('geoCache', geo)
  return geo
}

/** Fetch fresh weather; on any failure fall back to the last cached result (flagged stale). */
export async function fetchWeather(city: string, force = false): Promise<WeatherResult> {
  const cache = store.get('weatherCache')
  // Serve the cache while it is fresh (visibility changes must not turn into API calls).
  if (!force && cache && store.get('geoCache')?.city === city && Date.now() - cache.updatedAt < CACHE_TTL_MS) return { data: cache }
  try {
    const geo = await locate(city)
    const j = await getJson(
      'https://api.open-meteo.com/v1/forecast' +
        `?latitude=${geo.lat}&longitude=${geo.lon}` +
        '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&timezone=auto&forecast_days=4&wind_speed_unit=kmh'
    )
    const data = mapWeather(geo.name, j)
    store.set('weatherCache', data)
    return { data }
  } catch (e) {
    const cached = store.get('geoCache')?.city === city ? store.get('weatherCache') : undefined
    const message = e instanceof Error ? e.message : 'Onbekende fout'
    return cached
      ? { data: cached, stale: true, error: 'Offline: laatst bekende weer' }
      : { data: null, error: `Weer ophalen mislukt: ${message}` }
  }
}
