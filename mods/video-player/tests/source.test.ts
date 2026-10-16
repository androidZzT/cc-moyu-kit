import { describe, expect, test } from 'claude-code/testing'

import { headersArgs, isUrl, parseYtdlp, ytdlpArgv } from '../hooks/source'
import { BILI_JSON, COMBINED_JSON, LIVE_JSON } from './samples'

describe('source', () => {
  test('isUrl takes http(s) links without spaces only', () => {
    expect(isUrl('https://www.bilibili.com/video/BV1GJ411x7h7')).toBe(true)
    expect(isUrl('http://example.com/a.mp4')).toBe(true)
    expect(isUrl('/Users/me/a.mp4')).toBe(false)
    expect(isUrl('ftp://example.com/a.mp4')).toBe(false)
    expect(isUrl('https://example.com/a b.mp4')).toBe(false)
  })

  test('ytdlpArgv asks for one video, short side up to 480, H.264 first, the link after --', () => {
    expect(ytdlpArgv('https://b.example/v')).toEqual([
      'yt-dlp', '-j', '--no-playlist', '--no-warnings', '-f', 'bv*+ba/b', '-S', 'res:480,vcodec:avc', '--', 'https://b.example/v',
    ])
  })

  test('B 站链接: separate picture and sound addresses, each with its headers', () => {
    expect(parseYtdlp(BILI_JSON)).toEqual({
      video: { url: 'https://upos.bilivideo.com/v-30032.m4s?e=1', headers: { 'User-Agent': 'UA', Referer: 'https://www.bilibili.com/' } },
      audio: { url: 'https://upos.bilivideo.com/a-30280.m4s?e=1', headers: { 'User-Agent': 'UA', Referer: 'https://www.bilibili.com/' } },
      isLive: false,
    })
  })

  test('a combined format plays picture and sound from the one address', () => {
    const media = { url: 'https://cdn.example/v.mp4', headers: { 'User-Agent': 'UA' } }
    expect(parseYtdlp(COMBINED_JSON)).toEqual({ video: media, audio: media, isLive: false })
  })

  test('直播 is flagged; malformed output is undefined', () => {
    expect(parseYtdlp(LIVE_JSON)?.isLive).toBe(true)
    expect(parseYtdlp('not json')).toBeUndefined()
    expect(parseYtdlp('{"requested_formats":[{"url":"file:///etc/passwd","vcodec":"avc1"}]}')).toBeUndefined()
    expect(parseYtdlp('{}')).toBeUndefined()
  })

  test('headersArgs: nothing without headers, else one -headers with CRLF-ended lines', () => {
    expect(headersArgs({})).toEqual([])
    expect(headersArgs({ 'User-Agent': 'UA', Referer: 'https://r/' })).toEqual(['-headers', 'User-Agent: UA\r\nReferer: https://r/\r\n'])
  })
})
