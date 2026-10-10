import { describe, expect, test } from 'claude-code/testing'

import type { Candle } from '../types'
import { DIVIDER, layoutChart } from '../hooks/kline-chart'
import type { ChartRow } from '../hooks/kline-chart'

const candle = (open: number, close: number, high: number, low: number): Candle => ({ date: '', open, close, high, low })

/** Each row's runs joined back into one string, tones dropped. */
const text = (rows: readonly ChartRow[]): string[] => rows.map(row => row.map(run => run.text).join(''))

describe('layoutChart', () => {
  test('one column per candle, a divider after the visible part, blank hidden columns', () => {
    const candles = [candle(10, 20, 20, 10), candle(20, 10, 20, 10), candle(10, 20, 20, 10)]
    const rows = layoutChart({ candles, visible: 2, shown: 0, rows: 4, columns: 40, reveal: 1 })
    expect(rows).toHaveLength(4)
    expect(text(rows).every(line => line.length === 4)).toBe(true)
    expect(text(rows).every(line => line[2] === DIVIDER)).toBe(true)
    expect(text(rows).every(line => line[3] === ' ')).toBe(true)
  })

  test('body fills its rows with █, wick outside the body draws │; up is up, down is down', () => {
    // range 0..100 padded; the first candle's body 40..60 with a wick to 90, the second falls
    const candles = [candle(40, 60, 90, 40), candle(60, 40, 60, 10)]
    const rows = layoutChart({ candles, visible: 2, shown: 0, rows: 10, columns: 40, reveal: 0 })
    const first = text(rows).map(line => line[0])
    expect(first).toContain('█')
    expect(first).toContain('│')
    expect(first.indexOf('│')).toBeLessThan(first.indexOf('█'))
    const tones = new Set(rows.flatMap(row => row.filter(run => run.text.trim() !== '' && run.text !== DIVIDER).map(run => run.tone)))
    expect([...tones].sort()).toEqual(['down', 'up'])
  })

  test('adjacent cells of one tone merge into one run', () => {
    const candles = Array.from({ length: 6 }, () => candle(10, 20, 20, 10))
    const rows = layoutChart({ candles, visible: 6, shown: 0, rows: 3, columns: 40, reveal: 0 })
    expect(rows.every(row => row.length <= 2)).toBe(true)
  })

  test('a revealed candle beyond the visible range is clipped to the edge, still drawn', () => {
    const candles = [candle(10, 11, 12, 9), candle(11, 10, 12, 9), candle(10, 500, 500, 10)]
    const rows = layoutChart({ candles, visible: 2, shown: 1, rows: 6, columns: 40, reveal: 1 })
    expect(text(rows)[0]?.[3]).toBe('█')
  })

  test('keeps the latest visible candles when the width is short', () => {
    const candles = Array.from({ length: 50 }, (_, i) => candle(i, i + 1, i + 1, i))
    const rows = layoutChart({ candles, visible: 45, shown: 0, rows: 5, columns: 20, reveal: 5 })
    expect(text(rows).every(line => line.length === 20)).toBe(true)
    expect(text(rows).every(line => line[14] === DIVIDER)).toBe(true)
  })
})
