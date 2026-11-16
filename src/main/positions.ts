export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Rect extends Point, Size {}
export interface DisplayInfo { id: number; workArea: Rect }

export interface Limits { min: Size; max: Size }
/** Where (and optionally how big) a widget was on one monitor. */
export interface Placement extends Point { width?: number; height?: number }
/** Remembered placement of one widget: where it was on every monitor it has lived on. */
export interface WidgetPositions { last: number; byDisplay: Record<string, Placement> }

/** The store file is user-editable: only trust finite numbers. */
const validPoint = (p: Placement | undefined): Placement | undefined =>
  p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : undefined
const validSize = (p: Placement | undefined): Size | undefined =>
  p && Number.isFinite(p.width) && Number.isFinite(p.height) && (p.width as number) > 0 && (p.height as number) > 0
    ? { width: p.width as number, height: p.height as number }
    : undefined

/** Clamp a size between the widget's limits and the work area (the minimum always wins over a tiny screen). */
export function clampSize(size: Size, limits: Limits, wa: Rect): Size {
  const one = (v: number, min: number, max: number, area: number): number => {
    const value = Number.isFinite(v) ? v : min
    return Math.round(Math.max(min, Math.min(value, max, area)))
  }
  return {
    width: one(size.width, limits.min.width, limits.max.width, wa.width),
    height: one(size.height, limits.min.height, limits.max.height, wa.height)
  }
}

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
  const key = String(displayId)
  return { last: displayId, byDisplay: { ...(prev?.byDisplay ?? {}), [key]: { ...prev?.byDisplay?.[key], x: p.x, y: p.y } } }
}

export function rememberBounds(prev: WidgetPositions | undefined, displayId: number, r: Rect): WidgetPositions {
  return { last: displayId, byDisplay: { ...(prev?.byDisplay ?? {}), [String(displayId)]: { x: r.x, y: r.y, width: r.width, height: r.height } } }
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
  if (!saved || typeof saved !== 'object') return clampToWorkArea(fallback(primary.workArea), size, primary.workArea)
  const home = displays.find((d) => d.id === saved.last)
  const point = validPoint(saved.byDisplay?.[String(saved.last)])
  if (home && point) return clampToWorkArea(point, size, home.workArea)
  if (point) return clampToWorkArea(point, size, primary.workArea)
  return clampToWorkArea(fallback(primary.workArea), size, primary.workArea)
}

/** Full placement (position + size) of a widget: saved size per monitor, clamped to limits and work area. */
export function resolveBounds(
  saved: WidgetPositions | undefined,
  defaults: Size,
  limits: Limits,
  displays: DisplayInfo[],
  primaryId: number,
  fallback: (workArea: Rect) => Point
): Rect {
  const primary = displays.find((d) => d.id === primaryId) ?? displays[0]
  if (!primary) return { x: 0, y: 0, ...defaults }
  const entry = saved && typeof saved === 'object' ? saved.byDisplay?.[String(saved.last)] : undefined
  const home = (saved && displays.find((d) => d.id === saved.last)) || primary
  const size = clampSize(validSize(entry) ?? defaults, limits, home.workArea)
  const point = resolvePosition(saved, size, displays, primaryId, fallback)
  return { ...point, ...size }
}

export type GestureKind = 'move' | 'resize'

/**
 * Window bounds while dragging or resizing. A locked widget never changes: lock means exactly this and nothing else
 * (no click-through, no z-order or visibility change).
 */
export function gestureBounds(kind: GestureKind, origin: Rect, delta: Point, limits: Limits, room: Rect, locked: boolean): Rect {
  if (locked) return origin
  if (kind === 'move') return { x: origin.x + delta.x, y: origin.y + delta.y, width: origin.width, height: origin.height }
  return { x: origin.x, y: origin.y, ...clampSize({ width: origin.width + delta.x, height: origin.height + delta.y }, limits, room) }
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
