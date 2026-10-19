import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DependencyRepository } from '../db/repositories/dependency-repository.js'
import { SQLiteClient } from '../db/sqlite-client.js'
import { createDependenciesRouter } from './dependencies.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')
const SCAN_AT = '2026-10-20T00:00:00.000Z'

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

const items = [
  {
    name: 'express',
    scope: 'dependencies',
    declaredVersion: '^5',
    installedVersion: '5.2.1',
    descKey: 'k',
    descFallback: 'f',
  },
  { name: 'vitest', scope: 'devDependencies', declaredVersion: '5.0.1', installedVersion: '5.0.1' },
]

describe('dependencies routes', () => {
  let db
  let repo

  function buildApp(overrides = {}) {
    const app = express()
    app.use(express.json())
    app.use(
      '/api/dependencies',
      createDependenciesRouter({
        dependencyRepo: repo,
        dependencyScanService: { scan: vi.fn().mockResolvedValue(items) },
        ...overrides,
      }),
    )
    return app
  }

  beforeEach(async () => {
    db = await openDb()
    repo = new DependencyRepository(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('scans and stores dependencies', async () => {
    const res = await request(buildApp()).post('/api/dependencies/scan')

    expect(res.body.data).toEqual({
      added: 2,
      updated: 0,
      unchanged: 0,
      count: 2,
      scanAt: expect.any(String),
    })
  })

  it('returns 500 when the scan fails', async () => {
    const dependencyScanService = { scan: vi.fn().mockRejectedValue(new Error('pnpm missing')) }

    const res = await request(buildApp({ dependencyScanService })).post('/api/dependencies/scan')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'pnpm missing' })
  })

  it('lists stored dependencies in camelCase', async () => {
    await repo.upsertBatch(items, SCAN_AT)

    const res = await request(buildApp()).get('/api/dependencies')

    expect(res.body.data.items[0]).toEqual({
      name: 'express',
      scope: 'dependencies',
      declaredVersion: '^5',
      installedVersion: '5.2.1',
      firstSeenAt: SCAN_AT,
      lastSeenAt: SCAN_AT,
      lastChangedAt: SCAN_AT,
      descKey: 'k',
      descFallback: 'f',
      descMode: 'auto',
      manualDesc: '',
      noteText: '',
    })
    expect(res.body.data).toMatchObject({ lastScanAt: SCAN_AT, total: 2 })
  })

  it('filters by scope', async () => {
    await repo.upsertBatch(items, SCAN_AT)

    const res = await request(buildApp()).get('/api/dependencies?scope=devDependencies')

    expect(res.body.data.items.map((i) => i.name)).toEqual(['vitest'])
  })

  it('returns 500 when listing fails', async () => {
    const dependencyRepo = { list: vi.fn().mockRejectedValue(new Error('db down')) }

    const res = await request(buildApp({ dependencyRepo })).get('/api/dependencies')

    expect(res.status).toBe(500)
  })

  it.each([
    [{}, 'Missing name or scope'],
    [{ name: 'express', scope: 'x', mode: 'auto' }, 'Invalid scope'],
    [{ name: 'express', scope: 'dependencies', mode: 'x' }, 'mode must be auto or manual'],
    [
      { name: 'express', scope: 'dependencies', mode: 'manual', manualDesc: ' ' },
      'manualDesc is required in manual mode',
    ],
  ])('rejects description update %j', async (body, message) => {
    const res = await request(buildApp()).put('/api/dependencies/description').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ success: false, message })
  })

  it('returns 404 when describing an unknown dependency', async () => {
    const res = await request(buildApp())
      .put('/api/dependencies/description')
      .send({ name: 'nope', scope: 'dependencies', mode: 'auto' })

    expect(res.status).toBe(404)
  })

  it('sets a manual description', async () => {
    await repo.upsertBatch(items, SCAN_AT)

    const res = await request(buildApp())
      .put('/api/dependencies/description')
      .send({ name: 'express', scope: 'dependencies', mode: 'manual', manualDesc: 'mine' })

    expect(res.body.data).toMatchObject({ descMode: 'manual', manualDesc: 'mine' })
  })

  it.each([
    [{}, 'Missing name or scope'],
    [{ name: 'express', scope: 'x' }, 'Invalid scope'],
  ])('rejects note update %j', async (body, message) => {
    const res = await request(buildApp()).put('/api/dependencies/note').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ success: false, message })
  })

  it('returns 404 when noting an unknown dependency', async () => {
    const res = await request(buildApp())
      .put('/api/dependencies/note')
      .send({ name: 'nope', scope: 'runtime' })

    expect(res.status).toBe(404)
  })

  it('updates a note', async () => {
    await repo.upsertBatch(items, SCAN_AT)

    const res = await request(buildApp())
      .put('/api/dependencies/note')
      .send({ name: 'vitest', scope: 'devDependencies', noteText: ' pinned ' })

    expect(res.body.data.noteText).toBe('pinned')
  })
})
