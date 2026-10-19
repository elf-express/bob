import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LogStore } from './log-store.js'

describe('LogStore', () => {
  let dir
  let logDir
  let store

  function writeLog(name, content = '') {
    fs.mkdirSync(logDir, { recursive: true })
    fs.writeFileSync(path.join(logDir, name), content)
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-logs-'))
    logDir = path.join(dir, 'log')
    store = new LogStore(logDir)
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates the log directory when listing', () => {
    expect(store.listFileNames()).toEqual([])
  })

  it('sorts logs by their embedded timestamp regardless of prefix', () => {
    writeLog('ai-2026-10-01_10-00-00.log')
    writeLog('2026-10-02_09-00-00-eddie.log')
    writeLog('agent-2026-10-01_11-00-00.log')
    writeLog('note.txt')

    expect(store.listFileNames()).toEqual([
      '2026-10-02_09-00-00-eddie.log',
      'agent-2026-10-01_11-00-00.log',
      'ai-2026-10-01_10-00-00.log',
    ])
  })

  it('honours the limit', () => {
    writeLog('2026-10-01_10-00-00-a.log')
    writeLog('2026-10-02_10-00-00-b.log')

    expect(store.listFileNames(1)).toEqual(['2026-10-02_10-00-00-b.log'])
  })

  it('reads a log by name', () => {
    writeLog('a.log', 'hello')

    expect(store.readLog('a.log')).toBe('hello')
  })

  it('throws ENOENT when reading a missing log', () => {
    expect(() => store.readLog('missing.log')).toThrowError(/ENOENT/)
  })

  it('does not treat a non-log file as a log', () => {
    writeLog('a.txt')

    expect(store.logExists('a.txt')).toBe(false)
  })

  it('reports the size of a log', () => {
    writeLog('a.log', 'abc')

    expect(store.statLog('a.log').size).toBe(3)
  })

  it('appends through the write stream', async () => {
    writeLog('a.log', 'one ')
    const stream = store.createWriteStream('a.log')

    await new Promise((resolve) => stream.end('two', resolve))

    expect(store.readLog('a.log')).toBe('one two')
  })

  it('deletes a log', () => {
    writeLog('a.log')

    store.deleteLog('a.log')

    expect(store.logExists('a.log')).toBe(false)
  })

  it('purges only logs older than maxAge', () => {
    writeLog('old.log')
    writeLog('new.log')
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    fs.utimesSync(path.join(logDir, 'old.log'), past, past)

    const purged = store.purgeExpired()

    expect(purged).toBe(1)
    expect(store.listFileNames()).toEqual(['new.log'])
  })

  it('clears every log but keeps other files', () => {
    writeLog('a.log')
    writeLog('b.log')
    writeLog('keep.txt')

    const deleted = store.clearAll()

    expect(deleted).toBe(2)
    expect(fs.readdirSync(logDir)).toEqual(['keep.txt'])
  })
})
