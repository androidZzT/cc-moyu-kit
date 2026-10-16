import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

// The world beneath the plugin: clock, env, panes, blits, and the commands it runs,
// answered from memory. ffmpeg and ffplay are children the test feeds and ends.

export const TMPDIR = '/tmp/T/'
export const ROOT = '/tmp/T/cc-moyu-video'
export const ALL_TOOLS = '/opt/homebrew/bin/ffmpeg\n/opt/homebrew/bin/ffprobe\n/opt/homebrew/bin/ffplay\n'
export const NO_FFPLAY = '/opt/homebrew/bin/ffmpeg\n/opt/homebrew/bin/ffprobe\nffplay not found\n'
export const NO_FFMPEG = 'ffmpeg not found\nffprobe not found\nffplay not found\n'
export const WITH_YTDLP = `${ALL_TOOLS}/Users/me/.local/bin/yt-dlp\n`
// captured from ffprobe on Sintel (1280×544, 14:48, audio) and a silent 20 s test clip
export const SINTEL_PROBE =
  '{"streams": [{"codec_type": "video", "width": 1280, "height": 544}, {"codec_type": "audio"}], "format": {"duration": "888.032000"}}'
export const SILENT_PROBE = '{"streams":[{"codec_type":"video","width":640,"height":360}],"format":{"duration":"20.000000"}}'
export const ALT_DENY = 'the Image draws its alt there: this terminal shows no pictures'

type Item = { stream: 'stdout' | 'stderr'; text: string } | 'end'

/** A spawned child the test drives: `emit` writes a piece, `end` exits it; `killed` is set when the plugin ends it. */
export type FakeChild = {
  argv: readonly string[]
  emit: (text: string, stream?: 'stdout' | 'stderr') => void
  end: () => void
  readonly killed: boolean
  readonly ended: boolean
}

const makeChild = (argv: readonly string[]) => {
  const queue: Item[] = []
  let wake: (() => void) | undefined
  const state = { killed: false, ended: false }
  const push = (item: Item) => {
    queue.push(item)
    wake?.()
  }
  const take = async (signal: AbortSignal | undefined): Promise<Item> => {
    while (queue.length === 0) {
      if (signal?.aborted) return 'end'
      await new Promise<void>(resolve => {
        wake = resolve
        signal?.addEventListener('abort', () => resolve(), { once: true })
      })
      wake = undefined
    }
    return queue.shift() as Item
  }
  const child: FakeChild = {
    argv,
    emit: (text, stream = 'stdout') => push({ stream, text }),
    end: () => push('end'),
    get killed() {
      return state.killed
    },
    get ended() {
      return state.ended
    },
  }
  return { child, take, state }
}

export type WorldOptions = {
  now?: number
  which?: string
  probe?: string
  stale?: string
  blitDeny?: string
  store?: Record<string, unknown>
  /** ffprobe answers by input: the last argument; inputs not listed are not videos. Overrides `probe`. */
  probes?: Record<string, string>
  ytdlp?: { exitCode: number; stdout?: string; stderr?: string }
}

export const setupWorld = (on: On, options: WorldOptions = {}) => {
  const clock = mock.clock(on, { now: options.now ?? 1_000_000 })
  mock.env(on, { TMPDIR })
  const runs: (readonly string[])[] = []
  const children: FakeChild[] = []
  const blits: string[] = []
  const panes = new Set<string>()
  const state = new Map<string, unknown>()
  const stored = new Map<string, unknown>(Object.entries(options.store ?? {}))
  let made = 0

  on('store.get', async (_$, e) => ({ value: stored.get(e.key) }) as never)
  on('store.set', async (_$, e) => {
    stored.set(e.key, e.value)
    return { value: undefined } as never
  })

  on('state.set', async (_$, e, next) => {
    const result = await next(e)
    state.set(e.key, e.value)
    return result
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }) as never)

  const reply = (exitCode: number, stdout = '', stderr = '') =>
    ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } }) as never
  const probeFor = (input: string | undefined): string | undefined =>
    options.probes === undefined ? options.probe : options.probes[input ?? '']
  on('process.run', async (_$, e) => {
    const argv = e.argv as readonly string[]
    runs.push(argv)
    switch (argv[0]) {
      case 'which':
        return reply(0, options.which ?? ALL_TOOLS)
      case 'ffprobe': {
        const probe = probeFor(argv.at(-1))
        return probe === undefined ? reply(1, '{\n\n}') : reply(0, probe)
      }
      case 'yt-dlp':
        return reply(options.ytdlp?.exitCode ?? 1, options.ytdlp?.stdout ?? '', options.ytdlp?.stderr ?? '')
      case 'mktemp':
        made += 1
        return reply(0, `${ROOT}/play.${made}\n`)
      case 'find':
        return reply(0, options.stale ?? '')
      default:
        return reply(0)
    }
  })
  on('process.spawn', async function* (_$, e, next) {
    const { child, take, state: life } = makeChild(e.argv)
    children.push(child)
    try {
      for (;;) {
        const item = await take(next.signal)
        if (item === 'end') {
          life.ended = !next.signal?.aborted
          return { value: { code: life.ended ? 0 : null, signal: life.ended ? null : 'SIGTERM' } }
        }
        yield item
      }
    } finally {
      life.killed = !life.ended
    }
  })
  on('ui.blit', async (_$, e) => {
    const args = e as { source?: { file?: string } }
    blits.push(args.source?.file ?? '')
    return { value: options.blitDeny === undefined ? {} : { deny: options.blitDeny } } as never
  })
  on('ui.open', async (_$, e) => {
    panes.add(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', async (_$, e) => {
    panes.delete(e.id)
    return { value: undefined } as never
  })

  const spawned = (tool: string): FakeChild[] => children.filter(child => child.argv[0] === tool)
  return {
    clock,
    runs,
    blits,
    panes,
    /** Commands run with this program, in order. */
    ran: (tool: string): (readonly string[])[] => runs.filter(argv => argv[0] === tool),
    ffmpeg: (): FakeChild | undefined => spawned('ffmpeg').at(-1),
    ffplay: (): FakeChild | undefined => spawned('ffplay').at(-1),
    spawned,
    player: <T>(): T => state.get('player') as T,
    stored: (key: string): unknown => stored.get(key),
  }
}

export const startSession = ($: Engine) => $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

export const video = ($: Engine, args: string) => $.command.run({ command: 'video', args } as never)
