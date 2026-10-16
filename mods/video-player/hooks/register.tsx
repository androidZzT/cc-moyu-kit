import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Player } from '../types'
import { frameRoot, parseStale, staleArgv } from './cleanup'
import {
  audioArgv,
  decodeArgv,
  firstAudioClock,
  framePath,
  frameSize,
  lastProgressFrame,
  parseArgs,
  parseProbe,
  parseWhich,
  probeArgv,
  whichArgv,
} from './plan'
import type { FrameSize, Probe, Tools } from './plan'
import { isUrl, parseYtdlp, plainMedia, ytdlpArgv } from './source'
import type { Media } from './source'
import {
  DONE_LINE,
  dueFrame,
  formatClock,
  frameToShow,
  framesToDelete,
  isFinished,
  positionAt,
  progressCells,
  rowsFor,
  seekTarget,
  statusLine,
} from './timeline'
import type { SeekTarget } from './timeline'
import { DEFAULT_VOLUME, VOLUME_KEY, audibleLevel, readVolume, setLevel, stepVolume, toggleMute, volumeLabel } from './volume'
import type { Volume } from './volume'

// `$` may only be handed to functions declared in this file, so every engine-facing step lives here;
// the other modules hold pure logic. A playback runs as segments: each is an ffmpeg writing raw RGB
// frames from one start position at playback speed, an ffplay for the sound from the same position,
// and timers that swap the keyed Image's `{ file }` source with `$.ui.blit`. Pause ends the segment;
// resume and seek start a new one. A volume change restarts only the segment's ffplay. Each ffplay's
// first sound clock re-anchors the picture clock, so a sound that starts late is not left behind.
// A link is read directly when ffprobe can, else resolved by yt-dlp into addresses and headers.

const PANE_ID = 'video-player'
const PANE_TITLE = '视频'
const IMAGE_KEY = 'view'
const STATS_MS = 1_000
/** While paused, the playback directory is touched this often so no session takes it for a leftover. */
const TOUCH_MS = 60_000
const STEP_SEC = 10
const USAGE =
  '用法：/video <绝对路径|http(s) 链接> [fps 1–60，默认 15] · /video pause | resume | seek <mm:ss|秒|+N|-N> | volume <0–100> | mute | stop'
const NEED_FFMPEG = '需要 ffmpeg 和 ffprobe：brew install ffmpeg'
const NEED_YTDLP = '播放网页链接需要 yt-dlp：brew install yt-dlp'
const NO_LIVE = '不支持直播'
const CANNOT_RESOLVE = '解析不了这个链接'
const NEED_TERMINAL = '这个终端不能显示图片，请在 kitty、Ghostty 等支持图片的终端里播放'
const TERMINAL_ONLY = '视频只能在终端里播放（kitty、Ghostty 等）'
const NOT_PLAYING = '没有在播放'
const DECODING_LINE = '解码中…'
const PLAYED_CELL = '━'
const UNPLAYED_CELL = '─'
const ALT_DENY = /\balt\b/i
const ERROR_DETAIL_CHARS = 200
const IDLE: Player = { status: 'idle', width: 0, height: 0, line: USAGE }

const playerAtom = atom({ plugin: 'video-player', key: 'player' } as const, IDLE)

/**
 * One playback and its current segment. Frame counters live here, off the state, so a frame swap
 * never redraws the pane; `segment` tells a stale segment's loop and timers that they are done.
 */
type Run = Readonly<{
  id: number
  /** Where the picture is read from, and the sound: one address for a file, maybe two for a web page. */
  video: Media
  audio: Media
  fps: number
  dir: string
  size: FrameSize
  durationSec: number
  hasSound: boolean
  isPaused: boolean
  pausedAtSec: number
  segment: number
  segDir: string
  offsetSec: number
  decoded: number
  isDecodeDone: boolean
  shown: number
  deletedThrough: number
  startedAt?: number
  shownSinceStats: number
  /** Frames shown in the last full second, for the status line. */
  lastFps: number
  /** Ends the segment's ffplay alone, so a volume change can restart the sound without the picture. */
  stopSound?: () => void
  /** Counts the segment's ffplay starts; only the latest one's clock re-anchors the picture. */
  sound: number
  /** The frame file on screen, kept across segments so the picture never blanks while a new one starts. */
  displayPath?: string
  /** The previous segment's directory, removed once the new segment's first frame is on screen. */
  prevSegDir?: string
  /** Why the last frame swap was refused, shown in the status line until a swap succeeds. */
  lastDeny?: string
  stops: readonly (() => void)[]
}>

let run: Run | undefined
let nextRunId = 1
/** The volume every ffplay starts at; read back from the store when the session starts. */
let volume: Volume = DEFAULT_VOLUME

const isCurrent = (id: number, segment: number): boolean => run?.id === id && run.segment === segment

/** Replaces the current run with `fn`'s changes, only while it is still segment `segment` of run `id`. */
const patchSegment = (id: number, segment: number, fn: (current: Run) => Partial<Run>): Run | undefined => {
  if (run === undefined || !isCurrent(id, segment)) return undefined
  run = { ...run, ...fn(run) }
  return run
}

/**
 * The frame file the pane draws: the last one swapped in, or else the segment's current frame, so the
 * Image is drawn from the first decoded frame on (a swap can only reach an Image already drawn).
 */
const pictureOf = (r: Run): string | undefined => r.displayPath ?? (r.shown > 0 ? framePath(r.segDir, r.shown) : undefined)

/** Seconds into the video now: where it was paused, or where the frame on screen sits. */
const currentPosition = (r: Run): number => (r.isPaused ? r.pausedAtSec : positionAt(r.offsetSec, r.shown, r.fps))

const setPlayer = async ($: EngineInterface, patch: Partial<Player>): Promise<void> => {
  await update($, playerAtom, player => ({ ...player, ...patch }))
}

const runInBackground = ($: EngineInterface, work: Promise<unknown>): void => {
  void work.catch(error => $.ui.log(`video-player: ${String(error)}`, { to: 'debug' }))
}

/** Runs a command; a command that cannot start reads as a failure with empty output. */
const runQuietly = async (
  $: EngineInterface,
  argv: readonly string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
  try {
    return await $.process.run(argv)
  } catch {
    return { exitCode: 1, stdout: '', stderr: '' }
  }
}

/** Ends whatever the current segment (or pause) runs: ffmpeg, ffplay and timers. */
const halt = (): void => {
  const halting = run
  if (halting === undefined) return
  run = { ...halting, stops: [], stopSound: undefined }
  halting.stops.forEach(stop => stop())
  halting.stopSound?.()
}

/** Ends the run `id` names: everything stops, its frames go, and the pane shows `patch`. */
const finish = async ($: EngineInterface, id: number, patch: Partial<Player>): Promise<void> => {
  if (run?.id !== id) return
  const ending = run
  halt()
  run = undefined
  await runQuietly($, ['rm', '-rf', ending.dir])
  await setPlayer($, { ...patch, dir: undefined })
}

const killer = (child: { return: (value: never) => Promise<unknown> }) => () => void child.return(undefined as never).catch(() => {})

/** Plays the audio track from `atSec` through ffplay at the current volume; muted, nothing starts. */
const playSound = ($: EngineInterface, id: number, segment: number, atSec: number): void => {
  const current = run
  const level = audibleLevel(volume)
  if (current === undefined || !isCurrent(id, segment) || !current.hasSound || level === 0) return
  const sound = current.sound + 1
  const child = $.process.spawn({ argv: audioArgv(current.audio, atSec, level) })
  patchSegment(id, segment, () => ({ stopSound: killer(child), sound }))
  runInBackground($, followSound($, id, segment, sound, child))
}

/** Reads ffplay's status output until its first sound clock, which re-anchors the picture clock once. */
const followSound = async (
  $: EngineInterface,
  id: number,
  segment: number,
  sound: number,
  child: AsyncIterable<{ text: string }>,
): Promise<void> => {
  let partial = ''
  let isAligned = false
  for await (const { text } of child) {
    if (isAligned) continue
    const clockSec = firstAudioClock(partial + text)
    partial = /[^\r\n]*$/.exec(text)?.[0] ?? ''
    if (clockSec === undefined) continue
    isAligned = true
    await alignToSound($, id, segment, sound, clockSec)
  }
}

/**
 * Moves the segment's clock so the frame due now is the one at `clockSec`, where the sound is. A sound
 * that started late puts the due frame behind the one on screen, and the picture holds until it catches up.
 */
const alignToSound = async ($: EngineInterface, id: number, segment: number, sound: number, clockSec: number): Promise<void> => {
  const now = await $.clock.now()
  patchSegment(id, segment, r => (r.sound === sound ? { startedAt: now - (clockSec - r.offsetSec) * 1000 } : {}))
}

/** Puts `next` on screen; the previous segment's frames go once the new segment has a frame up. */
const blitFrame = async ($: EngineInterface, id: number, segment: number, next: number): Promise<void> => {
  const current = run
  if (current === undefined || !isCurrent(id, segment)) return
  const file = framePath(current.segDir, next)
  const result = await $.ui.blit({
    requestId: PANE_ID,
    key: IMAGE_KEY,
    source: { file, format: 'rgb', width: current.size.width, height: current.size.height },
  })
  const deny = result.deny
  if (deny !== undefined) {
    if (ALT_DENY.test(deny)) await finish($, id, { status: 'error', line: NEED_TERMINAL })
    else patchSegment(id, segment, () => ({ lastDeny: deny }))
    return
  }
  const updated = patchSegment(id, segment, r => ({
    displayPath: file,
    shownSinceStats: r.shownSinceStats + 1,
    prevSegDir: undefined,
    lastDeny: undefined,
  }))
  if (updated !== undefined && current.prevSegDir !== undefined) await runQuietly($, ['rm', '-rf', current.prevSegDir])
}

/** Swaps in the frame due now; finishes once the decoder is done and the last frame has had its time. */
const showFrame = async ($: EngineInterface, id: number, segment: number): Promise<void> => {
  const startedAt = run?.startedAt
  if (!isCurrent(id, segment) || startedAt === undefined || run === undefined) return
  const due = dueFrame((await $.clock.now()) - startedAt, run.fps)
  const latest = run
  if (latest === undefined || !isCurrent(id, segment)) return
  if (isFinished(due, latest.decoded, latest.isDecodeDone)) {
    await finish($, id, { status: 'done', line: DONE_LINE })
    return
  }
  const next = frameToShow(due, latest.decoded)
  if (next <= latest.shown) return
  patchSegment(id, segment, () => ({ shown: next }))
  await blitFrame($, id, segment, next)
}

const lineFor = (r: Run, fps: number): string => {
  const line = statusLine({
    positionSec: currentPosition(r),
    durationSec: r.durationSec,
    fps,
    hasSound: r.hasSound,
    isPaused: r.isPaused,
    volume: volumeLabel(volume),
  })
  return r.lastDeny === undefined ? line : `${line} · 换帧被拒：${r.lastDeny}`
}

/** Once a second: removes frames already shown and refreshes the status line and the progress bar. */
const reportStats = async ($: EngineInterface, id: number, segment: number): Promise<void> => {
  const current = run
  if (current === undefined || !isCurrent(id, segment)) return
  const stale = framesToDelete(current.deletedThrough, current.shown)
  patchSegment(id, segment, r => ({
    deletedThrough: Math.max(r.deletedThrough, r.shown - 1),
    shownSinceStats: 0,
    lastFps: current.shownSinceStats,
  }))
  if (stale.length > 0) await runQuietly($, ['rm', '-f', ...stale.map(index => framePath(current.segDir, index))])
  if (!isCurrent(id, segment)) return
  const latest = run
  if (latest !== undefined) await setPlayer($, { line: lineFor(latest, current.shownSinceStats) })
}

/** The segment's first frame is on disk: its clock, sound and timers start. */
const startPlayback = async ($: EngineInterface, id: number, segment: number): Promise<void> => {
  const startedAt = await $.clock.now()
  const current = patchSegment(id, segment, () => ({ startedAt }))
  if (current === undefined) return
  playSound($, id, segment, current.offsetSec)
  const frames = $.clock.every(Math.max(1, Math.floor(1000 / current.fps)), () => runInBackground($, showFrame($, id, segment)))
  const stats = $.clock.every(STATS_MS, () => runInBackground($, reportStats($, id, segment)))
  patchSegment(id, segment, r => ({ stops: [...r.stops, () => frames.cancel(), () => stats.cancel()] }))
  await showFrame($, id, segment)
  // redrawn after the first frame is chosen, so the pane draws the Image the next swaps reach;
  // skipped when that first swap already ended the playback
  if (isCurrent(id, segment)) await setPlayer($, { status: 'playing' })
}

/** Runs the segment's ffmpeg, counting decoded frames from its progress output; playback starts with the first. */
const decode = async ($: EngineInterface, id: number, segment: number): Promise<void> => {
  const current = run
  if (current === undefined || !isCurrent(id, segment)) return
  const child = $.process.spawn({ argv: decodeArgv(current.video, current.fps, current.segDir, current.size, current.offsetSec) })
  patchSegment(id, segment, r => ({ stops: [...r.stops, killer(child)] }))
  let errors = ''
  for await (const { stream, text } of child) {
    if (!isCurrent(id, segment)) return
    if (stream === 'stderr') {
      errors += text
      continue
    }
    const decoded = lastProgressFrame(text)
    if (decoded === undefined) continue
    const updated = patchSegment(id, segment, () => ({ decoded }))
    if (updated?.startedAt === undefined && decoded >= 1) await startPlayback($, id, segment)
  }
  const ended = patchSegment(id, segment, () => ({ isDecodeDone: true }))
  if (ended !== undefined && ended.decoded === 0) {
    await finish($, id, { status: 'error', line: `ffmpeg 没有解出画面：${errors.trim().slice(0, ERROR_DETAIL_CHARS)}` })
  }
}

/** Ends the current segment and starts a new one at `offsetSec` in a fresh directory. */
const startSegment = async ($: EngineInterface, id: number, offsetSec: number): Promise<void> => {
  const before = run
  if (before?.id !== id) return
  halt()
  const segment = before.segment + 1
  const segDir = `${before.dir}/s${segment}`
  run = {
    ...before,
    isPaused: false,
    segment,
    segDir,
    offsetSec,
    decoded: 0,
    isDecodeDone: false,
    shown: 0,
    deletedThrough: 0,
    startedAt: undefined,
    shownSinceStats: 0,
    lastFps: before.fps,
    prevSegDir: before.segment > 0 ? before.segDir : undefined,
    stops: [],
  }
  await runQuietly($, ['mkdir', '-p', segDir])
  if (!isCurrent(id, segment)) return
  await setPlayer($, { status: 'decoding' })
  runInBackground($, decode($, id, segment))
}

const pause = async ($: EngineInterface): Promise<string> => {
  const current = run
  if (current === undefined) return NOT_PLAYING
  if (current.isPaused) return '已经暂停'
  const pausedAtSec = currentPosition(current)
  halt()
  const touch = $.clock.every(TOUCH_MS, () => runInBackground($, runQuietly($, ['touch', current.dir])))
  run = { ...(run ?? current), isPaused: true, pausedAtSec, stops: [() => touch.cancel()] }
  await setPlayer($, { status: 'paused', line: lineFor(run, 0) })
  return `已暂停在 ${formatClock(pausedAtSec)}`
}

const resume = async ($: EngineInterface): Promise<string> => {
  const current = run
  if (current === undefined) return NOT_PLAYING
  if (!current.isPaused) return '正在播放'
  await startSegment($, current.id, current.pausedAtSec)
  return `从 ${formatClock(current.pausedAtSec)} 继续`
}

/**
 * Applies a new volume and remembers it; while the sound plays, only ffplay restarts, from where
 * the sound is now (the segment's start plus the real time since), so the picture carries on.
 */
const applyVolume = async ($: EngineInterface, next: Volume): Promise<string> => {
  volume = next
  await $.store.set(VOLUME_KEY, next)
  const current = run
  if (current !== undefined && !current.isPaused && current.startedAt !== undefined) {
    const { id, segment, startedAt } = current
    const atSec = current.offsetSec + ((await $.clock.now()) - startedAt) / 1000
    if (isCurrent(id, segment)) {
      run?.stopSound?.()
      patchSegment(id, segment, () => ({ stopSound: undefined }))
      playSound($, id, segment, atSec)
    }
  }
  const latest = run
  if (latest !== undefined) await setPlayer($, { line: lineFor(latest, latest.isPaused ? 0 : latest.lastFps) })
  return volumeLabel(next)
}

const togglePause = async ($: EngineInterface): Promise<string> => (run?.isPaused === true ? resume($) : pause($))

const seek = async ($: EngineInterface, target: SeekTarget): Promise<string> => {
  const current = run
  if (current === undefined) return NOT_PLAYING
  const to = seekTarget(target, currentPosition(current), current.durationSec)
  await startSegment($, current.id, to)
  return `跳到 ${formatClock(to)}`
}

/** Stops whatever plays now; its frames are removed. */
const stopCurrent = async ($: EngineInterface): Promise<void> => {
  if (run !== undefined) await finish($, run.id, IDLE)
}

/** A fresh playback directory under the temp root, or undefined when it cannot be made. */
const makePlaybackDir = async ($: EngineInterface): Promise<string | undefined> => {
  const root = frameRoot(await $.env.get('TMPDIR'))
  await runQuietly($, ['mkdir', '-p', root])
  const made = await runQuietly($, ['mktemp', '-d', `${root}/play.XXXXXX`])
  const dir = made.stdout.trim()
  return made.exitCode === 0 && dir.startsWith(`${root}/`) ? dir : undefined
}

const readProbe = async ($: EngineInterface, input: Media): Promise<Probe | undefined> => {
  const probed = await runQuietly($, probeArgv(input))
  return probed.exitCode === 0 ? parseProbe(probed.stdout) : undefined
}

/** What to play, or the one line saying why it cannot be played. */
type Opened = { kind: 'ok'; video: Media; audio: Media; probe: Probe } | { kind: 'error'; text: string }

const refuse = (text: string): Opened => ({ kind: 'error', text })

const openFile = async ($: EngineInterface, path: string): Promise<Opened> => {
  const media = plainMedia(path)
  const probe = await readProbe($, media)
  return probe === undefined ? refuse(`读不了这个视频：${path}`) : { kind: 'ok', video: media, audio: media, probe }
}

/** A direct link plays as it is; a web page is resolved by yt-dlp into its picture and sound addresses. */
const openLink = async ($: EngineInterface, url: string, tools: Tools): Promise<Opened> => {
  const direct = plainMedia(url)
  const probe = await readProbe($, direct)
  if (probe !== undefined) return probe.durationSec > 0 ? { kind: 'ok', video: direct, audio: direct, probe } : refuse(NO_LIVE)
  if (!tools['yt-dlp']) return refuse(NEED_YTDLP)
  const answer = await runQuietly($, ytdlpArgv(url))
  if (answer.exitCode !== 0) return refuse(`${CANNOT_RESOLVE}：${answer.stderr.trim().slice(0, ERROR_DETAIL_CHARS)}`)
  const resolved = parseYtdlp(answer.stdout)
  if (resolved === undefined) return refuse(CANNOT_RESOLVE)
  if (resolved.isLive) return refuse(NO_LIVE)
  const probed = await readProbe($, resolved.video)
  if (probed === undefined) return refuse(`读不了这个视频：${url}`)
  if (probed.durationSec <= 0) return refuse(NO_LIVE)
  const hasAudioTrack = resolved.audio.url !== resolved.video.url || probed.hasAudioTrack
  return { kind: 'ok', video: resolved.video, audio: resolved.audio, probe: { ...probed, hasAudioTrack } }
}

const findTools = async ($: EngineInterface): Promise<Tools> => parseWhich((await runQuietly($, whichArgv())).stdout)

const play = async ($: EngineInterface, path: string, fps: number): Promise<string> => {
  await stopCurrent($)
  const tools = await findTools($)
  if (!tools.ffmpeg || !tools.ffprobe) return NEED_FFMPEG
  const opened = isUrl(path) ? await openLink($, path, tools) : await openFile($, path)
  if (opened.kind === 'error') return opened.text
  const { probe } = opened
  const dir = await makePlaybackDir($)
  if (dir === undefined) return '建不了临时目录，没有开始播放'
  const id = nextRunId++
  run = {
    id,
    video: opened.video,
    audio: opened.audio,
    fps,
    dir,
    size: frameSize(probe.width, probe.height),
    durationSec: probe.durationSec,
    hasSound: tools.ffplay && probe.hasAudioTrack,
    isPaused: false,
    pausedAtSec: 0,
    segment: 0,
    segDir: dir,
    offsetSec: 0,
    decoded: 0,
    isDecodeDone: false,
    shown: 0,
    deletedThrough: 0,
    shownSinceStats: 0,
    lastFps: fps,
    sound: 0,
    stops: [],
  }
  const decoding: Player = { status: 'decoding', dir, width: probe.width, height: probe.height, line: DECODING_LINE }
  await update($, playerAtom, () => decoding)
  await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
  await startSegment($, id, 0)
  return `开始播放 ${probe.width}×${probe.height} @ ${fps} fps`
}

/** Removes playback directories an interrupted session left behind. */
const removeLeftovers = async ($: EngineInterface): Promise<void> => {
  const root = frameRoot(await $.env.get('TMPDIR'))
  const stale = parseStale((await runQuietly($, staleArgv(root))).stdout, root)
  if (stale.length > 0) await runQuietly($, ['rm', '-rf', ...stale])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'video',
      description: '在侧边面板播放视频：/video <绝对路径|链接> [fps] · pause · resume · seek <位置> · volume <0–100> · mute · stop',
    })
    volume = readVolume(await $.store.get(VOLUME_KEY))
    runInBackground($, removeLeftovers($))
    return next(e)
  })

  on('command.run', { command: 'video' }, async ($, e) => {
    const args = parseArgs(e.args)
    switch (args.kind) {
      case 'play':
        return { text: await play($, args.path, args.fps) }
      case 'pause':
        return { text: await pause($) }
      case 'resume':
        return { text: await resume($) }
      case 'seek':
        return { text: await seek($, args.target) }
      case 'volume':
        return { text: await applyVolume($, setLevel(volume, args.level)) }
      case 'mute':
        return { text: await applyVolume($, toggleMute(volume)) }
      case 'stop':
        await stopCurrent($)
        await update($, playerAtom, () => IDLE)
        await $.ui.close({ id: PANE_ID })
        return { text: '已停止' }
      case 'usage':
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    if (e.surface !== 'terminal') return <Text dimColor>{TERMINAL_ONLY}</Text>
    const player = await read($, playerAtom)
    const current = run
    const picture = current === undefined ? undefined : pictureOf(current)
    if (player.dir === undefined || current === undefined || picture === undefined) {
      return <Text dimColor>{player.line}</Text>
    }
    const { Image } = $.ui.resolve(e)
    const columns = e.props.bodyColumns
    const cells = progressCells(currentPosition(current), current.durationSec, columns)
    const act = (work: Promise<unknown>) => runInBackground($, work)
    return (
      <Box flexDirection="column">
        <Image
          key={IMAGE_KEY}
          source={{ file: picture, format: 'rgb', width: current.size.width, height: current.size.height }}
          columns={columns}
          rows={rowsFor(columns, player.width, player.height)}
          alt="视频画面"
        />
        <Box key="progress" flexDirection="row">
          {cells.map((cell, i) => (
            <Button
              key={`seek-${i}`}
              plain
              dimColor={!cell.isPlayed}
              label={cell.isPlayed ? PLAYED_CELL : UNPLAYED_CELL}
              onPress={() => act(seek($, { kind: 'absolute', sec: cell.targetSec }))}
            />
          ))}
        </Box>
        <Box key="controls" flexDirection="row" gap={1}>
          <Button key="toggle" hotkey="p" onPress={() => act(togglePause($))}>
            {current.isPaused ? '▶ 播放' : '⏸ 暂停'}
          </Button>
          <Button key="back" hotkey="h" onPress={() => act(seek($, { kind: 'relative', sec: -STEP_SEC }))}>
            « 10s
          </Button>
          <Button key="forward" hotkey="l" onPress={() => act(seek($, { kind: 'relative', sec: STEP_SEC }))}>
            10s »
          </Button>
          {current.hasSound && (
            <Button key="quieter" hotkey="j" onPress={() => act(applyVolume($, stepVolume(volume, -1)))}>
              🔉
            </Button>
          )}
          {current.hasSound && (
            <Button key="louder" hotkey="k" onPress={() => act(applyVolume($, stepVolume(volume, 1)))}>
              🔊
            </Button>
          )}
          {current.hasSound && (
            <Button key="mute" hotkey="m" onPress={() => act(applyVolume($, toggleMute(volume)))}>
              {volume.isMuted ? '🔈' : '🔇'}
            </Button>
          )}
          <Text dimColor wrap="truncate-end">
            {player.line}
          </Text>
        </Box>
      </Box>
    )
  })
}
