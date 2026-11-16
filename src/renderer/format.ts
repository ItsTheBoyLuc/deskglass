/** WMO weather code -> emoji + Dutch label (Open-Meteo). */
export function weatherInfo(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Helder' }
  if (code === 1) return { emoji: '🌤️', label: 'Overwegend helder' }
  if (code === 2) return { emoji: '⛅', label: 'Half bewolkt' }
  if (code === 3) return { emoji: '☁️', label: 'Bewolkt' }
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Mist' }
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'Motregen' }
  if (code >= 61 && code <= 67) return { emoji: '🌧️', label: 'Regen' }
  if (code >= 71 && code <= 77) return { emoji: '🌨️', label: 'Sneeuw' }
  if (code >= 80 && code <= 82) return { emoji: '🌧️', label: 'Buien' }
  if (code === 85 || code === 86) return { emoji: '🌨️', label: 'Sneeuwbuien' }
  if (code >= 95) return { emoji: '⛈️', label: 'Onweer' }
  return { emoji: '🌡️', label: 'Onbekend' }
}

export function formatRate(bytesPerSec: number | null): string {
  if (bytesPerSec === null) return 'n/a'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let v = bytesPerSec
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

export const meterClass = (pct: number): string => (pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : '')

const nl = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('nl-NL', o)
export const fmtDate = nl({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export const fmtTime = nl({ hour: '2-digit', minute: '2-digit' })
export const fmtWeekdayShort = nl({ weekday: 'short' })
export const fmtDayHeading = nl({ weekday: 'long', day: 'numeric', month: 'long' })
