import type { BoxProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import type { Feed, Quote, WatchItem } from '../types'
import { BAR_CELLS, pctBar } from './bars'
import { isMarketOpen } from './hours'
import { INDICES, MARKET_LABELS } from './symbols'
import type { Market } from './symbols'
import { resample, sparkline } from './trend'

export type PaneElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
}

export type Direction = 'up' | 'down' | 'flat' | 'missing' | 'pending'

export type Row = {
  code: string
  name: string
  priceText: string
  changeText: string
  pctText: string
  direction: Direction
  /** Today's prices, oldest first; drawn on the row's second line. */
  series: readonly number[]
  /** The latest point of `series` against the previous close. */
  trendDirection: Direction
  barText: string
  isFlash: boolean
}

export type Section = { title: string; rows: Row[]; isOpen?: boolean; hint?: string }

export type StatusLine = { text: string; isStale: boolean }

/** Per-code extras the second line and the tick highlight read. */
export type RowExtras = {
  trends: Readonly<Record<string, readonly number[]>>
  flash: readonly string[]
}

const UP_COLOR = 'red'
const DOWN_COLOR = 'green'
export const OPEN_COLOR = 'cyan'
const STALE_COLOR = 'yellow'
const BEIJING_OFFSET_MS = 8 * 3_600_000
const MARKET_ORDER: readonly Market[] = ['cn', 'hk', 'us']
/** Cell widths of the right-aligned numeric columns: 42,310.50 · -1234.56 · ▲10.00% */
export const PRICE_WIDTH = 9
export const CHANGE_WIDTH = 8
export const PCT_WIDTH = 7
/** Second line: one cell of indent, the sparkline, one cell of gap, then the bar. */
const TREND_RESERVED_CELLS = 2 + BAR_CELLS
const RULE_CHAR = '─'
export const EMPTY_WATCHLIST_HINT = '/market add <代码> [名称] 添加自选'

/** 1234567.891 → "1,234,567.89" */
export const formatPrice = (value: number): string => {
  const [whole = '0', fraction = '00'] = value.toFixed(2).split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`
}

const formatChange = (value: number): string =>
  `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}`

const directionOf = (delta: number): Direction => (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat')

const toRow = (code: string, name: string, quote: Quote | undefined, extras: RowExtras): Row => {
  const series = extras.trends[code] ?? []
  const base = { code, name, series, isFlash: extras.flash.includes(code) }
  if (quote === undefined) {
    return { ...base, priceText: '--', changeText: '', pctText: '', direction: 'pending', trendDirection: 'flat', barText: '' }
  }
  if (quote.isMissing) {
    return { ...base, priceText: '未找到', changeText: '', pctText: '', direction: 'missing', trendDirection: 'flat', barText: '' }
  }
  const direction = directionOf(quote.change)
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : ' '
  const latest = series.at(-1)
  return {
    ...base,
    priceText: formatPrice(quote.price),
    changeText: formatChange(quote.change),
    pctText: `${arrow}${Math.abs(quote.pct).toFixed(2)}%`,
    direction,
    trendDirection: latest === undefined ? 'flat' : directionOf(latest - quote.prevClose),
    barText: pctBar(quote.pct),
  }
}

export const buildSections = (
  quotes: Readonly<Record<string, Quote>>,
  watchlist: readonly WatchItem[],
  nowMs: number,
  extras: RowExtras = { trends: {}, flash: [] },
): Section[] => [
  ...MARKET_ORDER.map(market => ({
    title: MARKET_LABELS[market],
    isOpen: isMarketOpen(market, nowMs),
    rows: INDICES.filter(index => index.market === market).map(index =>
      toRow(index.code, index.name, quotes[index.code], extras),
    ),
  })),
  {
    title: '自选',
    rows: watchlist.map(item => toRow(item.code, item.name, quotes[item.code], extras)),
    ...(watchlist.length === 0 ? { hint: EMPTY_WATCHLIST_HINT } : {}),
  },
]

/** HH:MM:SS in Beijing time. */
export const formatClock = (ms: number): string => new Date(ms + BEIJING_OFFSET_MS).toISOString().slice(11, 19)

export const buildStatus = (feed: Feed): StatusLine => {
  if (feed.status === 'loading') return { text: '加载中…', isStale: false }
  const last = feed.lastOkAt === undefined ? '暂无数据' : `上次 ${formatClock(feed.lastOkAt)}`
  if (feed.status === 'stale') return { text: `过期 · ${last}`, isStale: true }
  return { text: `更新于 ${formatClock(feed.lastOkAt ?? 0)}`, isStale: false }
}

const colorOf = (direction: Direction): string | undefined =>
  direction === 'up' ? UP_COLOR : direction === 'down' ? DOWN_COLOR : undefined

export const renderRule = ({ Box, Text }: PaneElements, key: string, columns: number): RenderElement => (
  <Box key={key}>
    <Text dimColor wrap="truncate-end">
      {RULE_CHAR.repeat(Math.max(columns, 1))}
    </Text>
  </Box>
)

export const renderHeader = (
  { Box, Text }: PaneElements,
  title: string,
  isOpen: boolean | undefined,
): RenderElement => (
  <Box key={`head-${title}`} flexDirection="row" columnGap={1}>
    <Text bold>{title}</Text>
    {isOpen !== undefined && (
      <Text key="light" color={isOpen ? OPEN_COLOR : undefined} dimColor={!isOpen}>
        {isOpen ? '● 盘中' : '○ 休市'}
      </Text>
    )}
  </Box>
)

const renderQuoteLine = ({ Box, Text }: PaneElements, row: Row, isStale: boolean): RenderElement => {
  const isMuted = isStale || row.direction === 'missing' || row.direction === 'pending'
  return (
    <Box key={`row-${row.code}`} flexDirection="row" justifyContent="space-between" columnGap={1}>
      <Text wrap="truncate-end" dimColor={isStale}>
        {row.name}
      </Text>
      <Box key={`quote-${row.code}`} flexShrink={0}>
        <Text dimColor={isMuted} inverse={row.isFlash && !isStale}>
          {row.priceText.padStart(PRICE_WIDTH)}
        </Text>
        <Text dimColor={isStale} color={isStale ? undefined : colorOf(row.direction)}>
          {` ${row.changeText.padStart(CHANGE_WIDTH)} ${row.pctText.padStart(PCT_WIDTH)}`}
        </Text>
      </Box>
    </Box>
  )
}

const renderTrendLine = ({ Box, Text }: PaneElements, row: Row, isStale: boolean, columns: number): RenderElement => {
  const line = sparkline(resample(row.series, Math.max(columns - TREND_RESERVED_CELLS, 0)))
  return (
    <Box key={`trend-${row.code}`} flexDirection="row" justifyContent="space-between" columnGap={1}>
      <Text key="spark" wrap="truncate-end" dimColor={isStale} color={isStale ? undefined : colorOf(row.trendDirection)}>
        {` ${line}`}
      </Text>
      <Text key="bar" dimColor={isStale} color={isStale ? undefined : colorOf(row.direction)}>
        {row.barText.padEnd(BAR_CELLS)}
      </Text>
    </Box>
  )
}

export const renderPane = (
  elements: PaneElements,
  sections: readonly Section[],
  status: StatusLine,
  columns: number,
  tail?: RenderElement,
): RenderElement => {
  const { Box, Text } = elements
  return (
    <Box flexDirection="column">
      <Box key="status">
        <Text dimColor={!status.isStale} color={status.isStale ? STALE_COLOR : undefined}>
          {status.text}
        </Text>
      </Box>
      {sections.map(section => (
        <Box key={`section-${section.title}`} flexDirection="column">
          {renderRule(elements, `rule-${section.title}`, columns)}
          {renderHeader(elements, section.title, section.isOpen)}
          {section.hint !== undefined && (
            <Box key="watch-hint">
              <Text dimColor>{section.hint}</Text>
            </Box>
          )}
          {section.rows.flatMap(row => [
            renderQuoteLine(elements, row, status.isStale),
            renderTrendLine(elements, row, status.isStale, columns),
          ])}
        </Box>
      ))}
      {tail}
    </Box>
  )
}
