import { describe, expect, test } from 'claude-code/testing'

import { buildKlineUrl, parseKline } from '../hooks/kline'
import { CN_KLINE_BODY, HK_KLINE_BODY } from './kline-fixture'

describe('parseKline', () => {
  test('builds the forward-adjusted daily URL on the DigiCert host', () => {
    expect(buildKlineUrl('sh600519')).toBe('https://ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600519,day,,,320,qfq')
  })

  test('A股: reads qfqday as date, open, close, high, low', () => {
    const candles = parseKline('sh600519', CN_KLINE_BODY)
    expect(candles).toHaveLength(3)
    expect(candles[2]).toEqual({ date: '2026-10-09', open: 1255.42, close: 1263, high: 1282, low: 1255.42 })
  })

  test('港股: reads day and ignores the trailing notice object', () => {
    const candles = parseKline('hk00700', HK_KLINE_BODY)
    expect(candles).toHaveLength(3)
    expect(candles[0]).toEqual({ date: '2026-10-07', open: 425.6, close: 420.6, high: 426, low: 419.2 })
  })

  test('drops malformed candles and throws when no series is present', () => {
    const body = JSON.stringify({ code: 0, data: { sh600000: { day: [['2026-10-09', 'x', '1', '1', '1'], ['2026-10-09', '1', '2', '3', '0.5']] } } })
    expect(parseKline('sh600000', body)).toEqual([{ date: '2026-10-09', open: 1, close: 2, high: 3, low: 0.5 }])
    expect(() => parseKline('sh600000', '{"code":11,"data":"","msg":"URL illeagal"}')).toThrow()
    expect(() => parseKline('sh600000', 'not json')).toThrow()
  })
})
