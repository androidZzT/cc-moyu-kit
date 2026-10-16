import { describe, expect, test } from 'claude-code/testing'

import {
  DONE_LINE,
  dueFrame,
  formatClock,
  frameToShow,
  framesToDelete,
  isFinished,
  parseSeek,
  positionAt,
  positionSec,
  progressCells,
  rowsFor,
  seekTarget,
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

describe('seeking', () => {
  test('position counts from where the segment started', () => {
    expect(positionAt(60, 76, 15)).toBe(65)
    expect(positionAt(0, 1, 15)).toBe(0)
  })

  test('/video seek takes mm:ss, seconds, or +N / -N', () => {
    expect(parseSeek('05:30')).toEqual({ kind: 'absolute', sec: 330 })
    expect(parseSeek('90')).toEqual({ kind: 'absolute', sec: 90 })
    expect(parseSeek('+10')).toEqual({ kind: 'relative', sec: 10 })
    expect(parseSeek('-10')).toEqual({ kind: 'relative', sec: -10 })
    expect(parseSeek('5:3')).toBeUndefined()
    expect(parseSeek('soon')).toBeUndefined()
    expect(parseSeek('')).toBeUndefined()
  })

  test('越过片头: targets are kept between the start and a second before the end', () => {
    expect(seekTarget({ kind: 'relative', sec: -10 }, 4, 888)).toBe(0)
    expect(seekTarget({ kind: 'relative', sec: 10 }, 65, 888)).toBe(75)
    expect(seekTarget({ kind: 'absolute', sec: 330 }, 65, 888)).toBe(330)
    expect(seekTarget({ kind: 'absolute', sec: 5_000 }, 65, 888)).toBe(887)
  })
})

describe('progress bar', () => {
  test('显示进度: halfway through a 60-cell bar, the first 30 cells are played', () => {
    const cells = progressCells(444.016, 888.032, 60)
    expect(cells).toHaveLength(60)
    expect(cells.filter(cell => cell.isPlayed)).toHaveLength(30)
    expect(cells[29]?.isPlayed).toBe(true)
    expect(cells[30]?.isPlayed).toBe(false)
  })

  test('点击跳转: cell 45 of 60 jumps to about 11:06', () => {
    const cells = progressCells(0, 888.032, 60)
    expect(formatClock(cells[45]?.targetSec ?? 0)).toBe('11:06')
    expect(cells[0]?.targetSec).toBe(0)
  })

  test('no duration known: nothing is played and every cell targets the start', () => {
    expect(progressCells(10, 0, 3)).toEqual([
      { isPlayed: false, targetSec: 0 },
      { isPlayed: false, targetSec: 0 },
      { isPlayed: false, targetSec: 0 },
    ])
  })
})

describe('paused status line', () => {
  test('starts with ⏸ and drops the frame rate', () => {
    expect(statusLine({ positionSec: 65, durationSec: 888.032, fps: 0, hasSound: true, isPaused: true })).toBe('⏸ 01:05 / 14:48')
    expect(statusLine({ positionSec: 65, durationSec: 888.032, fps: 0, hasSound: false, isPaused: true })).toBe('⏸ 01:05 / 14:48 · 无声音')
    expect(statusLine({ positionSec: 65, durationSec: 888.032, fps: 15, hasSound: true, volume: '音量 60%' })).toBe('01:05 / 14:48 · 15 fps · 音量 60%')
    expect(statusLine({ positionSec: 65, durationSec: 888.032, fps: 0, hasSound: true, isPaused: true, volume: '静音' })).toBe('⏸ 01:05 / 14:48 · 静音')
    expect(statusLine({ positionSec: 65, durationSec: 888.032, fps: 15, hasSound: false, volume: '静音' })).toBe('01:05 / 14:48 · 15 fps · 无声音')
  })
})
