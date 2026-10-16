import { describe, expect, test } from 'claude-code/testing'

import {
  DONE_LINE,
  dueFrame,
  formatClock,
  frameToShow,
  framesToDelete,
  isFinished,
  positionSec,
  rowsFor,
  statusLine,
} from '../hooks/timeline'

describe('which frame is due', () => {
  test('2 s into playback at 15 fps is frame 31; the first frame shows at once', () => {
    expect(dueFrame(0, 15)).toBe(1)
    expect(dueFrame(2_000, 15)).toBe(31)
    expect(dueFrame(1_999, 15)).toBe(30)
  })

  test('a decoder behind playback holds on the last decoded frame', () => {
    expect(frameToShow(31, 28)).toBe(28)
    expect(frameToShow(31, 40)).toBe(31)
    expect(frameToShow(1, 0)).toBe(0)
  })

  test('playback is finished only once the decoder is done and the due frame is past the last one', () => {
    expect(isFinished(301, 300, true)).toBe(true)
    expect(isFinished(300, 300, true)).toBe(false)
    expect(isFinished(301, 300, false)).toBe(false)
    expect(isFinished(2, 0, true)).toBe(false)
  })
})

describe('status line', () => {
  test('mm:ss position over duration, the shown frame rate, and a note when there is no sound', () => {
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(888.032)).toBe('14:48')
    expect(formatClock(3_725)).toBe('62:05')
    expect(positionSec(976, 15)).toBe(65)
    expect(statusLine({ positionSec: 65, durationSec: 888.032, fps: 15, hasSound: true })).toBe('01:05 / 14:48 · 15 fps')
    expect(statusLine({ positionSec: 65, durationSec: 888.032, fps: 14, hasSound: false })).toBe('01:05 / 14:48 · 14 fps · 无声音')
    expect(DONE_LINE).toBe('播放完毕')
  })
})

describe('frames to delete', () => {
  test('every frame before the shown one that is not yet deleted', () => {
    expect(framesToDelete(0, 16)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(framesToDelete(15, 18)).toEqual([16, 17])
    expect(framesToDelete(17, 18)).toEqual([])
    expect(framesToDelete(0, 0)).toEqual([])
  })
})

describe('picture box', () => {
  test('keeps the aspect with cells about twice as tall as wide', () => {
    expect(rowsFor(60, 1280, 544)).toBe(13)
    expect(rowsFor(60, 640, 360)).toBe(17)
    expect(rowsFor(1, 1280, 544)).toBe(1)
  })
})
