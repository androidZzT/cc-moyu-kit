import type { WatchItem } from '../types'
import { CODE_FORMAT_HELP, normalizeCode } from './symbols'

export const MAX_WATCHLIST = 20

export type MarketCommand =
  | { kind: 'toggle' }
  | { kind: 'add'; code: string; name?: string }
  | { kind: 'remove'; code: string }
  | { kind: 'list' }
  | { kind: 'usage' }

export type ListChange = { list: readonly WatchItem[]; message: string; isChanged: boolean }

/** Splits `/market` arguments into a subcommand; anything unrecognised is `usage`. */
export const parseCommand = (args: string): MarketCommand => {
  const [verb, code, ...rest] = args.trim().split(/\s+/).filter(Boolean)
  if (verb === undefined) return { kind: 'toggle' }
  if (verb === 'list' && code === undefined) return { kind: 'list' }
  if (verb === 'remove' && code !== undefined && rest.length === 0) return { kind: 'remove', code }
  if (verb === 'add' && code !== undefined) {
    return rest.length > 0 ? { kind: 'add', code, name: rest.join(' ') } : { kind: 'add', code }
  }
  return { kind: 'usage' }
}

export const addItem = (list: readonly WatchItem[], rawCode: string, name?: string): ListChange => {
  const code = normalizeCode(rawCode)
  if (code === undefined) return { list, message: CODE_FORMAT_HELP, isChanged: false }
  const existing = list.find(item => item.code === code)
  if (existing !== undefined) {
    const renamed = { code, name: name ?? existing.name }
    return {
      list: list.map(item => (item.code === code ? renamed : item)),
      message: `已更新自选 ${code}（${renamed.name}）`,
      isChanged: renamed.name !== existing.name,
    }
  }
  if (list.length >= MAX_WATCHLIST) {
    return { list, message: `自选已达上限 ${MAX_WATCHLIST} 只，请先 /market remove`, isChanged: false }
  }
  const item = { code, name: name ?? code }
  return { list: [...list, item], message: `已添加自选 ${code}（${item.name}）`, isChanged: true }
}

export const removeItem = (list: readonly WatchItem[], rawCode: string): ListChange => {
  const code = normalizeCode(rawCode) ?? rawCode
  if (!list.some(item => item.code === code)) {
    return { list, message: `自选中未找到 ${rawCode}`, isChanged: false }
  }
  return { list: list.filter(item => item.code !== code), message: `已删除自选 ${code}`, isChanged: true }
}

export const formatList = (list: readonly WatchItem[]): string =>
  list.length === 0
    ? '自选为空。/market add <代码> [名称] 添加，例如 /market add sh600519 茅台'
    : list.map(item => `${item.code}  ${item.name}`).join('\n')

/** Keeps only well-formed entries from stored data, which may be stale or hand-edited. */
export const sanitizeStored = (value: unknown): WatchItem[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .flatMap((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return []
      const { code, name } = entry as Record<string, unknown>
      const normalized = typeof code === 'string' ? normalizeCode(code) : undefined
      if (normalized === undefined || seen.has(normalized)) return []
      seen.add(normalized)
      return [{ code: normalized, name: typeof name === 'string' && name !== '' ? name : normalized }]
    })
    .slice(0, MAX_WATCHLIST)
}
