import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SQLiteClient } from './sqlite-client.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

describe('SQLiteClient', () => {
  let db
  let dir

  beforeEach(async () => {
    db = new SQLiteClient(':memory:')
    await db.connect()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-sqlite-'))
  })

  afterEach(async () => {
    await db.close()
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('applies every migration and records it', async () => {
    await db.runMigrations(MIGRATION_DIR)

    const rows = await db.all('SELECT filename FROM schema_migrations ORDER BY filename')
    expect(rows.map((r) => r.filename)).toEqual([
      '001_init.sql',
      '002_annotations.sql',
      '003_app_config.sql',
      '004_package_manager_override.sql',
      '005_dependency_inventory.sql',
      '006_annotation_mode_and_tracking.sql',
    ])
  })

  it('does not re-apply migrations on a second run', async () => {
    await db.runMigrations(MIGRATION_DIR)

    await db.runMigrations(MIGRATION_DIR)

    expect(await db.get('SELECT COUNT(1) AS c FROM schema_migrations')).toEqual({ c: 6 })
  })

  it('records a migration that was applied before tracking existed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await db.run('CREATE TABLE t (a TEXT, x TEXT)')
    fs.writeFileSync(path.join(dir, '001_x.sql'), 'ALTER TABLE t ADD COLUMN x TEXT;')

    await db.runMigrations(dir)

    expect(await db.all('SELECT filename FROM schema_migrations')).toEqual([{ filename: '001_x.sql' }])
  })

  it('throws on a genuine migration error', async () => {
    fs.writeFileSync(path.join(dir, '001_bad.sql'), 'SELECT * FROM missing_table;')

    await expect(db.runMigrations(dir)).rejects.toThrow('no such table')
  })

  it('skips blank migration files', async () => {
    fs.writeFileSync(path.join(dir, '001_blank.sql'), '   \n')

    await db.runMigrations(dir)

    expect(await db.all('SELECT filename FROM schema_migrations')).toEqual([])
  })

  it('returns lastID and changes from run', async () => {
    await db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')

    const result = await db.run('INSERT INTO t (v) VALUES (?)', ['a'])

    expect(result).toEqual({ lastID: 1, changes: 1 })
  })

  it('returns null from get when no row matches', async () => {
    await db.run('CREATE TABLE t (v TEXT)')

    expect(await db.get('SELECT v FROM t')).toBeNull()
  })

  it('commits the work of a transaction', async () => {
    await db.run('CREATE TABLE t (v INTEGER)')

    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t VALUES (1)')
    })

    expect(await db.get('SELECT COUNT(1) AS c FROM t')).toEqual({ c: 1 })
  })

  it('rolls back a transaction when the work throws', async () => {
    await db.run('CREATE TABLE t (v INTEGER)')

    const work = db.transaction(async (tx) => {
      await tx.run('INSERT INTO t VALUES (1)')
      throw new Error('boom')
    })

    await expect(work).rejects.toThrow('boom')
    expect(await db.get('SELECT COUNT(1) AS c FROM t')).toEqual({ c: 0 })
  })

  it('creates the parent directory of a file database', async () => {
    const fileDb = new SQLiteClient(path.join(dir, 'nested', 'bob.sqlite'))

    await fileDb.connect()

    await fileDb.close()
    expect(fs.existsSync(path.join(dir, 'nested'))).toBe(true)
  })

  it('treats close as a no-op when not connected', async () => {
    await expect(new SQLiteClient(':memory:').close()).resolves.toBeUndefined()
  })
})
