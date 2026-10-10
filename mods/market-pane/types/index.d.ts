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

export type SectorCell = { name: string; pct: number }

export type Sectors = {
  gainers: SectorCell[]
  losers: SectorCell[]
  lastFetchAt?: number
  lastOkAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'market-pane': {
      quotes: Record<string, Quote>
      feed: Feed
      watchlist: WatchItem[]
      trends: Record<string, number[]>
      trendFeed: TrendFeed
      sectors: Sectors
      flash: string[]
    }
  }
}
