import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SQLiteClient } from '../sqlite-client.js'
import { BindingRepository } from './binding-repository.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

describe('BindingRepository without the override column', () => {
  let db
  let repo

  beforeEach(async () => {
    db = await openDb()
    repo = new BindingRepository(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('returns null before anything is bound', async () => {
    expect(await repo.getBinding()).toBeNull()
  })

  it('inserts the binding as row 1 with a null override', async () => {
    const binding = await repo.upsertBinding('/work/app')

    expect(binding).toMatchObject({
      id: 1,
      target_path: '/work/app',
      allow_rebind: 1,
      package_manager_override: null,
    })
  })

  it('updates the existing binding and ignores the override value', async () => {
    await repo.upsertBinding('/work/a')

    const binding = await repo.upsertBinding('/work/b', 0, 'pnpm')

    expect(binding).toMatchObject({ target_path: '/work/b', allow_rebind: 0, package_manager_override: null })
  })

  it('leaves the binding untouched when setting an override', async () => {
    await repo.upsertBinding('/work/a')

    const binding = await repo.setPackageManagerOverride('pnpm')

    expect(binding.package_manager_override).toBeNull()
  })
})

describe('BindingRepository with the override column', () => {
  let db
  let repo

  beforeEach(async () => {
    db = await openDb()
    await db.run('ALTER TABLE project_binding ADD COLUMN package_manager_override TEXT')
    repo = new BindingRepository(db)
    await repo.upsertBinding('/work/app')
  })

  afterEach(async () => {
    await db.close()
  })

  it('stores the override passed to upsertBinding', async () => {
    const binding = await repo.upsertBinding('/work/app', 1, 'yarn')

    expect(binding.package_manager_override).toBe('yarn')
  })

  it.each(['npm', 'pnpm', 'yarn'])('accepts %s as an override', async (pm) => {
    const binding = await repo.setPackageManagerOverride(pm)

    expect(binding.package_manager_override).toBe(pm)
  })

  it.each(['bun', '', null])('clears the override for %j', async (value) => {
    await repo.setPackageManagerOverride('pnpm')

    const binding = await repo.setPackageManagerOverride(value)

    expect(binding.package_manager_override).toBeNull()
  })
})

describe('BindingRepository.hasPackageManagerOverrideColumn', () => {
  it('returns false when PRAGMA fails', async () => {
    const repo = new BindingRepository({ all: vi.fn().mockRejectedValue(new Error('locked')) })

    expect(await repo.hasPackageManagerOverrideColumn()).toBe(false)
  })

  it('caches the column check', async () => {
    const all = vi.fn().mockResolvedValue([{ name: 'package_manager_override' }])
    const repo = new BindingRepository({ all })
    await repo.hasPackageManagerOverrideColumn()

    await repo.hasPackageManagerOverrideColumn()

    expect(all).toHaveBeenCalledOnce()
  })
})
