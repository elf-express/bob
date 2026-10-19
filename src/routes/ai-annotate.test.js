import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnnotationRepository } from '../db/repositories/annotation-repository.js'
import { SQLiteClient } from '../db/sqlite-client.js'
import { createAiAnnotateRouter } from './ai-annotate.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

describe('POST /api/files/ai-annotate', () => {
  let db
  let repo
  let dir

  function post(annotationRepo, body) {
    const app = express()
    app.use('/api/files', createAiAnnotateRouter({ projectDir: dir, annotationRepo }))
    return request(app).post('/api/files/ai-annotate').send(body)
  }

  beforeEach(async () => {
    db = await openDb()
    repo = new AnnotationRepository(db)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ai-'))
    fs.mkdirSync(path.join(dir, 'src', 'routes'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'src', 'routes', 'x.js'),
      "const a = require('./a')\nmodule.exports = {}\n",
    )
  })

  afterEach(async () => {
    await db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it.each(['', '../x.js'])('rejects path %j', async (p) => {
    const res = await post(repo, { path: p })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ ok: false, error: 'invalid path' })
  })

  it('returns 404 for a missing file', async () => {
    const res = await post(repo, { path: 'nope.js' })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ ok: false, error: 'file not found' })
  })

  it('returns 500 when the path is a directory', async () => {
    const res = await post(repo, { path: 'src' })

    expect(res.status).toBe(500)
    expect(res.body.ok).toBe(false)
  })

  it('returns 413 for a file over 500000 characters', async () => {
    fs.writeFileSync(path.join(dir, 'big.js'), 'a'.repeat(500001))

    const res = await post(repo, { path: 'big.js' })

    expect(res.status).toBe(413)
  })

  it('generates and stores an AI annotation', async () => {
    const res = await post(repo, { path: 'src\\routes\\x.js' })

    expect(res.body).toMatchObject({
      ok: true,
      path: 'src/routes/x.js',
      generated: { purpose: 'Express route handler', relations: './a' },
    })
    expect(await repo.getByPath('src/routes/x.js')).toMatchObject({
      mode: 'ai',
      purpose: 'Express route handler',
    })
  })

  it('still returns the result with a warning when the db write fails', async () => {
    const failing = { setAiAnnotation: vi.fn().mockRejectedValue(new Error('locked')) }

    const res = await post(failing, { path: 'src/routes/x.js' })

    expect(res.body).toMatchObject({ ok: true, warning: 'db write failed: locked' })
  })

  it('works without a repository', async () => {
    const res = await post(null, { path: 'src/routes/x.js' })

    expect(res.body.ok).toBe(true)
  })
})
