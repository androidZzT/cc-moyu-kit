import type { GameRound, GameScore, GameState } from '../types'
import type { GameViewProps } from './game-view'

/** A candle with its date dropped, so nothing on screen dates the round before it is answered. */
const undated = (round: GameRound, count: number) =>
  round.candles.slice(0, count).map(candle => ({ ...candle, date: '' }))

/** The Client's props: visible candles only until a verdict, then the hidden ones, the name and the dates. */
export const toViewProps = (game: GameState, score: GameScore): GameViewProps => {
  const status = game.status === 'idle' ? 'loading' : game.status
  const round = game.round
  if (round === undefined) return { status, score }
  const verdict = game.verdict?.round === round.id ? game.verdict : undefined
  if (verdict === undefined) {
    return { status, score, round: { id: round.id, candles: undated(round, round.visible), visible: round.visible } }
  }
  return {
    status,
    score,
    round: { id: round.id, candles: undated(round, round.candles.length), visible: round.visible },
    reveal: {
      round: round.id,
      guess: verdict.guess,
      isCorrect: verdict.isCorrect,
      name: round.name,
      code: round.code,
      from: round.candles[round.visible - 1]?.date ?? '',
      to: round.candles.at(-1)?.date ?? '',
      changePct: round.changePct,
    },
  }
}
