import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { SAMPLE_BODY } from './fixture'
import { BOARDS_BODY } from './board-fixture'
import { MOVERS_BODIES } from './movers-fixture'
import { MINUTE_BODY } from './trend-fixture'

export type HttpReply = { status: number; text: string } | Error

export type StateKey =
  | 'quotes'
  | 'feed'
  | 'watchlist'
  | 'trends'
  | 'trendFeed'
  | 'movers'
  | 'moversFeed'
  | 'flash'
  | 'mode'
  | 'game'
  | 'score'

const ok = (text: string): HttpReply => ({ status: 200, text })

/** The captured minute series, answered under whichever code was asked for. */
const minuteBodyFor = (code: string): string => MINUTE_BODY.replace('"sh000001"', JSON.stringify(code))

/** 320 synthetic daily candles for any code: a wave on a slow drift, so cuts land on both outcomes. */
export const klineBodyFor = (code: string): string => {
  const candles = Array.from({ length: 320 }, (_, i) => {
    const close = 100 + 10 * Math.sin(i / 6) + i * 0.05
    const open = 100 + 10 * Math.sin((i - 1) / 6) + (i - 1) * 0.05
    const day = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)
    return [day, open.toFixed(3), close.toFixed(3), (Math.max(open, close) + 1).toFixed(3), (Math.min(open, close) - 1).toFixed(3), '1000']
  })
  return JSON.stringify({ code: 0, msg: '', data: { [code]: { day: candles } } })
}

/** Beijing wall-clock time to epoch ms. */
export const bj = (y: number, mo: number, d: number, h: number, mi = 0): number =>
  Date.UTC(y, mo - 1, d, h - 8, mi)

/** Fakes the engine beneath the plugin: clock, store, http and the pane registry. */
export const setupWorld = (on: On, options: { now: number; store?: Record<string, unknown> }) => {
  const clock = mock.clock(on, { now: options.now })
  const stored = new Map<string, unknown>(Object.entries(options.store ?? {}))
  on('store.get', async (_$, e) => ({ value: stored.get(e.key) }) as never)
  on('store.set', async (_$, e) => {
    stored.set(e.key, e.value)
    return { value: undefined } as never
  })
  // quote, minute, kline and board-mover requests are recorded and answered separately
  const requests: string[] = []
  const minuteRequests: string[] = []
  const klineRequests: string[] = []
  const moversRequests: string[] = []
  const moversReplies = new Map<string, HttpReply>()
  let klineReply: HttpReply | undefined
  // the default quote reply answers the indices and the five watched boards
  let reply: HttpReply = ok(SAMPLE_BODY + BOARDS_BODY)
  const minuteReplies = new Map<string, HttpReply>()
  const panes = new Map<string, string>()
  const state = new Map<string, unknown>()

  on('state.set', async (_$, e, next) => {
    const result = await next(e)
    state.set(e.key, e.value)
    return result
  })

  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }) as never)
  const answer = (url: string): HttpReply => {
    if (url.includes('/minute/query')) {
      minuteRequests.push(url)
      const code = /[?&]code=([^&]*)/.exec(url)?.[1] ?? ''
      return minuteReplies.get(code) ?? ok(minuteBodyFor(code))
    }
    if (url.includes('/getBoardRankList')) {
      moversRequests.push(url)
      const board = /board_code=([^&]*)/.exec(url)?.[1] ?? ''
      const side = url.includes('direct=up') ? 'up' : 'down'
      const body = MOVERS_BODIES[board]?.[side]
      return moversReplies.get(board) ?? (body === undefined ? { status: 404, text: '' } : ok(body))
    }
    if (url.includes('/fqkline/')) {
      klineRequests.push(url)
      const code = /param=([^,]*)/.exec(url)?.[1] ?? ''
      return klineReply ?? ok(klineBodyFor(code))
    }
    requests.push(url)
    return reply
  }
  on('http.fetch', async (_$, e) => {
    const next = answer(e.url)
    if (next instanceof Error) throw next
    return { value: { status: next.status, ok: next.status < 300, headers: {}, text: next.text } } as never
  })
  on('ui.open', async (_$, e) => {
    panes.set(e.id, e.title ?? e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', async (_$, e) => {
    panes.delete(e.id)
    return { value: undefined } as never
  })
  on('ui.panes', async () => ({
    value: [...panes].map(([id, title]) => ({ id, title, isShown: true, isFocused: false, isPlaced: true })),
  }) as never)

  return {
    clock,
    requests,
    minuteRequests,
    klineRequests,
    moversRequests,
    panes,
    stored: (key: string): unknown => stored.get(key),
    read: <T>(key: StateKey): T => state.get(key) as T,
    setReply: (next: HttpReply) => {
      reply = next
    },
    setMinuteReply: (code: string, next: HttpReply) => {
      minuteReplies.set(code, next)
    },
    /** Answers both sides of one board's mover ranking with `next` from now on. */
    setMoversReply: (board: string, next: HttpReply) => {
      moversReplies.set(board, next)
    },
    setKlineReply: (next: HttpReply | undefined) => {
      klineReply = next
    },
  }
}

export const startSession = ($: Engine) =>
  $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
