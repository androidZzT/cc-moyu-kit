import { describe, expect, test } from 'claude-code/testing'

import { EMPTY_WATCHLIST_HINT, buildSections, buildStatus, formatClock, formatPrice } from '../hooks/view'
import type { Quote } from '../types'
import { SAMPLE_BODY } from './fixture'
import { bj, setupWorld, startSession } from './harness'

const quote = (price: number, prevClose: number): Quote => ({
  price,
  prevClose,
  change: price - prevClose,
  pct: ((price - prevClose) / prevClose) * 100,
  isMissing: false,
})

// Friday 10:00 Beijing: A股 / 港股 in session, 美股 closed.
const CN_MORNING = bj(2026, 10, 9, 10, 0)

describe('formatPrice', () => {
  test('rounds to two decimals and groups thousands', () => {
    expect(formatPrice(3.456)).toBe('3.46')
    expect(formatPrice(42310.5)).toBe('42,310.50')
    expect(formatPrice(1234567.891)).toBe('1,234,567.89')
  })
})

describe('buildSections', () => {
  test('groups indices as A股 / 港股 / 美股 then 自选 with a hint when empty', () => {
    const sections = buildSections({}, [], CN_MORNING)
    expect(sections.map(s => s.title)).toEqual(['A股', '港股', '美股', '自选'])
    expect(sections.map(s => s.rows.length)).toEqual([3, 2, 3, 0])
    expect(sections[3]?.hint).toBe(EMPTY_WATCHLIST_HINT)
    expect(sections[0]?.rows[0]).toMatchObject({ name: '上证指数', priceText: '--', direction: 'pending' })
  })

  test('marks each market open or closed, and leaves 自选 without a light', () => {
    const sections = buildSections({}, [], CN_MORNING)
    expect(sections.map(s => s.isOpen)).toEqual([true, true, false, undefined])
  })

  test('shows signed change, ▲/▼ percent, and missing codes as 未找到', () => {
    const sections = buildSections(
      {
        sh000001: quote(3811.9 * 1.0082, 3811.9),
        sz399001: quote(12394.61, 12620.9),
        sh600519: { price: 0, prevClose: 0, change: 0, pct: 0, isMissing: true },
      },
      [{ code: 'sh600519', name: '茅台' }],
      CN_MORNING,
    )
    expect(sections[0]?.rows[0]).toMatchObject({ changeText: '+31.26', pctText: '▲0.82%', direction: 'up' })
    expect(sections[0]?.rows[1]).toMatchObject({
      priceText: '12,394.61',
      changeText: '-226.29',
      pctText: '▼1.79%',
      direction: 'down',
    })
    expect(sections[3]?.rows[0]).toMatchObject({ name: '茅台', priceText: '未找到', direction: 'missing' })
    expect(sections[3]?.hint).toBeUndefined()
  })
})

describe('second-line data', () => {
  test('carries the series, a trend direction against the previous close, the bar and the tick flag', () => {
    const sections = buildSections(
      { sh000001: quote(3775.49, 3811.9) },
      [],
      CN_MORNING,
      { trends: { sh000001: [3804.09, 3813.79] }, flash: ['sh000001'] },
    )
    expect(sections[0]?.rows[0]).toMatchObject({
      series: [3804.09, 3813.79],
      trendDirection: 'up',
      direction: 'down',
      barText: '█', // 0.96% rounds to a whole cell
      isFlash: true,
    })
    expect(sections[0]?.rows[1]).toMatchObject({ series: [], trendDirection: 'flat', barText: '', isFlash: false })
  })
})

describe('buildStatus', () => {
  const at = bj(2026, 10, 9, 10, 22) + 33_000
  test('loading, ok and stale lines', () => {
    expect(formatClock(at)).toBe('10:22:33')
    expect(buildStatus({ status: 'loading' })).toEqual({ text: '加载中…', isStale: false })
    expect(buildStatus({ status: 'ok', lastOkAt: at })).toEqual({ text: '更新于 10:22:33', isStale: false })
    expect(buildStatus({ status: 'stale', lastOkAt: at })).toEqual({ text: '过期 · 上次 10:22:33', isStale: true })
    expect(buildStatus({ status: 'stale' }).text).toBe('过期 · 暂无数据')
  })
})

const PANE_PROPS = { title: '行情', isFocused: false, bodyColumns: 40, placement: 'dock' }

describe('pane drawing', () => {
  test('draws status, groups and colored quotes on terminal and desktop', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'market-pane',
        surface,
        component: 'Pane',
        requestId: 'market-pane',
        props: PANE_PROPS,
        viewport: { columns: 40, rows: 30 },
      } as never)
      expect((await ui.find({ key: 'status' }))?.text).toBe('更新于 10:00:00')
      expect(await ui.find({ type: 'Text', text: 'A股' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '恒生指数' })).toBeDefined()
      expect((await ui.find({ key: 'watch-hint' }))?.text).toBe(EMPTY_WATCHLIST_HINT)
      // price, signed change and ▲/▼ percent, each right-aligned in a fixed-width column
      expect((await ui.find({ key: 'quote-sh000001' }))?.text).toMatch(
        /^ *[\d,]+\.\d{2} +[+-]\d+\.\d{2} +[▲▼ ]\d+\.\d{2}%$/,
      )
      // every row's numeric block has the same width, so the right edges line up
      const widths = await Promise.all(
        ['sh000001', 'sz399001', 'sz399006', 'hkHSI'].map(async code => (await ui.find({ key: `quote-${code}` }))?.text?.length),
      )
      expect(new Set(widths).size).toBe(1)
      expect((await ui.find({ key: 'head-A股' }))?.text).toMatch(/盘中/)
      expect((await ui.find({ key: 'head-美股' }))?.text).toMatch(/休市/)
      expect((await ui.find({ key: 'rule-A股' }))?.text).toBe('─'.repeat(PANE_PROPS.bodyColumns))
      // fixture: 上证 below previous close → green ▼; 恒指 above → red ▲; the price itself stays uncolored
      const tree = JSON.stringify(await ui.drawn())
      expect(tree).toMatch(/"props":\{"dimColor":false,"color":"green"\},"children":\[" +-[\d.]+ +▼/)
      expect(tree).toMatch(/"props":\{"dimColor":false,"color":"red"\},"children":\[" +\+[\d.]+ +▲/)
      await ui.unmount()
    }
  })

  test('draws a second line per row: colored sparkline and change bar; a moved price is inverse', async ($, on) => {
    const world = setupWorld(on, { now: bj(2026, 10, 9, 10, 0) })
    await startSession($)
    await world.clock.settle()
    world.setReply({ status: 200, text: SAMPLE_BODY.replace('~3775.49~', '~3776.00~') })
    await world.clock.advance(10_000)
    const ui = await $.ui.mount({
      plugin: 'market-pane',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'market-pane',
      props: PANE_PROPS,
      viewport: { columns: 40, rows: 60 },
    } as never)
    // fixture: 7 minute points ending above the 3811.90 close → red line; the day is still down → green bar
    const trend = (await ui.find({ key: 'trend-sh000001' }))?.text ?? ''
    expect(trend).toBe(' ▄▅▃▂▁█▇█   ') // dips to 09:34, closes near the high; bar: one full cell
    const tree = JSON.stringify(await ui.drawn())
    expect(tree).toMatch(/"color":"red"\},"children":\[" [▁▂▃▄▅▆▇█]{7}"\]/)
    expect(tree).toMatch(/"color":"green"\},"children":\["█   "\]/)
    expect(tree).toMatch(/"inverse":true\},"children":\[" *3,776\.00"\]/)
    // 恒指 did not move → not inverse
    expect(tree).not.toMatch(/"inverse":true\},"children":\[" *24,018\.87"\]/)
    await ui.unmount()
  })
})
