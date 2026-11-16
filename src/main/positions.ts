export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Rect extends Point, Size {}
export interface DisplayInfo { id: number; workArea: Rect }

/** Remembered placement of one widget: where it was on every monitor it has lived on. */
export interface WidgetPositions { last: number; byDisplay: Record<string, Point> }

export function clampToWorkArea(p: Point, size: Size, wa: Rect): Point {
  const maxX = wa.x + wa.width - size.width
  const maxY = wa.y + wa.height - size.height
  // If the window is larger than the area, maxX < wa.x: pin to the top-left.
  return {
    x: Math.round(Math.max(wa.x, Math.min(p.x, Math.max(wa.x, maxX)))),
    y: Math.round(Math.max(wa.y, Math.min(p.y, Math.max(wa.y, maxY))))
  }
}

export function rememberPosition(prev: WidgetPositions | undefined, displayId: number, p: Point): WidgetPositions {
  return { last: displayId, byDisplay: { ...(prev?.byDisplay ?? {}), [String(displayId)]: { x: p.x, y: p.y } } }
}

/**
 * Where a widget should be shown now. Saved position on a still-connected monitor wins (re-clamped in case
 * the resolution shrank). If that monitor is gone we clamp onto the primary display, without erasing the
 * saved entry, so the widget returns when the monitor is plugged back in.
 */
export function resolvePosition(
  saved: WidgetPositions | undefined,
  size: Size,
  displays: DisplayInfo[],
  primaryId: number,
  fallback: (workArea: Rect) => Point
): Point {
  const primary = displays.find((d) => d.id === primaryId) ?? displays[0]
  if (!primary) return { x: 0, y: 0 }
  if (!saved) return clampToWorkArea(fallback(primary.workArea), size, primary.workArea)
  const home = displays.find((d) => d.id === saved.last)
  const point = saved.byDisplay[String(saved.last)]
  if (home && point) return clampToWorkArea(point, size, home.workArea)
  if (point) return clampToWorkArea(point, size, primary.workArea)
  return clampToWorkArea(fallback(primary.workArea), size, primary.workArea)
}

/** Display whose work area overlaps the window most (falls back to the closest centre). */
export function displayForRect(r: Rect, displays: DisplayInfo[]): DisplayInfo | undefined {
  let best: DisplayInfo | undefined
  let bestScore = -Infinity
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  for (const d of displays) {
    const w = d.workArea
    const ox = Math.max(0, Math.min(r.x + r.width, w.x + w.width) - Math.max(r.x, w.x))
    const oy = Math.max(0, Math.min(r.y + r.height, w.y + w.height) - Math.max(r.y, w.y))
    const dist = Math.hypot(cx - (w.x + w.width / 2), cy - (w.y + w.height / 2))
    const score = ox * oy - dist * 1e-6
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}
