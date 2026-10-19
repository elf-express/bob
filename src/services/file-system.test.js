import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteClient } from '../db/sqlite-client.js'
import { FileSystemService } from './file-system.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

function write(root, rel, content = '') {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

describe('FileSystemService', () => {
  let db
  let dir
  let service

  beforeEach(async () => {
    db = await openDb()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-fs-'))
    write(dir, 'README.md', '# demo')
    write(dir, 'src/app.js', 'module.exports = {}')
    write(dir, 'src/logo.png')
    write(dir, 'node_modules/x/index.js')
    write(dir, '.git/HEAD')
    fs.mkdirSync(path.join(dir, 'docs'))
    service = new FileSystemService(dir, db)
  })

  afterEach(async () => {
    await db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('lists directories first and hides ignored folders', async () => {
    const files = await service.listFiles('')

    expect(files.map((f) => f.name)).toEqual(['docs', 'src', 'README.md'])
  })

  it('attaches the saved annotation to listed files', async () => {
    await service.updateAnnotation('README.md', '  readme  ')

    const files = await service.listFiles('')

    expect(files.find((f) => f.name === 'README.md')).toMatchObject({
      path: 'README.md',
      isDirectory: false,
      annotation: 'readme',
      purpose: '',
    })
  })

  it('lists a nested directory with forward-slash paths', async () => {
    const files = await service.listFiles('src')

    expect(files.map((f) => f.path)).toEqual(['src/app.js', 'src/logo.png'])
  })

  it('rejects a missing directory', async () => {
    await expect(service.listFiles('nope')).rejects.toThrow('Directory not found: nope')
  })

  it('rejects a file path', async () => {
    await expect(service.listFiles('README.md')).rejects.toThrow('Path is not a directory: README.md')
  })

  it('rejects a path outside the project', async () => {
    await expect(service.listFiles('../')).rejects.toThrow('Path traversal denied')
  })

  it('counts files outside ignored folders', async () => {
    expect(await service.getProjectStats()).toEqual({ fileCount: 3 })
  })

  it('snapshots the tree without media files or ignored folders', async () => {
    const nodes = await service.scanTreeSnapshot()

    expect(nodes.map((n) => n.rel_path).sort()).toEqual(['README.md', 'docs', 'src', 'src/app.js'])
    expect(nodes.find((n) => n.rel_path === 'src/app.js')).toEqual({
      rel_path: 'src/app.js',
      name: 'app.js',
      is_dir: false,
      depth: 2,
      parent_path: 'src',
    })
  })

  it('returns nothing for an empty search', async () => {
    expect(await service.searchFiles('')).toEqual([])
  })

  it('searches names case-insensitively with annotations', async () => {
    await service.updateAnnotation('src/app.js', 'entry')

    const results = await service.searchFiles('APP')

    expect(results).toEqual([{ name: 'app.js', path: 'src/app.js', isDirectory: false, annotation: 'entry' }])
  })

  it.each([
    ['createDirectory', ['x']],
    ['createFile', ['x.txt', 'hi']],
    ['deletePath', ['README.md']],
    ['renamePath', ['README.md', 'b.md']],
  ])('refuses %s while writes are disabled', async (method, args) => {
    await expect(service[method](...args)).rejects.toMatchObject({ code: 'FS_WRITE_DISABLED' })
  })

  describe('with writes enabled', () => {
    beforeEach(() => {
      service.fileSystemWriteEnabled = true
    })

    it('creates a file and its parent folders', async () => {
      await service.createFile('a/b/c.txt', 'hi')

      expect(fs.readFileSync(path.join(dir, 'a', 'b', 'c.txt'), 'utf8')).toBe('hi')
    })

    it('creates a directory', async () => {
      await service.createDirectory('x/y')

      expect(fs.statSync(path.join(dir, 'x', 'y')).isDirectory()).toBe(true)
    })

    it('renames into a new folder', async () => {
      await service.renamePath('README.md', 'moved/README.md')

      expect(fs.existsSync(path.join(dir, 'moved', 'README.md'))).toBe(true)
    })

    it('deletes a folder recursively', async () => {
      await service.deletePath('src')

      expect(fs.existsSync(path.join(dir, 'src'))).toBe(false)
    })

    it('still refuses a path outside the project', async () => {
      await expect(service.createFile('../evil.txt', 'x')).rejects.toThrow('Path traversal denied')
    })
  })
})
