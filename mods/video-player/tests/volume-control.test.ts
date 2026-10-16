import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ROOT, SILENT_PROBE, SINTEL_PROBE, setupWorld, startSession, video } from './harness'
import type { WorldOptions } from './harness'

const COLUMNS = 60
const PANE_PROPS = { title: '视频', isFocused: false, bodyColumns: COLUMNS, placement: 'dock' }

const flag = (argv: readonly string[] | undefined, name: string): string | undefined => {
  const at = argv?.indexOf(name) ?? -1
  return at < 0 ? undefined : argv?.[at + 1]
}

/** Sintel playing, frame 31 (2 s in) on screen, the segment started 2.1 s ago. */
const playing = async ($: Engine, on: Parameters<typeof setupWorld>[0], options: WorldOptions = {}) => {
  const world = setupWorld(on, { probe: SINTEL_PROBE, ...options })
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

describe('音量', () => {
  test('starts the sound at 100% by default', async ($, on) => {
    const world = await playing($, on)
    expect(flag(world.ffplay()?.argv, '-volume')).toBe('100')
    expect(world.player<{ line: string }>().line).toContain('音量 100%')
  })

  test('命令设音量: only the sound restarts, from where playback is, at the new level', async ($, on) => {
    const world = await playing($, on)
    const first = world.ffplay()
    const decoder = world.ffmpeg()
    expect((await video($, 'volume 40')).text).toBe('音量 40%')
    await world.clock.settle()
    expect(first?.killed).toBe(true)
    expect(world.spawned('ffplay')).toHaveLength(2)
    expect(flag(world.ffplay()?.argv, '-volume')).toBe('40')
    expect(flag(world.ffplay()?.argv, '-ss')).toBe('2.1')
    expect(decoder?.killed).toBe(false)
    expect(world.spawned('ffmpeg')).toHaveLength(1)
    expect(world.player<{ line: string }>().line).toContain('音量 40%')
    expect(world.stored('volume')).toEqual({ level: 40, isMuted: false })
  })

  test('静音与取消: mute ends the sound and keeps the picture; unmute starts it again at the old level', async ($, on) => {
    const world = await playing($, on)
    expect((await video($, 'mute')).text).toBe('静音')
    await world.clock.settle()
    expect(world.ffplay()?.killed).toBe(true)
    expect(world.player<{ line: string }>().line).toContain('静音')
    const blits = world.blits.length
    await world.clock.advance(1_000)
    expect(world.blits.length).toBeGreaterThan(blits)
    expect(world.spawned('ffplay')).toHaveLength(1)
    expect((await video($, 'mute')).text).toBe('音量 100%')
    await world.clock.settle()
    expect(world.spawned('ffplay')).toHaveLength(2)
    expect(flag(world.ffplay()?.argv, '-volume')).toBe('100')
    expect(flag(world.ffplay()?.argv, '-ss')).toBe('3.1')
  })

  test('跨会话记住: a stored level is used from the first sound on', async ($, on) => {
    const world = await playing($, on, { store: { volume: { level: 30, isMuted: false } } })
    expect(flag(world.ffplay()?.argv, '-volume')).toBe('30')
    expect(world.player<{ line: string }>().line).toContain('音量 30%')
  })

  test('a stored mute starts no sound at all', async ($, on) => {
    const world = await playing($, on, { store: { volume: { level: 30, isMuted: true } } })
    expect(world.spawned('ffplay')).toHaveLength(0)
    expect(world.player<{ line: string }>().line).toContain('静音')
  })

  test('暂停中调音量: no sound while paused; resume plays at the new level', async ($, on) => {
    const world = await playing($, on)
    await video($, 'pause')
    await video($, 'volume 50')
    await world.clock.settle()
    expect(world.spawned('ffplay')).toHaveLength(1)
    expect(world.player<{ line: string }>().line).toBe('⏸ 00:02 / 14:48 · 音量 50%')
    await video($, 'resume')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    expect(flag(world.ffplay()?.argv, '-volume')).toBe('50')
  })

  test('参数不合法: answers usage and keeps the volume', async ($, on) => {
    const world = await playing($, on)
    expect((await video($, 'volume 150')).text).toContain('用法')
    expect(world.spawned('ffplay')).toHaveLength(1)
    expect(world.stored('volume')).toBeUndefined()
  })

  test('nothing playing: the volume is still set and remembered', async ($, on) => {
    const world = setupWorld(on, { probe: SINTEL_PROBE })
    await startSession($)
    await world.clock.settle()
    expect((await video($, 'volume 20')).text).toBe('音量 20%')
    expect(world.stored('volume')).toEqual({ level: 20, isMuted: false })
  })
})

describe('音量按钮', () => {
  test('加减按钮: j twice gives 80%; the controls carry j, k and m', async ($, on) => {
    const world = await playing($, on)
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    for (const hotkey of ['j', 'k', 'm']) expect(tree).toContain(`"hotkey":"${hotkey}"`)
    await press($, 'quieter')
    await world.clock.settle()
    await press($, 'quieter')
    await world.clock.settle()
    expect(world.player<{ line: string }>().line).toContain('音量 80%')
    expect(flag(world.ffplay()?.argv, '-volume')).toBe('80')
    await ui.unmount()
  })

  test('m toggles mute from the pane', async ($, on) => {
    const world = await playing($, on)
    const ui = await mountPane($)
    await press($, 'mute')
    await world.clock.settle()
    expect(world.ffplay()?.killed).toBe(true)
    expect(JSON.stringify(await ui.drawn())).toContain('🔈')
    await ui.unmount()
  })

  test('a video without sound has no volume buttons', async ($, on) => {
    const world = setupWorld(on, { probe: SILENT_PROBE })
    await startSession($)
    await world.clock.settle()
    await video($, '/Users/me/clip.mp4')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    const ui = await mountPane($)
    const tree = JSON.stringify(await ui.drawn())
    expect(tree).toContain(`${ROOT}/play.1/s1/000001.rgb`)
    expect(tree).not.toContain('"hotkey":"j"')
    expect(tree).not.toContain('"hotkey":"m"')
    await ui.unmount()
  })
})
