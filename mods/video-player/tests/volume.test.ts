import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_VOLUME, audibleLevel, parseLevel, readVolume, setLevel, stepVolume, toggleMute, volumeLabel } from '../hooks/volume'

describe('volume', () => {
  test('readVolume keeps a valid stored value and falls back to 100% otherwise', () => {
    expect(readVolume({ level: 30, isMuted: true })).toEqual({ level: 30, isMuted: true })
    expect(readVolume(undefined)).toEqual(DEFAULT_VOLUME)
    expect(readVolume({ level: 150, isMuted: false })).toEqual(DEFAULT_VOLUME)
    expect(readVolume({ level: 2.5, isMuted: false })).toEqual(DEFAULT_VOLUME)
    expect(readVolume({ level: 40, isMuted: 'yes' })).toEqual(DEFAULT_VOLUME)
    expect(readVolume('loud')).toEqual(DEFAULT_VOLUME)
  })

  test('加减按钮: steps of 10 stay within 0–100 and unmute', () => {
    expect(stepVolume(stepVolume(DEFAULT_VOLUME, -1), -1)).toEqual({ level: 80, isMuted: false })
    expect(stepVolume(DEFAULT_VOLUME, 1)).toEqual({ level: 100, isMuted: false })
    expect(stepVolume({ level: 5, isMuted: false }, -1)).toEqual({ level: 0, isMuted: false })
    expect(stepVolume({ level: 50, isMuted: true }, 1)).toEqual({ level: 60, isMuted: false })
  })

  test('setLevel unmutes; toggleMute keeps the level', () => {
    expect(setLevel({ level: 80, isMuted: true }, 40)).toEqual({ level: 40, isMuted: false })
    expect(toggleMute({ level: 80, isMuted: false })).toEqual({ level: 80, isMuted: true })
    expect(toggleMute({ level: 80, isMuted: true })).toEqual({ level: 80, isMuted: false })
  })

  test('audibleLevel is 0 when muted; the label reads 音量 N% or 静音', () => {
    expect(audibleLevel({ level: 60, isMuted: false })).toBe(60)
    expect(audibleLevel({ level: 60, isMuted: true })).toBe(0)
    expect(volumeLabel({ level: 60, isMuted: false })).toBe('音量 60%')
    expect(volumeLabel({ level: 60, isMuted: true })).toBe('静音')
  })

  test('参数不合法: parseLevel takes whole numbers 0–100 only', () => {
    expect(parseLevel('40')).toBe(40)
    expect(parseLevel('0')).toBe(0)
    expect(parseLevel('150')).toBeUndefined()
    expect(parseLevel('4.5')).toBeUndefined()
    expect(parseLevel('loud')).toBeUndefined()
  })
})
