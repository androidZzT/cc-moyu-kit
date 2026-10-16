import { describe, expect, test } from 'claude-code/testing'

import {
  audioArgv,
  decodeArgv,
  framePath,
  frameSize,
  lastProgressFrame,
  parseArgs,
  parseProbe,
  parseWhich,
  probeArgv,
} from '../hooks/plan'
import { firstAudioClock } from '../hooks/plan'

const LOCAL = { url: '/v.mkv', headers: {} }
const REMOTE = { url: 'https://upos.bilivideo.com/v.m4s', headers: { Referer: 'https://www.bilibili.com/' } }
const HEADERS = ['-headers', 'Referer: https://www.bilibili.com/\r\n']

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
      'yt-dlp': false,
    })
    expect(parseWhich('/opt/homebrew/bin/ffmpeg\nffprobe not found\n/Users/me/.local/bin/yt-dlp\n')).toEqual({
      ffmpeg: true,
      ffprobe: false,
      ffplay: false,
      'yt-dlp': true,
    })
  })
})

describe('probe', () => {
  test('asks for the streams and the duration as JSON', () => {
    expect(probeArgv(LOCAL)).toEqual([
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
  test('frames are 640 wide with an even height that keeps the aspect', () => {
    expect(frameSize(1280, 544)).toEqual({ width: 640, height: 272 })
    expect(frameSize(640, 360)).toEqual({ width: 640, height: 360 })
    expect(frameSize(1920, 817)).toEqual({ width: 640, height: 272 })
  })

  test('decodes raw RGB frames at playback speed with a 2 s head start, picture only, numbering from 1', () => {
    const argv = decodeArgv(LOCAL, 15, '/t/play.1/s1', { width: 640, height: 272 })
    expect(argv.join(' ')).toBe(
      'ffmpeg -hide_banner -loglevel error -nostdin -readrate 1 -readrate_initial_burst 2 -i /v.mkv -an -sn ' +
        '-vf fps=15,scale=640:272 -progress pipe:1 -f image2 -c:v rawvideo -pix_fmt rgb24 -y /t/play.1/s1/%06d.rgb',
    )
    expect(framePath('/t/play.1/s1', 31)).toBe('/t/play.1/s1/000031.rgb')
  })

  test('plays the audio track with no window', () => {
    expect(audioArgv(LOCAL, 0, 100)).toEqual(['ffplay', '-nodisp', '-autoexit', '-loglevel', 'info', '-vn', '-sn', '-volume', '100', '/v.mkv'])
  })

  test('a segment starting later seeks both the picture and the sound there', () => {
    expect(decodeArgv(LOCAL, 15, '/t/s2', { width: 640, height: 272 }, 65.5).slice(5, 7)).toEqual(['-ss', '65.5'])
    expect(audioArgv(LOCAL, 65.5, 40)).toEqual(['ffplay', '-nodisp', '-autoexit', '-loglevel', 'info', '-vn', '-sn', '-volume', '40', '-ss', '65.5', '/v.mkv'])
  })

  test('parses pause, resume and seek', () => {
    expect(parseArgs('pause')).toEqual({ kind: 'pause' })
    expect(parseArgs('resume')).toEqual({ kind: 'resume' })
    expect(parseArgs('seek 05:30')).toEqual({ kind: 'seek', target: { kind: 'absolute', sec: 330 } })
    expect(parseArgs('seek -10')).toEqual({ kind: 'seek', target: { kind: 'relative', sec: -10 } })
    expect(parseArgs('seek later')).toEqual({ kind: 'usage' })
    expect(parseArgs('volume 40')).toEqual({ kind: 'volume', level: 40 })
    expect(parseArgs('mute')).toEqual({ kind: 'mute' })
    expect(parseArgs('volume 150')).toEqual({ kind: 'usage' })
    expect(parseArgs('volume')).toEqual({ kind: 'usage' })
  })

  test('reads the last frame count from a piece of progress output', () => {
    expect(lastProgressFrame('frame=12\nfps=0.00\nprogress=continue\nframe=30\nfps=15\n')).toBe(30)
    expect(lastProgressFrame('fps=0.00\n')).toBeUndefined()
  })
})

describe('network inputs', () => {
  test('/video takes an http(s) link like a path, with an optional fps', () => {
    expect(parseArgs('https://www.bilibili.com/video/BV1GJ411x7h7')).toEqual({ kind: 'play', path: 'https://www.bilibili.com/video/BV1GJ411x7h7', fps: 15 })
    expect(parseArgs('https://example.com/a.mp4 24')).toEqual({ kind: 'play', path: 'https://example.com/a.mp4', fps: 24 })
    expect(parseArgs('https://example.com/a b.mp4')).toEqual({ kind: 'usage' })
  })

  test('probe, decode and sound send the headers before the input; decode reconnects on http', () => {
    expect(probeArgv(REMOTE).slice(-3)).toEqual([...HEADERS, REMOTE.url])
    const decode = decodeArgv(REMOTE, 15, '/t/s1', { width: 640, height: 360 }, 100)
    const input = decode.indexOf('-i')
    expect(decode.slice(input - 2, input + 2)).toEqual([...HEADERS, '-i', REMOTE.url])
    expect(decode).toContain('-reconnect')
    expect(decodeArgv(LOCAL, 15, '/t/s1', { width: 640, height: 272 })).not.toContain('-reconnect')
    expect(audioArgv(REMOTE, 0, 100).slice(-3)).toEqual([...HEADERS, REMOTE.url])
  })
})

describe('firstAudioClock', () => {
  test('reads the sound clock from ffplay status lines; nan before it starts', () => {
    expect(firstAudioClock('    nan    :  0.000 fd=   0 aq=    0KB\r')).toBeUndefined()
    expect(firstAudioClock('Input #0, matroska\n  99.97 M-A:  0.000 fd=   0\r 100.01 M-A: 0.000\r')).toBe(99.97)
    expect(firstAudioClock('   0.02 M-A:  0.000 fd=')).toBe(0.02)
    expect(firstAudioClock('Duration: 00:03:32.26, start')).toBeUndefined()
  })
})
