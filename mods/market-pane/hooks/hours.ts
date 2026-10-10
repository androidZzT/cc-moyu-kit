import type { Market } from './symbols'

export const OPEN_INTERVAL_MS = 10_000
export const CLOSED_INTERVAL_MS = 300_000

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const BEIJING_OFFSET_H = 8
const US_EASTERN_STANDARD_OFFSET_H = -5
const US_EASTERN_DAYLIGHT_OFFSET_H = -4

/** Trading sessions in minutes after local midnight, start inclusive, end exclusive. */
const SESSIONS: Readonly<Record<Market, readonly (readonly [number, number])[]>> = {
  cn: [[9 * 60 + 30, 11 * 60 + 30], [13 * 60, 15 * 60]],
  hk: [[9 * 60 + 30, 12 * 60], [13 * 60, 16 * 60]],
  us: [[9 * 60 + 30, 16 * 60]],
}

/** Day of month (UTC) of the n-th Sunday of a month. */
const nthSunday = (year: number, month: number, n: number): number => {
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay()
  return 1 + ((7 - firstDay) % 7) + (n - 1) * 7
}

/** US DST: 2:00 local on the second Sunday of March to 2:00 local on the first Sunday of November. */
export const isUsDaylightTime = (nowMs: number): boolean => {
  const year = new Date(nowMs).getUTCFullYear()
  const start = Date.UTC(year, 2, nthSunday(year, 2, 2), 2 - US_EASTERN_STANDARD_OFFSET_H)
  const end = Date.UTC(year, 10, nthSunday(year, 10, 1), 2 - US_EASTERN_DAYLIGHT_OFFSET_H)
  return nowMs >= start && nowMs < end
}

const offsetHours = (market: Market, nowMs: number): number => {
  if (market !== 'us') return BEIJING_OFFSET_H
  return isUsDaylightTime(nowMs) ? US_EASTERN_DAYLIGHT_OFFSET_H : US_EASTERN_STANDARD_OFFSET_H
}

/** Whether the market is in a trading session; holidays are not modelled. */
export const isMarketOpen = (market: Market, nowMs: number): boolean => {
  const localMs = nowMs + offsetHours(market, nowMs) * HOUR_MS
  const weekday = new Date(localMs).getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  const minutes = Math.floor((localMs % DAY_MS) / 60_000)
  return SESSIONS[market].some(([start, end]) => minutes >= start && minutes < end)
}

/** The market's local calendar date, YYYY-MM-DD. */
export const marketLocalDate = (market: Market, nowMs: number): string =>
  new Date(nowMs + offsetHours(market, nowMs) * HOUR_MS).toISOString().slice(0, 10)

export const refreshIntervalMs =(markets: readonly Market[], nowMs: number): number =>
  markets.some(market => isMarketOpen(market, nowMs)) ? OPEN_INTERVAL_MS : CLOSED_INTERVAL_MS
