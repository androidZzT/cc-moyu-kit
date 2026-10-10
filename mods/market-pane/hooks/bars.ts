/** Cells in a change bar; each cell stands for 1%, so a full bar is 4%. */
export const BAR_CELLS = 4
const PCT_PER_CELL = 1
const EIGHTHS_PER_CELL = 8
const FULL_CELL = '█'
/** Index n holds the glyph for n/8 of a cell. */
const PARTIAL_CELLS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const

/** A bar whose length is proportional to |pct|, at 1/8-cell precision, capped at BAR_CELLS. */
export const pctBar = (pct: number): string => {
  if (!Number.isFinite(pct)) return ''
  const maxEighths = BAR_CELLS * EIGHTHS_PER_CELL
  const eighths = Math.min(maxEighths, Math.round((Math.abs(pct) / PCT_PER_CELL) * EIGHTHS_PER_CELL))
  const full = Math.floor(eighths / EIGHTHS_PER_CELL)
  return FULL_CELL.repeat(full) + PARTIAL_CELLS[eighths % EIGHTHS_PER_CELL]
}
