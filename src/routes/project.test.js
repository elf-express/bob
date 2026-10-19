import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BindingRepository } from '../db/repositories/binding-repository.js'
import { SQLiteClient } from '../db/sqlite-client.js'
import { createProjectRouter } from './project.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATION_DIR = path.join(HERE, '..', 'db', 'migrations')
const TOOL_DIR = path.resolve(HERE, '..', '..')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

function buildApp(bindingRepo) {
  const app = express()
  app.use(express.json())
  app.use('/api/project', createProjectRouter({ bindingRepo, packageManagerProvider: async () => 'pnpm' }))
  return app
}

describe('project routes', () => {
  let db
  let repo
  let app

  beforeEach(async () => {
    db = await openDb()
    await db.run('ALTER TABLE project_binding ADD COLUMN package_manager_override TEXT')
    repo = new BindingRepository(db)
    app = buildApp(repo)
  })

  afterEach(async () => {
    await db.close()
  })

  it('reports an unbound project', async () => {
    const res = await request(app).get('/api/project/status')

    expect(res.body.data).toEqual({
      bound: false,
      targetPath: null,
      boundAt: null,
      updatedAt: null,
      allowRebind: false,
      packageManagerOverride: null,
      effectivePackageManager: 'pnpm',
    })
  })

  it('rejects binding without a target', async () => {
    const res = await request(app).post('/api/project/bind').send({})

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Missing targetPath')
  })

  it.each([TOOL_DIR, path.join(TOOL_DIR, 'src')])(
    'rejects binding to the tool directory %s',
    async (targetPath) => {
      const res = await request(app).post('/api/project/bind').send({ targetPath })

      expect(res.status).toBe(400)
    },
  )

  it('binds a project', async () => {
    const res = await request(app).post('/api/project/bind').send({ targetPath: '/work/app' })

    expect(res.body.data).toMatchObject({ target_path: '/work/app', allow_rebind: 1 })
  })

  it('refuses to rebind to another path without force', async () => {
    await repo.upsertBinding('/work/a')

    const res = await request(app).post('/api/project/bind').send({ targetPath: '/work/b' })

    expect(res.status).toBe(409)
    expect(res.body.message).toContain('Already bound to /work/a')
  })

  it('rebinds with force and keeps the override', async () => {
    await repo.upsertBinding('/work/a', 1, 'yarn')

    const res = await request(app).post('/api/project/bind').send({ targetPath: '/work/b', force: true })

    expect(res.body.data).toMatchObject({ target_path: '/work/b', package_manager_override: 'yarn' })
  })

  it('returns 404 for the override before binding', async () => {
    const res = await request(app).get('/api/project/pm-override')

    expect(res.status).toBe(404)
  })

  it('rejects an unknown package manager', async () => {
    const res = await request(app).put('/api/project/pm-override').send({ packageManager: 'bun' })

    expect(res.status).toBe(400)
  })

  it('returns 404 when setting an override before binding', async () => {
    const res = await request(app).put('/api/project/pm-override').send({ packageManager: 'pnpm' })

    expect(res.status).toBe(404)
  })

  it.each([
    ['pnpm', 'pnpm'],
    ['auto', null],
    [null, null],
  ])('stores override %j as %j', async (packageManager, expected) => {
    await repo.upsertBinding('/work/app', 1, 'yarn')

    const res = await request(app).put('/api/project/pm-override').send({ packageManager })

    expect(res.body.data).toEqual({ packageManagerOverride: expected })
  })

  it('reads the stored override', async () => {
    await repo.upsertBinding('/work/app', 1, 'yarn')

    const res = await request(app).get('/api/project/pm-override')

    expect(res.body.data).toEqual({ packageManagerOverride: 'yarn' })
  })

  it('returns 500 when the repository fails', async () => {
    const failing = { getBinding: vi.fn().mockRejectedValue(new Error('db down')) }

    const res = await request(buildApp(failing)).get('/api/project/status')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'db down' })
  })
})
