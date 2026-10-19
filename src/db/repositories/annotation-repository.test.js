import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteClient } from '../sqlite-client.js'
import { AnnotationRepository } from './annotation-repository.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

describe('AnnotationRepository without a db', () => {
  const repo = new AnnotationRepository(null)

  it.each([
    ['getAll', [], []],
    ['getByPath', ['a.js'], null],
    ['findInboundReferences', ['a.js'], []],
    ['getBatch', [['a.js']], {}],
    ['upsert', ['a.js', { annotation: 'x' }], undefined],
    ['setMode', ['a.js', 'manual'], undefined],
    ['setAiAnnotation', ['a.js', { purpose: 'x' }], undefined],
  ])('%s returns a neutral value', async (method, args, expected) => {
    expect(await repo[method](...args)).toEqual(expected)
  })
})

describe('AnnotationRepository', () => {
  let db
  let repo

  beforeEach(async () => {
    db = await openDb()
    repo = new AnnotationRepository(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('stores an annotation under a forward-slash path', async () => {
    await repo.upsert('src\\a.js', { annotation: 'entry', purpose: 'p', relations: 'b.js', userNote: 'n' })

    expect(await repo.getByPath('src/a.js')).toMatchObject({
      rel_path: 'src/a.js',
      annotation: 'entry',
      purpose: 'p',
      relations: 'b.js',
      user_note: 'n',
      mode: 'pending',
    })
  })

  it('updates an existing annotation', async () => {
    await repo.upsert('a.js', { annotation: 'one' })

    await repo.upsert('a.js', { annotation: 'two' })

    expect(await repo.getAll()).toEqual([expect.objectContaining({ rel_path: 'a.js', annotation: 'two' })])
  })

  it('deletes the row when every field is blank', async () => {
    await repo.upsert('a.js', { annotation: 'one' })

    await repo.upsert('a.js', { annotation: '  ', purpose: '', relations: '', userNote: '' })

    expect(await repo.getByPath('a.js')).toBeNull()
  })

  it('inserts a row with the given mode', async () => {
    await repo.setMode('a.js', 'manual')

    expect(await repo.getByPath('a.js')).toMatchObject({ mode: 'manual', annotation: '' })
  })

  it('changes only the mode of an existing row', async () => {
    await repo.upsert('a.js', { annotation: 'keep' })

    await repo.setMode('a.js', 'skip')

    expect(await repo.getByPath('a.js')).toMatchObject({ mode: 'skip', annotation: 'keep' })
  })

  it('records an AI annotation and keeps the user note', async () => {
    await repo.upsert('a.js', { userNote: 'mine' })

    await repo.setAiAnnotation('a.js', { purpose: 'Route', relations: './b' })

    expect(await repo.getByPath('a.js')).toMatchObject({
      purpose: 'Route',
      relations: './b',
      user_note: 'mine',
      mode: 'ai',
      annotated_by: 'ai-generator',
      annotated_at: expect.any(String),
    })
  })

  it('finds candidate inbound references but not the file itself', async () => {
    await repo.upsert('a.js', { relations: 'a.js' })
    await repo.upsert('b.js', { relations: 'a.js, c.js' })
    await repo.upsert('c.js', { relations: 'x.js' })

    const rows = await repo.findInboundReferences('a.js')

    expect(rows).toEqual([{ rel_path: 'b.js', relations: 'a.js, c.js' }])
  })

  it('returns no inbound references for an empty target', async () => {
    expect(await repo.findInboundReferences('')).toEqual([])
  })

  it('returns a batch keyed by path', async () => {
    await repo.upsert('a.js', { annotation: 'A' })
    await repo.upsert('b.js', { annotation: 'B' })

    const batch = await repo.getBatch(['a.js', 'missing.js'])

    expect(Object.keys(batch)).toEqual(['a.js'])
    expect(batch['a.js'].annotation).toBe('A')
  })

  it('returns an empty batch for an empty list', async () => {
    expect(await repo.getBatch([])).toEqual({})
  })
})
