import { describe, expect, test } from 'claude-code/testing'

import { CODE_FORMAT_HELP } from '../hooks/symbols'
import { MAX_WATCHLIST, addItem, formatList, parseCommand, removeItem, sanitizeStored } from '../hooks/watchlist'

describe('parseCommand', () => {
  test('dispatches subcommands, everything else is usage', () => {
    expect(parseCommand('')).toEqual({ kind: 'toggle' })
    expect(parseCommand('  list ')).toEqual({ kind: 'list' })
    expect(parseCommand('add sh600519 贵州 茅台')).toEqual({ kind: 'add', code: 'sh600519', name: '贵州 茅台' })
    expect(parseCommand('add sh600519')).toEqual({ kind: 'add', code: 'sh600519' })
    expect(parseCommand('remove sh600519')).toEqual({ kind: 'remove', code: 'sh600519' })
    expect(parseCommand('ad sh600519')).toEqual({ kind: 'usage' })
    expect(parseCommand('add')).toEqual({ kind: 'usage' })
    expect(parseCommand('list extra')).toEqual({ kind: 'usage' })
    expect(parseCommand(' play ')).toEqual({ kind: 'play' })
    expect(parseCommand('play now')).toEqual({ kind: 'usage' })
  })
})

describe('addItem', () => {
  test('adds with a name, or the code when none is given', () => {
    expect(addItem([], 'sh600519', '茅台').list).toEqual([{ code: 'sh600519', name: '茅台' }])
    expect(addItem([], 'USaapl').list).toEqual([{ code: 'usAAPL', name: 'usAAPL' }])
  })

  test('rejects a malformed code with the format help', () => {
    const change = addItem([], '600519')
    expect(change).toEqual({ list: [], message: CODE_FORMAT_HELP, isChanged: false })
  })

  test('re-adding renames in place without duplicating', () => {
    const start = [{ code: 'sh600519', name: '茅台' }]
    const change = addItem(start, 'sh600519', '贵州茅台')
    expect(change.list).toEqual([{ code: 'sh600519', name: '贵州茅台' }])
    expect(start[0]?.name).toBe('茅台')
  })

  test(`refuses a new code past ${MAX_WATCHLIST}`, () => {
    const full = Array.from({ length: MAX_WATCHLIST }, (_, i) => ({
      code: `sh6000${String(i).padStart(2, '0')}`,
      name: `s${i}`,
    }))
    const change = addItem(full, 'sz000001')
    expect(change.isChanged).toBe(false)
    expect(change.list).toHaveLength(MAX_WATCHLIST)
    expect(change.message).toContain('上限')
  })
})

describe('removeItem and formatList', () => {
  test('removes an existing code; a missing one is reported and nothing changes', () => {
    const start = [{ code: 'sh600519', name: '茅台' }]
    expect(removeItem(start, 'SH600519').list).toEqual([])
    const missing = removeItem(start, 'sz000001')
    expect(missing.isChanged).toBe(false)
    expect(missing.list).toBe(start)
    expect(missing.message).toContain('未找到')
  })

  test('lists code and name per line, or usage when empty', () => {
    expect(formatList([{ code: 'sh600519', name: '茅台' }, { code: 'hk00700', name: '腾讯' }])).toBe(
      'sh600519  茅台\nhk00700  腾讯',
    )
    expect(formatList([])).toContain('/market add')
  })
})

describe('sanitizeStored', () => {
  test('keeps valid, unique entries and drops the rest', () => {
    expect(sanitizeStored('junk')).toEqual([])
    expect(
      sanitizeStored([
        { code: 'sh600519', name: '茅台' },
        { code: 'SH600519', name: 'dup' },
        { code: 'bad' },
        null,
        { code: 'hk00700' },
      ]),
    ).toEqual([
      { code: 'sh600519', name: '茅台' },
      { code: 'hk00700', name: 'hk00700' },
    ])
  })
})
