export type Quote = {
  price: number
  prevClose: number
  change: number
  pct: number
  isMissing: boolean
}

export type FeedStatus = 'loading' | 'ok' | 'stale'

export type Feed = {
  status: FeedStatus
  lastOkAt?: number
  lastFetchAt?: number
  lastError?: string
}

export type WatchItem = { code: string; name: string }

/** When intraday data was last requested per market, and the US trading day the sampled series belong to. */
export type TrendFeed = {
  cnAt?: number
  hkAt?: number
  usDay?: string
}

/** One watched board's cell; `pct` is absent while the board has no quote. */
export type SectorCell = { name: string; pct?: number }

/** One daily candle, prices forward-adjusted (前复权). */
export type Candle = { date: string; open: number; close: number; high: number; low: number }

export type Guess = 'up' | 'down'

/** One round as the hooks keep it; `answer` never leaves the hooks module. */
export type GameRound = {
  id: number
  code: string
  name: string
  /** Visible candles followed by the REVEAL_DAYS hidden ones. */
  candles: Candle[]
  visible: number
  answer: Guess
  /** Close REVEAL_DAYS later against the last visible close, in percent. */
  changePct: number
}

export type Verdict = { round: number; guess: Guess; isCorrect: boolean }

export type GameScore = { played: number; correct: number; streak: number; best: number }

export type PaneMode = 'market' | 'game'

export type GameState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  round?: GameRound
  verdict?: Verdict
  /** Rounds dealt this session; the next round's id. */
  dealt: number
}

declare module 'claude-code' {
  interface PluginState {
    'market-pane': {
      quotes: Record<string, Quote>
      feed: Feed
      watchlist: WatchItem[]
      trends: Record<string, number[]>
      trendFeed: TrendFeed
      flash: string[]
      mode: PaneMode
      game: GameState
      score: GameScore
    }
  }
}
