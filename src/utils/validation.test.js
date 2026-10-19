import { describe, expect, it } from 'vitest'

import { isUnsafeRelPath, validateFileName } from './validation.js'

describe('validateFileName', () => {
  it.each([null, undefined, '', 42])('rejects %j', (name) => {
    expect(validateFileName(name)).toBe(false)
  })

  it('accepts a name of exactly 255 characters', () => {
    expect(validateFileName('a'.repeat(255))).toBe(true)
  })

  it('rejects a name of 256 characters', () => {
    expect(validateFileName('a'.repeat(256))).toBe(false)
  })

  it.each(['../x.log', 'a/b.log', 'a\\b.log', 'x\0.log'])('rejects traversal or separator in %j', (name) => {
    expect(validateFileName(name)).toBe(false)
  })

  it('accepts a plain log file name', () => {
    expect(validateFileName('2026-10-20_10-00-00-eddie.log')).toBe(true)
  })
})

describe('isUnsafeRelPath', () => {
  it.each([null, '', '   ', 'a\0b', '/etc/passwd', '../secret', 'src/../../x', '..\\x'])(
    'treats %j as unsafe',
    (p) => {
      expect(isUnsafeRelPath(p)).toBe(true)
    },
  )

  it.each(['src/app.js', 'config..backup.js', 'src\\utils\\format.js'])('treats %j as safe', (p) => {
    expect(isUnsafeRelPath(p)).toBe(false)
  })
})
