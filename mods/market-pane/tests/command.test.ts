import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { bj, setupWorld, startSession } from './harness'

const run = ($: Engine, args: string) =>
  $.command.run({ command: 'market', args } as never)

describe('/market toggle', () => {
  test('closes an open pane, and reopening refreshes at once', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect(world.panes.has('market-pane')).toBe(true)

    expect((await run($, '')).text).toBe('行情面板已关闭')
    expect(world.panes.has('market-pane')).toBe(false)

    expect((await run($, '')).text).toBe('行情面板已打开')
    await world.clock.settle()
    expect(world.panes.has('market-pane')).toBe(true)
    expect(world.requests).toHaveLength(2)
  })

  test('unknown subcommand answers usage and leaves the pane alone', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect((await run($, 'ad sh600519')).text).toContain('用法')
    expect(world.panes.has('market-pane')).toBe(true)
  })
})

describe('/market watchlist', () => {
  test('add persists to the store and refreshes with the new code', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect((await run($, 'add sh600519 茅台')).text).toContain('已添加')
    await world.clock.settle()
    expect(world.stored('watchlist')).toEqual([{ code: 'sh600519', name: '茅台' }])
    expect(world.requests.at(-1)).toContain('sh600519')
    expect((await run($, 'list')).text).toBe('sh600519  茅台')
    expect((await run($, 'remove sh600519')).text).toContain('已删除')
    expect(world.stored('watchlist')).toEqual([])
  })

  test('a new session restores the stored watchlist', async ($, on) => {
    const world = setupWorld(on, {
      now: bj(2026, 10, 9, 10, 0),
      store: { watchlist: [{ code: 'hk00700', name: '腾讯' }, { code: 'bogus' }] },
    })
    await startSession($)
    await world.clock.settle()
    expect(world.read('watchlist')).toEqual([{ code: 'hk00700', name: '腾讯' }])
    expect(world.requests[0]).toContain('hk00700')
    expect((await run($, 'list')).text).toBe('hk00700  腾讯')
  })

  test('invalid add leaves list and store untouched', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect((await run($, 'add 600519')).text).toContain('代码格式')
    expect((await run($, 'list')).text).toContain('自选为空')
  })
})
