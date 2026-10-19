import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteClient } from '../db/sqlite-client.js'
import { AnnotationService } from './annotation-service.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

describe('AnnotationService', () => {
  let db
  let service

  beforeEach(async () => {
    db = await openDb()
    service = new AnnotationService('.', db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('returns an empty map without annotations', async () => {
    expect(await service.getAnnotations()).toEqual({})
  })

  it('returns blank metadata for an unknown file', async () => {
    expect(await service.getMetadata('a.js')).toEqual({
      annotation: '',
      purpose: '',
      relations: '',
      userNote: '',
    })
  })

  it('trims and returns the saved annotation', async () => {
    expect(await service.saveAnnotation('a.js', '  entry  ')).toBe('entry')
  })

  it('treats a missing annotation as empty', async () => {
    await service.savePurpose('a.js', 'p')

    expect(await service.saveAnnotation('a.js', undefined)).toBe('')
  })

  it('keeps each field when saving another one', async () => {
    await service.saveAnnotation('a.js', 'entry')
    await service.savePurpose('a.js', ' p ')
    await service.saveRelations('a.js', ' b.js ')

    await service.saveUserNote('a.js', ' n ')

    expect(await service.getMetadata('a.js')).toEqual({
      annotation: 'entry',
      purpose: 'p',
      relations: 'b.js',
      userNote: 'n',
    })
  })

  it('groups purposes, relations and notes by path', async () => {
    await service.saveAnnotation('a.js', 'A')
    await service.savePurpose('a.js', 'P')

    const all = await service.getAnnotations()

    expect(all).toEqual({
      'a.js': 'A',
      _purposes: { 'a.js': 'P' },
      _relations: { 'a.js': '' },
      _userNotes: { 'a.js': '' },
    })
  })

  it('removes the row when the only field is cleared', async () => {
    await service.saveAnnotation('a.js', 'A')

    await service.saveAnnotation('a.js', '')

    expect(await service.getAnnotations()).toEqual({})
  })
})
