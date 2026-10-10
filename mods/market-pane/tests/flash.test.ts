import { describe, expect, test } from 'claude-code/testing'

import { bj, setupWorld, startSession } from './harness'
import { SAMPLE_BODY } from './fixture'

// SAMPLE_BODY prices 上证指数 at 3775.49; this reply moves it and leaves the rest alone.
const MOVED_BODY = SAMPLE_BODY.replace('~3775.49~', '~3776.00~')

describe('price tick highlight', () => {
  test('首次数据: the first quotes highlight nothing', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect(world.read<string[]>('flash')).toEqual([])
  })

  test('价格变动: a moved price is highlighted until the next refresh', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    world.setReply({ status: 200, text: MOVED_BODY })
    await world.clock.advance(10_000)
    expect(world.read<string[]>('flash')).toEqual(['sh000001'])
    await world.clock.advance(10_000)
    expect(world.read<string[]>('flash')).toEqual([])
  })

  test('刷新失败: a stale refresh clears every highlight', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    world.setReply({ status: 200, text: MOVED_BODY })
    await world.clock.advance(10_000)
    world.setReply(new Error('down'))
    await world.clock.advance(10_000)
    expect(world.read<{ status: string }>('feed').status).toBe('stale')
    expect(world.read<string[]>('flash')).toEqual([])
  })
})
