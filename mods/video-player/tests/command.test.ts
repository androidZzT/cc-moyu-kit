import { describe, expect, test } from 'claude-code/testing'

import { NO_FFMPEG, ROOT, SINTEL_PROBE, setupWorld, startSession, video } from './harness'

describe('/video checks before it plays', () => {
  test('相对路径: answers usage and runs nothing', async ($, on) => {
    const world = setupWorld(on, { probe: SINTEL_PROBE })
    await startSession($)
    await world.clock.settle()
    expect((await video($, 'a.mp4')).text).toContain('用法')
    expect(world.ran('which')).toHaveLength(0)
    expect(world.ran('ffprobe')).toHaveLength(0)
    expect(world.spawned('ffmpeg')).toHaveLength(0)
  })

  test('缺少 ffmpeg: says how to install it and starts nothing', async ($, on) => {
    const world = setupWorld(on, { which: NO_FFMPEG, probe: SINTEL_PROBE })
    await startSession($)
    await world.clock.settle()
    expect((await video($, '/Users/me/a.mp4')).text).toContain('brew install ffmpeg')
    expect(world.ran('ffprobe')).toHaveLength(0)
    expect(world.ran('mktemp')).toHaveLength(0)
    expect(world.spawned('ffmpeg')).toHaveLength(0)
    expect(world.panes.has('video-player')).toBe(false)
  })

  test('不是视频: answers that it cannot read the file and starts nothing', async ($, on) => {
    const world = setupWorld(on)
    await startSession($)
    await world.clock.settle()
    expect((await video($, '/Users/me/notes.txt')).text).toContain('读不了这个视频')
    expect(world.ran('mktemp')).toHaveLength(0)
    expect(world.spawned('ffmpeg')).toHaveLength(0)
  })

  test('默认帧率: probes, makes a frame directory under the temp root, opens the pane and starts ffmpeg', async ($, on) => {
    const world = setupWorld(on, { probe: SINTEL_PROBE })
    await startSession($)
    await world.clock.settle()
    expect((await video($, '/Users/me/Sintel.mkv')).text).toBe('开始播放 1280×544 @ 15 fps')
    await world.clock.settle()
    expect(world.ran('ffprobe')[0]?.at(-1)).toBe('/Users/me/Sintel.mkv')
    expect(world.ran('mkdir')).toEqual([['mkdir', '-p', ROOT]])
    expect(world.ran('mktemp')).toEqual([['mktemp', '-d', `${ROOT}/play.XXXXXX`]])
    expect(world.panes.has('video-player')).toBe(true)
    const ffmpeg = world.ffmpeg()
    expect(ffmpeg?.argv).toContain('/Users/me/Sintel.mkv')
    expect(ffmpeg?.argv.at(-1)).toBe(`${ROOT}/play.1/%06d.png`)
    expect(world.player<{ status: string }>().status).toBe('decoding')
  })
})
