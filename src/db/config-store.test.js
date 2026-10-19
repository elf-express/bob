import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConfigStore } from './config-store.js'

describe('ConfigStore', () => {
  let dir
  let store

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-store-'))
    store = new ConfigStore(path.join(dir, 'bob.config.json'), path.join(dir, 'backups'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reports a missing config file', () => {
    expect(store.configExists()).toBe(false)
  })

  it('round-trips a saved config', () => {
    store.saveConfig({ projectName: 'demo' })

    expect(store.loadConfig()).toEqual({ projectName: 'demo' })
  })

  it('creates the backup directory on demand', () => {
    store.ensureBackupDir()

    expect(fs.existsSync(path.join(dir, 'backups'))).toBe(true)
  })

  it('lists only bob.config.*.json backups, newest name first', () => {
    store.saveConfig({ projectName: 'demo' })
    store.ensureBackupDir()
    store.createBackup('bob.config.2026-01-01.json')
    store.createBackup('bob.config.2026-02-01.json')
    fs.writeFileSync(path.join(dir, 'backups', 'other.json'), '{}')

    const backups = store.listBackups()

    expect(backups.map((b) => b.name)).toEqual(['bob.config.2026-02-01.json', 'bob.config.2026-01-01.json'])
    expect(backups[0]).toMatchObject({ size: expect.any(Number), time: expect.any(String) })
  })

  it('restores a backup over the current config', () => {
    store.saveConfig({ projectName: 'old' })
    store.ensureBackupDir()
    store.createBackup('bob.config.a.json')
    store.saveConfig({ projectName: 'new' })

    store.restoreBackup('bob.config.a.json')

    expect(store.loadConfig()).toEqual({ projectName: 'old' })
  })

  it('throws when restoring a missing backup', () => {
    expect(() => store.restoreBackup('bob.config.none.json')).toThrow(
      'Backup not found: bob.config.none.json',
    )
  })

  it('deletes a backup', () => {
    store.saveConfig({ projectName: 'demo' })
    store.ensureBackupDir()
    store.createBackup('bob.config.a.json')

    store.deleteBackup('bob.config.a.json')

    expect(store.listBackups()).toEqual([])
  })

  it('throws when deleting a missing backup', () => {
    expect(() => store.deleteBackup('bob.config.none.json')).toThrow('Backup not found: bob.config.none.json')
  })
})
