import type { Candle } from '../types'

/** Same DigiCert-chained host as the minute endpoint; see trend.ts. */
export const KLINE_ENDPOINT = 'https://ifzq.gtimg.cn/appstock/app/fqkline/get'
/** Daily candles per request: the endpoint's own cap, about 15 months. */
export const KLINE_DAYS = 320

/** A股 answers forward-adjusted candles under `qfqday`, 港股 and indices under `day`. */
const SERIES_KEYS = ['qfqday', 'day'] as const

type KlineResponse = { data?: Record<string, Record<string, unknown> | undefined> | string }

export const buildKlineUrl = (code: string): string => `${KLINE_ENDPOINT}?param=${code},day,,,${KLINE_DAYS},qfq`

/** `[date, open, close, high, low, volume, ...]`, numbers as strings; undefined when any price is unusable. */
const toCandle = (entry: unknown): Candle | undefined => {
  if (!Array.isArray(entry) || typeof entry[0] !== 'string') return undefined
  const [open, close, high, low] = entry.slice(1, 5).map(Number)
  const prices = [open, close, high, low]
  if (prices.some(price => price === undefined || !Number.isFinite(price) || price <= 0)) return undefined
  return { date: entry[0], open: open ?? 0, close: close ?? 0, high: high ?? 0, low: low ?? 0 }
}

/** Daily candles for one code, oldest first. Throws when the body holds no series for it. */
export const parseKline = (code: string, body: string): Candle[] => {
  const response = JSON.parse(body) as KlineResponse
  const entry = typeof response.data === 'object' ? response.data[code] : undefined
  const series = SERIES_KEYS.map(key => entry?.[key]).find(Array.isArray)
  if (series === undefined) throw new Error(`kline response holds no series for ${code}`)
  return (series as unknown[]).flatMap(item => {
    const candle = toCandle(item)
    return candle === undefined ? [] : [candle]
  })
}
