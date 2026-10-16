// Pure planning: command arguments, the ffmpeg / ffprobe / ffplay command lines, and reading their output.

import { parseSeek } from './timeline'
import type { SeekTarget } from './timeline'

export const DEFAULT_FPS = 15
export const MAX_FPS = 60
/** Decoded frame width in pixels; the terminal scales the picture to its box. */
export const FRAME_WIDTH = 640
/** Seconds ffmpeg may run ahead of playback before it is held to real time. */
export const DECODE_LEAD_SEC = 2
export const TOOLS = ['ffmpeg', 'ffprobe', 'ffplay'] as const

export type Tool = (typeof TOOLS)[number]
export type Tools = Readonly<Record<Tool, boolean>>
export type PlayArgs =
  | { kind: 'play'; path: string; fps: number }
  | { kind: 'seek'; target: SeekTarget }
  | { kind: 'stop' | 'pause' | 'resume' | 'usage' }
export type Probe = { width: number; height: number; durationSec: number; hasAudioTrack: boolean }
export type FrameSize = { width: number; height: number }

const USAGE: PlayArgs = { kind: 'usage' }

const unquote = (text: string): string => text.replace(/^(["'])(.*)\1$/, '$2')

/** `/video <absolute path> [fps]`: the path may hold spaces, so a trailing whole number is the fps. */
export const parseArgs = (args: string): PlayArgs => {
  const text = args.trim()
  if (text === 'stop' || text === 'pause' || text === 'resume') return { kind: text }
  if (text.startsWith('seek ')) {
    const target = parseSeek(text.slice('seek '.length))
    return target === undefined ? USAGE : { kind: 'seek', target }
  }
  const match = /^(.*?)(?:\s+(\d+))?$/.exec(text)
  const path = unquote((match?.[1] ?? '').trim())
  const fps = match?.[2] === undefined ? DEFAULT_FPS : Number(match[2])
  if (!path.startsWith('/')) return USAGE
  if (fps < 1 || fps > MAX_FPS) return USAGE
  return { kind: 'play', path, fps }
}

export const whichArgv = (): readonly string[] => ['which', ...TOOLS]

/** `which` prints a resolved path per tool it found; a tool is present when some line ends with `/<tool>`. */
export const parseWhich = (stdout: string): Tools => {
  const lines = stdout.split('\n').map(line => line.trim())
  const has = (tool: Tool): boolean => lines.some(line => line.endsWith(`/${tool}`))
  return { ffmpeg: has('ffmpeg'), ffprobe: has('ffprobe'), ffplay: has('ffplay') }
}

export const probeArgv = (path: string): readonly string[] => [
  'ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', path,
]

type ProbeStream = { codec_type?: unknown; width?: unknown; height?: unknown }

const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

/** The first video stream's size, the duration and whether an audio track exists; undefined when it is not a video. */
export const parseProbe = (stdout: string): Probe | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return undefined
  }
  const body = parsed as { streams?: unknown; format?: { duration?: unknown } }
  const streams: readonly ProbeStream[] = Array.isArray(body.streams) ? body.streams : []
  const video = streams.find(stream => stream.codec_type === 'video')
  if (video === undefined || !isPositive(video.width) || !isPositive(video.height)) return undefined
  const durationSec = Number(body.format?.duration)
  return {
    width: video.width,
    height: video.height,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0,
    hasAudioTrack: streams.some(stream => stream.codec_type === 'audio'),
  }
}

/** `-ss <seconds>` for a segment that starts past the beginning, to the millisecond. */
const seekArgs = (offsetSec: number): readonly string[] =>
  offsetSec > 0 ? ['-ss', String(Math.round(offsetSec * 1000) / 1000)] : []

/** The decoded frame: FRAME_WIDTH wide, the height kept to the aspect and rounded to an even number. */
export const frameSize = (width: number, height: number): FrameSize => ({
  width: FRAME_WIDTH,
  height: Math.max(2, 2 * Math.round((FRAME_WIDTH * height) / width / 2)),
})

/**
 * Picture only, held to playback speed after a short head start, each frame written as raw RGB
 * so the terminal draws it without decoding; the size is given exactly so every file matches it.
 */
export const decodeArgv = (path: string, fps: number, dir: string, size: FrameSize, offsetSec = 0): readonly string[] => [
  'ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', ...seekArgs(offsetSec),
  '-readrate', '1', '-readrate_initial_burst', String(DECODE_LEAD_SEC),
  '-i', path, '-an', '-sn',
  '-vf', `fps=${fps},scale=${size.width}:${size.height}`,
  '-progress', 'pipe:1', '-f', 'image2', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-y', `${dir}/%06d.rgb`,
]

export const audioArgv = (path: string, offsetSec: number): readonly string[] => [
  'ffplay', '-nodisp', '-autoexit', '-loglevel', 'error', '-vn', '-sn', ...seekArgs(offsetSec), path,
]

/** The last `frame=N` in a piece of ffmpeg's progress output, if any. */
export const lastProgressFrame = (text: string): number | undefined => {
  const matches = [...text.matchAll(/^frame=(\d+)$/gm)]
  const last = matches[matches.length - 1]
  return last === undefined ? undefined : Number(last[1])
}

export const framePath = (dir: string, index: number): string => `${dir}/${String(index).padStart(6, '0')}.rgb`
