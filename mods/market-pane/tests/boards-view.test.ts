import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { BOARDS } from '../hooks/boards'
import { BOARDS_UNAVAILABLE, buildBoards } from '../hooks/boards-view'
import type { BoardMovers, Quote } from '../types'
import { BOARDS_BODY } from './board-fixture'
import { SAMPLE_BODY } from './fixture'
import { bj, setupWorld, startSession } from './harness'

const PANE_PROPS = { title: '行情', isFocused: false, bodyColumns: 40, placement: 'dock' }
const CHIPS = 'pt02003891'
const ROBOTS = 'pt02003640'

const mountPane = ($: Engine) =>
  $.ui.mount({
    plugin: 'market-pane',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'market-pane',
    props: PANE_PROPS,
    viewport: { columns: 40, rows: 120 },
  } as never)

const quote = (pct: number): Quote => ({ price: 100 + pct, prevClose: 100, change: pct, pct, isMissing: false })
const MISSING: Quote = { price: 0, prevClose: 0, change: 0, pct: 0, isMissing: true }
const SOME_MOVERS: BoardMovers = { gainers: [{ code: 'sz000001', name: '甲', pct: 5 }], losers: [] }

describe('buildBoards', () => {
  test('one block per watched board in the configured order, names from the config', () => {
    const quotes = Object.fromEntries(BOARDS.map((board, i) => [board.code, quote(i - 2)]))
    const { blocks } = buildBoards(quotes, {}, true)
    expect(blocks.map(block => block.name)).toEqual(['半导体', '人工智能', '机器人', '券商', '创新药'])
    expect(blocks.map(block => block.pct)).toEqual([-2, -1, 0, 1, 2])
    expect(blocks.every(block => block.gainers.length === 0 && block.losers.length === 0)).toBe(true)
  })

  test('a board without a quote has no percent; its movers still show', () => {
    const quotes = Object.fromEntries(BOARDS.map(board => [board.code, board.code === ROBOTS ? MISSING : quote(1)]))
    const { blocks } = buildBoards(quotes, { [ROBOTS]: SOME_MOVERS }, true)
    expect(blocks[2]).toMatchObject({ name: '机器人', pct: undefined, gainers: SOME_MOVERS.gainers })
  })

  test('nothing quoted and no movers yet: no blocks, so the placeholder shows', () => {
    expect(buildBoards({}, {}, true).blocks).toEqual([])
    expect(buildBoards({}, { [ROBOTS]: SOME_MOVERS }, true).blocks).toHaveLength(BOARDS.length)
  })
})

describe('board drawing', () => {
  test('一次报价请求: the board codes ride in the one quote request', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect(world.requests).toHaveLength(1)
    for (const board of BOARDS) expect(world.requests[0]).toContain(board.code)
  })

  test('正常展示: a title and three rows of top gainer beside top loser per board, after 自选', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect((await ui.find({ key: 'head-板块' }))?.text).toMatch(/盘中/)
    // fixture: 芯片概念 8032.86 against 8128.00
    expect((await ui.find({ key: `board-${CHIPS}` }))?.text).toBe('半导体▼1.17%')
    expect((await ui.find({ key: `movers-${CHIPS}-0` }))?.text).toBe('远程股份+10.1园林股份-10.0')
    // *ST皇庭 is dropped from the losers
    expect((await ui.find({ key: `movers-${CHIPS}-1` }))?.text).toBe('盛视科技+10.0宏昌电子-9.5')
    expect(await ui.find({ key: `movers-${CHIPS}-3` })).toBeUndefined()
    for (const board of BOARDS) expect(await ui.find({ key: `board-${board.code}` })).toBeDefined()
    const tree = JSON.stringify(await ui.drawn())
    expect(tree.indexOf('"key":"section-自选"')).toBeLessThan(tree.indexOf('"key":"section-板块"'))
    expect(tree.indexOf(`"key":"board-${CHIPS}"`)).toBeLessThan(tree.indexOf(`"key":"board-${ROBOTS}"`))
    await ui.unmount()
  })

  test('领涨与领跌: board percent and each mover colored red up, green down', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    expect(tree).toMatch(/"color":"green"\},"children":\["▼1\.17%"\]/)
    expect(tree).toMatch(/"color":"red"\},"children":\["\+10\.1"\]/)
    expect(tree).toMatch(/"color":"green"\},"children":\["-10\.0"\]/)
    await ui.unmount()
  })

  test('名称过长: the two columns and their gap fit the 40-column pane; names truncate', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    const widths = [...tree.matchAll(/"key":"(?:up|down)","width":(\d+)/g)].map(match => Number(match[1]))
    expect(widths.length).toBeGreaterThan(0)
    expect(Math.max(...widths) * 2 + 1).toBeLessThanOrEqual(PANE_PROPS.bodyColumns)
    expect(tree).toMatch(/"wrap":"truncate-end"\},"children":\["远程股份"\]/)
    await ui.unmount()
  })

  test('单个板块榜单失败: that board shows its title only, the others are whole', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    world.setMoversReply(ROBOTS, new Error('down'))
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect((await ui.find({ key: `board-${ROBOTS}` }))?.text).toBe('机器人▼0.82%')
    expect(await ui.find({ key: `movers-${ROBOTS}-0` })).toBeUndefined()
    expect(await ui.find({ key: `movers-${CHIPS}-0` })).toBeDefined()
    await ui.unmount()
  })

  test('a board missing from the quote reply shows -- beside its name', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    world.setReply({ status: 200, text: SAMPLE_BODY + BOARDS_BODY.replace(/v_pt02003640="[^"]*";\n/, '') })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect((await ui.find({ key: `board-${ROBOTS}` }))?.text).toBe('机器人--')
    await ui.unmount()
  })

  test('首次即失败: a dim placeholder instead of the boards', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    world.setReply(new Error('down'))
    for (const board of BOARDS) world.setMoversReply(board.code, new Error('down'))
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect((await ui.find({ key: 'boards-empty' }))?.text).toBe(BOARDS_UNAVAILABLE)
    expect(await ui.find({ key: `board-${CHIPS}` })).toBeUndefined()
    await ui.unmount()
  })
})
