import { describe, expect, test } from 'claude-code/testing'

import { BOARDS } from '../hooks/boards'
import type { BoardMovers } from '../types'
import { bj, setupWorld, startSession } from './harness'

const ROBOTS = 'pt02003640'
const REQUESTS_PER_ROUND = BOARDS.length * 2

describe('board mover fetching', () => {
  test('fetches both sides of every board when the pane opens', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect(world.moversRequests).toHaveLength(REQUESTS_PER_ROUND)
    const movers = world.read<Record<string, BoardMovers>>('movers')
    expect(movers['pt02003891']?.gainers[0]).toEqual({ code: 'sz002692', name: '远程股份', pct: 10.08 })
    expect(movers['pt02003891']?.losers.map(mover => mover.name)).toEqual(['园林股份', '宏昌电子', '兴发集团'])
  })

  test('盘中刷新榜单: once a minute while A股 is open', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    await world.clock.advance(120_000)
    expect(world.moversRequests).toHaveLength(REQUESTS_PER_ROUND * 3)
  })

  test('every 30 minutes while A股 is closed, and none while the pane is closed', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 10, 12, 0) }) // Saturday
    await startSession($)
    await world.clock.settle()
    await world.clock.advance(29 * 60_000)
    expect(world.moversRequests).toHaveLength(REQUESTS_PER_ROUND)
    await world.clock.advance(60_000)
    expect(world.moversRequests).toHaveLength(REQUESTS_PER_ROUND * 2)
    world.panes.delete('market-pane')
    await world.clock.advance(60 * 60_000)
    expect(world.moversRequests).toHaveLength(REQUESTS_PER_ROUND * 2)
  })

  test('a board whose ranking fails keeps its last movers; the others update', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const before = world.read<Record<string, BoardMovers>>('movers')[ROBOTS]
    world.setMoversReply(ROBOTS, new Error('down'))
    await world.clock.advance(60_000)
    expect(world.read<Record<string, BoardMovers>>('movers')[ROBOTS]).toEqual(before)
    expect(world.read<{ lastOkAt?: number }>('moversFeed').lastOkAt).toBe(bj(2026, 10, 9, 10, 1))
    expect(world.read<{ status: string }>('feed').status).toBe('ok')
  })

  test('单个板块榜单失败 from the start: that board has no movers, quotes still fine', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    world.setMoversReply(ROBOTS, { status: 500, text: '' })
    await startSession($)
    await world.clock.settle()
    const movers = world.read<Record<string, BoardMovers>>('movers')
    expect(movers[ROBOTS]).toBeUndefined()
    expect(Object.keys(movers)).toHaveLength(BOARDS.length - 1)
    expect(world.read<{ status: string }>('feed').status).toBe('ok')
  })
})
