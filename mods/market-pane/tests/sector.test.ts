import { describe, expect, test } from 'claude-code/testing'

import { formatSectorPct, heatTier } from '../hooks/sector'

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
