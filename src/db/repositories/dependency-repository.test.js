import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteClient } from '../sqlite-client.js'
import { DependencyRepository } from './dependency-repository.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

const items = [
  {
    name: 'vitest',
    scope: 'devDependencies',
    declaredVersion: '5.0.1',
    installedVersion: '5.0.1',
    descKey: 'k.v',
  },
  {
    name: 'Express',
    scope: 'dependencies',
    declaredVersion: '^5.2.1',
    installedVersion: '5.2.1',
    descKey: 'k.e',
  },
  { name: 'node', scope: 'runtime', declaredVersion: 'v24', installedVersion: 'v24', descKey: 'k.n' },
]

describe('DependencyRepository', () => {
  let db
  let repo

  beforeEach(async () => {
    db = await openDb()
    repo = new DependencyRepository(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('adds unseen packages', async () => {
    expect(await repo.upsertBatch(items, '2026-10-20T00:00:00.000Z')).toEqual({
      added: 3,
      updated: 0,
      unchanged: 0,
    })
  })

  it('counts packages with the same versions as unchanged', async () => {
    await repo.upsertBatch(items, '2026-10-20T00:00:00.000Z')

    expect(await repo.upsertBatch(items, '2026-10-21T00:00:00.000Z')).toEqual({
      added: 0,
      updated: 0,
      unchanged: 3,
    })
  })

  it('records a version change with a new last_changed_at', async () => {
    await repo.upsertBatch(items, '2026-10-20T00:00:00.000Z')

    await repo.upsertBatch([{ ...items[0], installedVersion: '5.0.5' }], '2026-10-21T00:00:00.000Z')

    const [row] = await repo.list({ q: 'vitest' })
    expect(row).toMatchObject({ installed_version: '5.0.5', last_changed_at: '2026-10-21T00:00:00.000Z' })
  })

  it('keeps the description key of a package in manual mode', async () => {
    await repo.upsertBatch(items, '2026-10-20T00:00:00.000Z')
    await repo.updateDescriptionMode({
      name: 'vitest',
      scope: 'devDependencies',
      mode: 'manual',
      manualDesc: 'mine',
    })

    await repo.upsertBatch([{ ...items[0], descKey: 'k.changed' }], '2026-10-21T00:00:00.000Z')

    const [row] = await repo.list({ q: 'vitest' })
    expect(row.desc_key).toBe('k.v')
  })

  it('orders runtime, then dependencies, then devDependencies', async () => {
    await repo.upsertBatch(items)

    expect((await repo.list()).map((r) => r.name)).toEqual(['node', 'Express', 'vitest'])
  })

  it('filters by scope', async () => {
    await repo.upsertBatch(items)

    expect((await repo.list({ scope: 'dependencies' })).map((r) => r.name)).toEqual(['Express'])
  })

  it('ignores an unknown scope filter', async () => {
    await repo.upsertBatch(items)

    expect(await repo.list({ scope: 'bogus' })).toHaveLength(3)
  })

  it('searches names case-insensitively', async () => {
    await repo.upsertBatch(items)

    expect((await repo.list({ q: 'EXP' })).map((r) => r.name)).toEqual(['Express'])
  })

  it('reports the last scan time and total', async () => {
    await repo.upsertBatch(items, '2026-10-20T00:00:00.000Z')

    expect(await repo.getMeta()).toEqual({ lastScanAt: '2026-10-20T00:00:00.000Z', total: 3 })
  })

  it('reports an empty inventory', async () => {
    expect(await repo.getMeta()).toEqual({ lastScanAt: null, total: 0 })
  })

  it('trims a manual description and note', async () => {
    await repo.upsertBatch(items)

    const row = await repo.updateDescriptionMode({
      name: 'vitest',
      scope: 'devDependencies',
      mode: 'manual',
      manualDesc: '  mine  ',
      noteText: ' n ',
    })

    expect(row).toMatchObject({ desc_mode: 'manual', manual_desc: 'mine', note_text: 'n' })
  })

  it('falls back to auto mode and clears the manual description', async () => {
    await repo.upsertBatch(items)

    const row = await repo.updateDescriptionMode({
      name: 'vitest',
      scope: 'devDependencies',
      mode: 'weird',
      manualDesc: 'ignored',
    })

    expect(row).toMatchObject({ desc_mode: 'auto', manual_desc: '', note_text: '' })
  })

  it('updates a note', async () => {
    await repo.upsertBatch(items)

    const row = await repo.updateNote({ name: 'node', scope: 'runtime', noteText: ' pinned ' })

    expect(row.note_text).toBe('pinned')
  })

  it('returns null when updating a missing package', async () => {
    expect(await repo.updateNote({ name: 'nope', scope: 'runtime', noteText: 'x' })).toBeNull()
  })
})
