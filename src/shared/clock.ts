export interface ClockParts {
  /** "14:05" (24h, two-digit hour) or "2:05" (12h, no leading zero) */
  time: string
  /** two digits, or null when seconds are off */
  seconds: string | null
  /** "AM" / "PM" in 12h mode, null in 24h mode */
  period: 'AM' | 'PM' | null
}

/** Clock text for the widget (local time). 12h: midnight = 12:xx AM, noon = 12:xx PM. */
export function formatClock(date: Date, hour12: boolean, withSeconds: boolean): ClockParts {
  const two = (n: number): string => String(n).padStart(2, '0')
  const h = date.getHours()
  const minutes = two(date.getMinutes())
  const seconds = withSeconds ? two(date.getSeconds()) : null
  if (!hour12) return { time: `${two(h)}:${minutes}`, seconds, period: null }
  return { time: `${h % 12 === 0 ? 12 : h % 12}:${minutes}`, seconds, period: h < 12 ? 'AM' : 'PM' }
}
