import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Feed, GameRound, GameScore, GameState, Quote, Sectors, TrendFeed } from '../types'

import { EMPTY_SCORE, buildPool, makeRound, mulberry32, parseGameMessage, pickItem, sanitizeScore, scoreAfter } from './game'
import type { GameMessage, PoolItem } from './game'
import type { GameViewProps } from './game-view'
import { buildHeatmap, renderHeatmap } from './heatmap-view'
import { isMarketOpen, refreshIntervalMs } from './hours'
import { buildQuoteUrl, movedCodes, parseQuotes } from './parse'
import { buildSectorUrl, parseSectorRank } from './sector'
import { INDICES, marketOf } from './symbols'
import { buildKlineUrl, parseKline } from './kline'
import { buildMinuteUrl, parseMinute, sampleUs } from './trend'
import { buildSections, buildStatus, renderPane } from './view'
import { addItem, formatList, parseCommand, removeItem, sanitizeStored } from './watchlist'
import type { ListChange } from './watchlist'
import type { Market } from './symbols'

// `$` may only be handed to functions declared in this file, so every
// engine-facing step lives here; the other modules hold pure logic.

const PANE_ID = 'market-pane'
const PANE_TITLE = '行情'
const TICK_MS = 10_000
const FETCH_TIMEOUT_MS = 8_000
/** Slack so a tick that lands a little early still counts as due. */
const DUE_SLACK_MS = 1_000
const ALL_MARKETS: readonly Market[] = ['cn', 'hk', 'us']
/** Markets whose intraday series come from the minute endpoint; US series are sampled from quotes. */
const MINUTE_MARKETS = ['cn', 'hk'] as const
type MinuteMarket = (typeof MINUTE_MARKETS)[number]
const MINUTE_FEED_KEY: Readonly<Record<MinuteMarket, 'cnAt' | 'hkAt'>> = { cn: 'cnAt', hk: 'hkAt' }
const SLOW_OPEN_MS = 60_000
const SLOW_CLOSED_MS = 30 * 60_000
/** The minute endpoint answers one code per request; at most this many run at once. */
const MINUTE_BATCH = 5

const quotesAtom = atom({ plugin: 'market-pane', key: 'quotes' } as const, {})
const feedAtom = atom({ plugin: 'market-pane', key: 'feed' } as const, { status: 'loading' })
const watchlistAtom = atom({ plugin: 'market-pane', key: 'watchlist' } as const, [])
const trendsAtom = atom({ plugin: 'market-pane', key: 'trends' } as const, {})
const trendFeedAtom = atom({ plugin: 'market-pane', key: 'trendFeed' } as const, {})
const sectorsAtom = atom({ plugin: 'market-pane', key: 'sectors' } as const, { gainers: [], losers: [] })
const flashAtom = atom({ plugin: 'market-pane', key: 'flash' } as const, [])
const modeAtom = atom({ plugin: 'market-pane', key: 'mode' } as const, 'market')
const gameAtom = atom({ plugin: 'market-pane', key: 'game' } as const, { status: 'idle', dealt: 0 })
const scoreAtom = atom({ plugin: 'market-pane', key: 'score' } as const, EMPTY_SCORE)

let inFlight = false
let trendsInFlight = false
let sectorsInFlight = false
let dealInFlight = false

const isPaneActive = async ($: EngineInterface): Promise<boolean> =>
  (await $.ui.panes()).some(pane => pane.id === PANE_ID && pane.isPlaced)

const fetchWithTimeout = async ($: EngineInterface, url: string): Promise<string> => {
  const timeout = $.clock.sleep(FETCH_TIMEOUT_MS).then(() => {
    throw new Error(`timed out after ${FETCH_TIMEOUT_MS}ms`)
  })
  const response = await Promise.race([$.http.fetch(url), timeout])
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text
}

/** Adds this refresh's US prices to the sampled US series (only during the US session). */
const recordUsSamples = async (
  $: EngineInterface,
  quotes: Readonly<Record<string, Quote>>,
  codes: readonly string[],
  now: number,
): Promise<void> => {
  const usCodes = codes.filter(code => marketOf(code) === 'us')
  const trends = await read($, trendsAtom)
  const { usDay } = await read($, trendFeedAtom)
  const sampled = sampleUs(trends, quotes, usCodes, now, usDay)
  if (sampled.trends === trends) return
  await update($, trendsAtom, () => sampled.trends)
  await update($, trendFeedAtom, (feed): TrendFeed => ({ ...feed, usDay: sampled.usDay }))
}

/** Fetches every index and watchlist quote in one request; on failure keeps the old quotes and marks them stale. */
const refresh = async ($: EngineInterface): Promise<void> => {
  if (inFlight) return
  inFlight = true
  try {
    const watchlist = await read($, watchlistAtom)
    const codes = [...INDICES.map(index => index.code), ...watchlist.map(item => item.code)]
    const startedAt = await $.clock.now()
    await update($, feedAtom, feed => ({ ...feed, lastFetchAt: startedAt }))
    try {
      const quotes = parseQuotes(codes, await fetchWithTimeout($, buildQuoteUrl(codes)))
      const previous = await read($, quotesAtom)
      await update($, flashAtom, () => movedCodes(previous, quotes))
      await update($, quotesAtom, () => quotes)
      await update($, feedAtom, (feed): Feed => ({ ...feed, status: 'ok', lastOkAt: startedAt, lastError: undefined }))
      await recordUsSamples($, quotes, codes, startedAt)
    } catch (error) {
      const lastError = error instanceof Error ? error.message : String(error)
      await update($, flashAtom, () => [])
      await update($, feedAtom, (feed): Feed => ({ ...feed, status: 'stale', lastError }))
    }
  } finally {
    inFlight = false
  }
}

const slowIntervalMs = (market: Market, now: number): number =>
  isMarketOpen(market, now) ? SLOW_OPEN_MS : SLOW_CLOSED_MS

const isDue = (lastAt: number | undefined, interval: number, now: number): boolean =>
  lastAt === undefined || now - lastAt >= interval - DUE_SLACK_MS

/** One code's minute series, or undefined when the request fails, so its old series stays. */
const fetchMinute = async ($: EngineInterface, code: string): Promise<readonly [string, number[]] | undefined> => {
  try {
    return [code, parseMinute(code, await fetchWithTimeout($, buildMinuteUrl(code)))] as const
  } catch {
    return undefined
  }
}

/** Fetches minute series in batches of MINUTE_BATCH and merges the ones that arrived. */
const fetchMinuteBatches = async ($: EngineInterface, codes: readonly string[]): Promise<void> => {
  for (let start = 0; start < codes.length; start += MINUTE_BATCH) {
    const results = await Promise.all(codes.slice(start, start + MINUTE_BATCH).map(code => fetchMinute($, code)))
    const arrived = Object.fromEntries(results.filter(result => result !== undefined))
    await update($, trendsAtom, trends => ({ ...trends, ...arrived }))
  }
}

/**
 * Refreshes the intraday series of each minute market whose interval has
 * elapsed. With `fillMissing`, codes of the other markets that have no series
 * yet are fetched too (pane opened, code added).
 */
const refreshTrends = async ($: EngineInterface, fillMissing: boolean): Promise<void> => {
  if (trendsInFlight) return
  trendsInFlight = true
  try {
    const now = await $.clock.now()
    const watchlist = await read($, watchlistAtom)
    const [trends, trendFeed] = [await read($, trendsAtom), await read($, trendFeedAtom)]
    const allCodes = [...INDICES.map(index => index.code), ...watchlist.map(item => item.code)]
    const dueMarkets = MINUTE_MARKETS.filter(market =>
      isDue(trendFeed[MINUTE_FEED_KEY[market]], slowIntervalMs(market, now), now),
    )
    const codes = allCodes.filter(code => {
      const market = marketOf(code)
      if (market === 'us') return false
      return dueMarkets.includes(market) || (fillMissing && trends[code] === undefined)
    })
    if (dueMarkets.length > 0) {
      await update($, trendFeedAtom, (feed): TrendFeed => ({
        ...feed,
        ...Object.fromEntries(dueMarkets.map(market => [MINUTE_FEED_KEY[market], now])),
      }))
    }
    await fetchMinuteBatches($, codes)
  } finally {
    trendsInFlight = false
  }
}

/**
 * Refreshes the A股 industry ranking when its interval has elapsed, or at once
 * with `fillMissing` while none has arrived yet. Both sides must arrive;
 * otherwise the last ranking stays.
 */
const refreshSectors = async ($: EngineInterface, fillMissing: boolean): Promise<void> => {
  if (sectorsInFlight) return
  const now = await $.clock.now()
  const { lastFetchAt, lastOkAt } = await read($, sectorsAtom)
  const isWanted = isDue(lastFetchAt, slowIntervalMs('cn', now), now) || (fillMissing && lastOkAt === undefined)
  if (!isWanted) return
  sectorsInFlight = true
  try {
    await update($, sectorsAtom, (sectors): Sectors => ({ ...sectors, lastFetchAt: now }))
    const [gainers, losers] = await Promise.all([
      fetchWithTimeout($, buildSectorUrl('gainers')).then(parseSectorRank),
      fetchWithTimeout($, buildSectorUrl('losers')).then(parseSectorRank),
    ])
    await update($, sectorsAtom, (sectors): Sectors => ({ ...sectors, gainers, losers, lastOkAt: now }))
  } catch {
    // keep the last ranking; the next interval retries
  } finally {
    sectorsInFlight = false
  }
}

/** Runs a background task; a failure is recorded on the feed instead of surfacing to the person. */
const runInBackground = ($: EngineInterface, task: Promise<void>): void => {
  task.catch(async (error: unknown) => {
    const lastError = error instanceof Error ? error.message : String(error)
    await update($, feedAtom, feed => ({ ...feed, lastError })).catch(() => undefined)
  })
}

/** Runs every TICK_MS: refreshes only while the pane is placed and the market-hours interval has elapsed. */
const tick = async ($: EngineInterface): Promise<void> => {
  if (!(await isPaneActive($))) return
  const now = await $.clock.now()
  const { lastFetchAt } = await read($, feedAtom)
  const interval = refreshIntervalMs(ALL_MARKETS, now)
  if (isDue(lastFetchAt, interval, now)) {
    await refresh($)
  }
  await refreshTrends($, false)
  await refreshSectors($, false)
}

/** Everything the pane shows, fetched now: quotes, plus intraday series and sectors that are due or missing. */
const refreshOnOpen = ($: EngineInterface): void => {
  runInBackground($, refresh($))
  runInBackground($, refreshTrends($, true))
  runInBackground($, refreshSectors($, true))
}

// ── K 线猜涨跌 ──────────────────────────────────────────────────────────────

const GAME_KEY = 'kline-game'
const SCORE_STORE_KEY = 'kline-score'
/** Codes tried per round before the round is reported as failed. */
const DEAL_TRIES = 3
/** Spreads seeds of rounds dealt within the same millisecond. */
const SEED_STRIDE = 7_919
const CLOSED_HINT = '休市中 · /market play 玩 K 线猜涨跌'
const GAME_TERMINAL_ONLY = 'K 线猜涨跌目前只支持终端 · /market play 回到行情'

/** One code's round, or undefined when its history fails to load or never gives a non-flat cut. */
const dealFrom = async ($: EngineInterface, item: PoolItem, id: number, rand: () => number): Promise<GameRound | undefined> => {
  try {
    const draft = makeRound(parseKline(item.code, await fetchWithTimeout($, buildKlineUrl(item.code))), rand)
    return draft === undefined ? undefined : { ...draft, id, code: item.code, name: item.name }
  } catch {
    return undefined
  }
}

/** Deals the next round from the pool; after DEAL_TRIES failed codes the game shows the retry prompt. */
const dealRound = async ($: EngineInterface): Promise<void> => {
  if (dealInFlight) return
  dealInFlight = true
  try {
    const { dealt } = await read($, gameAtom)
    const id = dealt + 1
    await update($, gameAtom, (game): GameState => ({ status: 'loading', dealt: game.dealt }))
    const rand = mulberry32((await $.clock.now()) + id * SEED_STRIDE)
    const pool = buildPool(await read($, watchlistAtom))
    for (let attempt = 0; attempt < DEAL_TRIES; attempt += 1) {
      const item = pickItem(pool, rand)
      const round = item === undefined ? undefined : await dealFrom($, item, id, rand)
      if (round !== undefined) {
        await update($, gameAtom, (): GameState => ({ status: 'ready', round, dealt: id }))
        return
      }
    }
    await update($, gameAtom, (game): GameState => ({ status: 'error', dealt: game.dealt }))
  } finally {
    dealInFlight = false
  }
}

/** A candle with its date dropped, so nothing on screen dates the round before it is answered. */
const undated = (round: GameRound, count: number) =>
  round.candles.slice(0, count).map(candle => ({ ...candle, date: '' }))

/** The Client's props: visible candles only until a verdict, then the hidden ones, the name and the dates. */
const toViewProps = (game: GameState, score: GameScore): GameViewProps => {
  const status = game.status === 'idle' ? 'loading' : game.status
  const round = game.round
  if (round === undefined) return { status, score }
  const verdict = game.verdict?.round === round.id ? game.verdict : undefined
  if (verdict === undefined) {
    return { status, score, round: { id: round.id, candles: undated(round, round.visible), visible: round.visible } }
  }
  return {
    status,
    score,
    round: { id: round.id, candles: undated(round, round.candles.length), visible: round.visible },
    reveal: {
      round: round.id,
      guess: verdict.guess,
      isCorrect: verdict.isCorrect,
      name: round.name,
      code: round.code,
      from: round.candles[round.visible - 1]?.date ?? '',
      to: round.candles.at(-1)?.date ?? '',
      changePct: round.changePct,
    },
  }
}

/** Judges a guess against the round the hooks hold; a stale round or a second guess changes nothing. */
const applyGuess = async ($: EngineInterface, message: Extract<GameMessage, { type: 'guess' }>): Promise<void> => {
  const game = await read($, gameAtom)
  const round = game.round
  if (round === undefined || round.id !== message.round || game.verdict?.round === round.id) return
  const isCorrect = message.guess === round.answer
  const score = scoreAfter(await read($, scoreAtom), isCorrect)
  await update($, scoreAtom, () => score)
  await update($, gameAtom, (current): GameState => ({ ...current, verdict: { round: round.id, guess: message.guess, isCorrect } }))
  await $.store.set(SCORE_STORE_KEY, score)
}

/** `/market play`: switches the pane to the game (dealing the first round) or back to the quotes. */
const toggleGame = async ($: EngineInterface): Promise<string> => {
  if ((await read($, modeAtom)) === 'game') {
    await update($, modeAtom, () => 'market' as const)
    return '已回到行情'
  }
  await update($, modeAtom, () => 'game' as const)
  if (!(await isPaneActive($))) await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
  if ((await read($, gameAtom)).round === undefined) runInBackground($, dealRound($))
  return 'K 线猜涨跌：点一下面板，按 ↑ 猜涨、↓ 猜跌，q 退出'
}

const STORE_KEY = 'watchlist'
const USAGE = '用法：/market 开关面板 · /market add <代码> [名称] · /market remove <代码> · /market list · /market play 猜涨跌'

/** Closes the pane when it is shown, otherwise opens it (at any width, since the person asked) and refreshes. */
const togglePane = async ($: EngineInterface): Promise<string> => {
  if (await isPaneActive($)) {
    await $.ui.close({ id: PANE_ID })
    return '行情面板已关闭'
  }
  await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
  refreshOnOpen($)
  return '行情面板已打开'
}

/** Writes a changed watchlist to the session state, then persists it, then refreshes so new codes show at once. */
const applyListChange = async ($: EngineInterface, change: ListChange): Promise<string> => {
  if (!change.isChanged) return change.message
  const list = [...change.list]
  await update($, watchlistAtom, () => list)
  await $.store.set(STORE_KEY, list)
  if (await isPaneActive($)) refreshOnOpen($)
  return change.message
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = sanitizeStored(await $.store.get(STORE_KEY))
    await update($, watchlistAtom, () => stored)
    const score = sanitizeScore(await $.store.get(SCORE_STORE_KEY))
    await update($, scoreAtom, () => score)
    await $.command.register({ name: 'market', description: '开关行情面板；add/remove/list 管理自选' })
    $.clock.every(TICK_MS, () => runInBackground($, tick($)))
    const opened = await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
    if (opened.isPlaced) refreshOnOpen($)
    return next(e)
  })

  on('command.run', { command: 'market' }, async ($, e) => {
    const command = parseCommand(e.args)
    const list = await read($, watchlistAtom)
    switch (command.kind) {
      case 'toggle':
        return { text: await togglePane($) }
      case 'add':
        return { text: await applyListChange($, addItem(list, command.code, command.name)) }
      case 'remove':
        return { text: await applyListChange($, removeItem(list, command.code)) }
      case 'list':
        return { text: formatList(list) }
      case 'play':
        return { text: await toggleGame($) }
      case 'usage':
        return { text: USAGE }
    }
  })

  on('ui.message', async ($, e, next) => {
    if (e.element !== GAME_KEY) return next(e)
    const message = parseGameMessage(e.data)
    if (message === undefined) return {}
    switch (message.type) {
      case 'quit':
        await update($, modeAtom, () => 'market' as const)
        return {}
      case 'next':
        runInBackground($, dealRound($))
        return {}
      case 'guess':
        await applyGuess($, message)
        return { props: toViewProps(await read($, gameAtom), await read($, scoreAtom)) }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const elements = $.ui.resolve(e)
    if ((await read($, modeAtom)) === 'game') {
      if (e.surface !== 'terminal') {
        const { Text } = elements
        return <Text dimColor>{GAME_TERMINAL_ONLY}</Text>
      }
      const { Box, Client } = $.ui.resolve(e)
      const props = toViewProps(await read($, gameAtom), await read($, scoreAtom))
      return (
        <Box flexDirection="column">
          <Client key={GAME_KEY} module="./game-surface.tsx" props={props} width={e.props.bodyColumns} height={e.props.scroll.bodyRows} />
        </Box>
      )
    }
    const now = await $.clock.now()
    const extras = { trends: await read($, trendsAtom), flash: await read($, flashAtom) }
    const sections = buildSections(await read($, quotesAtom), await read($, watchlistAtom), now, extras)
    const columns = e.props.bodyColumns
    const heatmap = renderHeatmap(elements, buildHeatmap(await read($, sectorsAtom), isMarketOpen('cn', now)), columns)
    const isAllClosed = !ALL_MARKETS.some(market => isMarketOpen(market, now))
    const { Box, Text } = elements
    const tail = (
      <Box key="tail" flexDirection="column">
        {heatmap}
        {isAllClosed && (
          <Box key="closed-hint" marginTop={1}>
            <Text dimColor>{CLOSED_HINT}</Text>
          </Box>
        )}
      </Box>
    )
    return renderPane(elements, sections, buildStatus(await read($, feedAtom)), columns, tail)
  })
}
