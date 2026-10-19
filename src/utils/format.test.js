import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { countIssues, getLogTimestamp, getUserSlug, stripAnsi, toFileSlug } from './format.js'

describe('stripAnsi', () => {
  it('removes colour escape sequences', () => {
    expect(stripAnsi('\u001B[31mred\u001B[0m plain')).toBe('red plain')
  })

  it('returns an empty string unchanged', () => {
    expect(stripAnsi('')).toBe('')
  })
})

describe('countIssues', () => {
  it('counts eslint errors, tsc errors and warnings separately', () => {
    const text = [
      '  1:5  error  no-undef',
      'a.ts(1,1): error TS2304: Cannot find name',
      '  2:3  warning  no-console',
      '[warn] src/a.js',
    ].join('\n')

    expect(countIssues(text)).toEqual({ errors: 2, warnings: 2 })
  })

  it('returns zero counts for text without issues', () => {
    expect(countIssues('all good')).toEqual({ errors: 0, warnings: 0 })
  })
})

describe('getLogTimestamp', () => {
  it('formats a date as YYYY-MM-DD_HH-mm-ss with zero padding', () => {
    expect(getLogTimestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02_03-04-05')
  })

  it('defaults to the current time', () => {
    expect(getLogTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/)
  })
})

describe('toFileSlug', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    ['', ''],
    ['   ', ''],
    ['楊 清雲', '楊_清雲'],
    ['a/b\\c:d*e?f"g<h>i|j', 'abcdefghij'],
    ['._name_.', 'name'],
  ])('turns %j into %j', (input, expected) => {
    expect(toFileSlug(input)).toBe(expected)
  })

  it('keeps a name of exactly maxLen characters', () => {
    expect(toFileSlug('a'.repeat(40))).toHaveLength(40)
  })

  it('truncates a name longer than maxLen', () => {
    expect(toFileSlug('a'.repeat(41))).toHaveLength(40)
  })

  it('honours a custom maxLen', () => {
    expect(toFileSlug('abcdef', 3)).toBe('abc')
  })
})

describe('getUserSlug', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefers BOB_USER from the environment', () => {
    vi.stubEnv('BOB_USER', 'TW 199501')

    expect(getUserSlug(process.cwd())).toBe('TW_199501')
  })

  it('falls back to human when git cannot run in the directory', () => {
    vi.stubEnv('BOB_USER', '')

    expect(getUserSlug(path.join(os.tmpdir(), 'bob-no-such-dir-e345'))).toBe('human')
  })
})
