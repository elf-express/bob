import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import { BindingRepository } from './db/repositories/binding-repository.js'
import { ConfigRepository } from './db/repositories/config-repository.js'
import { SQLiteClient } from './db/sqlite-client.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'db', 'migrations')

function write(root, rel, content = '') {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

describe('createApp', () => {
  let db
  let dir
  let logDir
  let app

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-app-'))
    const projectDir = path.join(dir, 'project')
    write(projectDir, 'package.json', JSON.stringify({ name: 'demo', scripts: { lint: 'eslint .' } }))
    write(projectDir, 'src/a.js')
    logDir = path.join(dir, 'log')
    write(logDir, 'old.log')
    write(logDir, 'fresh.log')
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    fs.utimesSync(path.join(logDir, 'old.log'), past, past)
    const publicDir = path.join(dir, 'public')
    write(publicDir, 'index.html', '<h1>bob</h1>')
    db = new SQLiteClient(':memory:')
    await db.connect()
    await db.runMigrations(MIGRATION_DIR)
    app = await createApp({
      projectDir,
      projectName: 'demo',
      logDir,
      publicDir,
      db,
      bindingRepo: new BindingRepository(db),
      configRepo: new ConfigRepository(db),
    })
  }, 60000)

  afterAll(async () => {
    await db.close()
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('serves static files without caching', async () => {
    const res = await request(app).get('/')

    expect(res.text).toContain('<h1>bob</h1>')
    expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate')
  })

  it('rejects a non-local Host with 403', async () => {
    const res = await request(app).get('/api/health').set('Host', 'evil.com')

    expect(res.status).toBe(403)
  })

  it('runs the tree and command scans on startup', async () => {
    const res = await request(app).get('/api/scan/latest')

    expect(res.body.data.counts).toMatchObject({ commands: 1, treeNodes: 3 })
  })

  it('stores the dependency scan on startup', async () => {
    const res = await request(app).get('/api/dependencies')

    expect(res.body.data.items.map((i) => i.name)).toContain('node')
  })

  it('purges logs older than 48 hours on startup', () => {
    expect(fs.readdirSync(logDir).filter((f) => f.endsWith('.log'))).toEqual(['fresh.log'])
  })

  it('falls back to the project name when no config is stored', async () => {
    const res = await request(app).get('/api/data')

    expect(res.body.config.projectName).toBe('demo')
  })
})
