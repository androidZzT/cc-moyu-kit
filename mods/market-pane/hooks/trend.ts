import type { Quote } from '../types'
import { isMarketOpen, marketLocalDate } from './hours'

/**
 * ifzq.gtimg.cn rather than web.ifzq.gtimg.cn: same endpoint and body, but its
 * certificate chains to DigiCert. web.ifzq's chains to GlobalSign Root R3,
 * which fails certificate verification in the host's `$.http.fetch`.
 */
export const MINUTE_ENDPOINT = 'https://ifzq.gtimg.cn/appstock/app/minute/query?code='
/** Most samples kept per US series; a full session at 10 s per refresh would be 2,340. */
export const MAX_SAMPLES = 400

const SPARK_LEVELS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const
const FLAT_LEVEL = 3
/** Position of the price in a "HHMM price volume amount" minute entry. */
const MINUTE_FIELD_PRICE = 1

type MinuteResponse = { data?: Record<string, { data?: { data?: unknown } } | undefined> }

export const buildMinuteUrl = (code: string): string => MINUTE_ENDPOINT + code

/**
 * Today's minute prices for one code, oldest first. An unknown code answers
 * with no usable entries and yields []. Throws when the body is not the
 * expected shape, so the caller can keep the previous series.
 */
export const parseMinute = (code: string, body: string): number[] => {
  const response = JSON.parse(body) as MinuteResponse
  const entries = response.data?.[code]?.data?.data
  if (!Array.isArray(entries)) throw new Error(`minute response holds no series for ${code}`)
  return entries
    .map(entry => (typeof entry === 'string' ? Number(entry.trim().split(/\s+/)[MINUTE_FIELD_PRICE]) : Number.NaN))
    .filter(price => Number.isFinite(price) && price > 0)
}

/** At most `width` points: the last point of each equal bucket, so the latest point stays rightmost. */
export const resample = (series: readonly number[], width: number): number[] => {
  if (width <= 0) return []
  if (series.length <= width) return [...series]
  return Array.from({ length: width }, (_, i) => series[Math.floor(((i + 1) * series.length) / width) - 1] ?? 0)
}

/** One block glyph per point, scaled between the series' own low and high; '' below 2 points. */
export const sparkline = (series: readonly number[]): string => {
  if (series.length < 2) return ''
  const low = Math.min(...series)
  const span = Math.max(...series) - low
  const top = SPARK_LEVELS.length - 1
  return series
    .map(price => SPARK_LEVELS[span === 0 ? FLAT_LEVEL : Math.round(((price - low) / span) * top)])
    .join('')
}

export type UsSample = { trends: Record<string, number[]>; usDay: string | undefined }

/**
 * Appends each quoted US code's price while the US market is open. The first
 * sample of a new US trading day drops the previous day's US series. Outside
 * the session the input is returned unchanged.
 */
export const sampleUs = (
  trends: Readonly<Record<string, number[]>>,
  quotes: Readonly<Record<string, Quote>>,
  usCodes: readonly string[],
  nowMs: number,
  usDay: string | undefined,
): UsSample => {
  if (!isMarketOpen('us', nowMs)) return { trends, usDay }
  const today = marketLocalDate('us', nowMs)
  const isNewDay = today !== usDay
  const sampled = usCodes.flatMap(code => {
    const quote = quotes[code]
    if (quote === undefined || quote.isMissing) return []
    const previous = isNewDay ? [] : (trends[code] ?? [])
    return [[code, [...previous, quote.price].slice(-MAX_SAMPLES)] as const]
  })
  const kept = Object.entries(trends).filter(([code]) => !(isNewDay && usCodes.includes(code)))
  return { trends: { ...Object.fromEntries(kept), ...Object.fromEntries(sampled) }, usDay: today }
}
