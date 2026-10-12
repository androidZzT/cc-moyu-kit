import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { BOARDS } from '../hooks/boards'
import { SECTORS_UNAVAILABLE, buildHeatmap } from '../hooks/heatmap-view'
import type { Quote } from '../types'
import { BOARDS_BODY } from './board-fixture'
import { SAMPLE_BODY } from './fixture'
import { bj, setupWorld, startSession } from './harness'

const PANE_PROPS = { title: '行情', isFocused: false, bodyColumns: 40, placement: 'dock' }

const mountPane = ($: Engine) =>
  $.ui.mount({
    plugin: 'market-pane',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'market-pane',
    props: PANE_PROPS,
    viewport: { columns: 40, rows: 80 },
  } as never)

const quote = (pct: number): Quote => ({ price: 100 + pct, prevClose: 100, change: pct, pct, isMissing: false })
const MISSING: Quote = { price: 0, prevClose: 0, change: 0, pct: 0, isMissing: true }

describe('buildHeatmap', () => {
  test('one cell per watched board in the configured order, names from the config', () => {
    const quotes = Object.fromEntries(BOARDS.map((board, i) => [board.code, quote(i - 2)]))
    const heatmap = buildHeatmap(quotes, true)
    expect(heatmap.cells.map(cell => cell.name)).toEqual(['半导体', '人工智能', '机器人', '券商', '创新药'])
    expect(heatmap.cells.map(cell => cell.pct)).toEqual([-2, -1, 0, 1, 2])
  })

  test('单个板块缺失: that cell has no percent, the others keep theirs', () => {
    const quotes = Object.fromEntries(BOARDS.map(board => [board.code, board.name === '机器人' ? MISSING : quote(1)]))
    expect(buildHeatmap(quotes, true).cells.map(cell => cell.pct)).toEqual([1, 1, undefined, 1, 1])
  })

  test('no board quoted yet: no cells, so the placeholder shows', () => {
    expect(buildHeatmap({}, true).cells).toEqual([])
  })
})

describe('board heatmap drawing', () => {
  test('一次请求: the board codes ride in the one quote request', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    expect(world.requests).toHaveLength(1)
    for (const board of BOARDS) expect(world.requests[0]).toContain(board.code)
  })

  test('正常展示: 5 cells after 自选 in the configured order', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect((await ui.find({ key: 'head-板块' }))?.text).toMatch(/盘中/)
    // fixture: 芯片概念 8032.86 against 8128.00, 创新药 1105.16 against 1120.58
    expect((await ui.find({ key: 'cell-0' }))?.text).toBe('半导体-1.2')
    expect((await ui.find({ key: 'cell-4' }))?.text).toBe('创新药-1.4')
    expect(await ui.find({ key: 'cell-5' })).toBeUndefined()
    const tree = JSON.stringify(await ui.drawn())
    expect(tree.indexOf('"key":"section-自选"')).toBeLessThan(tree.indexOf('"key":"section-板块"'))
    await ui.unmount()
  })

  test('小涨板块 mild red, 小跌板块 mild green, white text on both', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    // cell-0 is 半导体 at -1.17%, cell-3 is 券商 at +0.04%
    expect(tree).toMatch(/"key":"cell-0","width":\d+,"flexShrink":0,"flexDirection":"row","justifyContent":"space-between","backgroundColor":"#1f3d22"/)
    expect(tree).toMatch(/"key":"cell-3","width":\d+,"flexShrink":0,"flexDirection":"row","justifyContent":"space-between","backgroundColor":"#5c1f1f"/)
    await ui.unmount()
  })

  test('名称过长: three cells and their gaps fit the 40-column pane; names truncate', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    const widths = [...tree.matchAll(/"key":"cell-\d+","width":(\d+)/g)].map(match => Number(match[1]))
    expect(widths).toHaveLength(BOARDS.length)
    expect(Math.max(...widths) * 3 + 2).toBeLessThanOrEqual(PANE_PROPS.bodyColumns)
    expect(tree).toMatch(/"wrap":"truncate-end","color":"white"\},"children":\["人工智能"\]/)
    await ui.unmount()
  })

  test('单个板块缺失: the cell shows -- without a background', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    world.setReply({ status: 200, text: SAMPLE_BODY + BOARDS_BODY.replace(/v_pt02003640="[^"]*";\n/, '') })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect((await ui.find({ key: 'cell-2' }))?.text).toBe('机器人--')
    expect(JSON.stringify(await ui.drawn())).not.toMatch(/"key":"cell-2"[^}]*"backgroundColor"/)
    expect((await ui.find({ key: 'cell-3' }))?.text).toBe('券商+0.0')
    await ui.unmount()
  })

  test('首次即失败: a dim placeholder instead of the grid', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    world.setReply(new Error('down'))
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect((await ui.find({ key: 'sector-empty' }))?.text).toBe(SECTORS_UNAVAILABLE)
    expect(await ui.find({ key: 'cell-0' })).toBeUndefined()
    await ui.unmount()
  })
})
