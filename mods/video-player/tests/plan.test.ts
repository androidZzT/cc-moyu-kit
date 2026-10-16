import { describe, expect, test } from 'claude-code/testing'

import {
  audioArgv,
  decodeArgv,
  framePath,
  lastProgressFrame,
  parseArgs,
  parseProbe,
  parseWhich,
  probeArgv,
} from '../hooks/plan'

// `ffprobe -show_entries stream=codec_type,width,height:format=duration -of json`, captured 2026-10-16
const SINTEL_PROBE =
  '{"programs": [], "stream_groups": [], "streams": [{"codec_type": "video", "width": 1280, "height": 544}, {"codec_type": "audio"}, {"codec_type": "subtitle"}], "format": {"duration": "888.032000"}}'
const SILENT_PROBE =
  '{"programs":[],"stream_groups":[],"streams":[{"codec_type":"video","width":640,"height":360}],"format":{"duration":"20.000000"}}'

describe('parseArgs', () => {
  test('plays an absolute path at 15 fps by default', () => {
    expect(parseArgs('/Users/me/a.mp4')).toEqual({ kind: 'play', path: '/Users/me/a.mp4', fps: 15 })
  })

  test('takes a trailing fps and keeps spaces inside the path', () => {
    expect(parseArgs('/Users/me/My Movie.mkv 30')).toEqual({ kind: 'play', path: '/Users/me/My Movie.mkv', fps: 30 })
    expect(parseArgs('"/Users/me/My Movie.mkv"')).toEqual({ kind: 'play', path: '/Users/me/My Movie.mkv', fps: 15 })
  })

  test('stop, and usage for a relative path, an out-of-range fps or nothing', () => {
    expect(parseArgs(' stop ')).toEqual({ kind: 'stop' })
    expect(parseArgs('a.mp4')).toEqual({ kind: 'usage' })
    expect(parseArgs('/Users/me/a.mp4 120')).toEqual({ kind: 'usage' })
    expect(parseArgs('/Users/me/a.mp4 0')).toEqual({ kind: 'usage' })
    expect(parseArgs('')).toEqual({ kind: 'usage' })
  })
})

describe('parseWhich', () => {
  test('reads which tools resolved, by the path each line ends with', () => {
    expect(parseWhich('/opt/homebrew/bin/ffmpeg\n/opt/homebrew/bin/ffprobe\n/opt/homebrew/bin/ffplay\n')).toEqual({
      ffmpeg: true,
      ffprobe: true,
      ffplay: true,
    })
    expect(parseWhich('/opt/homebrew/bin/ffmpeg\nffprobe not found\n')).toEqual({ ffmpeg: true, ffprobe: false, ffplay: false })
  })
})

describe('probe', () => {
  test('asks for the streams and the duration as JSON', () => {
    expect(probeArgv('/v.mkv')).toEqual([
      'ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', '/v.mkv',
    ])
  })

  test('reads size, duration and whether there is an audio track', () => {
    expect(parseProbe(SINTEL_PROBE)).toEqual({ width: 1280, height: 544, durationSec: 888.032, hasAudioTrack: true })
    expect(parseProbe(SILENT_PROBE)).toEqual({ width: 640, height: 360, durationSec: 20, hasAudioTrack: false })
  })

  test('no video stream, or output that is not the JSON, is not a video', () => {
    expect(parseProbe('{\n\n}')).toBeUndefined()
    expect(parseProbe('{"streams":[{"codec_type":"audio"}],"format":{"duration":"3.0"}}')).toBeUndefined()
    expect(parseProbe('Invalid data found when processing input')).toBeUndefined()
  })
})

describe('decode and audio', () => {
  test('decodes at playback speed with a 3 s head start, picture only, numbering frames from 1', () => {
    const argv = decodeArgv('/v.mkv', 15, '/t/play.1')
    expect(argv.join(' ')).toBe(
      'ffmpeg -hide_banner -loglevel error -nostdin -readrate 1 -readrate_initial_burst 3 -i /v.mkv -an -sn ' +
        '-vf fps=15,scale=640:-2 -progress pipe:1 -y /t/play.1/%06d.png',
    )
    expect(framePath('/t/play.1', 31)).toBe('/t/play.1/000031.png')
  })

  test('plays the audio track with no window', () => {
    expect(audioArgv('/v.mkv')).toEqual(['ffplay', '-nodisp', '-autoexit', '-loglevel', 'error', '-vn', '-sn', '/v.mkv'])
  })

  test('reads the last frame count from a piece of progress output', () => {
    expect(lastProgressFrame('frame=12\nfps=0.00\nprogress=continue\nframe=30\nfps=15\n')).toBe(30)
    expect(lastProgressFrame('fps=0.00\n')).toBeUndefined()
  })
})
