import { describe, expect, test } from 'claude-code/testing'

import {
  CLOSED_INTERVAL_MS,
  OPEN_INTERVAL_MS,
  isMarketOpen,
  isUsDaylightTime,
  refreshIntervalMs,
} from '../hooks/hours'

/** Beijing wall-clock time to epoch ms. */
const bj = (y: number, mo: number, d: number, h: number, mi = 0): number =>
  Date.UTC(y, mo - 1, d, h - 8, mi)

describe('A股 / 港股 sessions (Beijing time)', () => {
  test('A股 open on a weekday morning, closed at lunch and after close', () => {
    expect(isMarketOpen('cn', bj(2026, 10, 9, 10, 0))).toBe(true) // Fri
    expect(isMarketOpen('cn', bj(2026, 10, 9, 9, 29))).toBe(false)
    expect(isMarketOpen('cn', bj(2026, 10, 9, 9, 30))).toBe(true)
    expect(isMarketOpen('cn', bj(2026, 10, 9, 12, 0))).toBe(false)
    expect(isMarketOpen('cn', bj(2026, 10, 9, 14, 59))).toBe(true)
    expect(isMarketOpen('cn', bj(2026, 10, 9, 15, 0))).toBe(false)
  })

  test('港股 afternoon runs to 16:00', () => {
    expect(isMarketOpen('hk', bj(2026, 10, 9, 15, 30))).toBe(true)
    expect(isMarketOpen('hk', bj(2026, 10, 9, 12, 30))).toBe(false)
    expect(isMarketOpen('hk', bj(2026, 10, 9, 16, 0))).toBe(false)
  })

  test('closed on weekends', () => {
    expect(isMarketOpen('cn', bj(2026, 10, 10, 10, 0))).toBe(false) // Sat
    expect(isMarketOpen('hk', bj(2026, 10, 11, 10, 0))).toBe(false) // Sun
  })
})

describe('美股 sessions with DST', () => {
  test('DST boundaries for 2026: Mar 8 to Nov 1', () => {
    expect(isUsDaylightTime(Date.UTC(2026, 2, 8, 6, 59))).toBe(false)
    expect(isUsDaylightTime(Date.UTC(2026, 2, 8, 7, 0))).toBe(true)
    expect(isUsDaylightTime(Date.UTC(2026, 10, 1, 5, 59))).toBe(true)
    expect(isUsDaylightTime(Date.UTC(2026, 10, 1, 6, 0))).toBe(false)
  })

  test('summer: opens 21:30 Beijing, closes 04:00 Beijing', () => {
    expect(isMarketOpen('us', bj(2026, 10, 8, 21, 29))).toBe(false)
    expect(isMarketOpen('us', bj(2026, 10, 8, 21, 30))).toBe(true)
    expect(isMarketOpen('us', bj(2026, 10, 9, 3, 59))).toBe(true)
    expect(isMarketOpen('us', bj(2026, 10, 9, 4, 0))).toBe(false)
  })

  test('winter: opens 22:30 Beijing, closes 05:00 Beijing', () => {
    expect(isMarketOpen('us', bj(2026, 12, 8, 22, 29))).toBe(false)
    expect(isMarketOpen('us', bj(2026, 12, 8, 22, 30))).toBe(true)
    expect(isMarketOpen('us', bj(2026, 12, 9, 4, 59))).toBe(true)
    expect(isMarketOpen('us', bj(2026, 12, 9, 5, 0))).toBe(false)
  })

  test('Saturday morning Beijing is still Friday session in New York', () => {
    expect(isMarketOpen('us', bj(2026, 10, 10, 2, 0))).toBe(true)
    expect(isMarketOpen('us', bj(2026, 10, 10, 22, 0))).toBe(false)
  })
})

describe('refreshIntervalMs', () => {
  const all = ['cn', 'hk', 'us'] as const
  test('10s when any market is open', () => {
    expect(refreshIntervalMs(all, bj(2026, 10, 9, 10, 0))).toBe(OPEN_INTERVAL_MS)
  })
  test('5 min when all markets are closed', () => {
    expect(refreshIntervalMs(all, bj(2026, 10, 10, 12, 0))).toBe(CLOSED_INTERVAL_MS)
  })
})
