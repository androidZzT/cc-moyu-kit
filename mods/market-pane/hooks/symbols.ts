export type Market = 'cn' | 'hk' | 'us'

export type IndexDef = { code: string; name: string; market: Market }

export const MARKET_LABELS: Readonly<Record<Market, string>> = {
  cn: 'A股',
  hk: '港股',
  us: '美股',
}

export const INDICES: readonly IndexDef[] = [
  { code: 'sh000001', name: '上证指数', market: 'cn' },
  { code: 'sz399001', name: '深证成指', market: 'cn' },
  { code: 'sz399006', name: '创业板指', market: 'cn' },
  { code: 'hkHSI', name: '恒生指数', market: 'hk' },
  { code: 'hkHSTECH', name: '恒生科技指数', market: 'hk' },
  { code: 'usDJI', name: '道琼斯', market: 'us' },
  { code: 'usIXIC', name: '纳斯达克', market: 'us' },
  { code: 'usINX', name: '标普500', market: 'us' },
]

export const CODE_FORMAT_HELP =
  '代码格式：A股 sh/sz/bj+6位数字（如 sh600519），港股 hk+5位数字或指数字母（如 hk00700），美股 us+代码（如 usAAPL）'

const CN = /^(sh|sz|bj)(\d{6})$/
const HK = /^hk(\d{5}|[A-Z]+)$/
const US = /^us([A-Z][A-Z.]*)$/

/** Returns the canonical code, or undefined when the input is not a valid code. */
export const normalizeCode = (input: string): string | undefined => {
  const raw = input.trim()
  if (raw.length < 3) return undefined
  const prefix = raw.slice(0, 2).toLowerCase()
  const body = raw.slice(2)
  const candidate = prefix === 'hk' || prefix === 'us' ? prefix + body.toUpperCase() : prefix + body
  return CN.test(candidate) || HK.test(candidate) || US.test(candidate) ? candidate : undefined
}

export const marketOf = (code: string): Market => {
  if (code.startsWith('hk')) return 'hk'
  if (code.startsWith('us')) return 'us'
  return 'cn'
}
