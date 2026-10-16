import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ALL_TOOLS, SINTEL_PROBE, WITH_YTDLP, setupWorld, startSession, video } from './harness'
import type { WorldOptions } from './harness'
import { BILI_JSON, BILI_VIDEO_PROBE, LIVE_JSON } from './samples'

const DIRECT = 'https://example.com/a.mp4'
const PAGE = 'https://www.bilibili.com/video/BV1GJ411x7h7'
const VIDEO_URL = 'https://upos.bilivideo.com/v-30032.m4s?e=1'
const AUDIO_URL = 'https://upos.bilivideo.com/a-30280.m4s?e=1'
const HEADERS = ['-headers', 'User-Agent: UA\r\nReferer: https://www.bilibili.com/\r\n']

const flag = (argv: readonly string[] | undefined, name: string): string | undefined => {
  const at = argv?.indexOf(name) ?? -1
  return at < 0 ? undefined : argv?.[at + 1]
}

const begin = async ($: Engine, on: Parameters<typeof setupWorld>[0], options: WorldOptions) => {
  const world = setupWorld(on, options)
  await startSession($)
  await world.clock.settle()
  return world
}

const BILI: WorldOptions = { which: WITH_YTDLP, probes: { [VIDEO_URL]: BILI_VIDEO_PROBE }, ytdlp: { exitCode: 0, stdout: BILI_JSON } }

describe('网络链接', () => {
  test('直链: ffmpeg and ffplay read the link itself; yt-dlp is not asked', async ($, on) => {
    const world = await begin($, on, { which: WITH_YTDLP, probes: { [DIRECT]: SINTEL_PROBE } })
    expect((await video($, DIRECT)).text).toBe('开始播放 1280×544 @ 15 fps')
    await world.clock.settle()
    expect(world.ran('yt-dlp')).toHaveLength(0)
    expect(flag(world.ffmpeg()?.argv, '-i')).toBe(DIRECT)
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    expect(world.ffplay()?.argv.at(-1)).toBe(DIRECT)
  })

  test('B 站链接: picture from the video address, sound from the audio address, both with the headers', async ($, on) => {
    const world = await begin($, on, BILI)
    expect((await video($, PAGE)).text).toBe('开始播放 852×480 @ 15 fps')
    await world.clock.settle()
    expect(world.ran('yt-dlp')[0]?.at(-1)).toBe(PAGE)
    const decode = world.ffmpeg()?.argv ?? []
    const input = decode.indexOf('-i')
    expect(decode.slice(input - 2, input + 2)).toEqual([...HEADERS, '-i', VIDEO_URL])
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    expect(world.ffplay()?.argv.slice(-3)).toEqual([...HEADERS, AUDIO_URL])
  })

  test('网络视频跳转: the new segment reads the same addresses 10 s later', async ($, on) => {
    const world = await begin($, on, BILI)
    await video($, PAGE)
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=60\n')
    await world.clock.advance(2_100)
    await video($, 'seek +10')
    await world.clock.settle()
    expect(flag(world.ffmpeg()?.argv, '-ss')).toBe('12')
    expect(flag(world.ffmpeg()?.argv, '-i')).toBe(VIDEO_URL)
    expect(world.ran('yt-dlp')).toHaveLength(1)
  })
})

describe('网络播放的降级', () => {
  test('没装 yt-dlp: says how to install it and starts nothing', async ($, on) => {
    const world = await begin($, on, { which: ALL_TOOLS, probes: {} })
    expect((await video($, PAGE)).text).toBe('播放网页链接需要 yt-dlp：brew install yt-dlp')
    expect(world.ran('mktemp')).toHaveLength(0)
  })

  test('直播: a live page or a link without a duration is refused', async ($, on) => {
    const world = await begin($, on, { which: WITH_YTDLP, probes: { [DIRECT]: SINTEL_PROBE.replace('888.032000', 'N/A') }, ytdlp: { exitCode: 0, stdout: LIVE_JSON } })
    expect((await video($, PAGE)).text).toBe('不支持直播')
    expect((await video($, DIRECT)).text).toBe('不支持直播')
    expect(world.ran('mktemp')).toHaveLength(0)
  })

  test('解析失败: names yt-dlp’s error', async ($, on) => {
    const world = await begin($, on, { which: WITH_YTDLP, probes: {}, ytdlp: { exitCode: 1, stderr: 'ERROR: Unsupported URL: https://x' } })
    const reply = (await video($, 'https://x.example/page')).text
    expect(reply).toContain('解析不了这个链接')
    expect(reply).toContain('Unsupported URL')
    expect(world.spawned('ffmpeg')).toHaveLength(0)
  })
})

describe('音画对齐', () => {
  const frameNumber = (path: string): number => Number(/(\d{6})\.rgb$/.exec(path)?.[1] ?? 0)

  const playingLocal = async ($: Engine, on: Parameters<typeof setupWorld>[0]) => {
    const world = await begin($, on, { probe: SINTEL_PROBE })
    await video($, '/Users/me/Sintel.mkv')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=1\n')
    await world.clock.settle()
    world.ffmpeg()?.emit('frame=200\n')
    return world
  }

  test('声音晚到: the picture holds until the sound catches up, never going back', async ($, on) => {
    const world = await playingLocal($, on)
    await world.clock.advance(700)
    world.ffplay()?.emit('    nan    :  0.000 fd=   0\r', 'stderr')
    world.ffplay()?.emit('   0.00 M-A:  0.000 fd=   0\r', 'stderr')
    await world.clock.settle()
    const held = world.blits.length
    await world.clock.advance(500)
    expect(world.blits).toHaveLength(held)
    await world.clock.advance(500)
    expect(world.blits.length).toBeGreaterThan(held)
    const numbers = world.blits.map(frameNumber)
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
  })

  test('a restarted sound after a volume change aligns the picture again', async ($, on) => {
    const world = await playingLocal($, on)
    await world.clock.advance(2_100)
    await video($, 'volume 40')
    await world.clock.advance(500)
    world.ffplay()?.emit('   2.10 M-A:  0.000\r', 'stderr')
    await world.clock.settle()
    const held = world.blits.length
    await world.clock.advance(400)
    expect(world.blits).toHaveLength(held)
  })

  test('only the first clock of a sound counts', async ($, on) => {
    const world = await playingLocal($, on)
    world.ffplay()?.emit('   0.00 M-A:  0.000\r', 'stderr')
    await world.clock.advance(1_000)
    const moving = world.blits.length
    world.ffplay()?.emit('   0.00 M-A:  0.000\r', 'stderr')
    await world.clock.advance(300)
    expect(world.blits.length).toBeGreaterThan(moving)
  })
})
