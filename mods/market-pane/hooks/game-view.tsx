import type { ClientElements, RenderElement } from 'claude-code'

import type { Candle, GameScore, Guess } from '../types'
import { REVEAL_DAYS } from './game'
import { layoutChart } from './kline-chart'
import type { ChartRow, Tone } from './kline-chart'

/** What the hooks hand the game's Client: the round's visible candles, and the outcome once guessed. */
export type GameViewProps = {
  status: 'loading' | 'ready' | 'error'
  score: GameScore
  round?: { id: number; candles: Candle[]; visible: number }
  reveal?: {
    round: number
    guess: Guess
    isCorrect: boolean
    name: string
    code: string
    from: string
    to: string
    changePct: number
  }
}

/** Rows the view keeps around the chart: title, subtitle, result line, controls. */
export const CHROME_ROWS = 4
export const MIN_CHART_ROWS = 6
const UP_COLOR = 'red'
const DOWN_COLOR = 'green'
const RIGHT_COLOR = 'green'
const WRONG_COLOR = 'red'

const TONE_COLOR: Readonly<Record<Tone, string | undefined>> = {
  up: UP_COLOR,
  down: DOWN_COLOR,
  none: undefined,
  divider: undefined,
}

export const formatScore = (score: GameScore): string => {
  const rate = score.played === 0 ? '—' : `${Math.round((score.correct / score.played) * 100)}%`
  return `已玩 ${score.played} 局 · 正确率 ${rate} · 连对 ${score.streak}（最佳 ${score.best}）`
}

export const formatChange = (pct: number): string => `${pct >= 0 ? '+' : '-'}${Math.abs(pct).toFixed(2)}%`

/** The result line once every hidden candle is shown. */
export const formatReveal = (reveal: NonNullable<GameViewProps['reveal']>): string =>
  `${reveal.isCorrect ? '✓ 猜对' : '✗ 猜错'} · ${reveal.name} ${reveal.code} · ${reveal.from} → ${reveal.to} · ${REVEAL_DAYS} 日 ${formatChange(reveal.changePct)}`

const renderChartRow = ({ Box, Text }: ClientElements, row: ChartRow, index: number): RenderElement => (
  <Box key={`row-${index}`} flexDirection="row">
    {row.map((run, i) => (
      <Text key={`run-${i}`} color={TONE_COLOR[run.tone]} dimColor={run.tone === 'divider'}>
        {run.text}
      </Text>
    ))}
  </Box>
)

export type ViewState = { columns: number; rows: number; shown: number; guess?: Guess }

/** What the controls do; the surface module binds them to posts. */
export type GameActions = { guess: (guess: Guess) => void; next: () => void; quit: () => void }

const renderFooter = (
  elements: ClientElements,
  props: GameViewProps,
  view: ViewState,
  isRevealed: boolean,
  actions: GameActions,
): RenderElement => {
  const { Box, Text, Button } = elements
  if (props.status === 'error') {
    return (
      <Box key="footer" flexDirection="row" columnGap={2}>
        <Text color={WRONG_COLOR}>题目加载失败，按 Enter 重试</Text>
        <Button key="next" onPress={actions.next}>重试</Button>
        <Button key="quit" onPress={actions.quit}>退出</Button>
      </Box>
    )
  }
  if (props.status === 'loading' || props.round === undefined) {
    return (
      <Box key="footer">
        <Text dimColor>出题中…</Text>
      </Box>
    )
  }
  if (isRevealed) {
    return (
      <Box key="footer" flexDirection="row" columnGap={2}>
        <Button key="next" onPress={actions.next}>下一局 ⏎</Button>
        <Button key="quit" onPress={actions.quit}>退出 q</Button>
      </Box>
    )
  }
  if (view.guess !== undefined) {
    return (
      <Box key="footer">
        <Text dimColor>揭晓中…</Text>
      </Box>
    )
  }
  return (
    <Box key="footer" flexDirection="row" columnGap={2}>
      <Button key="guess-up" onPress={() => actions.guess('up')}>
        <Text color={UP_COLOR}>↑ 涨</Text>
      </Button>
      <Button key="guess-down" onPress={() => actions.guess('down')}>
        <Text color={DOWN_COLOR}>↓ 跌</Text>
      </Button>
      <Text dimColor>点面板后按 ↑/↓ · q 退出 · Esc 还焦点</Text>
    </Box>
  )
}

/** The whole game view: score, chart, result and controls. */
export const renderGame = (
  elements: ClientElements,
  props: GameViewProps,
  view: ViewState,
  actions: GameActions,
): RenderElement => {
  const { Box, Text } = elements
  const round = props.round
  const reveal = props.reveal !== undefined && props.reveal.round === round?.id ? props.reveal : undefined
  const isRevealed = reveal !== undefined && view.shown >= REVEAL_DAYS
  const chartRows = Math.max(MIN_CHART_ROWS, view.rows - CHROME_ROWS)
  const chart =
    round === undefined
      ? []
      : layoutChart({
          candles: round.candles,
          visible: round.visible,
          shown: reveal === undefined ? 0 : view.shown,
          rows: chartRows,
          columns: view.columns,
          reveal: REVEAL_DAYS,
        })
  return (
    <Box flexDirection="column">
      <Box key="title">
        <Text bold>K 线猜涨跌</Text>
        <Text dimColor>{`  ${formatScore(props.score)}`}</Text>
      </Box>
      <Box key="subtitle">
        <Text dimColor>{`猜 ${REVEAL_DAYS} 个交易日后收盘比现在涨还是跌 · 名称和日期揭晓后显示`}</Text>
      </Box>
      <Box key="chart" flexDirection="column">
        {chart.map((row, i) => renderChartRow(elements, row, i))}
      </Box>
      <Box key="result">
        {isRevealed && reveal !== undefined ? (
          <Text bold color={reveal.isCorrect ? RIGHT_COLOR : WRONG_COLOR} wrap="truncate-end">
            {formatReveal(reveal)}
          </Text>
        ) : (
          <Text> </Text>
        )}
      </Box>
      {renderFooter(elements, props, view, isRevealed, actions)}
    </Box>
  )
}
