import { describe, expect, test } from 'claude-code/testing'

import type { Feed, Quote } from '../types'
import { bj, setupWorld, startSession } from './harness'

describe('refresh cadence', () => {
  test('fetches once on start, then every 10s while A股 is open', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect(world.requests).toHaveLength(1)
    expect(world.requests[0]).toContain('sh000001')
    expect(world.requests[0]).toContain('usINX')

    await world.clock.advance(10_000)
    expect(world.requests).toHaveLength(2)
    await world.clock.advance(30_000)
    expect(world.requests).toHaveLength(5)
  })

  test('drops to every 5 minutes when all markets are closed', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 10, 12, 0) }) // Saturday
    await startSession($)
    await world.clock.settle()
    expect(world.requests).toHaveLength(1)
    await world.clock.advance(290_000)
    expect(world.requests).toHaveLength(1)
    await world.clock.advance(10_000)
    expect(world.requests).toHaveLength(2)
  })

  test('stops requesting while the pane is closed', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    world.panes.delete('market-pane')
    await world.clock.advance(60_000)
    expect(world.requests).toHaveLength(1)
  })
})

describe('failure degradation', () => {
  test('keeps old quotes and marks stale on failure, recovers on next success', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const first = world.read<Record<string, Quote>>('quotes')
    expect(first.sh000001?.isMissing).toBe(false)
    expect(world.read<Feed>('feed').status).toBe('ok')

    world.setReply(new Error('network down'))
    await world.clock.advance(10_000)
    const feed = world.read<Feed>('feed')
    expect(feed.status).toBe('stale')
    expect(feed.lastError).toBeDefined()
    expect(world.read('quotes')).toEqual(first)

    world.setReply({ status: 502, text: 'bad gateway' })
    await world.clock.advance(10_000)
    expect(world.read<Feed>('feed').status).toBe('stale')

    world.setReply({ status: 200, text: 'v_sh000001="1~?~000001~4000.00~3800.00~0";' })
    await world.clock.advance(10_000)
    const recovered = world.read<Feed>('feed')
    expect(recovered.status).toBe('ok')
    expect(recovered.lastError).toBeUndefined()
    expect(world.read<Record<string, Quote>>('quotes').sh000001?.price).toBe(4000)
  })
})
