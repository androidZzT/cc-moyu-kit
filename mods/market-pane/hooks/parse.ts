import type { Quote } from '../types'

export const QUOTE_ENDPOINT = 'https://qt.gtimg.cn/q='

const FIELD_PRICE = 3
const FIELD_PREV_CLOSE = 4
const LINE = /v_([A-Za-z0-9.]+)="([^"]*)"/g

export const MISSING_QUOTE: Quote = { price: 0, prevClose: 0, change: 0, pct: 0, isMissing: true }

export const buildQuoteUrl = (codes: readonly string[]): string =>
  QUOTE_ENDPOINT + [...new Set(codes)].join(',')

const toQuote = (fields: readonly string[]): Quote => {
  const price = Number(fields[FIELD_PRICE])
  const prevClose = Number(fields[FIELD_PREV_CLOSE])
  if (!(Number.isFinite(price) && price > 0 && Number.isFinite(prevClose) && prevClose > 0)) {
    return MISSING_QUOTE
  }
  const change = price - prevClose
  return { price, prevClose, change, pct: (change / prevClose) * 100, isMissing: false }
}

/**
 * Parses a quote response into one entry per requested code. Only numeric
 * fields are read, so the GBK-encoded names do not matter. A code the
 * response does not answer (absent, or `pv_none_match`) is marked missing.
 * Throws when the body holds no quote line at all, so the caller can treat
 * it as a failed fetch.
 */
export const parseQuotes = (codes: readonly string[], body: string): Record<string, Quote> => {
  const answered = new Map<string, Quote>()
  for (const match of body.matchAll(LINE)) {
    const [, code, payload] = match
    if (code && payload !== undefined && payload.includes('~')) {
      answered.set(code, toQuote(payload.split('~')))
    }
  }
  if (answered.size === 0 && !body.includes('pv_none_match') && codes.length > 0) {
    throw new Error('quote response holds no quote line')
  }
  return Object.fromEntries(codes.map(code => [code, answered.get(code) ?? MISSING_QUOTE]))
}

/** Codes quoted in both refreshes whose price moved; a code without an earlier quote is not counted. */
export const movedCodes = (
  previous: Readonly<Record<string, Quote>>,
  next: Readonly<Record<string, Quote>>,
): string[] =>
  Object.entries(next)
    .filter(([code, quote]) => {
      const before = previous[code]
      return before !== undefined && !before.isMissing && !quote.isMissing && before.price !== quote.price
    })
    .map(([code]) => code)
