// Pure playback arithmetic: which frame is due, when playback ends, the status line and what to delete.

export const DONE_LINE = '播放完毕'
const NO_SOUND = '无声音'
/** A terminal cell is about twice as tall as it is wide. */
const CELL_ASPECT = 2

/** The 1-based frame due `elapsedMs` into playback. */
export const dueFrame = (elapsedMs: number, fps: number): number => Math.floor((elapsedMs * fps) / 1000) + 1

/** The due frame, or the last decoded one while the decoder is behind; 0 before any frame exists. */
export const frameToShow = (due: number, decoded: number): number => Math.min(due, decoded)

export const isFinished = (due: number, decoded: number, isDecodeDone: boolean): boolean =>
  isDecodeDone && decoded > 0 && due > decoded

/** Seconds into the video at a 1-based frame. */
export const positionSec = (frame: number, fps: number): number => Math.max(0, frame - 1) / fps

const twoDigits = (value: number): string => String(value).padStart(2, '0')

export const formatClock = (seconds: number): string => {
  const whole = Math.floor(seconds)
  return `${twoDigits(Math.floor(whole / 60))}:${twoDigits(whole % 60)}`
}

export type StatusInput = { positionSec: number; durationSec: number; fps: number; hasSound: boolean }

export const statusLine = ({ positionSec, durationSec, fps, hasSound }: StatusInput): string => {
  const parts = [`${formatClock(positionSec)} / ${formatClock(durationSec)}`, `${fps} fps`]
  return (hasSound ? parts : [...parts, NO_SOUND]).join(' · ')
}

/** Frames after `deletedThrough` and before the one on screen: shown already, so safe to remove. */
export const framesToDelete = (deletedThrough: number, shown: number): readonly number[] =>
  Array.from({ length: Math.max(0, shown - 1 - deletedThrough) }, (_, i) => deletedThrough + 1 + i)

/** Rows a picture needs at `columns` wide to keep its aspect. */
export const rowsFor = (columns: number, width: number, height: number): number =>
  Math.max(1, Math.round((columns * height) / width / CELL_ASPECT))
