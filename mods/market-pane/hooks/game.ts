import type { Candle, GameRound, GameScore, Guess, WatchItem } from '../types'
import { marketOf } from './symbols'

/** Trading days hidden after the cut; the guess is about the close this many days later. */
export const REVEAL_DAYS = 5
/** Fewest candles a round shows, so the chart has a shape to read. */
export const MIN_VISIBLE = 40
/** Most candles a round keeps; a wide pane shows at most this many. */
export const MAX_VISIBLE = 120
/** Cuts tried before a code is given up as flat. */
export const MAX_CUT_TRIES = 8

export type PoolItem = { code: string; name: string }

/** Well-known A股/港股 names and the main indices; US stocks need an exchange suffix and are left out. */
export const GAME_POOL: readonly PoolItem[] = [
  { code: 'sh000001', name: '上证指数' },
  { code: 'sz399001', name: '深证成指' },
  { code: 'sz399006', name: '创业板指' },
  { code: 'hkHSI', name: '恒生指数' },
  { code: 'hkHSTECH', name: '恒生科技指数' },
  { code: 'sh600519', name: '贵州茅台' },
  { code: 'sh601318', name: '中国平安' },
  { code: 'sh600036', name: '招商银行' },
  { code: 'sh601899', name: '紫金矿业' },
  { code: 'sh600900', name: '长江电力' },
  { code: 'sh601012', name: '隆基绿能' },
  { code: 'sh600276', name: '恒瑞医药' },
  { code: 'sh688981', name: '中芯国际' },
  { code: 'sz300750', name: '宁德时代' },
  { code: 'sz002594', name: '比亚迪' },
  { code: 'sz000858', name: '五粮液' },
  { code: 'sz000333', name: '美的集团' },
  { code: 'sz300059', name: '东方财富' },
  { code: 'sz002415', name: '海康威视' },
  { code: 'hk00700', name: '腾讯控股' },
  { code: 'hk09988', name: '阿里巴巴' },
  { code: 'hk03690', name: '美团' },
  { code: 'hk01810', name: '小米集团' },
  { code: 'hk00941', name: '中国移动' },
  { code: 'hk02318', name: '中国平安(H)' },
]

/** The built-in pool plus the person's A股/港股 watchlist codes, first occurrence kept. */
export const buildPool = (watchlist: readonly WatchItem[]): PoolItem[] => {
  const extra = watchlist.filter(item => marketOf(item.code) !== 'us')
  const seen = new Set<string>()
  return [...GAME_POOL, ...extra].filter(item => {
    if (seen.has(item.code)) return false
    seen.add(item.code)
    return true
  })
}

/** A small seeded generator in [0, 1), so a mocked clock deals the same rounds. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export const pickItem = <T>(items: readonly T[], rand: () => number): T | undefined =>
  items[Math.floor(rand() * items.length)]

export type RoundDraft = Pick<GameRound, 'candles' | 'visible' | 'answer' | 'changePct'>

/**
 * A round cut from `candles`: the last visible candle sits at a random index
 * with at least MIN_VISIBLE before it and REVEAL_DAYS after it. A cut whose
 * outcome is flat is drawn again; undefined when the history is too short or
 * every try is flat.
 */
export const makeRound = (candles: readonly Candle[], rand: () => number): RoundDraft | undefined => {
  const first = MIN_VISIBLE - 1
  const last = candles.length - 1 - REVEAL_DAYS
  if (last < first) return undefined
  for (let attempt = 0; attempt < MAX_CUT_TRIES; attempt += 1) {
    const cut = first + Math.floor(rand() * (last - first + 1))
    const base = candles[cut]?.close ?? 0
    const later = candles[cut + REVEAL_DAYS]?.close ?? 0
    if (base === later || base <= 0) continue
    const start = Math.max(0, cut + 1 - MAX_VISIBLE)
    return {
      candles: candles.slice(start, cut + 1 + REVEAL_DAYS),
      visible: cut + 1 - start,
      answer: later > base ? 'up' : 'down',
      changePct: ((later - base) / base) * 100,
    }
  }
  return undefined
}

export const EMPTY_SCORE: GameScore = { played: 0, correct: 0, streak: 0, best: 0 }

export const scoreAfter = (score: GameScore, isCorrect: boolean): GameScore => {
  const streak = isCorrect ? score.streak + 1 : 0
  return {
    played: score.played + 1,
    correct: score.correct + (isCorrect ? 1 : 0),
    streak,
    best: Math.max(score.best, streak),
  }
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0

/** A stored score made safe: non-negative integers, correct and streak never past played. */
export const sanitizeScore = (value: unknown): GameScore => {
  if (typeof value !== 'object' || value === null) return EMPTY_SCORE
  const raw = value as Record<string, unknown>
  const played = count(raw.played)
  return {
    played,
    correct: Math.min(count(raw.correct), played),
    streak: Math.min(count(raw.streak), played),
    best: Math.min(count(raw.best), played),
  }
}

export type GameMessage = { type: 'next' } | { type: 'quit' } | { type: 'guess'; round: number; guess: Guess }

/** What a Client posted, validated; anything else is undefined and ignored. */
export const parseGameMessage = (data: unknown): GameMessage | undefined => {
  if (typeof data !== 'object' || data === null) return undefined
  const raw = data as Record<string, unknown>
  if (raw.type === 'next' || raw.type === 'quit') return { type: raw.type }
  const isGuess = raw.guess === 'up' || raw.guess === 'down'
  if (raw.type === 'guess' && isGuess && typeof raw.round === 'number' && Number.isInteger(raw.round)) {
    return { type: 'guess', round: raw.round, guess: raw.guess as Guess }
  }
  return undefined
}
