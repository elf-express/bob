import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteClient } from '../db/sqlite-client.js'
import { AnnotationService } from '../services/annotation-service.js'
import { createFilesRouter } from './files.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

function write(root, rel, content = '') {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

describe('files routes', () => {
  let db
  let dir
  let app

  beforeEach(async () => {
    db = await openDb()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-files-'))
    write(dir, 'src/components/Btn.vue')
    write(dir, 'src/app.js')
    write(dir, 'README.md')
    app = express()
    app.use(express.json())
    app.use('/api/files', createFilesRouter({ projectDir: dir, db }))
  })

  afterEach(async () => {
    await db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('lists a directory with tags', async () => {
    const res = await request(app).get('/api/files?path=src')

    expect(res.body.data.map((f) => [f.name, f.tags])).toEqual([
      ['components', ['ui']],
      ['app.js', []],
    ])
  })

  it('returns 500 for a path outside the project', async () => {
    const res = await request(app).get('/api/files?path=../')

    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
  })

  it('returns project stats', async () => {
    const res = await request(app).get('/api/files/stats')

    expect(res.body).toEqual({ success: true, data: { fileCount: 3 } })
  })

  it('searches files by name', async () => {
    const res = await request(app).get('/api/files/search?q=btn')

    expect(res.body.data.map((f) => f.path)).toEqual(['src/components/Btn.vue'])
  })

  it('returns suggested and custom tags', async () => {
    const res = await request(app).get('/api/files/tags?path=src/components/Btn.vue')

    expect(res.body.data).toEqual({ tags: ['ui'], suggested: ['ui'], custom: [] })
  })

  it('rejects saving tags without a path', async () => {
    const res = await request(app).post('/api/files/tags').send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ success: false, message: 'Missing path' })
  })

  it('saves custom tags', async () => {
    const res = await request(app)
      .post('/api/files/tags')
      .send({ path: 'README.md', tags: ['doc'] })

    expect(res.body).toEqual({ success: true, data: ['doc'] })
  })

  it('returns blank metadata for an unannotated file', async () => {
    const res = await request(app).get('/api/files/metadata?path=README.md')

    expect(res.body.data).toEqual({ annotation: '', purpose: '', relations: '', userNote: '' })
  })

  it('rejects an annotation without a file', async () => {
    const res = await request(app).post('/api/files/annotate').send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ success: false, message: 'Missing file path' })
  })

  it('saves annotation, purpose, relations and note', async () => {
    const body = {
      file: 'README.md',
      content: ' readme ',
      purpose: 'Docs',
      relations: 'src/app.js',
      userNote: 'n',
    }

    const res = await request(app).post('/api/files/annotate').send(body)

    expect(res.body).toEqual({ success: true, data: 'readme' })
    expect(await new AnnotationService(dir, db).getMetadata('README.md')).toEqual({
      annotation: 'readme',
      purpose: 'Docs',
      relations: 'src/app.js',
      userNote: 'n',
    })
  })

  it.each(['create', 'delete', 'rename'])('refuses POST /%s with 403', async (action) => {
    const res = await request(app)
      .post('/api/files/' + action)
      .send({ path: 'x' })

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ success: false, code: 'FS_WRITE_DISABLED' })
  })
})
