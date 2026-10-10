import { describe, expect, test } from 'claude-code/testing'

import { buildSectorUrl, formatSectorPct, heatTier, orderCells, parseSectorRank } from '../hooks/sector'
import { GAINERS_BODY, LOSERS_BODY } from './sector-fixture'

describe('parseSectorRank', () => {
  test('reads name and change percent of each listed industry', () => {
    expect(buildSectorUrl('gainers')).toMatch(/^http:\/\/proxy\.finance\.qq\.com\//)
    expect(buildSectorUrl('gainers')).toContain('board_type=hy2')
    expect(buildSectorUrl('gainers')).toContain('direct=down')
    expect(buildSectorUrl('losers')).toContain('direct=up')
    const gainers = parseSectorRank(GAINERS_BODY)
    expect(gainers).toHaveLength(6)
    expect(gainers[0]).toEqual({ name: '数字媒体', pct: 8 })
  })

  test('throws on an error reply or a body that is not JSON, so the caller can keep old data', () => {
    expect(() => parseSectorRank('')).toThrow()
    expect(() => parseSectorRank('{"code":-1,"msg":"error","data":null}')).toThrow()
  })
})

describe('orderCells', () => {
  test('正常展示: 6 gainers then 6 losers, each high to low, biggest gain first and biggest loss last', () => {
    const cells = orderCells(parseSectorRank(GAINERS_BODY), parseSectorRank(LOSERS_BODY))
    expect(cells).toHaveLength(12)
    expect(cells[0]?.name).toBe('数字媒体')
    expect(cells[5]?.name).toBe('广告营销')
    expect(cells[6]?.name).toBe('其他电子Ⅱ')
    expect(cells[11]?.name).toBe('元件')
    expect(cells.map(c => c.pct)).toEqual([...cells.map(c => c.pct)].sort((a, b) => b - a))
  })
})

describe('heatTier and formatSectorPct', () => {
  test('大涨板块 is strong red, 小跌板块 is mild green, from 3% on is strong', () => {
    expect(heatTier(7.9)).toBe('upStrong')
    expect(heatTier(3)).toBe('upStrong')
    expect(heatTier(2.99)).toBe('upMild')
    expect(heatTier(-1.1)).toBe('downMild')
    expect(heatTier(-3.01)).toBe('downStrong')
    expect(heatTier(0)).toBe('flat')
  })

  test('one decimal with a sign', () => {
    expect(formatSectorPct(8)).toBe('+8.0')
    expect(formatSectorPct(-4.27)).toBe('-4.3')
    expect(formatSectorPct(0)).toBe('0.0')
  })
})
