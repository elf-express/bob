import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnnotationRepository } from '../db/repositories/annotation-repository.js'
import { SQLiteClient } from '../db/sqlite-client.js'
import { createRelationsRouter, parseRelations, relationsInclude } from './relations.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

function buildApp(annotationRepo) {
  const app = express()
  app.use('/api/files', createRelationsRouter({ annotationRepo }))
  return app
}

const VIA = 'annotation.relations'

describe('parseRelations', () => {
  it.each([
    [null, []],
    ['', []],
    [' a.js , ,b.js ', ['a.js', 'b.js']],
  ])('splits %j into %j', (raw, expected) => {
    expect(parseRelations(raw)).toEqual(expected)
  })
})

describe('relationsInclude', () => {
  it.each([
    ['a.js, b.js', 'b.js', true],
    ['src\\a.js', 'src/a.js', true],
    ['foo-bar.js', 'foo.js', false],
    ['a.js', '', false],
    [null, 'a.js', false],
  ])('checks %j for %j -> %s', (raw, target, expected) => {
    expect(relationsInclude(raw, target)).toBe(expected)
  })
})

describe('GET /api/files/relations', () => {
  let db
  let repo

  beforeEach(async () => {
    db = await openDb()
    repo = new AnnotationRepository(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it.each(['', '../x', '/etc/passwd'])('rejects path %j', async (p) => {
    const res = await request(buildApp(repo)).get('/api/files/relations?path=' + encodeURIComponent(p))

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ ok: false, error: 'invalid path' })
  })

  it('returns empty lists without a repository', async () => {
    const res = await request(buildApp(null)).get('/api/files/relations?path=a.js')

    expect(res.body).toEqual({ ok: true, path: 'a.js', outbound: [], inbound: [] })
  })

  it('returns outbound and exact inbound relations', async () => {
    await repo.upsert('a.js', { relations: 'b.js, c.js' })
    await repo.upsert('d.js', { relations: 'a.js,x.js' })
    await repo.upsert('e.js', { relations: 'a.js-old' })

    const res = await request(buildApp(repo)).get('/api/files/relations?path=a.js')

    expect(res.body).toEqual({
      ok: true,
      path: 'a.js',
      outbound: [
        { path: 'b.js', via: VIA },
        { path: 'c.js', via: VIA },
      ],
      inbound: [{ path: 'd.js', via: VIA }],
    })
  })

  it('returns 500 when the repository fails', async () => {
    const failing = {
      getByPath: vi.fn().mockRejectedValue(new Error('db down')),
      findInboundReferences: vi.fn(),
    }

    const res = await request(buildApp(failing)).get('/api/files/relations?path=a.js')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ ok: false, error: 'db down' })
  })
})
