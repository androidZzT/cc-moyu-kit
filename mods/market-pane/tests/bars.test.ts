import { describe, expect, test } from 'claude-code/testing'

import { BAR_CELLS, pctBar } from '../hooks/bars'

describe('pctBar', () => {
  test('+0.50% fills one eighth of the bar (half a cell)', () => {
    expect(pctBar(0.5)).toBe('▌')
  })

  test('scales linearly in eighths of a cell', () => {
    expect(pctBar(1)).toBe('█')
    expect(pctBar(-1.25)).toBe('█▎')
    expect(pctBar(2.6)).toBe('██▋')
  })

  test('caps at a full bar from 4% without overflowing', () => {
    expect(pctBar(4)).toBe('█'.repeat(BAR_CELLS))
    expect(pctBar(10)).toBe('█'.repeat(BAR_CELLS))
    expect(pctBar(-20)).toBe('█'.repeat(BAR_CELLS))
  })

  test('is empty for a flat move or no data', () => {
    expect(pctBar(0)).toBe('')
    expect(pctBar(0.01)).toBe('')
    expect(pctBar(Number.NaN)).toBe('')
  })
})
