import { describe, expect, test } from 'claude-code/testing'

import { toViewProps } from '../hooks/game-props'
import { EMPTY_SCORE } from '../hooks/game'
import type { GameRound } from '../types'

const ROUND: GameRound = {
  id: 3,
  code: 'sh600519',
  name: '贵州茅台',
  candles: ['20260901', '20260902', '20260903', '20260904'].map((date, i) => ({
    date,
    open: 10 + i,
    close: 11 + i,
    high: 12 + i,
    low: 9 + i,
  })),
  visible: 2,
  answer: 'up',
  changePct: 18.18,
}

describe('toViewProps', () => {
  test('idle and loading without a round show loading and the score only', () => {
    expect(toViewProps({ status: 'idle', dealt: 0 }, EMPTY_SCORE)).toEqual({ status: 'loading', score: EMPTY_SCORE })
  })

  test('before a verdict: only the visible candles, no dates, no name, no answer', () => {
    const props = toViewProps({ status: 'ready', round: ROUND, dealt: 3 }, EMPTY_SCORE)
    expect(props.round?.candles).toHaveLength(2)
    expect(props.round?.candles.every(candle => candle.date === '')).toBe(true)
    expect(props.reveal).toBeUndefined()
    const text = JSON.stringify(props)
    for (const secret of ['贵州茅台', 'sh600519', '2026', 'answer', '18.18']) expect(text).not.toContain(secret)
  })

  test('after a verdict: all candles, the stock, the dated range and the change', () => {
    const props = toViewProps(
      { status: 'ready', round: ROUND, verdict: { round: 3, guess: 'down', isCorrect: false }, dealt: 3 },
      EMPTY_SCORE,
    )
    expect(props.round?.candles).toHaveLength(4)
    expect(props.reveal).toEqual({
      round: 3,
      guess: 'down',
      isCorrect: false,
      name: '贵州茅台',
      code: 'sh600519',
      from: '20260902',
      to: '20260904',
      changePct: 18.18,
    })
  })

  test('a verdict for an older round reveals nothing about the current one', () => {
    const props = toViewProps(
      { status: 'ready', round: ROUND, verdict: { round: 2, guess: 'up', isCorrect: true }, dealt: 3 },
      EMPTY_SCORE,
    )
    expect(props.reveal).toBeUndefined()
    expect(props.round?.candles).toHaveLength(2)
  })
})
