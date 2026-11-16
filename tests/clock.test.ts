import { describe, expect, it } from 'vitest'
import { formatClock } from '../src/shared/clock'

const at = (h: number, m: number, s = 0) => new Date(2026, 10, 16, h, m, s)

describe('formatClock 24h', () => {
  it('uses two-digit hours and no period', () => {
    expect(formatClock(at(14, 5), false, false)).toEqual({ time: '14:05', seconds: null, period: null })
    expect(formatClock(at(9, 5), false, false).time).toBe('09:05')
    expect(formatClock(at(0, 0), false, false).time).toBe('00:00')
    expect(formatClock(at(23, 59), false, false).time).toBe('23:59')
  })
})

describe('formatClock 12h', () => {
  it('has no leading zero on the hour and shows AM/PM', () => {
    expect(formatClock(at(14, 5), true, false)).toEqual({ time: '2:05', seconds: null, period: 'PM' })
    expect(formatClock(at(9, 5), true, false)).toEqual({ time: '9:05', seconds: null, period: 'AM' })
    expect(formatClock(at(1, 0), true, false)).toEqual({ time: '1:00', seconds: null, period: 'AM' })
    expect(formatClock(at(23, 59), true, false)).toEqual({ time: '11:59', seconds: null, period: 'PM' })
  })
  it('midnight is 12:00 AM and noon is 12:00 PM', () => {
    expect(formatClock(at(0, 0), true, false)).toEqual({ time: '12:00', seconds: null, period: 'AM' })
    expect(formatClock(at(0, 30), true, false)).toEqual({ time: '12:30', seconds: null, period: 'AM' })
    expect(formatClock(at(12, 0), true, false)).toEqual({ time: '12:00', seconds: null, period: 'PM' })
    expect(formatClock(at(12, 59), true, false)).toEqual({ time: '12:59', seconds: null, period: 'PM' })
  })
})

describe('formatClock seconds', () => {
  it('works with both formats and is zero-padded', () => {
    expect(formatClock(at(14, 5, 7), false, true)).toEqual({ time: '14:05', seconds: '07', period: null })
    expect(formatClock(at(14, 5, 7), true, true)).toEqual({ time: '2:05', seconds: '07', period: 'PM' })
    expect(formatClock(at(0, 0, 59), true, true)).toEqual({ time: '12:00', seconds: '59', period: 'AM' })
  })
})
