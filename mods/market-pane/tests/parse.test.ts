import { describe, expect, test } from 'claude-code/testing'

import { buildQuoteUrl, movedCodes, parseQuotes } from '../hooks/parse'
import { SAMPLE_BODY } from './fixture'

describe('buildQuoteUrl', () => {
  test('joins all codes into one request without duplicates', () => {
    expect(buildQuoteUrl(['sh000001', 'hkHSI', 'sh000001'])).toBe(
      'https://qt.gtimg.cn/q=sh000001,hkHSI',
    )
  })
})

describe('parseQuotes', () => {
  test('parses every market from one response using numeric fields only', () => {
    const quotes = parseQuotes(['sh000001', 'hkHSI', 'usIXIC'], SAMPLE_BODY)
    for (const code of ['sh000001', 'hkHSI', 'usIXIC']) {
      const quote = quotes[code]!
      expect(quote.isMissing).toBe(false)
      expect(quote.price).toBeGreaterThan(0)
      expect(Math.abs(quote.change - (quote.price - quote.prevClose))).toBeLessThan(1e-9)
      expect(Math.abs(quote.pct - (quote.change / quote.prevClose) * 100)).toBeLessThan(1e-9)
    }
  })

  test('computes change from price and previous close', () => {
    const body = 'v_sh600519="1~?~600519~110.00~100.00~0";'
    expect(parseQuotes(['sh600519'], body).sh600519).toEqual({
      price: 110,
      prevClose: 100,
      change: 10,
      pct: 10,
      isMissing: false,
    })
  })

  test('marks a code absent from the response as missing, others unaffected', () => {
    const quotes = parseQuotes(['sh000001', 'sh999999'], SAMPLE_BODY)
    expect(quotes.sh999999?.isMissing).toBe(true)
    expect(quotes.sh000001?.isMissing).toBe(false)
  })

  test('marks pv_none_match and non-numeric fields as missing', () => {
    expect(parseQuotes(['sh999999'], 'v_pv_none_match="1";').sh999999?.isMissing).toBe(true)
    const bad = 'v_sh600519="1~?~600519~abc~100~0";'
    expect(parseQuotes(['sh600519'], bad).sh600519?.isMissing).toBe(true)
  })

  test('throws on a body with no quote line', () => {
    expect(() => parseQuotes(['sh000001'], '<html>blocked</html>')).toThrow()
  })
})

describe('movedCodes', () => {
  const at = (price: number, isMissing = false) => ({ price, prevClose: 1, change: 0, pct: 0, isMissing })
  test('lists codes whose price changed between two refreshes', () => {
    expect(movedCodes({ a: at(1), b: at(2) }, { a: at(1.5), b: at(2), c: at(3) })).toEqual(['a'])
    expect(movedCodes({ a: at(0, true) }, { a: at(1) })).toEqual([])
  })
})
