import { describe, expect, test } from 'claude-code/testing'

import type { Sectors } from '../types'
import { bj, setupWorld, startSession } from './harness'

describe('sector fetching', () => {
  test('fetches gainers and losers when the pane opens', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect(world.sectorRequests).toHaveLength(2)
    const sectors = world.read<Sectors>('sectors')
    expect(sectors.gainers[0]).toEqual({ name: '数字媒体', pct: 8 })
    expect(sectors.losers).toHaveLength(6)
    expect(sectors.lastOkAt).toBe(bj(2026, 10, 9, 10, 0))
  })

  test('盘中刷新: once a minute while A股 is open', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    await world.clock.advance(120_000)
    expect(world.sectorRequests).toHaveLength(6)
  })

  test('every 30 minutes while A股 is closed, and none while the pane is closed', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 10, 12, 0) }) // Saturday
    await startSession($)
    await world.clock.settle()
    await world.clock.advance(29 * 60_000)
    expect(world.sectorRequests).toHaveLength(2)
    await world.clock.advance(60_000)
    expect(world.sectorRequests).toHaveLength(4)
    world.panes.delete('market-pane')
    await world.clock.advance(60 * 60_000)
    expect(world.sectorRequests).toHaveLength(4)
  })

  test('a failed refresh keeps the last sectors', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    world.setSectorReply(new Error('down'))
    await world.clock.advance(60_000)
    const sectors = world.read<Sectors>('sectors')
    expect(sectors.gainers).toHaveLength(6)
    expect(sectors.lastOkAt).toBe(bj(2026, 10, 9, 10, 0))
    expect(world.read<{ status: string }>('feed').status).toBe('ok')
  })

  test('首次即失败: no sectors and no lastOkAt, quotes still fine', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    world.setSectorReply({ status: 500, text: '' })
    await startSession($)
    await world.clock.settle()
    const sectors = world.read<Sectors | undefined>('sectors')
    expect(sectors?.gainers ?? []).toEqual([])
    expect(sectors?.lastOkAt).toBeUndefined()
    expect(world.read<{ status: string }>('feed').status).toBe('ok')
  })
})
