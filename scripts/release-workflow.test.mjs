import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const yml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows', 'release.yml'),
  'utf8',
)

// elf-stack 3.5 對照表（2026-10-20 核對）
const PINNED = new Set([
  'actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0',
  'pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v4.4.0',
  'actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0',
])

// 取出 `<indent><name>:` 底下縮排更深的行（含空行）
const section = (text, indent, name) =>
  text.match(new RegExp(`^${indent}${name}:[^\\n]*\\n((?:${indent} .*\\n|[ \\t]*\\n)*)`, 'm'))?.[1] ?? ''
const keys = (text, indent) => [...text.matchAll(new RegExp(`^${indent}([\\w-]+):`, 'gm'))].map((m) => m[1])

const on = section(yml, '', 'on')
const jobs = section(yml, '', 'jobs')

describe('release.yml', () => {
  it('只有 push tags 與 workflow_dispatch 兩種觸發', () => {
    expect(keys(on, '  ')).toEqual(['push', 'workflow_dispatch'])
    expect(section(on, '  ', 'push').trim()).toBe("tags: ['v*']")
    expect(section(on, '  ', 'workflow_dispatch')).toMatch(/^ {6}tag:$/m)
    expect(yml).not.toMatch(/workflow_call/)
  })

  it('verify 用完整歷史，檢查版號與是否在 origin/release 上', () => {
    const verify = section(jobs, '  ', 'verify')
    expect(verify).toMatch(/fetch-depth: 0/)
    expect(verify).toContain(`require('./package.json').version`)
    expect(verify).toContain('git merge-base --is-ancestor')
    expect(verify).toContain('origin/release')
  })

  it('verify 以外的 job 全部 needs: verify', () => {
    const names = keys(jobs, '  ')
    expect(names).toContain('verify')
    expect(names).toContain('publish')
    for (const name of names.filter((n) => n !== 'verify')) {
      expect(section(jobs, '  ', name), name).toMatch(/^ {4}needs: (verify|\[[^\]]*\bverify\b[^\]]*\])$/m)
    }
  })

  it('每個 checkout 都取 tag，兩種觸發共用', () => {
    const checkouts = yml.match(/uses: actions\/checkout@/g) ?? []
    const refs = yml.match(/ref: \$\{\{ inputs\.tag \|\| github\.ref \}\}/g) ?? []
    expect(checkouts.length).toBeGreaterThan(0)
    expect(refs.length).toBe(checkouts.length)
  })

  it('所有 uses: 釘 40 碼 SHA，與 elf-stack 3.5 逐字一致', () => {
    const uses = [...yml.matchAll(/^\s*(?:- )?uses: (.+)$/gm)].map((m) => m[1].trim())
    expect(uses.length).toBeGreaterThan(0)
    for (const u of uses) expect(PINNED, u).toContain(u)
  })

  it('publish 有寫入權限，已發佈的版本跳過，其他錯誤失敗', () => {
    const publish = section(jobs, '  ', 'publish')
    expect(publish).toMatch(/packages: write/)
    expect(publish).toContain('npm view')
    expect(publish).toContain('E404')
    // stderr 的 warn／notice 不能混進版號比對
    expect(publish).not.toMatch(/npm view[^\n]*2>&1/)
    expect(publish).toContain('pnpm publish --no-git-checks')
  })
})
