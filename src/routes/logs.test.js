import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createLogsRouter } from './logs.js'

describe('logs routes', () => {
  let dir
  let logDir

  function writeLog(name, content = '') {
    fs.writeFileSync(path.join(logDir, name), content)
  }

  function buildApp() {
    const app = express()
    app.use('/api', createLogsRouter({ logDir }))
    return app
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-logs-route-'))
    logDir = path.join(dir, 'log')
    fs.mkdirSync(logDir)
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns an empty list without logs', async () => {
    const res = await request(buildApp()).get('/api/logs')

    expect(res.body).toEqual([])
  })

  it('parses source, command, duration and exit code from each log', async () => {
    // Arrange
    writeLog(
      '2026-10-02_09-00-00-eddie.log',
      '\u001B[32m[1/1] pnpm lint\u001B[0m\n[EXIT CODE: 2]\n[DURATION: 1234ms]\n',
    )
    writeLog('2026-10-02_08-00-00-ai.log', 'x')
    writeLog('2026-10-02_07-00-00-agent.log', 'x')
    writeLog('ai-2026-10-01_10-00-00.log', 'x')
    writeLog('agent-2026-10-01_09-00-00.log', 'x')
    writeLog('2026-10-01_08-00-00.log', 'Source: Agent (Claude Code subagent: x)\nDuration 1.5s\n')
    writeLog('2026-10-01_07-00-00-bob.log', 'Source: Claude main session\nDuration 250ms\n')

    // Act
    const res = await request(buildApp()).get('/api/logs')

    // Assert
    const byName = Object.fromEntries(res.body.map((log) => [log.filename, log]))
    expect(byName['2026-10-02_09-00-00-eddie.log']).toMatchObject({
      source: 'human',
      userLabel: 'eddie',
      command: 'pnpm lint',
      exitCode: 2,
      duration: 1234,
    })
    expect(byName['2026-10-02_08-00-00-ai.log']).toMatchObject({
      source: 'ai',
      userLabel: '',
      command: '2026-10-02_08-00-00-ai',
    })
    expect(byName['2026-10-02_07-00-00-agent.log'].source).toBe('agent')
    expect(byName['ai-2026-10-01_10-00-00.log'].source).toBe('ai')
    expect(byName['agent-2026-10-01_09-00-00.log'].source).toBe('agent')
    expect(byName['2026-10-01_08-00-00.log']).toMatchObject({ source: 'agent', duration: 1500 })
    expect(byName['2026-10-01_07-00-00-bob.log']).toMatchObject({
      source: 'ai',
      userLabel: 'bob',
      duration: 250,
    })
  })

  it('downloads a log without colour codes', async () => {
    writeLog('a.log', '\u001B[31mred\u001B[0m')

    const res = await request(buildApp()).get('/api/logs/a.log')

    expect(res.text).toBe('red')
    expect(res.headers['content-disposition']).toBe('attachment; filename="a.log"')
  })

  it.each([
    ['get', '..%2Fx.log', 400, { error: 'invalid name' }],
    ['get', 'missing.log', 404, { error: 'not found' }],
    ['delete', '..%2Fx.log', 400, { error: 'invalid name' }],
    ['delete', 'missing.log', 404, { error: 'not found' }],
  ])('%s %s responds %i', async (method, name, status, body) => {
    const res = await request(buildApp())[method]('/api/logs/' + name)

    expect(res.status).toBe(status)
    expect(res.body).toEqual(body)
  })

  it('deletes a log', async () => {
    writeLog('a.log')

    const res = await request(buildApp()).delete('/api/logs/a.log')

    expect(res.body).toEqual({ success: true, message: 'Deleted a.log' })
    expect(fs.existsSync(path.join(logDir, 'a.log'))).toBe(false)
  })

  it('clears every log', async () => {
    writeLog('a.log')
    writeLog('b.log')

    const res = await request(buildApp()).delete('/api/logs/clear')

    expect(res.body).toEqual({ ok: true, deleted: 2 })
  })
})
