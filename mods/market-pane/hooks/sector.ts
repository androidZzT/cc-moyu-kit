import type { SectorCell } from '../types'

/**
 * Plain http on purpose: the https certificate chains to GlobalSign Root R3,
 * which fails certificate verification in the host's `$.http.fetch`, and no
 * other Tencent host serves this ranking. The data is public and only displayed.
 */
const RANK_ENDPOINT = 'http://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank'
/** 申万二级行业 */
const BOARD_TYPE = 'hy2'
export const CELLS_PER_SIDE = 6
/** |pct| from which a cell takes the strong shade. */
export const STRONG_PCT = 3

export type RankSide = 'gainers' | 'losers'
export type HeatTier = 'upStrong' | 'upMild' | 'downStrong' | 'downMild' | 'flat'

type RankResponse = { code?: number; data?: { rank_list?: unknown } }
type RankEntry = { name?: unknown; zdf?: unknown }

/** `direct=down` ranks by change descending (gainers first), `direct=up` ascending (losers first). */
export const buildSectorUrl = (side: RankSide): string =>
  `${RANK_ENDPOINT}?board_type=${BOARD_TYPE}&sort_type=PriceRatio&direct=${side === 'gainers' ? 'down' : 'up'}` +
  `&offset=0&count=${CELLS_PER_SIDE}`

/** Industries in the order the response lists them. Throws on an error reply or an unexpected body. */
export const parseSectorRank = (body: string): SectorCell[] => {
  const response = JSON.parse(body) as RankResponse
  const list = response.data?.rank_list
  if (response.code !== 0 || !Array.isArray(list)) throw new Error('sector rank response holds no list')
  return (list as RankEntry[]).flatMap(entry => {
    const pct = Number(entry.zdf)
    return typeof entry.name === 'string' && entry.name !== '' && Number.isFinite(pct)
      ? [{ name: entry.name, pct }]
      : []
  })
}

const byPctDescending = (a: SectorCell, b: SectorCell): number => b.pct - a.pct

/** Top gainers then top losers, each side high to low: the biggest gain comes first, the biggest loss last. */
export const orderCells = (gainers: readonly SectorCell[], losers: readonly SectorCell[]): SectorCell[] => [
  ...[...gainers].sort(byPctDescending).slice(0, CELLS_PER_SIDE),
  ...[...losers].sort(byPctDescending).slice(-CELLS_PER_SIDE),
]

export const heatTier = (pct: number): HeatTier => {
  if (pct === 0) return 'flat'
  const isStrong = Math.abs(pct) >= STRONG_PCT
  if (pct > 0) return isStrong ? 'upStrong' : 'upMild'
  return isStrong ? 'downStrong' : 'downMild'
}

export const formatSectorPct = (pct: number): string => `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${Math.abs(pct).toFixed(1)}`
