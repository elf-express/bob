import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConfigRepository } from '../db/repositories/config-repository.js'
import { SQLiteClient } from '../db/sqlite-client.js'
import { createConfigRouter } from './config.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

function validConfig(name = 'demo') {
  return {
    projectName: name,
    groups: [
      {
        id: 'g',
        name: 'G',
        categories: [{ id: 'c', name: 'C', commands: [{ cmd: 'pnpm lint', desc: 'Lint' }] }],
      },
    ],
  }
}

function buildApp(options) {
  const app = express()
  app.use(express.json())
  app.use('/api/config', createConfigRouter(options))
  return app
}

function jsonFile(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
}

describe('config routes in db mode', () => {
  let db
  let repo
  let dir
  let backupDir
  let app

  function writeBackup(name, value) {
    fs.mkdirSync(backupDir, { recursive: true })
    fs.writeFileSync(path.join(backupDir, name), typeof value === 'string' ? value : JSON.stringify(value))
  }

  beforeEach(async () => {
    db = await openDb()
    repo = new ConfigRepository(db)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-config-db-'))
    backupDir = path.join(dir, 'backups')
    app = buildApp({ db, configRepo: repo, backupDir })
  })

  afterEach(async () => {
    await db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns 500 when nothing is stored', async () => {
    const res = await request(app).get('/api/config')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Configuration not found in database' })
  })

  it('rejects an invalid config on save', async () => {
    const res = await request(app).put('/api/config').send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/^Invalid configuration: /)
  })

  it('saves a valid config', async () => {
    const res = await request(app).put('/api/config').send(validConfig())

    expect(res.body).toEqual({ ok: true, message: 'Configuration saved successfully' })
    expect(await repo.getConfig()).toEqual(validConfig())
  })

  it('backs up the previous config on save', async () => {
    await request(app).put('/api/config').send(validConfig('one'))

    await request(app).put('/api/config').send(validConfig('two'))

    expect(fs.readdirSync(backupDir)).toHaveLength(1)
  })

  it('validates without saving', async () => {
    const res = await request(app).post('/api/config/validate').send({})

    expect(res.body.valid).toBe(false)
    expect(await repo.getConfig()).toBeNull()
  })

  it('lists backups', async () => {
    writeBackup('bob.config.a.json', validConfig())

    const res = await request(app).get('/api/config/backups')

    expect(res.body.backups.map((b) => b.name)).toEqual(['bob.config.a.json'])
  })

  it.each([
    ['get', '/backups/'],
    ['post', '/restore/'],
    ['delete', '/backups/'],
  ])('%s %s rejects an invalid backup name', async (method, prefix) => {
    const res = await request(app)[method]('/api/config' + prefix + '..%2Fx.json')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid backup name' })
  })

  it('returns 404 when downloading a missing backup', async () => {
    const res = await request(app).get('/api/config/backups/bob.config.none.json')

    expect(res.status).toBe(404)
  })

  it('downloads a backup as an attachment', async () => {
    writeBackup('bob.config.a.json', validConfig())

    const res = await request(app).get('/api/config/backups/bob.config.a.json')

    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('bob.config.a.json')
  })

  it.each([
    ['post', '/api/config/restore/bob.config.none.json'],
    ['delete', '/api/config/backups/bob.config.none.json'],
  ])('%s %s rejects a missing backup', async (method, url) => {
    const res = await request(app)[method](url)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Backup not found: bob.config.none.json' })
  })

  it('rejects restoring an invalid backup', async () => {
    writeBackup('bob.config.bad.json', { groups: [] })

    const res = await request(app).post('/api/config/restore/bob.config.bad.json')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/^Invalid configuration: /)
  })

  it('restores a valid backup', async () => {
    writeBackup('bob.config.a.json', validConfig('restored'))

    const res = await request(app).post('/api/config/restore/bob.config.a.json')

    expect(res.body).toEqual({ ok: true, message: 'Configuration restored successfully' })
    expect((await repo.getConfig()).projectName).toBe('restored')
  })

  it('deletes a backup', async () => {
    writeBackup('bob.config.a.json', validConfig())

    const res = await request(app).delete('/api/config/backups/bob.config.a.json')

    expect(res.body).toEqual({ ok: true, message: 'Backup deleted successfully' })
    expect(fs.readdirSync(backupDir)).toEqual([])
  })

  it('rejects an import without a file', async () => {
    const res = await request(app).post('/api/config/import')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'No file uploaded' })
  })

  it('rejects an import with an invalid config', async () => {
    const res = await request(app).post('/api/config/import').attach('file', jsonFile({}), 'bob.config.json')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid configuration', errors: expect.any(Array) })
  })

  it('rejects an import that is not JSON', async () => {
    const res = await request(app)
      .post('/api/config/import')
      .attach('file', jsonFile('not json'), 'bob.config.json')

    expect(res.status).toBe(400)
  })

  it('rejects an import over 1 MB with 413', async () => {
    const big = Buffer.alloc(1024 * 1024 + 1, 'a')

    const res = await request(app).post('/api/config/import').attach('file', big, 'bob.config.json')

    expect(res.status).toBe(413)
    expect(res.body).toEqual({ error: 'File too large' })
  })

  it('imports a valid config', async () => {
    const res = await request(app)
      .post('/api/config/import')
      .attach('file', jsonFile(validConfig('imported')), 'bob.config.json')

    expect(res.body).toEqual({ ok: true, message: 'Configuration imported successfully' })
    expect((await repo.getConfig()).projectName).toBe('imported')
  })

  it('returns 404 when exporting nothing', async () => {
    const res = await request(app).get('/api/config/export')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Configuration not found' })
  })

  it('exports the stored config as an attachment', async () => {
    await repo.upsertConfig(validConfig())

    const res = await request(app).get('/api/config/export')

    expect(res.headers['content-disposition']).toBe('attachment; filename="bob.config.json"')
    expect(res.body).toEqual(validConfig())
  })
})

describe('config routes in file mode', () => {
  let dir
  let configPath
  let backupDir
  let app

  function readConfigFile() {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-config-file-'))
    configPath = path.join(dir, 'bob.config.json')
    backupDir = path.join(dir, 'backups')
    app = buildApp({ configPath, backupDir })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns 500 when the config file is missing', async () => {
    const res = await request(app).get('/api/config')

    expect(res.status).toBe(500)
    expect(res.body.error).toContain('Configuration file not found')
  })

  it('loads the config file', async () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig()))

    const res = await request(app).get('/api/config')

    expect(res.body).toEqual(validConfig())
  })

  it('saves the config file', async () => {
    await request(app).put('/api/config').send(validConfig())

    expect(readConfigFile()).toEqual(validConfig())
  })

  it('rejects an invalid config', async () => {
    const res = await request(app).put('/api/config').send({})

    expect(res.status).toBe(400)
  })

  it('validates a config', async () => {
    const res = await request(app).post('/api/config/validate').send(validConfig())

    expect(res.body).toEqual({ valid: true, errors: [] })
  })

  it('lists the backup created by a second save', async () => {
    await request(app).put('/api/config').send(validConfig('one'))
    await request(app).put('/api/config').send(validConfig('two'))

    const res = await request(app).get('/api/config/backups')

    expect(res.body.backups).toHaveLength(1)
  })

  it('restores a backup', async () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig('two')))
    fs.writeFileSync(path.join(backupDir, 'bob.config.a.json'), JSON.stringify(validConfig('one')))

    const res = await request(app).post('/api/config/restore/bob.config.a.json')

    expect(res.status).toBe(200)
    expect(readConfigFile().projectName).toBe('one')
  })

  it('rejects restoring a missing backup', async () => {
    const res = await request(app).post('/api/config/restore/bob.config.none.json')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Backup not found: bob.config.none.json' })
  })

  it('deletes a backup', async () => {
    fs.writeFileSync(path.join(backupDir, 'bob.config.a.json'), '{}')

    const res = await request(app).delete('/api/config/backups/bob.config.a.json')

    expect(res.status).toBe(200)
    expect(fs.readdirSync(backupDir)).toEqual([])
  })

  it('returns 404 when exporting a missing file', async () => {
    const res = await request(app).get('/api/config/export')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Configuration file not found' })
  })

  it('exports the config file', async () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig()))

    const res = await request(app).get('/api/config/export')

    expect(res.body).toEqual(validConfig())
  })

  it('imports a valid config into the file', async () => {
    const res = await request(app)
      .post('/api/config/import')
      .attach('file', jsonFile(validConfig('imported')), 'bob.config.json')

    expect(res.status).toBe(200)
    expect(readConfigFile().projectName).toBe('imported')
  })
})
