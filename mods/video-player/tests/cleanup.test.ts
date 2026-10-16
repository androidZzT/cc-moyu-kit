import { describe, expect, test } from 'claude-code/testing'

import { STALE_MINUTES, frameRoot, parseStale, staleArgv } from '../hooks/cleanup'

describe('leftover frame directories', () => {
  test('live under one root in the temp dir, with or without its trailing slash', () => {
    expect(frameRoot('/var/folders/x/T/')).toBe('/var/folders/x/T/cc-moyu-video')
    expect(frameRoot('/tmp')).toBe('/tmp/cc-moyu-video')
    expect(frameRoot(undefined)).toBe('/tmp/cc-moyu-video')
  })

  test('are found by find: direct subdirectories untouched for more than 10 minutes', () => {
    expect(STALE_MINUTES).toBe(10)
    expect(staleArgv('/tmp/cc-moyu-video')).toEqual([
      'find', '/tmp/cc-moyu-video', '-mindepth', '1', '-maxdepth', '1', '-type', 'd', '-mmin', '+10',
    ])
  })

  test('keep only direct children of the root, never the root itself or a path outside it', () => {
    const root = '/tmp/cc-moyu-video'
    const stdout = [
      '/tmp/cc-moyu-video/play.abc123',
      '/tmp/cc-moyu-video',
      '/tmp/cc-moyu-video/play.x/nested',
      '/tmp/elsewhere',
      '/tmp/cc-moyu-video/../etc',
      '',
    ].join('\n')
    expect(parseStale(stdout, root)).toEqual(['/tmp/cc-moyu-video/play.abc123'])
  })
})
