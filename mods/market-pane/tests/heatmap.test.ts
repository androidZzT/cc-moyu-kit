import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { SECTORS_UNAVAILABLE } from '../hooks/heatmap-view'
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

describe('sector heatmap drawing', () => {
  test('正常展示: 12 cells after 自选, biggest gain top-left, biggest loss bottom-right', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect((await ui.find({ key: 'head-板块' }))?.text).toMatch(/盘中/)
    expect((await ui.find({ key: 'cell-0' }))?.text).toBe('数字媒体+8.0')
    expect((await ui.find({ key: 'cell-11' }))?.text).toBe('元件-4.3')
    expect(await ui.find({ key: 'cell-12' })).toBeUndefined()
    const tree = JSON.stringify(await ui.drawn())
    expect(tree.indexOf('"key":"section-自选"')).toBeLessThan(tree.indexOf('"key":"section-板块"'))
    await ui.unmount()
  })

  test('大涨板块 strong red, 小跌板块 mild green, white text on both', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    expect(tree).toMatch(/"key":"cell-0","width":\d+,"flexShrink":0,"flexDirection":"row","justifyContent":"space-between","backgroundColor":"#c62828"/)
    // cell-6 is 其他电子Ⅱ at -2.37%: below the 3% strong threshold
    expect(tree).toMatch(/"key":"cell-6","width":\d+,"flexShrink":0,"flexDirection":"row","justifyContent":"space-between","backgroundColor":"#1f3d22"/)
    await ui.unmount()
  })

  test('名称过长: three cells and their gaps fit the 40-column pane; names truncate', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    const widths = [...tree.matchAll(/"key":"cell-\d+","width":(\d+)/g)].map(match => Number(match[1]))
    expect(widths).toHaveLength(12)
    expect(Math.max(...widths) * 3 + 2).toBeLessThanOrEqual(PANE_PROPS.bodyColumns)
    expect(tree).toMatch(/"wrap":"truncate-end","color":"white"\},"children":\["电子化学品Ⅱ"\]/)
    await ui.unmount()
  })

  test('首次即失败: a dim placeholder instead of the grid, other groups unaffected', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    world.setSectorReply(new Error('down'))
    await startSession($)
    await world.clock.settle()
    const ui = await mountPane($)
    expect((await ui.find({ key: 'sector-empty' }))?.text).toBe(SECTORS_UNAVAILABLE)
    expect(await ui.find({ key: 'cell-0' })).toBeUndefined()
    expect((await ui.find({ key: 'status' }))?.text).toBe('更新于 10:00:00')
    await ui.unmount()
  })
})
