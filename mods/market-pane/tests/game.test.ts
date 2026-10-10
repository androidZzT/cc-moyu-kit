import { describe, expect, test } from 'claude-code/testing'

import type { Candle } from '../types'
import {
  GAME_POOL,
  MAX_VISIBLE,
  MIN_VISIBLE,
  REVEAL_DAYS,
  buildPool,
  makeRound,
  mulberry32,
  parseGameMessage,
  sanitizeScore,
  scoreAfter,
} from '../hooks/game'

/** Candles whose close follows `closes`; open is the previous close. */
const series = (closes: readonly number[]): Candle[] =>
  closes.map((close, i) => {
    const open = closes[i - 1] ?? close
    return { date: `d${i}`, open, close, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1 }
  })

const rising = (n: number): number[] => Array.from({ length: n }, (_, i) => 100 + i)

describe('pool', () => {
  test('built-in pool holds only A股/港股 codes, unique', () => {
    expect(GAME_POOL.length).toBeGreaterThanOrEqual(20)
    expect(GAME_POOL.every(item => /^(sh|sz|hk)/.test(item.code))).toBe(true)
    expect(new Set(GAME_POOL.map(item => item.code)).size).toBe(GAME_POOL.length)
  })

  test('adds A股/港股 watchlist codes, skips US codes and duplicates', () => {
    const pool = buildPool([
      { code: 'sh688256', name: '寒武纪' },
      { code: 'usAAPL', name: '苹果' },
      { code: GAME_POOL[0]?.code ?? '', name: 'dup' },
    ])
    expect(pool).toHaveLength(GAME_POOL.length + 1)
    expect(pool.some(item => item.code === 'usAAPL')).toBe(false)
    expect(pool.at(-1)).toEqual({ code: 'sh688256', name: '寒武纪' })
  })
})

describe('mulberry32', () => {
  test('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const draws = Array.from({ length: 50 }, () => a())
    expect(draws).toEqual(Array.from({ length: 50 }, () => b()))
    expect(draws.every(x => x >= 0 && x < 1)).toBe(true)
  })
})

describe('makeRound', () => {
  test('cuts so that MIN_VISIBLE..MAX_VISIBLE candles show and REVEAL_DAYS stay hidden', () => {
    const candles = series(rising(320))
    for (let seed = 1; seed < 30; seed += 1) {
      const round = makeRound(candles, mulberry32(seed))
      expect(round).toBeDefined()
      if (round === undefined) continue
      expect(round.visible).toBeGreaterThanOrEqual(MIN_VISIBLE)
      expect(round.visible).toBeLessThanOrEqual(MAX_VISIBLE)
      expect(round.candles).toHaveLength(round.visible + REVEAL_DAYS)
      expect(round.answer).toBe('up')
    }
  })

  test('answer and change compare the close REVEAL_DAYS later with the last visible close', () => {
    const closes = [...rising(60), 150, 140, 130, 120, 110]
    const round = makeRound(series(closes), () => 0.999)
    expect(round?.visible).toBe(60)
    expect(round?.answer).toBe('down')
    expect(Math.abs((round?.changePct ?? 0) - ((110 - 159) / 159) * 100)).toBeLessThan(1e-9)
  })

  test('a flat outcome is never dealt: undefined when every cut is flat', () => {
    expect(makeRound(series(Array.from({ length: 80 }, () => 100)), mulberry32(7))).toBeUndefined()
  })

  test('too short a history yields undefined', () => {
    expect(makeRound(series(rising(MIN_VISIBLE + REVEAL_DAYS - 1)), mulberry32(1))).toBeUndefined()
  })
})

describe('score', () => {
  test('a right guess adds to correct and streak and lifts best; a wrong one resets the streak', () => {
    const start = { played: 0, correct: 0, streak: 0, best: 0 }
    const one = scoreAfter(start, true)
    const two = scoreAfter(one, true)
    const miss = scoreAfter(two, false)
    expect(two).toEqual({ played: 2, correct: 2, streak: 2, best: 2 })
    expect(miss).toEqual({ played: 3, correct: 2, streak: 0, best: 2 })
    expect(start.played).toBe(0)
  })

  test('sanitizeScore keeps non-negative integers and falls back to zero', () => {
    expect(sanitizeScore({ played: 5, correct: 3, streak: 1, best: 2 })).toEqual({ played: 5, correct: 3, streak: 1, best: 2 })
    expect(sanitizeScore({ played: -1, correct: 'x', streak: 1.5 })).toEqual({ played: 0, correct: 0, streak: 0, best: 0 })
    expect(sanitizeScore(undefined)).toEqual({ played: 0, correct: 0, streak: 0, best: 0 })
    expect(sanitizeScore({ played: 2, correct: 9, streak: 0, best: 0 }).correct).toBe(2)
  })
})

describe('parseGameMessage', () => {
  test('accepts next, quit and a guess with a round id; rejects everything else', () => {
    expect(parseGameMessage({ type: 'next' })).toEqual({ type: 'next' })
    expect(parseGameMessage({ type: 'quit' })).toEqual({ type: 'quit' })
    expect(parseGameMessage({ type: 'guess', round: 3, guess: 'up' })).toEqual({ type: 'guess', round: 3, guess: 'up' })
    expect(parseGameMessage({ type: 'guess', round: 3, guess: 'sideways' })).toBeUndefined()
    expect(parseGameMessage({ type: 'guess', round: '3', guess: 'up' })).toBeUndefined()
    expect(parseGameMessage('next')).toBeUndefined()
    expect(parseGameMessage(null)).toBeUndefined()
  })
})
