import { describe, expect, test } from 'claude-code/testing'

import { bj, setupWorld, startSession } from './harness'

const CN_HK_CODES = ['sh000001', 'sz399001', 'sz399006', 'hkHSI', 'hkHSTECH']
const countFor = (requests: readonly string[], code: string): number =>
  requests.filter(url => url.endsWith(`code=${code}`)).length

describe('intraday minute fetching', () => {
  test('盘中更新: fetches every A股/港股 index on open, then once a minute, never US codes', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect(CN_HK_CODES.map(code => countFor(world.minuteRequests, code))).toEqual([1, 1, 1, 1, 1])
    expect(world.minuteRequests.some(url => url.includes('code=us'))).toBe(false)
    expect(world.read<Record<string, number[]>>('trends').sh000001).toHaveLength(7)

    await world.clock.advance(180_000)
    expect(countFor(world.minuteRequests, 'sh000001')).toBe(4)
  })

  test('drops to every 30 minutes while the markets are closed', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 10, 12, 0) }) // Saturday
    await startSession($)
    await world.clock.settle()
    expect(countFor(world.minuteRequests, 'sh000001')).toBe(1)
    await world.clock.advance(29 * 60_000)
    expect(countFor(world.minuteRequests, 'sh000001')).toBe(1)
    await world.clock.advance(60_000)
    expect(countFor(world.minuteRequests, 'sh000001')).toBe(2)
  })

  test('面板关闭: no minute requests while the pane is closed', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const before = world.minuteRequests.length
    world.panes.delete('market-pane')
    await world.clock.advance(300_000)
    expect(world.minuteRequests).toHaveLength(before)
  })

  test('单个标的失败: the others update, the failed code keeps its old series, quotes are unaffected', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    world.setMinuteReply('hkHSTECH', new Error('timeout'))
    world.setMinuteReply('sh000001', { status: 200, text: '{"code":0,"data":{"sh000001":{"data":{"data":["0930 1.00 1 1","0931 2.00 1 1"]}}}}' })
    await world.clock.advance(60_000)
    const trends = world.read<Record<string, number[]>>('trends')
    expect(trends.sh000001).toEqual([1, 2])
    expect(trends.hkHSTECH).toHaveLength(7)
    expect(world.read<{ status: string }>('feed').status).toBe('ok')
  })

  test('a newly added A股/港股 code gets its series at once; a US code does not', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    await $.command.run({ command: 'market', args: 'add hk03690 美团' } as never)
    await $.command.run({ command: 'market', args: 'add usAAPL 苹果' } as never)
    await world.clock.settle()
    expect(countFor(world.minuteRequests, 'hk03690')).toBe(1)
    expect(countFor(world.minuteRequests, 'usAAPL')).toBe(0)
    expect(countFor(world.minuteRequests, 'sh000001')).toBe(1)
  })
})

describe('US sampling', () => {
  test('美股指数 (the quote fixture answers 纳斯达克 usIXIC): each successful quote refresh during the US session adds one point', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 22, 0) }) // Friday 10:00 New York
    await startSession($)
    await world.clock.settle()
    await world.clock.advance(290_000)
    expect(world.requests).toHaveLength(30)
    expect(world.read<Record<string, number[]>>('trends').usIXIC).toHaveLength(30)
    expect(world.read<{ usDay?: string }>('trendFeed').usDay).toBe('2026-10-09')
  })

  test('休市不采样: no US points while the US market is closed', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    await world.clock.advance(60_000)
    expect(world.read<Record<string, number[]>>('trends').usIXIC).toBeUndefined()
  })

  test('a failed quote refresh adds no point', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 22, 0) })
    await startSession($)
    await world.clock.settle()
    world.setReply(new Error('down'))
    await world.clock.advance(30_000)
    expect(world.read<Record<string, number[]>>('trends').usIXIC).toHaveLength(1)
  })
})
