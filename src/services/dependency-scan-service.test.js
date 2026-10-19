import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DependencyScanService } from './dependency-scan-service.js'

function write(root, rel, content) {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content))
}

describe('DependencyScanService.explain', () => {
  const service = new DependencyScanService('.')

  it.each([
    ['vite', 'Frontend dev server and build tool.'],
    ['@types/node', 'Type definitions package: @types/node.'],
    ['eslint-plugin-vue', 'ESLint plugin/config package: eslint-plugin-vue.'],
    ['vitest-environment-x', 'Vitest related package: vitest-environment-x.'],
    ['@vitejs/plugin-vue', 'Vite ecosystem package: @vitejs/plugin-vue.'],
    ['lodash', 'Used by this project: lodash'],
  ])('explains %s', (name, fallback) => {
    expect(service.explain(name).descFallback).toBe(fallback)
  })

  it('normalises the description key', () => {
    expect(service.explain('@Scope/Pkg:x').descKey).toBe('dependencyDescriptions.@scope-pkg-x')
  })
})

describe('DependencyScanService', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-deps-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it.each([
    ['foo', '1.2.3'],
    ['@a/b', '4.5.6'],
    ['broken', 'unknown'],
    ['missing', 'not-installed'],
  ])('reads the installed version of %s', (name, expected) => {
    write(dir, 'node_modules/foo/package.json', { version: '1.2.3' })
    write(dir, 'node_modules/@a/b/package.json', { version: '4.5.6' })
    write(dir, 'node_modules/broken/package.json', '{')

    expect(new DependencyScanService(dir).readInstalledVersion(name)).toBe(expected)
  })

  it.each([
    ['foo', 'dependencies', '1.0.0'],
    ['bar', 'devDependencies', '2.0.0'],
    ['baz', 'dependencies', '3.0.0'],
    ['qux', 'dependencies', 'not-installed'],
  ])('falls back to the pnpm index for %s', (name, scope, expected) => {
    const service = new DependencyScanService(dir)
    service.pnpmDirectVersionIndex = {
      byManifest: new Map([
        [path.resolve(dir), { dependencies: new Map([['foo', '1.0.0']]), devDependencies: new Map() }],
      ]),
      byScope: new Map([['devDependencies:bar', '2.0.0']]),
      byName: new Map([['baz', '3.0.0']]),
    }

    expect(service.readInstalledVersion(name, dir, scope)).toBe(expected)
  })

  it.each(['', 'bob-no-such-pm-e345'])('reports unknown for package manager %j', (pm) => {
    expect(new DependencyScanService(dir).resolvePackageManagerVersion(pm)).toBe('unknown')
  })

  it('reads the version of an installed tool', () => {
    expect(new DependencyScanService(dir).resolvePackageManagerVersion('node')).toMatch(/^v\d+\./)
  })

  it('throws without a root package.json', () => {
    expect(() => new DependencyScanService(dir).readRootPackageJson()).toThrow('package.json not found')
  })

  it('caches the pnpm index', () => {
    const service = new DependencyScanService(dir)
    const first = service.buildPnpmDirectVersionIndex()

    const second = service.buildPnpmDirectVersionIndex()

    expect(second).toBe(first)
  })

  it('lists runtime, root and workspace dependencies once each', async () => {
    write(dir, 'package.json', {
      dependencies: { foo: '^1.0.0' },
      peerDependencies: { foo: '^1.0.0' },
      devDependencies: { bar: '2.0.0' },
    })
    write(dir, 'node_modules/foo/package.json', { version: '1.2.3' })
    write(dir, 'packages/a/package.json', { dependencies: { baz: '1.0.0' } })
    write(dir, 'packages/broken/package.json', '{')
    const service = new DependencyScanService(dir, async () => 'npm')

    const items = await service.scan()

    expect(items.map((i) => i.scope + ':' + i.name)).toEqual([
      'runtime:node',
      'runtime:package-manager',
      'dependencies:foo',
      'devDependencies:bar',
      'dependencies:baz',
    ])
    expect(items[1]).toMatchObject({ declaredVersion: 'npm' })
    expect(items[2]).toMatchObject({ declaredVersion: '^1.0.0', installedVersion: '1.2.3' })
  })

  it('assumes npm without a package manager provider', async () => {
    write(dir, 'package.json', {})

    const items = await new DependencyScanService(dir).scan()

    expect(items.find((i) => i.name === 'package-manager').declaredVersion).toBe('npm')
  })
})
