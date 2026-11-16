import { describe, expect, it } from 'vitest'
import { clampToWorkArea, rememberPosition, resolvePosition } from '../src/main/positions'
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
