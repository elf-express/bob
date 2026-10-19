import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigEditor, validateConfig } from './config-editor.js'

function validConfig(name = 'demo') {
  return {
    projectName: name,
    groups: [
      {
        id: 'g',
        name: 'G',
        categories: [{ id: 'c', name: 'C', commands: [{ cmd: 'pnpm lint', desc: 'Lint' }] }],
      },
    ],
  }
}

describe('validateConfig', () => {
  it('accepts a valid grouped config', () => {
    expect(validateConfig(validConfig())).toEqual({ valid: true, errors: [] })
  })

  it('stops early when neither groups nor categories is an array', () => {
    expect(validateConfig({})).toEqual({
      valid: false,
      errors: ['Missing or invalid "projectName" field', '"groups" or "categories" must be an array'],
    })
  })

  it('reports duplicate group ids and a missing group name', () => {
    const config = { projectName: 'x', groups: [{ id: 'g' }, { id: 'g', name: 'G' }] }

    expect(validateConfig(config).errors).toEqual([
      'Group "g" missing or invalid "name"',
      'Duplicate group ID: "g"',
    ])
  })

  it('reports a duplicate category id inside a group', () => {
    const config = {
      projectName: 'x',
      groups: [
        {
          id: 'g',
          name: 'G',
          categories: [
            { id: 'c', name: 'C', commands: [] },
            { id: 'c', name: 'C2', commands: [] },
          ],
        },
      ],
    }

    expect(validateConfig(config).errors).toEqual(['Duplicate category ID in group "g": "c"'])
  })

  it('reports a duplicate category id in the legacy layout', () => {
    const config = {
      projectName: 'x',
      categories: [
        { id: 'c', name: 'C', commands: [] },
        { id: 'c', name: 'C', commands: [] },
      ],
    }

    expect(validateConfig(config).errors).toEqual(['Duplicate category ID: "c"'])
  })

  it('reports category and command field problems', () => {
    const config = {
      projectName: 'x',
      categories: [{ id: 'a' }, { id: 'b', name: 'B', commands: [{ cmd: '', desc: 1 }] }],
    }

    expect(validateConfig(config).errors).toEqual([
      'Category "a" missing or invalid "name"',
      'Category "a" missing "commands" array',
      'Category "b" has command missing or invalid "cmd" field',
      'Category "b" has command missing or invalid "desc" field',
    ])
  })
})

describe('ConfigEditor', () => {
  let dir
  let configPath
  let backupDir
  let editor

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-editor-'))
    configPath = path.join(dir, 'bob.config.json')
    backupDir = path.join(dir, 'backups')
    editor = new ConfigEditor(configPath, backupDir)
  })

  afterEach(() => {
    vi.useRealTimers()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates the backup directory on construction', () => {
    expect(fs.existsSync(backupDir)).toBe(true)
  })

  it('throws when loading a missing config', () => {
    expect(() => editor.load()).toThrow('Configuration file not found')
  })

  it('refuses to save an invalid config', () => {
    expect(() => editor.save({})).toThrow('Invalid configuration: Missing or invalid "projectName" field')
  })

  it('saves a new config without creating a backup', () => {
    editor.save(validConfig())

    expect(editor.load()).toEqual(validConfig())
    expect(editor.listBackups()).toEqual([])
  })

  it('backs up the previous config when saving over it', () => {
    editor.save(validConfig('one'))

    editor.save(validConfig('two'))

    expect(editor.listBackups()).toHaveLength(1)
  })

  it('throws when backing up a missing config', () => {
    expect(() => editor.backup()).toThrow('Cannot backup: configuration file does not exist')
  })

  it('names backups bob.config.<timestamp>.json', () => {
    editor.save(validConfig())

    expect(editor.backup()).toMatch(/^bob\.config\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.json$/)
  })

  it('restores a backup', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T00:00:00.001Z'))
    editor.save(validConfig('one'))
    const name = editor.backup()
    vi.setSystemTime(new Date('2026-10-20T00:00:00.002Z'))
    editor.save(validConfig('two'))
    vi.setSystemTime(new Date('2026-10-20T00:00:00.003Z'))

    editor.restore(name)

    expect(editor.load().projectName).toBe('one')
  })

  it('deletes a backup', () => {
    editor.save(validConfig())
    const name = editor.backup()

    editor.deleteBackup(name)

    expect(editor.listBackups()).toEqual([])
  })
})
