import { describe, expect, it } from 'vitest'

import { getAnnotationMode } from './annotation-policy.js'

describe('getAnnotationMode', () => {
  it.each([
    ['src/app.ts', 'ai'],
    ['apps/src/App.VUE', 'ai'],
    ['server/Program.cs', 'ai'],
    ['package.json', 'manual'],
    ['.gitignore', 'manual'],
    ['.env', 'manual'],
    ['.env.production', 'manual'],
    ['LICENSE', 'manual'],
    ['README.md', 'optional'],
    ['notes.txt', 'optional'],
    ['logo.PNG', 'skip'],
    ['pnpm.lock', 'skip'],
    ['Makefile', 'skip'],
    ['', 'skip'],
    [null, 'skip'],
  ])('classifies %j as %s', (filePath, expected) => {
    expect(getAnnotationMode(filePath)).toBe(expected)
  })
})
