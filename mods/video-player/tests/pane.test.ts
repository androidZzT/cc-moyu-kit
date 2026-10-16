import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ROOT, SINTEL_PROBE, setupWorld, startSession, video } from './harness'

const COLUMNS = 60
const PANE_PROPS = { title: '视频', isFocused: false, bodyColumns: COLUMNS, placement: 'dock' }

const mountPane = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({
    plugin: 'video-player',
    surface,
    component: 'Pane',
    requestId: 'video-player',
    props: PANE_PROPS,
    viewport: { columns: COLUMNS, rows: 40 },
  } as never)

const begin = async ($: Engine, on: Parameters<typeof setupWorld>[0]) => {
  const world = setupWorld(on, { probe: SINTEL_PROBE })
  await startSession($)
  await world.clock.settle()
  await video($, '/Users/me/Sintel.mkv')
  await world.clock.settle()
  return world
}

describe('pane drawing', () => {
  test('before the first frame: only the status text', async ($, on) => {
    await begin($, on)
    const ui = await mountPane($)
    expect(await ui.find({ type: 'Image' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '解码中…' })).toBeDefined()
    await ui.unmount()
  })

  test('while playing: a keyed picture as wide as the pane, rows kept to the aspect, then the status line', async ($, on) => {
    const world = await begin($, on)
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=30\n')
    await world.clock.advance(1_100)
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    // 1280×544 at 60 columns: 60 × 544 / 1280 / 2 ≈ 13 rows
    expect(tree).toContain('"columns":60')
    expect(tree).toContain('"rows":13')
    expect(tree).toContain('"alt":"视频画面"')
    expect(tree).toMatch(new RegExp(`"file":"${ROOT}/play\\.1/s1/0000\\d\\d\\.rgb","format":"rgb","width":640,"height":272`))
    expect(tree).toMatch(/\d\d:\d\d \/ 14:48 · \d+ fps/)
    await ui.unmount()
  })

  test('once finished: the picture is gone and the pane says so', async ($, on) => {
    const world = await begin($, on)
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=15\n')
    world.ffmpeg()?.end()
    await world.clock.advance(1_500)
    const ui = await mountPane($)
    expect(await ui.find({ type: 'Image' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '播放完毕' })).toBeDefined()
    await ui.unmount()
  })

  test('outside a terminal: a one-line hint, no picture', async ($, on) => {
    await begin($, on)
    const ui = await mountPane($, 'desktop')
    expect(JSON.stringify(await ui.drawn())).toContain('视频只能在终端里播放')
    await ui.unmount()
  })
})

describe('first frame', () => {
  test('the picture is drawn from the first decoded frame even before any frame swap succeeds', async ($, on) => {
    const world = setupWorld(on, { probe: SINTEL_PROBE, blitDeny: 'nothing of this plugin is mounted there' })
    await startSession($)
    await world.clock.settle()
    await video($, '/Users/me/Sintel.mkv')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    expect(tree).toMatch(new RegExp(`"file":"${ROOT}/play\\.1/s1/000001\\.rgb"`))
    await ui.unmount()
  })

  test('a refused swap names its reason in the status line', async ($, on) => {
    const world = setupWorld(on, { probe: SINTEL_PROBE, blitDeny: 'the size is not the mounted one' })
    await startSession($)
    await world.clock.settle()
    await video($, '/Users/me/Sintel.mkv')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=30\n')
    await world.clock.advance(1_100)
    expect(world.player<{ line: string }>().line).toContain('换帧被拒：the size is not the mounted one')
  })
})
