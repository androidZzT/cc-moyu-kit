import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ALT_DENY, NO_FFPLAY, ROOT, SILENT_PROBE, SINTEL_PROBE, setupWorld, startSession, video } from './harness'
import type { WorldOptions } from './harness'

const DIR = `${ROOT}/play.1`
const frame = (n: number, dir = DIR): string => `${dir}/${String(n).padStart(6, '0')}.png`
const frameNumber = (path: string): number => Number(/(\d{6})\.png$/.exec(path)?.[1] ?? 0)

/** Starts a session and `/video` on Sintel; ffmpeg is spawned but has decoded nothing yet. */
const begin = async ($: Engine, on: Parameters<typeof setupWorld>[0], options: WorldOptions = {}) => {
  const world = setupWorld(on, { probe: SINTEL_PROBE, ...options })
  await startSession($)
  await world.clock.settle()
  await video($, '/Users/me/Sintel.mkv')
  await world.clock.settle()
  return world
}

/** The frames removed so far by `rm -f`, as numbers. */
const deleted = (world: ReturnType<typeof setupWorld>): number[] =>
  world
    .ran('rm')
    .filter(argv => argv[1] === '-f')
    .flatMap(argv => argv.slice(2).map(frameNumber))

describe('画面按时间推进', () => {
  test('正常播放: starts on the first decoded frame and shows frame 31 about 2 s in', async ($, on) => {
    const world = await begin($, on)
    world.ffmpeg()?.emit('frame=1\nprogress=continue\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=45\nprogress=continue\n')
    await world.clock.advance(2_100)
    expect(world.blits[0]).toBe(frame(1))
    expect(world.blits.at(-1)).toBe(frame(31))
    const numbers = world.blits.map(frameNumber)
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
    expect(world.player<{ status: string }>().status).toBe('playing')
  })

  test('解码落后: holds on the last decoded frame, then moves on once more arrive', async ($, on) => {
    const world = await begin($, on)
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=28\n')
    await world.clock.advance(2_100)
    expect(world.blits.at(-1)).toBe(frame(28))
    world.ffmpeg()?.emit('frame=40\n')
    await world.clock.advance(100)
    expect(frameNumber(world.blits.at(-1) ?? '')).toBeGreaterThanOrEqual(31)
  })

  test('播放中: the status line shows position over duration and the shown frame rate', async ($, on) => {
    const world = await begin($, on)
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=60\n')
    await world.clock.advance(2_100)
    expect(world.player<{ line: string }>().line).toMatch(/^00:0[12] \/ 14:48 · \d+ fps$/)
  })
})

describe('临时帧的磁盘占用与清理', () => {
  test('长片: frames already shown are removed every second, never the one on screen', async ($, on) => {
    const world = await begin($, on)
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=90\n')
    await world.clock.advance(3_100)
    const shown = frameNumber(world.blits.at(-1) ?? '')
    const removed = deleted(world)
    expect(removed.length).toBeGreaterThan(15)
    expect(removed.every(n => n < shown)).toBe(true)
    expect(removed).toContain(1)
    expect(new Set(removed).size).toBe(removed.length)
  })

  test('自然播完: stops the sound, removes the directory and says it is done', async ($, on) => {
    const world = await begin($, on)
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=30\n')
    world.ffmpeg()?.end()
    await world.clock.advance(2_500)
    expect(world.ffplay()?.killed).toBe(true)
    expect(world.ran('rm')).toContainEqual(['rm', '-rf', DIR])
    expect(world.player<{ status: string; line: string; dir?: string }>()).toMatchObject({ status: 'done', line: '播放完毕' })
    expect(world.player<{ dir?: string }>().dir).toBeUndefined()
  })
})

describe('停止与换片', () => {
  test('播放中停止: ends ffmpeg and the sound, removes the directory, closes the pane', async ($, on) => {
    const world = await begin($, on)
    world.ffmpeg()?.emit('frame=10\n')
    await world.clock.advance(500)
    expect((await video($, 'stop')).text).toBe('已停止')
    await world.clock.settle()
    expect(world.ffmpeg()?.killed).toBe(true)
    expect(world.ffplay()?.killed).toBe(true)
    expect(world.ran('rm')).toContainEqual(['rm', '-rf', DIR])
    expect(world.panes.has('video-player')).toBe(false)
    const blitsAtStop = world.blits.length
    await world.clock.advance(1_000)
    expect(world.blits).toHaveLength(blitsAtStop)
  })

  test('播放中换片: the old film stops and its directory goes before the new one starts', async ($, on) => {
    const world = await begin($, on)
    world.ffmpeg()?.emit('frame=10\n')
    await world.clock.advance(500)
    const first = world.ffmpeg()
    await video($, '/Users/me/Other.mkv')
    await world.clock.settle()
    expect(first?.killed).toBe(true)
    expect(world.spawned('ffplay')[0]?.killed).toBe(true)
    expect(world.ran('rm')).toContainEqual(['rm', '-rf', DIR])
    expect(world.ffmpeg()?.argv).toContain('/Users/me/Other.mkv')
    expect(world.ffmpeg()?.argv.at(-1)).toBe(`${ROOT}/play.2/%06d.png`)
  })
})

describe('声音', () => {
  test('有音轨: ffplay starts with the first frame, not before', async ($, on) => {
    const world = await begin($, on)
    expect(world.spawned('ffplay')).toHaveLength(0)
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    expect(world.ffplay()?.argv).toEqual(['ffplay', '-nodisp', '-autoexit', '-loglevel', 'error', '-vn', '-sn', '/Users/me/Sintel.mkv'])
  })

  test('没有 ffplay: the picture plays and the status line says there is no sound', async ($, on) => {
    const world = await begin($, on, { which: NO_FFPLAY })
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=30\n')
    await world.clock.advance(1_100)
    expect(world.spawned('ffplay')).toHaveLength(0)
    expect(world.blits.length).toBeGreaterThan(0)
    expect(world.player<{ line: string }>().line).toContain('无声音')
  })

  test('a file with no audio track plays silently without ffplay', async ($, on) => {
    const world = await begin($, on, { probe: SILENT_PROBE })
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.advance(1_100)
    expect(world.spawned('ffplay')).toHaveLength(0)
    expect(world.player<{ line: string }>().line).toContain('无声音')
  })
})

describe('降级', () => {
  test('终端不支持图片: stops decoding and the sound and names a terminal that can', async ($, on) => {
    const world = await begin($, on, { blitDeny: ALT_DENY })
    world.ffmpeg()?.emit('frame=5\n')
    await world.clock.advance(300)
    expect(world.ffmpeg()?.killed).toBe(true)
    expect(world.ffplay()?.killed).toBe(true)
    expect(world.player<{ status: string; line: string }>()).toMatchObject({ status: 'error' })
    expect(world.player<{ line: string }>().line).toContain('Ghostty')
    expect(world.ran('rm')).toContainEqual(['rm', '-rf', DIR])
  })

  test('被重载打断后的遗留: session start removes frame directories left untouched for 10 minutes', async ($, on) => {
    const world = setupWorld(on, { stale: `${ROOT}/play.old\n${ROOT}/play.older\n/etc\n` })
    await startSession($)
    await world.clock.settle()
    expect(world.ran('find')).toEqual([['find', ROOT, '-mindepth', '1', '-maxdepth', '1', '-type', 'd', '-mmin', '+10']])
    expect(world.ran('rm')).toEqual([['rm', '-rf', `${ROOT}/play.old`, `${ROOT}/play.older`]])
  })
})
