import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { GameScore, GameState } from '../types'
import { REVEAL_DAYS } from '../hooks/game'
import { REVEAL_STEP_MS } from '../hooks/game-surface'
import { bj, setupWorld, startSession } from './harness'

const GAME = 'kline-game'
const SATURDAY_NOON = bj(2026, 10, 10, 12, 0)
const PANE_PROPS = {
  title: '行情',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { bodyRows: 30, contentRows: 30, offset: 0 },
}

const mountPane = ($: Engine) =>
  $.ui.mount({
    plugin: 'market-pane',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'market-pane',
    props: PANE_PROPS as never,
    viewport: { columns: 80, rows: 30 },
  })

const play = ($: Engine) => $.command.run({ command: 'market', args: 'play' } as never)

const startGame = async ($: Engine, world: ReturnType<typeof setupWorld>) => {
  await startSession($)
  await world.clock.settle()
  await play($)
  await world.clock.settle()
  const ui = await mountPane($)
  await ui.resize({ columns: 80, rows: 30, in: GAME })
  return ui
}

describe('K 线猜涨跌', () => {
  test('进入游戏: /market play deals one round and draws it without name or dates', async ($, on) => {
    const world = setupWorld(on, { now: SATURDAY_NOON })
    const ui = await startGame($, world)
    expect(world.read<string>('mode')).toBe('game')
    expect(world.klineRequests).toHaveLength(1)
    const game = world.read<GameState>('game')
    expect(game.status).toBe('ready')
    const drawn = JSON.stringify(await ui.drawn({ in: GAME }))
    expect(drawn).toContain('K 线猜涨跌')
    expect(drawn).not.toContain(game.round?.name ?? '?')
    expect(drawn).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(await ui.find({ key: 'guess-up', in: GAME })).toBeDefined()
    await ui.unmount()
  })

  test('作答与揭晓: a wrong guess then a right one, judged by the hooks; the hidden candles and the name show', async ($, on) => {
    const world = setupWorld(on, { now: SATURDAY_NOON })
    const ui = await startGame($, world)
    const first = world.read<GameState>('game').round
    await ui.key({ key: first?.answer === 'up' ? 'down' : 'up', in: GAME })
    await world.clock.settle()
    expect(world.read<GameScore>('score')).toEqual({ played: 1, correct: 0, streak: 0, best: 0 })
    expect(world.stored('kline-score')).toEqual({ played: 1, correct: 0, streak: 0, best: 0 })
    await ui.advance(REVEAL_STEP_MS * (REVEAL_DAYS + 1))
    const result = await ui.find({ type: 'Text', text: /猜(对|错)/, in: GAME })
    expect(result?.text).toContain('✗ 猜错')
    expect(result?.text).toContain(first?.name ?? '?')
    expect(result?.text).toMatch(/\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}/)

    // a second key on an answered round changes nothing
    await ui.key({ key: 'down', in: GAME })
    await world.clock.settle()
    expect(world.read<GameScore>('score').played).toBe(1)

    await ui.key({ key: 'return', in: GAME })
    await world.clock.settle()
    expect(world.klineRequests).toHaveLength(2)
    const second = world.read<GameState>('game').round
    expect(second?.id).toBe(2)
    await ui.key({ key: second?.answer === 'up' ? 'k' : 'j', in: GAME })
    await world.clock.settle()
    expect(world.read<GameScore>('score')).toEqual({ played: 2, correct: 1, streak: 1, best: 1 })
    await ui.advance(REVEAL_STEP_MS * (REVEAL_DAYS + 1))
    expect((await ui.find({ type: 'Text', text: /猜(对|错)/, in: GAME }))?.text).toContain('✓ 猜对')
    await ui.unmount()
  })

  test('判定以 hooks 为准: a guess for another round or an odd value is ignored', async ($, on) => {
    const world = setupWorld(on, { now: SATURDAY_NOON })
    const ui = await startGame($, world)
    await ui.post({ type: 'guess', round: 99, guess: 'up' }, { in: GAME })
    await ui.post({ type: 'guess', round: 1, guess: 'sideways' }, { in: GAME })
    await ui.post('next', { in: GAME })
    await world.clock.settle()
    expect(world.read<GameScore>('score').played).toBe(0)
    expect(world.klineRequests).toHaveLength(1)
    await ui.unmount()
  })

  test('拉取失败: shows the retry prompt, Enter deals again, quotes are untouched', async ($, on) => {
    const world = setupWorld(on, { now: SATURDAY_NOON })
    world.setKlineReply(new Error('timeout'))
    const ui = await startGame($, world)
    expect(world.read<GameState>('game').status).toBe('error')
    expect((await ui.find({ type: 'Text', text: /题目加载失败/, in: GAME }))?.text).toContain('Enter')
    expect(world.read<{ status: string }>('feed').status).toBe('ok')
    world.setKlineReply(undefined)
    await ui.key({ key: 'return', in: GAME })
    await world.clock.settle()
    expect(world.read<GameState>('game').status).toBe('ready')
    await ui.unmount()
  })

  test('退出: q returns the pane to quotes, the score stays', async ($, on) => {
    const world = setupWorld(on, { now: SATURDAY_NOON, store: { 'kline-score': { played: 4, correct: 3, streak: 2, best: 3 } } })
    const ui = await startGame($, world)
    expect(JSON.stringify(await ui.drawn({ in: GAME }))).toContain('已玩 4 局 · 正确率 75%')
    await ui.key({ key: 'q', in: GAME })
    await world.clock.settle()
    expect(world.read<string>('mode')).toBe('market')
    expect(await ui.find({ key: 'section-A股' })).toBeDefined()
    expect(world.read<GameScore>('score').played).toBe(4)
    await ui.unmount()
  })
})

describe('休市提示', () => {
  test('all three markets closed: one dim hint under the heatmap', async ($, on) => {
    const world = setupWorld(on, { now: SATURDAY_NOON })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect((await ui.find({ key: 'closed-hint' }))?.text).toContain('/market play')
    await ui.unmount()
  })

  test('any market open: no hint', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect(await ui.find({ key: 'closed-hint' })).toBeUndefined()
    await ui.unmount()
  })
})
