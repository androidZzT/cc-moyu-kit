import { describe, expect, test } from 'claude-code/testing'

import {
  MAX_SAMPLES,
  buildMinuteUrl,
  parseMinute,
  resample,
  sampleUs,
  sparkline,
} from '../hooks/trend'
import type { Quote } from '../types'
import { bj } from './harness'
import { MINUTE_BODY, MINUTE_UNKNOWN_BODY } from './trend-fixture'

const quote = (price: number): Quote => ({ price, prevClose: 100, change: price - 100, pct: price - 100, isMissing: false })

describe('parseMinute', () => {
  test('A股指数: the series starts at the 09:30 price and ends at the latest minute', () => {
    expect(buildMinuteUrl('sh000001')).toBe('https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=sh000001')
    const series = parseMinute('sh000001', MINUTE_BODY)
    expect(series).toHaveLength(7)
    expect(series[0]).toBe(3804.09)
    expect(series[6]).toBe(3813.79)
  })

  test('an unknown code yields an empty series', () => {
    expect(parseMinute('sh999999', MINUTE_UNKNOWN_BODY)).toEqual([])
  })

  test('throws on a body that is not the expected JSON, so the caller can keep the old series', () => {
    expect(() => parseMinute('sh000001', '')).toThrow()
    expect(() => parseMinute('sh000001', '{"code":-1,"msg":"param error","data":[]}')).toThrow()
  })
})

describe('resample', () => {
  test('keeps a series that already fits', () => {
    expect(resample([1, 2, 3], 5)).toEqual([1, 2, 3])
  })

  test('takes the last point of each equal bucket, so the latest point stays rightmost', () => {
    expect(resample([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([2, 5, 7, 10])
    expect(resample([1, 2, 3], 0)).toEqual([])
  })
})

describe('sparkline', () => {
  test('冲高回落: the middle is highest and both ends are low', () => {
    const line = sparkline([10, 12, 14, 16, 14, 12, 10.2])
    expect(line).toBe('▁▃▆█▆▃▁')
  })

  test('a flat series sits in the middle band', () => {
    expect(sparkline([5, 5, 5])).toBe('▄▄▄')
  })

  test('暂无走势数据: fewer than 2 points draws nothing', () => {
    expect(sparkline([])).toBe('')
    expect(sparkline([5])).toBe('')
  })
})

describe('sampleUs', () => {
  const codes = ['usDJI', 'usIXIC']
  const quotes = { usDJI: quote(101), usIXIC: { ...quote(0), isMissing: true } }
  const usOpen = bj(2026, 10, 9, 22, 0) // Friday 10:00 New York (EDT)

  test('appends the price of each quoted US code during the US session', () => {
    const first = sampleUs({}, quotes, codes, usOpen, undefined)
    expect(first.usDay).toBe('2026-10-09')
    expect(first.trends).toEqual({ usDJI: [101] })
    const second = sampleUs(first.trends, { usDJI: quote(102) }, codes, usOpen + 10_000, first.usDay)
    expect(second.trends.usDJI).toEqual([101, 102])
  })

  test('休市不采样: nothing is added while the US market is closed', () => {
    const before = { usDJI: [101] }
    const result = sampleUs(before, quotes, codes, bj(2026, 10, 9, 12, 0), '2026-10-09')
    expect(result.trends).toBe(before)
    expect(result.usDay).toBe('2026-10-09')
  })

  test('新交易日: the first sample of a new US day drops the previous day', () => {
    const result = sampleUs({ usDJI: [90, 91], sh000001: [3800] }, quotes, codes, bj(2026, 10, 12, 22, 0), '2026-10-09')
    expect(result.usDay).toBe('2026-10-12')
    expect(result.trends).toEqual({ usDJI: [101], sh000001: [3800] })
  })

  test(`keeps only the latest ${MAX_SAMPLES} samples`, () => {
    const full = { usDJI: Array.from({ length: MAX_SAMPLES }, (_, i) => i) }
    const result = sampleUs(full, quotes, codes, usOpen, '2026-10-09')
    expect(result.trends.usDJI).toHaveLength(MAX_SAMPLES)
    expect(result.trends.usDJI?.[0]).toBe(1)
    expect(result.trends.usDJI?.at(-1)).toBe(101)
  })
})
