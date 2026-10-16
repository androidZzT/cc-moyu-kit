// Pure volume logic: the stored setting, its steps and the status-line label.

export const MAX_LEVEL = 100
export const VOLUME_STEP = 10
export const VOLUME_KEY = 'volume'

export type Volume = Readonly<{ level: number; isMuted: boolean }>

export const DEFAULT_VOLUME: Volume = { level: MAX_LEVEL, isMuted: false }

const isLevel = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_LEVEL

/** The stored setting, or 100% unmuted when it is missing or malformed. */
export const readVolume = (stored: unknown): Volume => {
  const value = stored as { level?: unknown; isMuted?: unknown } | null | undefined
  if (typeof value !== 'object' || value === null) return DEFAULT_VOLUME
  if (!isLevel(value.level) || typeof value.isMuted !== 'boolean') return DEFAULT_VOLUME
  return { level: value.level, isMuted: value.isMuted }
}

/** `/video volume` argument: a whole number from 0 to 100. */
export const parseLevel = (text: string): number | undefined => {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const level = Number(trimmed)
  return isLevel(level) ? level : undefined
}

export const setLevel = (_volume: Volume, level: number): Volume => ({ level, isMuted: false })

/** One step louder (+1) or quieter (-1), kept within 0–100; a step unmutes. */
export const stepVolume = (volume: Volume, direction: 1 | -1): Volume => ({
  level: Math.min(MAX_LEVEL, Math.max(0, volume.level + direction * VOLUME_STEP)),
  isMuted: false,
})

export const toggleMute = (volume: Volume): Volume => ({ ...volume, isMuted: !volume.isMuted })

/** The level ffplay plays at; 0 means no sound is started. */
export const audibleLevel = (volume: Volume): number => (volume.isMuted ? 0 : volume.level)

export const volumeLabel = (volume: Volume): string => (volume.isMuted ? '静音' : `音量 ${volume.level}%`)
