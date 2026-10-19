import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CommandScanService } from './command-scan-service.js'

function write(root, rel, content) {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content))
}

describe('CommandScanService.classifyScript', () => {
  const service = new CommandScanService('.')

  it.each([
    ['bob', { groupId: 'development', categoryId: 'dev-tools' }],
    ['clean:cache', { groupId: 'application', categoryId: 'clean' }],
    ['prepare:env', { groupId: 'application', categoryId: 'env-install' }],
    ['ci:lint', { groupId: 'quality', categoryId: 'check' }],
    ['docker:up', { groupId: 'deploy', categoryId: 'docker' }],
    ['minify', { groupId: 'development', categoryId: 'web-build' }],
    ['changelog', { groupId: 'deploy', categoryId: 'release' }],
    ['tauri:dev', { groupId: 'development', categoryId: 'desktop-dev' }],
    ['test:unit', { groupId: 'quality', categoryId: 'test' }],
    ['lint', { groupId: 'quality', categoryId: 'check' }],
    ['build', { groupId: 'development', categoryId: 'web-build' }],
    ['publish', { groupId: 'deploy', categoryId: 'release' }],
    ['dev', { groupId: 'development', categoryId: 'web-dev' }],
    ['foo', null],
    ['', null],
    [null, null],
  ])('classifies %j', (name, expected) => {
    expect(service.classifyScript(name)).toEqual(expected)
  })
})

describe('CommandScanService.explainScript', () => {
  const service = new CommandScanService('.')

  it.each([
    ['bob', 'Run bob (Start BOB Tools server)'],
    ['prepare:env', 'Run prepare:env (Prepare runtime or toolchain dependencies)'],
    ['clean:dist', 'Run clean:dist (Clean cache/build artifacts)'],
    ['compose:up', 'Run compose:up (Docker/container workflow)'],
    ['gate', 'Run gate (CI quality gate workflow)'],
    ['optimize', 'Run optimize (Build optimization workflow)'],
    ['bump', 'Run bump (Version/release management)'],
    ['electron', 'Run electron (Desktop app workflow)'],
    ['test', 'Run test (Execute automated tests)'],
    ['typecheck', 'Run typecheck (Code quality checks)'],
    ['build:web', 'Run build:web (Build or package project output)'],
    ['serve', 'Run serve (Start local development flow)'],
    ['deploy', 'Run deploy (Release or deployment pipeline)'],
    ['unknown', 'Run unknown'],
  ])('explains %j', (name, fallback) => {
    expect(service.explainScript(name).descFallback).toBe(fallback)
  })

  it('derives the description key from the script name', () => {
    expect(service.explainScript('Build:Web').descKey).toBe('commandDescriptions.build-web')
  })

  it('uses the default key for an empty name', () => {
    expect(service.explainScript('')).toEqual({
      descKey: 'commandDescriptions.__default',
      descFallback: 'Run ',
    })
  })
})

describe('CommandScanService helpers', () => {
  const projectDir = path.join(os.tmpdir(), 'bob-scan-root')
  const service = new CommandScanService(projectDir, 'pnpm')
  const webDir = path.join(projectDir, 'apps', 'web')

  it.each([
    ['', '""'],
    ['abc', 'abc'],
    ['a b', '"a b"'],
    ['a"b c', '"a\\"b c"'],
  ])('quotes %j as %s', (value, expected) => {
    expect(service.quoteArg(value)).toBe(expected)
  })

  it.each([
    [null, '.'],
    [projectDir, '.'],
    [webDir, 'apps/web'],
  ])('turns %j into relative path %s', (target, expected) => {
    expect(service.normalizeRelPath(target)).toBe(expected)
  })

  it.each([
    ['pnpm', { isRoot: true }, 'pnpm run dev'],
    ['pnpm', { packageName: '@x/web', packageDir: webDir }, 'pnpm --filter @x/web run dev'],
    ['pnpm', { packageDir: webDir }, 'pnpm -C apps/web run dev'],
    ['yarn', { packageName: 'web', packageDir: webDir }, 'yarn workspace web run dev'],
    ['yarn', { packageDir: webDir }, 'yarn --cwd apps/web run dev'],
    ['npm', { packageName: 'web', packageDir: webDir }, 'npm --prefix apps/web run dev'],
  ])('builds the %s run command for %j', (pm, options, expected) => {
    const scanner = new CommandScanService(projectDir, pm)

    expect(scanner.toRunCommand('dev', options)).toBe(expected)
  })

  it('returns an empty run command for an empty script name', () => {
    expect(service.toRunCommand('  ')).toBe('')
  })

  it('keeps the current package manager when given an empty value', () => {
    const scanner = new CommandScanService(projectDir, 'yarn')

    scanner.setPackageManager('')

    expect(scanner.packageManager).toBe('yarn')
  })

  it.each([
    [{ workspaces: ['apps/*'] }, true],
    [{ workspaces: [] }, false],
    [{ workspaces: { packages: ['apps/*'] } }, true],
    [{ workspaces: { packages: [] } }, false],
    [{}, false],
    [null, false],
  ])('detects workspaces in %j as %s', (pkg, expected) => {
    expect(service.hasWorkspaceConfig(pkg)).toBe(expected)
  })
})

describe('CommandScanService.scanRootPackageScripts', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-scan-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('throws without a root package.json', () => {
    expect(() => new CommandScanService(dir).scanRootPackageScripts()).toThrow('package.json not found')
  })

  it('returns no scripts for a package without scripts', () => {
    write(dir, 'package.json', {})

    expect(new CommandScanService(dir).scanRootPackageScripts().scripts).toEqual([])
  })

  it('adds workspace scripts that the root does not already proxy', () => {
    write(dir, 'package.json', {
      name: 'root',
      scripts: { dev: 'pnpm --filter web run dev', lint: 'eslint .' },
    })
    write(dir, 'pnpm-workspace.yaml', 'packages:\n  - apps/*\n')
    write(dir, 'apps/web/package.json', { name: 'web', scripts: { dev: 'vite', build: 'vite build' } })
    write(dir, 'apps/broken/package.json', '{')
    write(dir, 'node_modules/x/package.json', { scripts: { evil: 'x' } })
    const service = new CommandScanService(dir, 'pnpm')

    const { sourceFile, scripts } = service.scanRootPackageScripts()

    expect(sourceFile).toBe(path.join(dir, 'package.json'))
    expect(scripts.map((s) => s.name)).toEqual(['dev', 'lint', 'web:build'])
    expect(scripts[2]).toMatchObject({
      groupId: 'development',
      categoryId: 'web-build',
      scriptName: 'build',
      packageName: 'web',
      packageDir: 'apps/web',
      cmd: 'vite build',
      runCmd: 'pnpm --filter web run build',
      descKey: 'commandDescriptions.build',
    })
  })
})
