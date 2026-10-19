import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteClient } from '../db/sqlite-client.js'
import { TagService } from './tag-service.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

describe('TagService.suggestTags', () => {
  const service = new TagService('.', null)

  it.each([
    ['src/components/Btn.vue', ['ui']],
    ['src/router/index.ts', ['router']],
    ['vite.config.ts', ['config']],
    ['.env.local', ['config']],
    ['src/styles/a.scss', ['style']],
    ['src/types/x.d.ts', ['type']],
    ['src/utils/a.test.ts', ['utils', 'test']],
    ['README.md', []],
    ['', []],
  ])('suggests %j -> %j', (relPath, expected) => {
    expect(service.suggestTags(relPath)).toEqual(expected)
  })
})

describe('TagService', () => {
  let db
  let service

  beforeEach(async () => {
    db = await openDb()
    service = new TagService('.', db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('merges custom tags first and removes duplicates', async () => {
    await service.setCustomTag('src/components/Btn.vue', ['ui', 'core'])

    expect(await service.getTags('src/components/Btn.vue')).toEqual(['ui', 'core'])
  })

  it('clears custom tags when given null', async () => {
    await service.setCustomTag('a.js', ['core'])

    await service.setCustomTag('a.js', null)

    expect(await service.getCustomTags()).toEqual({})
  })

  it('returns only suggestions without a db', async () => {
    expect(await new TagService('.', null).getTags('src/api/x.ts')).toEqual(['api'])
  })
})
