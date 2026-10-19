import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createHistoryRouter } from './history.js'

// 在 git hook 內執行時會帶這些變數，讓 git 指向外層 repo
const INHERITED_GIT_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
]

describe('GET /api/files/history', () => {
  let dir

  function git(args) {
    return execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Tester',
        GIT_AUTHOR_EMAIL: 'tester@example.com',
        GIT_COMMITTER_NAME: 'Tester',
        GIT_COMMITTER_EMAIL: 'tester@example.com',
      },
    }).trim()
  }

  function get(projectDir, query) {
    const app = express()
    app.use('/api/files', createHistoryRouter({ projectDir }))
    return request(app).get('/api/files/history' + query)
  }

  beforeEach(() => {
    INHERITED_GIT_VARS.forEach((name) => vi.stubEnv(name, undefined))
    // git 不會往上找進 ceiling 目錄，tmpdir 本身或其上層的 repo 都不會被誤認
    vi.stubEnv('GIT_CEILING_DIRECTORIES', fs.realpathSync.native(os.tmpdir()))
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-history-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(['', '../x', '/etc/passwd'])('rejects path %j', async (p) => {
    const res = await get(dir, '?path=' + encodeURIComponent(p))

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ ok: false, error: 'invalid path' })
  })

  it('lists the commits that touched the file', async () => {
    git(['init', '-q'])
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a')
    git(['add', 'a.txt'])
    const tree = git(['write-tree'])
    const commit = git(['commit-tree', '--no-gpg-sign', '-m', 'feat: add a|b', tree])
    git(['update-ref', 'HEAD', commit])

    const res = await get(dir, '?path=a.txt&limit=500')

    expect(res.body).toEqual({
      ok: true,
      path: 'a.txt',
      history: [
        {
          sha: commit,
          shortSha: commit.slice(0, 7),
          author: 'Tester',
          email: 'tester@example.com',
          date: expect.any(String),
          subject: 'feat: add a|b',
        },
      ],
    })
  })

  it('returns 500 outside a git repository', async () => {
    const res = await get(dir, '?path=a.txt')

    expect(res.status).toBe(500)
    expect(res.body.ok).toBe(false)
  })

  it('reports notGitRepo when the project directory does not exist', async () => {
    const res = await get(path.join(dir, 'missing'), '?path=a.txt')

    expect(res.body).toEqual({ ok: true, path: 'a.txt', history: [], notGitRepo: true })
  })
})
