import { describe, expect, it } from 'vitest'
import { clampSize, clampToWorkArea, rememberBounds, rememberPosition, resolveBounds, resolvePosition } from '../src/main/positions'
import type { DisplayInfo } from '../src/main/positions'

const d1: DisplayInfo = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }
const d2: DisplayInfo = { id: 2, workArea: { x: 1920, y: 0, width: 1920, height: 1040 } }
const size = { width: 300, height: 150 }
const fallback = (wa: { x: number; y: number; width: number }) => ({ x: wa.x + wa.width - 340, y: wa.y + 24 })

describe('clampToWorkArea', () => {
  it('keeps an on-screen point unchanged', () => {
    expect(clampToWorkArea({ x: 100, y: 100 }, size, d1.workArea)).toEqual({ x: 100, y: 100 })
  })
  it('pulls a partly off-screen window back inside', () => {
    expect(clampToWorkArea({ x: 1800, y: 1000 }, size, d1.workArea)).toEqual({ x: 1620, y: 890 })
    expect(clampToWorkArea({ x: -50, y: -20 }, size, d1.workArea)).toEqual({ x: 0, y: 0 })
  })
  it('aligns top-left when the window is larger than the work area', () => {
    const tiny = { x: 10, y: 20, width: 100, height: 100 }
    expect(clampToWorkArea({ x: 500, y: 500 }, size, tiny)).toEqual({ x: 10, y: 20 })
  })
})

describe('resolvePosition', () => {
  it('uses the fallback on the primary display when nothing is saved', () => {
    expect(resolvePosition(undefined, size, [d1, d2], 1, fallback)).toEqual({ x: 1580, y: 24 })
  })
  it('restores the saved position on its own display', () => {
    const saved = rememberPosition(undefined, 2, { x: 2500, y: 300 })
    expect(resolvePosition(saved, size, [d1, d2], 1, fallback)).toEqual({ x: 2500, y: 300 })
  })
  it('clamps onto the primary display when the saved monitor disappeared', () => {
    const saved = rememberPosition(undefined, 2, { x: 2500, y: 300 })
    const pos = resolvePosition(saved, size, [d1], 1, fallback)
    expect(pos.x).toBeGreaterThanOrEqual(0)
    expect(pos.x + size.width).toBeLessThanOrEqual(1920)
    expect(pos.y).toBe(300)
  })
  it('does not forget the old monitor position, so it returns when the monitor does', () => {
    const saved = rememberPosition(undefined, 2, { x: 2500, y: 300 })
    resolvePosition(saved, size, [d1], 1, fallback)
    expect(resolvePosition(saved, size, [d1, d2], 1, fallback)).toEqual({ x: 2500, y: 300 })
  })
  it('ignores corrupt saved data (NaN, missing fields) instead of throwing', () => {
    const bad = { last: 1, byDisplay: { '1': { x: Number.NaN, y: 5 } } }
    expect(resolvePosition(bad, size, [d1], 1, fallback)).toEqual({ x: 1580, y: 24 })
    expect(resolvePosition({ last: 1 } as never, size, [d1], 1, fallback)).toEqual({ x: 1580, y: 24 })
    expect(resolvePosition('junk' as never, size, [d1], 1, fallback)).toEqual({ x: 1580, y: 24 })
  })
  it('re-clamps a saved position if the display got smaller', () => {
    const saved = rememberPosition(undefined, 1, { x: 1800, y: 900 })
    const small: DisplayInfo = { id: 1, workArea: { x: 0, y: 0, width: 1280, height: 720 } }
    expect(resolvePosition(saved, size, [small], 1, fallback)).toEqual({ x: 980, y: 570 })
  })
})

describe('rememberPosition', () => {
  it('is immutable and tracks the last display', () => {
    const a = rememberPosition(undefined, 1, { x: 1, y: 2 })
    const b = rememberPosition(a, 2, { x: 3, y: 4 })
    expect(a).toEqual({ last: 1, byDisplay: { '1': { x: 1, y: 2 } } })
    expect(b).toEqual({ last: 2, byDisplay: { '1': { x: 1, y: 2 }, '2': { x: 3, y: 4 } } })
  })
})

const limits = { min: { width: 200, height: 100 }, max: { width: 600, height: 400 } }
const defaults = { width: 300, height: 150 }

describe('clampSize', () => {
  it('keeps a size inside min/max', () => {
    expect(clampSize({ width: 100, height: 50 }, limits, d1.workArea)).toEqual({ width: 200, height: 100 })
    expect(clampSize({ width: 900, height: 900 }, limits, d1.workArea)).toEqual({ width: 600, height: 400 })
    expect(clampSize({ width: 320, height: 210 }, limits, d1.workArea)).toEqual({ width: 320, height: 210 })
  })
  it('never exceeds the work area (but never goes below the minimum either)', () => {
    const small = { x: 0, y: 0, width: 500, height: 300 }
    expect(clampSize({ width: 600, height: 400 }, limits, small)).toEqual({ width: 500, height: 300 })
    const tiny = { x: 0, y: 0, width: 150, height: 60 }
    expect(clampSize({ width: 300, height: 150 }, limits, tiny)).toEqual({ width: 200, height: 100 })
  })
  it('rounds and survives NaN', () => {
    expect(clampSize({ width: 250.6, height: 120.2 }, limits, d1.workArea)).toEqual({ width: 251, height: 120 })
    expect(clampSize({ width: Number.NaN, height: 150 }, limits, d1.workArea)).toEqual({ width: 200, height: 150 })
  })
})

describe('resolveBounds / rememberBounds', () => {
  it('uses default size and fallback position when nothing is saved', () => {
    expect(resolveBounds(undefined, defaults, limits, [d1], 1, fallback)).toEqual({ x: 1580, y: 24, ...defaults })
  })
  it('restores a saved size per monitor', () => {
    let saved = rememberBounds(undefined, 1, { x: 100, y: 100, width: 400, height: 250 })
    saved = rememberBounds(saved, 2, { x: 2000, y: 50, width: 220, height: 120 })
    expect(resolveBounds(saved, defaults, limits, [d1, d2], 1, fallback)).toEqual({ x: 2000, y: 50, width: 220, height: 120 })
    const onlyD1 = rememberBounds(rememberBounds(undefined, 2, { x: 2000, y: 50, width: 220, height: 120 }), 1, { x: 100, y: 100, width: 400, height: 250 })
    expect(resolveBounds({ ...onlyD1, last: 1 }, defaults, limits, [d1, d2], 1, fallback)).toEqual({ x: 100, y: 100, width: 400, height: 250 })
  })
  it('clamps a saved size to the limits and to a smaller monitor, then re-clamps the position', () => {
    const saved = rememberBounds(undefined, 1, { x: 1500, y: 900, width: 600, height: 400 })
    const small: DisplayInfo = { id: 1, workArea: { x: 0, y: 0, width: 500, height: 300 } }
    expect(resolveBounds(saved, defaults, limits, [small], 1, fallback)).toEqual({ x: 0, y: 0, width: 500, height: 300 })
  })
  it('ignores corrupt saved sizes', () => {
    const bad = { last: 1, byDisplay: { '1': { x: 10, y: 10, width: Number.NaN, height: -5 } } }
    expect(resolveBounds(bad, defaults, limits, [d1], 1, fallback)).toEqual({ x: 10, y: 10, ...defaults })
  })
  it('rememberPosition keeps an existing size for that monitor', () => {
    const a = rememberBounds(undefined, 1, { x: 1, y: 2, width: 300, height: 200 })
    expect(rememberPosition(a, 1, { x: 5, y: 6 }).byDisplay['1']).toEqual({ x: 5, y: 6, width: 300, height: 200 })
  })
})
