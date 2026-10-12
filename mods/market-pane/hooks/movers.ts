import type { Mover } from '../types'

/**
 * Plain http on purpose: the https certificate chains to GlobalSign Root R3,
 * which fails certificate verification in the host's `$.http.fetch`, and no
 * other Tencent host serves this ranking. The data is public and only displayed.
 */
const BOARD_RANK_ENDPOINT = 'http://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList'
export const MOVERS_PER_SIDE = 3
/** Entries asked per side, so MOVERS_PER_SIDE remain after the ST names are dropped. */
const MOVERS_FETCH_COUNT = 6
/** ST and *ST: stocks under special treatment, whose limit moves say little about the board. */
const SPECIAL_TREATMENT = 'ST'

export type MoverSide = 'gainers' | 'losers'

type RankResponse = { code?: number; data?: { rank_list?: unknown } }
type RankEntry = { code?: unknown; name?: unknown; zdf?: unknown }

/** `direct=down` ranks by change descending (gainers first), `direct=up` ascending (losers first). */
export const buildMoversUrl = (board: string, side: MoverSide): string =>
  `${BOARD_RANK_ENDPOINT}?board_code=${board}&sort_type=priceRatio&direct=${side === 'gainers' ? 'down' : 'up'}` +
  `&offset=0&count=${MOVERS_FETCH_COUNT}`

const toMover = (entry: RankEntry): Mover[] => {
  const pct = Number(entry.zdf)
  const isValid =
    typeof entry.code === 'string' && typeof entry.name === 'string' && entry.name !== '' && Number.isFinite(pct)
  return isValid && !(entry.name as string).includes(SPECIAL_TREATMENT)
    ? [{ code: entry.code as string, name: entry.name as string, pct }]
    : []
}

/** The first MOVERS_PER_SIDE non-ST stocks in the listed order. Throws on an error reply or an unexpected body. */
export const parseMovers = (body: string): Mover[] => {
  const response = JSON.parse(body) as RankResponse
  const list = response.data?.rank_list
  if (response.code !== 0 || !Array.isArray(list)) throw new Error('board rank response holds no list')
  return (list as RankEntry[]).flatMap(toMover).slice(0, MOVERS_PER_SIDE)
}

/** Guards half-up rounding of two-decimal inputs: 9.45 is stored as 9.4499…, which plain toFixed(1) rounds down. */
const ROUNDING_EPSILON = 1e-9

/** One decimal with a sign, halves rounded away from zero: -9.45 → "-9.5". */
export const formatMoverPct = (pct: number): string => {
  const tenths = Math.round(Math.abs(pct) * 10 + ROUNDING_EPSILON) / 10
  return `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${tenths.toFixed(1)}`
}
