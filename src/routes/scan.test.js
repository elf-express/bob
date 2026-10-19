import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigRepository } from '../db/repositories/config-repository.js'
import { ScanRepository } from '../db/repositories/scan-repository.js'
import { SQLiteClient } from '../db/sqlite-client.js'
import { CommandScanService } from '../services/command-scan-service.js'
import { FileSystemService } from '../services/file-system.js'
import { createScanRouter } from './scan.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

const configWithLint = {
  projectName: 'demo',
  groups: [
    {
      id: 'g',
      name: 'G',
      categories: [
        { id: 'c', name: 'C', commands: [{ scriptName: 'lint', cmd: 'npm run lint', desc: 'Lint' }] },
      ],
    },
  ],
}

describe('scan routes', () => {
  let db
  let dir
  let scanRepo
  let configRepo

  function buildApp(overrides = {}) {
    const app = express()
    app.use(
      '/api/scan',
      createScanRouter({
        commandScanService: new CommandScanService(dir, 'npm'),
        packageManagerProvider: async () => 'pnpm',
        fileSystemService: new FileSystemService(dir, db),
        scanRepo,
        configRepo,
        ...overrides,
      }),
    )
    return app
  }

  beforeEach(async () => {
    db = await openDb()
    scanRepo = new ScanRepository(db)
    configRepo = new ConfigRepository(db)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-scan-route-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint .' } }))
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), '')
  })

  afterEach(async () => {
    await db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('scans commands and upgrades the stored config', async () => {
    await configRepo.upsertConfig(configWithLint)

    const res = await request(buildApp()).post('/api/scan/commands')

    expect(res.body.data).toMatchObject({
      scanType: 'commands',
      status: 'success',
      count: 1,
      configSync: { attempted: true, changed: true, updated: 1, deduped: 0 },
    })
    expect((await configRepo.getConfig()).groups[0].categories[0].commands[0].cmd).toBe('pnpm run lint')
  })

  it('attempts no upgrade when no config is stored', async () => {
    const res = await request(buildApp()).post('/api/scan/commands')

    expect(res.body.data.configSync).toEqual({ attempted: true, changed: false, updated: 0, deduped: 0 })
  })

  it('reports a config sync error without failing the scan', async () => {
    const failing = { getConfig: vi.fn().mockRejectedValue(new Error('db down')), upsertConfig: vi.fn() }

    const res = await request(buildApp({ configRepo: failing })).post('/api/scan/commands')

    expect(res.status).toBe(200)
    expect(res.body.data.configSync).toMatchObject({ attempted: true, changed: false, error: 'db down' })
  })

  it('records a failed command scan', async () => {
    fs.rmSync(path.join(dir, 'package.json'))

    const res = await request(buildApp()).post('/api/scan/commands')

    expect(res.status).toBe(500)
    expect(res.body.data).toMatchObject({ scanType: 'commands', status: 'failed' })
    expect(await db.get('SELECT status FROM scan_runs WHERE id = ?', [res.body.data.scanId])).toEqual({
      status: 'failed',
    })
  })

  it('scans the tree', async () => {
    const res = await request(buildApp()).post('/api/scan/tree')

    expect(res.body.data).toMatchObject({ scanType: 'tree', status: 'success', count: 3 })
  })

  it('records a failed tree scan', async () => {
    const fileSystemService = { scanTreeSnapshot: vi.fn().mockRejectedValue(new Error('io error')) }

    const res = await request(buildApp({ fileSystemService })).post('/api/scan/tree')

    expect(res.status).toBe(500)
    expect(res.body).toMatchObject({ success: false, message: 'io error' })
  })

  it('returns the latest summary', async () => {
    await request(buildApp()).post('/api/scan/tree')

    const res = await request(buildApp()).get('/api/scan/latest')

    expect(res.body.data.counts.treeNodes).toBe(3)
  })

  it('returns 500 when the summary fails', async () => {
    const failing = { getLatestSummary: vi.fn().mockRejectedValue(new Error('db down')) }

    const res = await request(buildApp({ scanRepo: failing })).get('/api/scan/latest')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'db down' })
  })
})
