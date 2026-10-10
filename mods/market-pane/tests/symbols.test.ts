import { describe, expect, test } from 'claude-code/testing'

import { INDICES, marketOf, normalizeCode } from '../hooks/symbols'

describe('normalizeCode', () => {
  test('accepts and normalizes valid codes', () => {
    expect(normalizeCode('SH600519')).toBe('sh600519')
    expect(normalizeCode('hk00700')).toBe('hk00700')
    expect(normalizeCode('usAAPL')).toBe('usAAPL')
    expect(normalizeCode('USaapl')).toBe('usAAPL')
    expect(normalizeCode('bj830799')).toBe('bj830799')
    expect(normalizeCode('hkhsi')).toBe('hkHSI')
    expect(normalizeCode('usBRK.B')).toBe('usBRK.B')
  })

  test('rejects codes without market prefix or with wrong length', () => {
    expect(normalizeCode('600519')).toBeUndefined()
    expect(normalizeCode('sh60051')).toBeUndefined()
    expect(normalizeCode('sh6005190')).toBeUndefined()
    expect(normalizeCode('hk0070')).toBeUndefined()
    expect(normalizeCode('us')).toBeUndefined()
    expect(normalizeCode('xx600519')).toBeUndefined()
  })
})

test('built-in indices cover three markets with valid codes', () => {
  expect(INDICES).toHaveLength(8)
  for (const index of INDICES) {
    expect(normalizeCode(index.code)).toBe(index.code)
    expect(marketOf(index.code)).toBe(index.market)
  }
})
