/** |pct| from which a cell takes the strong shade. */
export const STRONG_PCT = 3

export type HeatTier = 'upStrong' | 'upMild' | 'downStrong' | 'downMild' | 'flat'

export const heatTier = (pct: number): HeatTier => {
  if (pct === 0) return 'flat'
  const isStrong = Math.abs(pct) >= STRONG_PCT
  if (pct > 0) return isStrong ? 'upStrong' : 'upMild'
  return isStrong ? 'downStrong' : 'downMild'
}

export const formatSectorPct = (pct: number): string => `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${Math.abs(pct).toFixed(1)}`
