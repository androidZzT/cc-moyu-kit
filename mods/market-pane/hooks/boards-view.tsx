import type { RenderElement } from 'claude-code'

import type { BoardMovers, Mover, Quote } from '../types'
import { BOARDS } from './boards'
import { MOVERS_PER_SIDE, formatMoverPct } from './movers'
import { renderHeader, renderRule } from './view'
import type { PaneElements } from './view'

export const BOARDS_TITLE = '板块'
export const BOARDS_UNAVAILABLE = '板块数据暂不可用'
const UP_COLOR = 'red'
const DOWN_COLOR = 'green'
const MISSING_PCT_TEXT = '--'
const COLUMN_GAP = 1

export type BoardBlock = {
  code: string
  name: string
  /** Absent while the board has no quote. */
  pct?: number
  gainers: readonly Mover[]
  losers: readonly Mover[]
}

export type Boards = { blocks: BoardBlock[]; isOpen: boolean }

/** A block per watched board in BOARDS order; none until some board has a quote or movers. */
export const buildBoards = (
  quotes: Readonly<Record<string, Quote>>,
  movers: Readonly<Record<string, BoardMovers>>,
  isOpen: boolean,
): Boards => {
  const blocks = BOARDS.map(({ code, name }): BoardBlock => {
    const quote = quotes[code]
    const ranked = movers[code] ?? { gainers: [], losers: [] }
    const pct = quote === undefined || quote.isMissing ? undefined : quote.pct
    return { code, name, pct, gainers: ranked.gainers, losers: ranked.losers }
  })
  const hasData = blocks.some(block => block.pct !== undefined || block.gainers.length + block.losers.length > 0)
  return { blocks: hasData ? blocks : [], isOpen }
}

const colorOf = (pct: number): string | undefined => (pct > 0 ? UP_COLOR : pct < 0 ? DOWN_COLOR : undefined)

/** ▲1.17% / ▼1.17%, like the index rows. */
const formatBoardPct = (pct: number): string => `${pct > 0 ? '▲' : pct < 0 ? '▼' : ' '}${Math.abs(pct).toFixed(2)}%`

const renderTitle = ({ Box, Text }: PaneElements, block: BoardBlock): RenderElement => (
  <Box key={`board-${block.code}`} flexDirection="row" columnGap={1}>
    <Text bold>{block.name}</Text>
    {block.pct === undefined ? (
      <Text dimColor>{MISSING_PCT_TEXT}</Text>
    ) : (
      <Text color={colorOf(block.pct)}>{formatBoardPct(block.pct)}</Text>
    )}
  </Box>
)

const renderMover = ({ Box, Text }: PaneElements, key: string, mover: Mover | undefined, width: number): RenderElement => (
  <Box key={key} width={width} flexShrink={0} flexDirection="row" justifyContent="space-between">
    {mover !== undefined && <Text wrap="truncate-end">{mover.name}</Text>}
    {mover !== undefined && (
      <Box key="pct" flexShrink={0}>
        <Text color={colorOf(mover.pct)}>{formatMoverPct(mover.pct)}</Text>
      </Box>
    )}
  </Box>
)

/** Three rows of the i-th gainer beside the i-th loser; none when the board has no movers yet. */
const renderMovers = (elements: PaneElements, block: BoardBlock, width: number): RenderElement[] => {
  const { Box } = elements
  const rows = Math.min(MOVERS_PER_SIDE, Math.max(block.gainers.length, block.losers.length))
  return Array.from({ length: rows }, (_, i) => (
    <Box key={`movers-${block.code}-${i}`} flexDirection="row" columnGap={COLUMN_GAP}>
      {renderMover(elements, 'up', block.gainers[i], width)}
      {renderMover(elements, 'down', block.losers[i], width)}
    </Box>
  ))
}

export const renderBoards = (elements: PaneElements, boards: Boards, columns: number): RenderElement => {
  const { Box, Text } = elements
  const width = Math.max(Math.floor((columns - COLUMN_GAP) / 2), 1)
  return (
    <Box key={`section-${BOARDS_TITLE}`} flexDirection="column">
      {renderRule(elements, `rule-${BOARDS_TITLE}`, columns)}
      {renderHeader(elements, BOARDS_TITLE, boards.isOpen)}
      {boards.blocks.length === 0 ? (
        <Box key="boards-empty">
          <Text dimColor>{BOARDS_UNAVAILABLE}</Text>
        </Box>
      ) : (
        boards.blocks.flatMap(block => [renderTitle(elements, block), ...renderMovers(elements, block, width)])
      )}
    </Box>
  )
}
