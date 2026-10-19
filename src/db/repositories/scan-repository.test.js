import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteClient } from '../sqlite-client.js'
import { ScanRepository } from './scan-repository.js'

const MIGRATION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

async function openDb() {
  const db = new SQLiteClient(':memory:')
  await db.connect()
  await db.runMigrations(MIGRATION_DIR)
  return db
}

describe('ScanRepository', () => {
  let db
  let repo

  beforeEach(async () => {
    db = await openDb()
    repo = new ScanRepository(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('starts a run in running state', async () => {
    const id = await repo.startRun('tree')

    expect(await db.get('SELECT scan_type, status FROM scan_runs WHERE id = ?', [id])).toEqual({
      scan_type: 'tree',
      status: 'running',
    })
  })

  it('marks a run successful with a finish time', async () => {
    const id = await repo.startRun('tree')

    await repo.finishRunSuccess(id)

    const row = await db.get('SELECT status, finished_at FROM scan_runs WHERE id = ?', [id])
    expect(row).toEqual({ status: 'success', finished_at: expect.any(String) })
  })

  it.each([
    ['disk full', 'disk full'],
    ['', null],
  ])('stores failure message %j as %j', async (message, stored) => {
    const id = await repo.startRun('commands')

    await repo.finishRunFailed(id, message)

    expect(await db.get('SELECT status, error_msg FROM scan_runs WHERE id = ?', [id])).toEqual({
      status: 'failed',
      error_msg: stored,
    })
  })

  it('replaces the command snapshot and prefers the per-item source file', async () => {
    const first = await repo.startRun('commands')
    await repo.replaceCommandSnapshot(first, [{ name: 'old', cmd: 'x' }], 'package.json')
    const second = await repo.startRun('commands')

    await repo.replaceCommandSnapshot(
      second,
      [
        { name: 'dev', cmd: 'vite' },
        { name: 'web:build', cmd: 'vite build', sourceFile: 'apps/web/package.json' },
      ],
      'package.json',
    )

    expect(await db.all('SELECT script_name, source_file FROM commands_snapshot ORDER BY id')).toEqual([
      { script_name: 'dev', source_file: 'package.json' },
      { script_name: 'web:build', source_file: 'apps/web/package.json' },
    ])
  })

  it('replaces the tree snapshot and stores booleans and empty parents', async () => {
    const id = await repo.startRun('tree')

    await repo.replaceTreeSnapshot(id, [
      { rel_path: 'src', name: 'src', is_dir: true, depth: 1, parent_path: '' },
      { rel_path: 'src/a.js', name: 'a.js', is_dir: false, depth: 2, parent_path: 'src' },
    ])

    expect(await db.all('SELECT rel_path, is_dir, parent_path FROM tree_snapshot ORDER BY id')).toEqual([
      { rel_path: 'src', is_dir: 1, parent_path: null },
      { rel_path: 'src/a.js', is_dir: 0, parent_path: 'src' },
    ])
  })

  it('summarises an empty database', async () => {
    expect(await repo.getLatestSummary()).toEqual({
      runs: {},
      counts: { commands: 0, treeNodes: 0, updatedAt: null },
    })
  })

  it('summarises the latest run per type and snapshot counts', async () => {
    const oldTree = await repo.startRun('tree')
    await repo.finishRunFailed(oldTree, 'x')
    const tree = await repo.startRun('tree')
    await repo.replaceTreeSnapshot(tree, [{ rel_path: 'a', name: 'a', is_dir: false, depth: 1 }])
    await repo.finishRunSuccess(tree)

    const summary = await repo.getLatestSummary()

    expect(summary.runs.tree).toMatchObject({ id: tree, status: 'success' })
    expect(summary.counts).toEqual({ commands: 0, treeNodes: 1, updatedAt: expect.any(String) })
  })
})
