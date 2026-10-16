import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ROOT, SINTEL_PROBE, setupWorld, startSession, video } from './harness'

const DIR = `${ROOT}/play.1`
const COLUMNS = 60
const PANE_PROPS = { title: '视频', isFocused: false, bodyColumns: COLUMNS, placement: 'dock' }

/** `-ss` given to a child, or undefined when it starts from the beginning. */
const seekOf = (argv: readonly string[] | undefined): string | undefined => {
  const at = argv?.indexOf('-ss') ?? -1
  return at < 0 ? undefined : argv?.[at + 1]
}

/** Sintel playing with frame 31 (2 s in) on screen. */
const playing = async ($: Engine, on: Parameters<typeof setupWorld>[0]) => {
  const world = setupWorld(on, { probe: SINTEL_PROBE })
  await startSession($)
  await world.clock.settle()
  await video($, '/Users/me/Sintel.mkv')
  await world.clock.settle()
  world.ffmpeg()?.emit('frame=1\n')
  await world.clock.settle()
  world.ffmpeg()?.emit('frame=60\n')
  await world.clock.advance(2_100)
  return world
}

const mountPane = ($: Engine) =>
  $.ui.mount({
    plugin: 'video-player',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'video-player',
    props: PANE_PROPS,
    viewport: { columns: COLUMNS, rows: 40 },
  } as never)

const press = ($: Engine, key: string) => $.ui.press({ plugin: 'video-player', key })

describe('暂停与继续', () => {
  test('暂停: the sound and decoding stop, the picture holds, the status line starts with ⏸', async ($, on) => {
    const world = await playing($, on)
    expect((await video($, 'pause')).text).toBe('已暂停在 00:02')
    await world.clock.settle()
    expect(world.ffmpeg()?.killed).toBe(true)
    expect(world.ffplay()?.killed).toBe(true)
    expect(world.player<{ status: string; line: string }>()).toMatchObject({ status: 'paused', line: '⏸ 00:02 / 14:48' })
    const blits = world.blits.length
    await world.clock.advance(2_000)
    expect(world.blits).toHaveLength(blits)
    expect((await video($, 'pause')).text).toBe('已经暂停')
  })

  test('继续: picture and sound start again from the paused position in a new segment', async ($, on) => {
    const world = await playing($, on)
    await video($, 'pause')
    expect((await video($, 'resume')).text).toBe('从 00:02 继续')
    await world.clock.settle()
    expect(world.spawned('ffmpeg')).toHaveLength(2)
    expect(seekOf(world.ffmpeg()?.argv)).toBe('2')
    expect(world.ffmpeg()?.argv.at(-1)).toBe(`${DIR}/s2/%06d.rgb`)
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    expect(seekOf(world.ffplay()?.argv)).toBe('2')
    expect(world.blits.at(-1)).toBe(`${DIR}/s2/000001.rgb`)
    expect(world.ran('rm')).toContainEqual(['rm', '-rf', `${DIR}/s1`])
    expect(world.player<{ status: string }>().status).toBe('playing')
    expect((await video($, 'resume')).text).toBe('正在播放')
  })

  test('长时间暂停: the playback directory is touched every minute until playback resumes', async ($, on) => {
    const world = await playing($, on)
    await video($, 'pause')
    await world.clock.advance(11 * 60_000)
    const touches = world.ran('touch')
    expect(touches.length).toBeGreaterThanOrEqual(10)
    expect(touches.every(argv => argv[1] === DIR)).toBe(true)
    await video($, 'resume')
    await world.clock.advance(3 * 60_000)
    expect(world.ran('touch')).toHaveLength(touches.length)
  })

  test('nothing playing: pause, resume and seek say so', async ($, on) => {
    const world = setupWorld(on, { probe: SINTEL_PROBE })
    await startSession($)
    await world.clock.settle()
    expect((await video($, 'pause')).text).toBe('没有在播放')
    expect((await video($, 'resume')).text).toBe('没有在播放')
    expect((await video($, 'seek +10')).text).toBe('没有在播放')
    expect(world.spawned('ffmpeg')).toHaveLength(0)
  })
})

describe('跳转', () => {
  test('前进 10 秒: a new segment starts 10 s later for picture and sound', async ($, on) => {
    const world = await playing($, on)
    const first = world.ffmpeg()
    expect((await video($, 'seek +10')).text).toBe('跳到 00:12')
    await world.clock.settle()
    expect(first?.killed).toBe(true)
    expect(seekOf(world.ffmpeg()?.argv)).toBe('12')
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    expect(seekOf(world.ffplay()?.argv)).toBe('12')
  })

  test('跳到绝对位置', async ($, on) => {
    const world = await playing($, on)
    expect((await video($, 'seek 05:30')).text).toBe('跳到 05:30')
    await world.clock.settle()
    expect(seekOf(world.ffmpeg()?.argv)).toBe('330')
  })

  test('越过片头: back 10 s from 00:02 starts from the beginning', async ($, on) => {
    const world = await playing($, on)
    expect((await video($, 'seek -10')).text).toBe('跳到 00:00')
    await world.clock.settle()
    expect(world.spawned('ffmpeg')).toHaveLength(2)
    expect(seekOf(world.ffmpeg()?.argv)).toBeUndefined()
  })

  test('a seek while paused plays from the new position', async ($, on) => {
    const world = await playing($, on)
    await video($, 'pause')
    await video($, 'seek +10')
    await world.clock.settle()
    expect(seekOf(world.ffmpeg()?.argv)).toBe('12')
    expect(world.player<{ status: string }>().status).toBe('decoding')
  })
})

describe('面板控制', () => {
  test('draws a 60-cell progress bar and the controls with their hotkeys', async ($, on) => {
    await playing($, on)
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    expect(tree).toContain('seek-0')
    expect(tree).toContain('seek-59')
    expect(tree).not.toContain('seek-60')
    expect(tree).toContain('⏸ 暂停')
    expect(tree).toContain('« 10s')
    expect(tree).toContain('10s »')
    for (const hotkey of ['p', 'h', 'l']) expect(tree).toContain(`"hotkey":"${hotkey}"`)
    await ui.unmount()
  })

  test('暂停 from the button: playback pauses and the button turns into play', async ($, on) => {
    const world = await playing($, on)
    const ui = await mountPane($)
    await press($, 'toggle')
    await world.clock.settle()
    expect(world.player<{ status: string }>().status).toBe('paused')
    expect(JSON.stringify(await ui.drawn())).toContain('▶ 播放')
    await press($, 'toggle')
    await world.clock.settle()
    expect(seekOf(world.ffmpeg()?.argv)).toBe('2')
    await ui.unmount()
  })

  test('点击跳转: cell 45 of 60 starts a segment at about 11:06; « 10s goes back', async ($, on) => {
    const world = await playing($, on)
    const ui = await mountPane($)
    await press($, 'seek-45')
    await world.clock.settle()
    expect(seekOf(world.ffmpeg()?.argv)).toBe('666.024')
    await press($, 'back')
    await world.clock.settle()
    expect(seekOf(world.ffmpeg()?.argv)).toBe('656.024')
    await ui.unmount()
  })
})
