import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteClient } from '../sqlite-client.js'
import { TagRepository } from './tag-repository.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

describe('TagRepository without a db', () => {
  const repo = new TagRepository(null)

  it('returns an empty tag map', async () => {
    expect(await repo.getAllCustomTags()).toEqual({})
  })

  it('returns no tags for a path', async () => {
    expect(await repo.getCustomTagsByPath('a.js')).toEqual([])
  })

  it('reports no tags', async () => {
    expect(await repo.hasAnyTag()).toBe(false)
  })

  it('ignores writes', async () => {
    await expect(repo.setCustomTags('a.js', ['ui'])).resolves.toBeUndefined()
  })
})

describe('TagRepository', () => {
  let db
  let repo

  beforeEach(async () => {
    db = await openDb()
    repo = new TagRepository(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('stores tags under a forward-slash path', async () => {
    await repo.setCustomTags('src\\a.js', ['ui', 'core'])

    expect(await repo.getCustomTagsByPath('src/a.js')).toEqual(['ui', 'core'])
  })

  it('deletes the row when tags are empty', async () => {
    await repo.setCustomTags('a.js', ['ui'])

    await repo.setCustomTags('a.js', [])

    expect(await repo.hasAnyTag()).toBe(false)
  })

  it('returns no tags for an unknown path', async () => {
    expect(await repo.getCustomTagsByPath('missing.js')).toEqual([])
  })

  it('maps every tagged path and tolerates corrupt JSON', async () => {
    await repo.setCustomTags('a.js', ['ui'])
    await db.run("INSERT INTO file_tags (rel_path, tags_json, updated_at) VALUES ('b.js', 'not json', 'now')")

    expect(await repo.getAllCustomTags()).toEqual({ 'a.js': ['ui'], 'b.js': [] })
  })

  it('returns no tags for a path with corrupt JSON', async () => {
    await db.run("INSERT INTO file_tags (rel_path, tags_json, updated_at) VALUES ('b.js', 'not json', 'now')")

    expect(await repo.getCustomTagsByPath('b.js')).toEqual([])
  })

  it('reports existing tags', async () => {
    await repo.setCustomTags('a.js', ['ui'])

    expect(await repo.hasAnyTag()).toBe(true)
  })
})
