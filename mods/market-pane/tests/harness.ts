import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { SAMPLE_BODY } from './fixture'
import { GAINERS_BODY, LOSERS_BODY } from './sector-fixture'
import { MINUTE_BODY } from './trend-fixture'

export type HttpReply = { status: number; text: string } | Error

export type StateKey = 'quotes' | 'feed' | 'watchlist' | 'trends' | 'trendFeed' | 'sectors' | 'flash'

const ok = (text: string): HttpReply => ({ status: 200, text })

/** The captured minute series, answered under whichever code was asked for. */
const minuteBodyFor = (code: string): string => MINUTE_BODY.replace('"sh000001"', JSON.stringify(code))

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
  // quote, minute and sector requests are recorded and answered separately
  const requests: string[] = []
  const minuteRequests: string[] = []
  const sectorRequests: string[] = []
  let reply: HttpReply = ok(SAMPLE_BODY)
  const minuteReplies = new Map<string, HttpReply>()
  let sectorReply: HttpReply | undefined
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
    if (url.includes('/rank/')) {
      sectorRequests.push(url)
      return sectorReply ?? ok(url.includes('direct=down') ? GAINERS_BODY : LOSERS_BODY)
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
    sectorRequests,
    panes,
    stored: (key: string): unknown => stored.get(key),
    read: <T>(key: StateKey): T => state.get(key) as T,
    setReply: (next: HttpReply) => {
      reply = next
    },
    setMinuteReply: (code: string, next: HttpReply) => {
      minuteReplies.set(code, next)
    },
    setSectorReply: (next: HttpReply | undefined) => {
      sectorReply = next
    },
  }
}

export const startSession = ($: Engine) =>
  $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
