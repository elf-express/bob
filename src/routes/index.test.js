import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BindingRepository } from '../db/repositories/binding-repository.js'
import { ConfigRepository } from '../db/repositories/config-repository.js'
import { SQLiteClient } from '../db/sqlite-client.js'
import { setupRoutes } from './index.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

describe('setupRoutes', () => {
  let db
  let dir
  let baseOptions

  function build(extra) {
    const app = express()
    app.use(express.json())
    setupRoutes(app, { ...baseOptions, ...extra })
    return app
  }

  beforeEach(async () => {
    db = await openDb()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-setup-'))
    fs.writeFileSync(path.join(dir, 'package.json'), '{}')
    baseOptions = {
      config: { groups: [] },
      packageManager: 'npm',
      logDir: path.join(dir, 'log'),
      backupDir: path.join(dir, 'log', 'config-backups'),
      projectDir: dir,
    }
  })

  afterEach(async () => {
    await db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('answers the health check', async () => {
    const res = await request(build({ db: null })).get('/api/health')

    expect(res.body).toEqual({ ok: true, service: 'bob-tools', pid: process.pid })
  })

  it('mounts the db-only routes when a db and binding repository are given', async () => {
    const app = build({ db, bindingRepo: new BindingRepository(db), configRepo: new ConfigRepository(db) })

    const res = await request(app).get('/api/scan/latest')

    expect(res.status).toBe(200)
  })

  it('omits the db-only routes without a db', async () => {
    const res = await request(build({ db: null })).get('/api/project/status')

    expect(res.status).toBe(404)
  })
})
