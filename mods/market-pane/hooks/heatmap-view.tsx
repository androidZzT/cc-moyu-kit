import type { RenderElement } from 'claude-code'

import type { Quote, SectorCell } from '../types'
import { BOARDS } from './boards'
import { formatSectorPct, heatTier } from './sector'
import type { HeatTier } from './sector'
import { renderHeader, renderRule } from './view'
import type { PaneElements } from './view'

export const HEATMAP_TITLE = '板块'
export const HEATMAP_COLUMNS = 3
export const SECTORS_UNAVAILABLE = '板块数据暂不可用'
const CELL_GAP = 1
const CELL_TEXT_COLOR = 'white'

/** Strong and mild shades of red (up) and green (down); a flat cell keeps the pane's own background. */
const TIER_BACKGROUND: Readonly<Record<HeatTier, string | undefined>> = {
  upStrong: '#c62828',
  upMild: '#5c1f1f',
  downStrong: '#2e7d32',
  downMild: '#1f3d22',
  flat: undefined,
}

export type Heatmap = { cells: SectorCell[]; isOpen: boolean }

const MISSING_PCT_TEXT = '--'

/** A cell per watched board in BOARDS order; none until at least one board has been quoted. */
export const buildHeatmap = (quotes: Readonly<Record<string, Quote>>, isOpen: boolean): Heatmap => {
  const cells = BOARDS.map(({ code, name }): SectorCell => {
    const quote = quotes[code]
    return quote === undefined || quote.isMissing ? { name } : { name, pct: quote.pct }
  })
  return { cells: cells.some(cell => cell.pct !== undefined) ? cells : [], isOpen }
}

/** Cells per row of HEATMAP_COLUMNS, keeping the given order. */
const toRows = (cells: readonly SectorCell[]): SectorCell[][] =>
  Array.from({ length: Math.ceil(cells.length / HEATMAP_COLUMNS) }, (_, i) =>
    cells.slice(i * HEATMAP_COLUMNS, (i + 1) * HEATMAP_COLUMNS),
  )

const renderCell = ({ Box, Text }: PaneElements, cell: SectorCell, index: number, width: number): RenderElement => {
  const background = cell.pct === undefined ? undefined : TIER_BACKGROUND[heatTier(cell.pct)]
  const color = background === undefined ? undefined : CELL_TEXT_COLOR
  return (
    <Box
      key={`cell-${index}`}
      width={width}
      flexShrink={0}
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor={background}
    >
      <Text wrap="truncate-end" color={color}>
        {cell.name}
      </Text>
      <Box key="pct" flexShrink={0}>
        <Text color={color}>{cell.pct === undefined ? MISSING_PCT_TEXT : formatSectorPct(cell.pct)}</Text>
      </Box>
    </Box>
  )
}

export const renderHeatmap = (elements: PaneElements, heatmap: Heatmap, columns: number): RenderElement => {
  const { Box, Text } = elements
  const cellWidth = Math.max(Math.floor((columns - CELL_GAP * (HEATMAP_COLUMNS - 1)) / HEATMAP_COLUMNS), 1)
  return (
    <Box key={`section-${HEATMAP_TITLE}`} flexDirection="column">
      {renderRule(elements, `rule-${HEATMAP_TITLE}`, columns)}
      {renderHeader(elements, HEATMAP_TITLE, heatmap.isOpen)}
      {heatmap.cells.length === 0 ? (
        <Box key="sector-empty">
          <Text dimColor>{SECTORS_UNAVAILABLE}</Text>
        </Box>
      ) : (
        toRows(heatmap.cells).map((row, rowIndex) => (
          <Box key={`heat-row-${rowIndex}`} flexDirection="row" columnGap={CELL_GAP}>
            {row.map((cell, i) => renderCell(elements, cell, rowIndex * HEATMAP_COLUMNS + i, cellWidth))}
          </Box>
        ))
      )}
    </Box>
  )
}
