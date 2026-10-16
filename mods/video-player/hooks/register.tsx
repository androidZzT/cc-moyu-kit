import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Player } from '../types'
import { frameRoot, parseStale, staleArgv } from './cleanup'
import { audioArgv, decodeArgv, framePath, lastProgressFrame, parseArgs, parseProbe, parseWhich, probeArgv, whichArgv } from './plan'
import type { Probe, Tools } from './plan'
import { DONE_LINE, dueFrame, frameToShow, framesToDelete, isFinished, positionSec, rowsFor, statusLine } from './timeline'

// `$` may only be handed to functions declared in this file, so every engine-facing step lives here;
// the other modules hold pure logic. ffmpeg writes PNG frames to a temp dir at playback speed, a timer
// swaps the keyed Image's `{ file }` source with `$.ui.blit`, and ffplay plays the audio track.

const PANE_ID = 'video-player'
const PANE_TITLE = '视频'
const IMAGE_KEY = 'view'
const STATS_MS = 1_000
const USAGE = '用法：/video <绝对路径> [fps 1–60，默认 15] · /video stop'
const NEED_FFMPEG = '需要 ffmpeg 和 ffprobe：brew install ffmpeg'
const NEED_TERMINAL = '这个终端不能显示图片，请在 kitty、Ghostty 等支持图片的终端里播放'
const TERMINAL_ONLY = '视频只能在终端里播放（kitty、Ghostty 等）'
const DECODING_LINE = '解码中…'
const ALT_DENY = /\balt\b/i
const ERROR_DETAIL_CHARS = 200
const IDLE: Player = { status: 'idle', width: 0, height: 0, line: USAGE }

const playerAtom = atom({ plugin: 'video-player', key: 'player' } as const, IDLE)

/** One playback. Frame counters live here, off the state, so a frame swap never redraws the pane. */
type Run = Readonly<{
  id: number
  path: string
  fps: number
  dir: string
  durationSec: number
  hasSound: boolean
  decoded: number
  isDecodeDone: boolean
  shown: number
  deletedThrough: number
  startedAt?: number
  shownSinceStats: number
  stops: readonly (() => void)[]
}>

let run: Run | undefined
let nextRunId = 1

/** Replaces the current run with `fn`'s changes, only while it is still the run `id` names. */
const patchRun = (id: number, fn: (current: Run) => Partial<Run>): Run | undefined => {
  if (run?.id !== id) return undefined
  run = { ...run, ...fn(run) }
  return run
}

const setPlayer = async ($: EngineInterface, patch: Partial<Player>): Promise<void> => {
  await update($, playerAtom, player => ({ ...player, ...patch }))
}

const runInBackground = ($: EngineInterface, work: Promise<unknown>): void => {
  void work.catch(error => $.ui.log(`video-player: ${String(error)}`, { to: 'debug' }))
}

/** Runs a command; a command that cannot start reads as a failure with empty output. */
const runQuietly = async ($: EngineInterface, argv: readonly string[]): Promise<{ exitCode: number; stdout: string }> => {
  try {
    return await $.process.run(argv)
  } catch {
    return { exitCode: 1, stdout: '' }
  }
}

/** Ends the run `id` names: timers, ffmpeg and ffplay stop, its frames go, and the pane shows `patch`. */
const finish = async ($: EngineInterface, id: number, patch: Partial<Player>): Promise<void> => {
  const ending = run
  if (ending?.id !== id) return
  run = undefined
  ending.stops.forEach(stop => stop())
  await runQuietly($, ['rm', '-rf', ending.dir])
  await setPlayer($, { ...patch, dir: undefined })
}

/** Plays the audio track through ffplay until the run ends. */
const playSound = ($: EngineInterface, id: number): void => {
  const current = run
  if (current?.id !== id || !current.hasSound) return
  const child = $.process.spawn({ argv: audioArgv(current.path) })
  patchRun(id, r => ({ stops: [...r.stops, () => void child.return(undefined as never).catch(() => {})] }))
  runInBackground(
    $,
    (async () => {
      for await (const piece of child) void piece
    })(),
  )
}

/** Swaps in the frame due now; finishes once the decoder is done and the last frame has had its time. */
const showFrame = async ($: EngineInterface, id: number): Promise<void> => {
  const current = run
  if (current?.id !== id || current.startedAt === undefined) return
  const due = dueFrame((await $.clock.now()) - current.startedAt, current.fps)
  const latest = run
  if (latest?.id !== id) return
  if (isFinished(due, latest.decoded, latest.isDecodeDone)) {
    await finish($, id, { status: 'done', line: DONE_LINE })
    return
  }
  const next = frameToShow(due, latest.decoded)
  if (next <= latest.shown) return
  patchRun(id, () => ({ shown: next }))
  const result = await $.ui.blit({ requestId: PANE_ID, key: IMAGE_KEY, source: { file: framePath(latest.dir, next), format: 'png' } })
  if (result.deny === undefined) {
    patchRun(id, r => ({ shownSinceStats: r.shownSinceStats + 1 }))
    return
  }
  if (ALT_DENY.test(result.deny)) await finish($, id, { status: 'error', line: NEED_TERMINAL })
}

/** Once a second: removes frames already shown and refreshes the status line. */
const reportStats = async ($: EngineInterface, id: number): Promise<void> => {
  const current = run
  if (current?.id !== id) return
  const stale = framesToDelete(current.deletedThrough, current.shown)
  patchRun(id, r => ({ deletedThrough: Math.max(r.deletedThrough, r.shown - 1), shownSinceStats: 0 }))
  if (stale.length > 0) await runQuietly($, ['rm', '-f', ...stale.map(index => framePath(current.dir, index))])
  if (run?.id !== id) return
  const line = statusLine({
    positionSec: positionSec(current.shown, current.fps),
    durationSec: current.durationSec,
    fps: current.shownSinceStats,
    hasSound: current.hasSound,
  })
  await setPlayer($, { line })
}

/** The first frame is on disk: the clock starts, the sound starts, and the timers run until the run ends. */
const startPlayback = async ($: EngineInterface, id: number): Promise<void> => {
  const startedAt = await $.clock.now()
  const current = patchRun(id, () => ({ startedAt }))
  if (current === undefined) return
  playSound($, id)
  const frames = $.clock.every(Math.max(1, Math.floor(1000 / current.fps)), () => runInBackground($, showFrame($, id)))
  const stats = $.clock.every(STATS_MS, () => runInBackground($, reportStats($, id)))
  patchRun(id, r => ({ stops: [...r.stops, () => frames.cancel(), () => stats.cancel()] }))
  await setPlayer($, { status: 'playing' })
  await showFrame($, id)
}

/** Runs ffmpeg, counting decoded frames from its progress output; playback starts with the first frame. */
const decode = async ($: EngineInterface, id: number): Promise<void> => {
  const current = run
  if (current?.id !== id) return
  const child = $.process.spawn({ argv: decodeArgv(current.path, current.fps, current.dir) })
  patchRun(id, r => ({ stops: [...r.stops, () => void child.return(undefined as never).catch(() => {})] }))
  let errors = ''
  for await (const { stream, text } of child) {
    if (run?.id !== id) return
    if (stream === 'stderr') {
      errors += text
      continue
    }
    const decoded = lastProgressFrame(text)
    if (decoded === undefined) continue
    const updated = patchRun(id, () => ({ decoded }))
    if (updated?.startedAt === undefined && decoded >= 1) await startPlayback($, id)
  }
  const ended = patchRun(id, () => ({ isDecodeDone: true }))
  if (ended !== undefined && ended.decoded === 0) {
    await finish($, id, { status: 'error', line: `ffmpeg 没有解出画面：${errors.trim().slice(0, ERROR_DETAIL_CHARS)}` })
  }
}

/** Stops whatever plays now; its frames are removed. */
const stopCurrent = async ($: EngineInterface): Promise<void> => {
  if (run !== undefined) await finish($, run.id, IDLE)
}

/** A fresh frame directory under the temp root, or undefined when it cannot be made. */
const makeFrameDir = async ($: EngineInterface): Promise<string | undefined> => {
  const root = frameRoot(await $.env.get('TMPDIR'))
  await runQuietly($, ['mkdir', '-p', root])
  const made = await runQuietly($, ['mktemp', '-d', `${root}/play.XXXXXX`])
  const dir = made.stdout.trim()
  return made.exitCode === 0 && dir.startsWith(`${root}/`) ? dir : undefined
}

const readProbe = async ($: EngineInterface, path: string): Promise<Probe | undefined> => {
  const probed = await runQuietly($, probeArgv(path))
  return probed.exitCode === 0 ? parseProbe(probed.stdout) : undefined
}

const findTools = async ($: EngineInterface): Promise<Tools> => parseWhich((await runQuietly($, whichArgv())).stdout)

const play = async ($: EngineInterface, path: string, fps: number): Promise<string> => {
  await stopCurrent($)
  const tools = await findTools($)
  if (!tools.ffmpeg || !tools.ffprobe) return NEED_FFMPEG
  const probe = await readProbe($, path)
  if (probe === undefined) return `读不了这个视频：${path}`
  const dir = await makeFrameDir($)
  if (dir === undefined) return '建不了临时目录，没有开始播放'
  const id = nextRunId++
  run = {
    id,
    path,
    fps,
    dir,
    durationSec: probe.durationSec,
    hasSound: tools.ffplay && probe.hasAudioTrack,
    decoded: 0,
    isDecodeDone: false,
    shown: 0,
    deletedThrough: 0,
    shownSinceStats: 0,
    stops: [],
  }
  const decoding: Player = { status: 'decoding', dir, width: probe.width, height: probe.height, line: DECODING_LINE }
  await update($, playerAtom, () => decoding)
  await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
  runInBackground($, decode($, id))
  return `开始播放 ${probe.width}×${probe.height} @ ${fps} fps`
}

/** Removes frame directories an interrupted session left behind. */
const removeLeftovers = async ($: EngineInterface): Promise<void> => {
  const root = frameRoot(await $.env.get('TMPDIR'))
  const stale = parseStale((await runQuietly($, staleArgv(root))).stdout, root)
  if (stale.length > 0) await runQuietly($, ['rm', '-rf', ...stale])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'video', description: '在侧边面板播放本地视频：/video <绝对路径> [fps] · /video stop' })
    runInBackground($, removeLeftovers($))
    return next(e)
  })

  on('command.run', { command: 'video' }, async ($, e) => {
    const args = parseArgs(e.args)
    switch (args.kind) {
      case 'play':
        return { text: await play($, args.path, args.fps) }
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
    const { Box, Text } = $.ui.resolve(e)
    if (e.surface !== 'terminal') return <Text dimColor>{TERMINAL_ONLY}</Text>
    const player = await read($, playerAtom)
    const current = run
    if (player.dir === undefined || current === undefined || current.shown === 0) {
      return <Text dimColor>{player.line}</Text>
    }
    const { Image } = $.ui.resolve(e)
    const columns = e.props.bodyColumns
    return (
      <Box flexDirection="column">
        <Image
          key={IMAGE_KEY}
          source={{ file: framePath(player.dir, current.shown), format: 'png' }}
          columns={columns}
          rows={rowsFor(columns, player.width, player.height)}
          alt="视频画面"
        />
        <Text dimColor wrap="truncate-end">
          {player.line}
        </Text>
      </Box>
    )
  })
}
