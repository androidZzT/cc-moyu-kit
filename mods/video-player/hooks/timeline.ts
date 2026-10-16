// Pure playback arithmetic: which frame is due, when playback ends, the status line and what to delete.

export const DONE_LINE = '播放完毕'
const NO_SOUND = '无声音'
const PAUSED_MARK = '⏸'
/** The latest a seek may land: a second before the end, so the decoder still has a frame to give. */
const END_MARGIN_SEC = 1
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

/** Seconds into the video at a frame of a segment that started at `offsetSec`. */
export const positionAt = (offsetSec: number, frame: number, fps: number): number => offsetSec + positionSec(frame, fps)

export type SeekTarget = { kind: 'absolute' | 'relative'; sec: number }

/** `/video seek` argument: `mm:ss` or whole seconds jump there, `+N` / `-N` move by N seconds. */
export const parseSeek = (text: string): SeekTarget | undefined => {
  const trimmed = text.trim()
  const relative = /^([+-])(\d+)$/.exec(trimmed)
  if (relative !== null) return { kind: 'relative', sec: (relative[1] === '-' ? -1 : 1) * Number(relative[2]) }
  const clock = /^(\d+):([0-5]\d)$/.exec(trimmed)
  if (clock !== null) return { kind: 'absolute', sec: Number(clock[1]) * 60 + Number(clock[2]) }
  return /^\d+$/.test(trimmed) ? { kind: 'absolute', sec: Number(trimmed) } : undefined
}

/** Where a seek lands, kept between the start and a second before the end (unbounded when the length is unknown). */
export const seekTarget = (target: SeekTarget, currentSec: number, durationSec: number): number => {
  const wanted = target.kind === 'absolute' ? target.sec : currentSec + target.sec
  const latest = durationSec > 0 ? Math.max(0, durationSec - END_MARGIN_SEC) : Number.POSITIVE_INFINITY
  return Math.min(Math.max(0, wanted), latest)
}

export type ProgressCell = { isPlayed: boolean; targetSec: number }

/** One cell per column: whether playback has passed it, and where a press on it jumps. */
export const progressCells = (positionSec: number, durationSec: number, count: number): readonly ProgressCell[] => {
  const played = durationSec > 0 ? Math.round((count * positionSec) / durationSec) : 0
  return Array.from({ length: count }, (_, i) => ({
    isPlayed: i < played,
    targetSec: durationSec > 0 ? (i / count) * durationSec : 0,
  }))
}

const twoDigits = (value: number): string => String(value).padStart(2, '0')

export const formatClock = (seconds: number): string => {
  const whole = Math.floor(seconds)
  return `${twoDigits(Math.floor(whole / 60))}:${twoDigits(whole % 60)}`
}

export type StatusInput = { positionSec: number; durationSec: number; fps: number; hasSound: boolean; isPaused?: boolean }

/** `01:05 / 14:48 · 15 fps` while playing; `⏸ 01:05 / 14:48` while paused; `无声音` last when silent. */
export const statusLine = ({ positionSec, durationSec, fps, hasSound, isPaused = false }: StatusInput): string => {
  const clock = `${formatClock(positionSec)} / ${formatClock(durationSec)}`
  const parts = isPaused ? [`${PAUSED_MARK} ${clock}`] : [clock, `${fps} fps`]
  return (hasSound ? parts : [...parts, NO_SOUND]).join(' · ')
}

/** Frames after `deletedThrough` and before the one on screen: shown already, so safe to remove. */
export const framesToDelete = (deletedThrough: number, shown: number): readonly number[] =>
  Array.from({ length: Math.max(0, shown - 1 - deletedThrough) }, (_, i) => deletedThrough + 1 + i)

/** Rows a picture needs at `columns` wide to keep its aspect. */
export const rowsFor = (columns: number, width: number, height: number): number =>
  Math.max(1, Math.round((columns * height) / width / CELL_ASPECT))
