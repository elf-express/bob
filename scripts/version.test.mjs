import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'version.mjs')

// 在暫存目錄放一份腳本與根 package.json，不改到真正的 repo
let root
const pkgPath = () => join(root, 'package.json')
const writePkg = (version) =>
  writeFileSync(
    pkgPath(),
    `{\n  "name": "@elf-express/bob",\n  "version": "${version}",\n  "dependencies": {\n    "express": "^5.2.1"\n  }\n}\n`,
  )
const run = (...args) =>
  spawnSync(process.execPath, [join(root, 'scripts', 'version.mjs'), ...args], { encoding: 'utf8' })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bob-version-'))
  mkdirSync(join(root, 'scripts'))
  cpSync(SCRIPT, join(root, 'scripts', 'version.mjs'))
  writePkg('1.0.0')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('scripts/version.mjs', () => {
  it('不帶參數時印出目前版號且不改檔', () => {
    const before = readFileSync(pkgPath(), 'utf8')
    const r = run()
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('1.0.0')
    expect(readFileSync(pkgPath(), 'utf8')).toBe(before)
  })

  it.each([
    ['patch', '1.0.1'],
    ['minor', '1.1.0'],
    ['major', '2.0.0'],
    ['3.4.5', '3.4.5'],
  ])('%s 改成 %s，只動 version 欄位', (arg, next) => {
    const before = readFileSync(pkgPath(), 'utf8')
    const r = run(arg)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain(`1.0.0 -> ${next} (1 files written)`)
    expect(readFileSync(pkgPath(), 'utf8')).toBe(before.replace('"version": "1.0.0"', `"version": "${next}"`))
  })

  it('未知的 bump 種類失敗且不改檔', () => {
    const before = readFileSync(pkgPath(), 'utf8')
    const r = run('beta')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('unknown bump: beta')
    expect(readFileSync(pkgPath(), 'utf8')).toBe(before)
  })

  it('目前版號不是純 X.Y.Z 時拒絕 bump', () => {
    writePkg('1.0.0-beta.1')
    const r = run('patch')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('not a plain semver version: 1.0.0-beta.1')
  })
})
