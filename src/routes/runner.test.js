import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createRunnerRouter } from './runner.js'

const config = { groups: [{ categories: [{ commands: [{ cmd: 'node -e "0"' }] }] }] }

// runner 寫 log 是非同步的；刪目錄前等 log 寫到結尾的 Warnings 摘要，避免刪除後才開檔造成 ENOENT
async function waitForLogFlush(logDir) {
  if (!fs.existsSync(logDir)) return
  await vi.waitFor(
    () => {
      const contents = fs.readdirSync(logDir).map((name) => fs.readFileSync(path.join(logDir, name), 'utf8'))
      expect(contents.every((text) => text.includes('Warnings:'))).toBe(true)
    },
    { timeout: 5000, interval: 20 },
  )
}

describe('runner routes', () => {
  let dir

  function buildApp(overrides = {}) {
    const app = express()
    app.use(express.json())
    app.use(
      '/api',
      createRunnerRouter({
        projectDir: dir,
        logDir: path.join(dir, 'log'),
        packageManager: 'npm',
        configProvider: async () => config,
        ...overrides,
      }),
    )
    return app
  }

  beforeEach(() => {
    vi.stubEnv('BOB_USER', 'tester')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-run-'))
  })

  afterEach(async () => {
    await waitForLogFlush(path.join(dir, 'log'))
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  })

  it.each([
    [{}, 'no commands'],
    [{ commands: [] }, 'no commands'],
    [{ commands: [1] }, 'commands must be strings'],
    [{ commands: ['rm -rf /'] }, 'command not in configuration'],
  ])('rejects %j with 400', async (body, error) => {
    const res = await request(buildApp()).post('/api/run').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error })
  })

  it('returns 500 when the package manager cannot be resolved', async () => {
    const app = buildApp({
      packageManagerProvider: async () => {
        throw new Error('pm failed')
      },
    })

    const res = await request(app)
      .post('/api/run')
      .send({ commands: ['node -e "0"'] })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'pm failed' })
  })

  it('streams a configured command as server-sent events', async () => {
    const res = await request(buildApp())
      .post('/api/run')
      .send({ commands: [' node -e "0" '] })

    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.text).toContain('event: done')
  })

  it('reports nothing to abort when idle', async () => {
    const res = await request(buildApp()).post('/api/abort')

    expect(res.body).toEqual({ ok: false, msg: 'No running command to abort' })
  })
})
