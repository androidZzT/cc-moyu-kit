import { describe, expect, test } from 'claude-code/testing'

import { buildMoversUrl, formatMoverPct, parseMovers } from '../hooks/movers'
import { MOVERS_BODIES } from './movers-fixture'

const CHIPS = 'pt02003891'
const DRUGS = 'pt02131362'

describe('buildMoversUrl', () => {
  test('one board, one side, a few spare entries for the ST names dropped later', () => {
    expect(buildMoversUrl(CHIPS, 'gainers')).toMatch(/^http:\/\/proxy\.finance\.qq\.com\/cgi\/cgi-bin\/rank\/hs\/getBoardRankList\?/)
    expect(buildMoversUrl(CHIPS, 'gainers')).toContain(`board_code=${CHIPS}`)
    expect(buildMoversUrl(CHIPS, 'gainers')).toContain('direct=down')
    expect(buildMoversUrl(CHIPS, 'losers')).toContain('direct=up')
    expect(buildMoversUrl(CHIPS, 'losers')).toContain('count=6')
  })
})

describe('parseMovers', () => {
  test('the first three stocks with code, name and percent, in the listed order', () => {
    expect(parseMovers(MOVERS_BODIES[CHIPS]!.down)).toEqual([
      { code: 'sz002692', name: '远程股份', pct: 10.08 },
      { code: 'sz002990', name: '盛视科技', pct: 10.01 },
      { code: 'sh603232', name: '格尔软件', pct: 10.01 },
    ])
  })

  test('跌幅榜含 ST: *ST and ST names are dropped and the next stocks fill in', () => {
    expect(parseMovers(MOVERS_BODIES[CHIPS]!.up).map(mover => mover.name)).toEqual(['园林股份', '宏昌电子', '兴发集团'])
    expect(parseMovers(MOVERS_BODIES[DRUGS]!.down).map(mover => mover.name)).toEqual(['莱美药业', '华北制药', '吉华集团'])
  })

  test('throws on an error reply or a body that is not JSON, so the caller can keep old data', () => {
    expect(() => parseMovers('')).toThrow()
    expect(() => parseMovers('{"code":51,"msg":"invalid"}')).toThrow()
  })
})

describe('formatMoverPct', () => {
  test('one decimal with a sign', () => {
    expect(formatMoverPct(10.08)).toBe('+10.1')
    expect(formatMoverPct(-9.45)).toBe('-9.5')
    expect(formatMoverPct(0)).toBe('0.0')
  })
})
