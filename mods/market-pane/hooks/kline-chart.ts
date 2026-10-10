import type { Candle } from '../types'

export const BODY = '█'
export const WICK = '│'
export const DIVIDER = '┊'
const BLANK = ' '
/** Headroom above and below the visible range, as a share of it, so revealed candles have room. */
const PAD_RATIO = 0.2
/** Headroom when the visible range is a single price. */
const FLAT_PAD_RATIO = 0.01

export type Tone = 'up' | 'down' | 'none' | 'divider'
export type Run = { text: string; tone: Tone }
export type ChartRow = Run[]

export type ChartInput = {
  /** Visible candles followed by the hidden ones. */
  candles: readonly Candle[]
  visible: number
  /** Hidden candles revealed so far. */
  shown: number
  rows: number
  columns: number
  /** Columns kept for the hidden candles after the divider; 0 draws no divider. */
  reveal: number
}

type Cell = { char: string; tone: Tone }
type Band = { top: number; bottom: number }

const priceRange = (candles: readonly Candle[]): { min: number; max: number } => {
  const low = Math.min(...candles.map(c => c.low))
  const high = Math.max(...candles.map(c => c.high))
  const pad = high > low ? (high - low) * PAD_RATIO : high * FLAT_PAD_RATIO
  return { min: low - pad, max: high + pad }
}

const overlaps = (from: number, to: number, band: Band): boolean => from <= band.top && to >= band.bottom

const cellOf = (candle: Candle, band: Band, clamp: (price: number) => number): Cell => {
  const tone: Tone = candle.close >= candle.open ? 'up' : 'down'
  const bodyLow = clamp(Math.min(candle.open, candle.close))
  const bodyHigh = clamp(Math.max(candle.open, candle.close))
  if (overlaps(bodyLow, bodyHigh, band)) return { char: BODY, tone }
  if (overlaps(clamp(candle.low), clamp(candle.high), band)) return { char: WICK, tone }
  return { char: BLANK, tone: 'none' }
}

/** Consecutive cells of one tone as one run; blanks merge with blanks. */
const toRuns = (cells: readonly Cell[]): ChartRow =>
  cells.reduce<Run[]>((runs, cell) => {
    const last = runs.at(-1)
    if (last !== undefined && last.tone === cell.tone) {
      return [...runs.slice(0, -1), { text: last.text + cell.char, tone: last.tone }]
    }
    return [...runs, { text: cell.char, tone: cell.tone }]
  }, [])

/**
 * The candle chart as rows of tone runs, top row first: one column per
 * candle, the latest visible candles that fit, then a divider and `reveal`
 * columns where the first `shown` hidden candles are drawn. The price scale
 * comes from the visible candles alone, so a revealed candle never rescales
 * the chart; one beyond it is clipped to the edge.
 */
export const layoutChart = ({ candles, visible, shown, rows, columns, reveal }: ChartInput): ChartRow[] => {
  const fit = Math.max(1, Math.min(visible, columns - reveal - (reveal > 0 ? 1 : 0)))
  const shownCandles = candles.slice(visible - fit, visible)
  const hidden = candles.slice(visible, visible + reveal)
  if (shownCandles.length === 0 || rows <= 0) return []
  const { min, max } = priceRange(shownCandles)
  const step = (max - min) / rows
  const clamp = (price: number): number => Math.min(max, Math.max(min, price))
  return Array.from({ length: rows }, (_, r) => {
    const band = { top: max - r * step, bottom: max - (r + 1) * step }
    const left = shownCandles.map(candle => cellOf(candle, band, clamp))
    const right = Array.from({ length: reveal }, (_, i) => {
      const candle = hidden[i]
      return i < shown && candle !== undefined ? cellOf(candle, band, clamp) : { char: BLANK, tone: 'none' as const }
    })
    const divider: Cell[] = reveal > 0 ? [{ char: DIVIDER, tone: 'divider' }] : []
    return toRuns([...left, ...divider, ...right])
  })
}
