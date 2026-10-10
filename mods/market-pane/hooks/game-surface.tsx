import type { ClientKeyEvent, ClientModule, ClientSurface } from 'claude-code'

import type { Guess } from '../types'
import { REVEAL_DAYS } from './game'
import { renderGame } from './game-view'
import type { GameActions, GameViewProps } from './game-view'

/** One hidden candle appears per step once the outcome arrives. */
export const REVEAL_STEP_MS = 180

type LocalState = { roundId: number; shown: number; guess?: Guess }
type Surface = ClientSurface<LocalState>

const UP_KEYS = new Set(['up', 'k'])
const DOWN_KEYS = new Set(['down', 'j'])
const NEXT_KEYS = new Set(['return', 'n', ' '])
const QUIT_KEYS = new Set(['q'])

/** The props each instance last drew with, so its timer and key listener act on the current round. */
const latestProps = new WeakMap<Surface, GameViewProps>()
/** Instances whose timer and key listener are running; local state stays undefined until the first guess. */
const started = new WeakSet<Surface>()

const currentState = (surface: Surface): LocalState => surface.state ?? { roundId: -1, shown: 0 }

/** The state for the round on screen: a new round starts unguessed with nothing shown. */
const stateFor = (surface: Surface, roundId: number): LocalState => {
  const state = currentState(surface)
  return state.roundId === roundId ? state : { roundId, shown: 0 }
}

const isRevealing = (props: GameViewProps | undefined, state: LocalState): boolean =>
  props?.reveal !== undefined && props.reveal.round === state.roundId && state.shown < REVEAL_DAYS

const isRevealed = (props: GameViewProps | undefined, state: LocalState): boolean =>
  props?.reveal !== undefined && props.reveal.round === state.roundId && state.shown >= REVEAL_DAYS

const actionsFor = (surface: Surface): GameActions => ({
  guess: (guess: Guess) => {
    const props = latestProps.get(surface)
    const round = props?.round
    if (props?.status !== 'ready' || round === undefined) return
    const state = stateFor(surface, round.id)
    if (state.guess !== undefined) return
    surface.setState({ ...state, guess })
    surface.post({ type: 'guess', round: round.id, guess })
  },
  next: () => {
    const props = latestProps.get(surface)
    const state = currentState(surface)
    if (props?.status === 'error' || isRevealed(props, state)) surface.post({ type: 'next' })
  },
  quit: () => surface.post({ type: 'quit' }),
})

const onKey = (surface: Surface, actions: GameActions) => (event: ClientKeyEvent): void => {
  if (event.ctrl || event.meta) return
  if (UP_KEYS.has(event.key)) actions.guess('up')
  else if (DOWN_KEYS.has(event.key)) actions.guess('down')
  else if (NEXT_KEYS.has(event.key)) actions.next()
  else if (QUIT_KEYS.has(event.key)) actions.quit()
}

/** Advances the reveal one candle per step while an outcome is on screen and not fully shown. */
const onStep = (surface: Surface) => (): void => {
  const state = currentState(surface)
  if (isRevealing(latestProps.get(surface), state)) surface.setState({ ...state, shown: state.shown + 1 })
}

const KlineGame: ClientModule<GameViewProps, LocalState> = (props, surface) => {
  latestProps.set(surface, props)
  const actions = actionsFor(surface)
  if (!started.has(surface)) {
    started.add(surface)
    surface.every(REVEAL_STEP_MS, onStep(surface))
    surface.onKey(onKey(surface, actions))
  }
  const state = props.round === undefined ? currentState(surface) : stateFor(surface, props.round.id)
  return renderGame(surface.elements, props, { columns: surface.columns, rows: surface.rows, ...state }, actions)
}

export default KlineGame
