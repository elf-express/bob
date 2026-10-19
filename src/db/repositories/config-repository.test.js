import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteClient } from '../sqlite-client.js'
import { ConfigRepository } from './config-repository.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

describe('ConfigRepository without a db', () => {
  const repo = new ConfigRepository(null)

  it('reports no config', async () => {
    expect(await repo.exists()).toBe(false)
  })

  it('returns null config', async () => {
    expect(await repo.getConfig()).toBeNull()
  })

  it('ignores upserts', async () => {
    await expect(repo.upsertConfig({ projectName: 'x' })).resolves.toBeUndefined()
  })
})

describe('ConfigRepository', () => {
  let db
  let repo

  beforeEach(async () => {
    db = await openDb()
    repo = new ConfigRepository(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('reports no config on an empty database', async () => {
    expect(await repo.exists()).toBe(false)
  })

  it('returns null config on an empty database', async () => {
    expect(await repo.getConfig()).toBeNull()
  })

  it('stores and reads back a config', async () => {
    await repo.upsertConfig({ projectName: 'demo', groups: [] })

    expect(await repo.getConfig()).toEqual({ projectName: 'demo', groups: [] })
  })

  it('replaces the config on a second upsert', async () => {
    await repo.upsertConfig({ projectName: 'a' })

    await repo.upsertConfig({ projectName: 'b' })

    expect(await repo.getConfig()).toEqual({ projectName: 'b' })
  })

  it('reports an existing config', async () => {
    await repo.upsertConfig({ projectName: 'a' })

    expect(await repo.exists()).toBe(true)
  })
})
