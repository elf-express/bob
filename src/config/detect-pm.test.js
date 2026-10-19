import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { detectPackageManager, isCommandAvailable } from './detect-pm.js'

describe('isCommandAvailable', () => {
  it('finds node on the PATH', () => {
    expect(isCommandAvailable('node')).toBe(true)
  })

  it('returns false for a command that does not exist', () => {
    expect(isCommandAvailable('bob-no-such-command-e345')).toBe(false)
  })
})

describe('detectPackageManager', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-pm-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('picks pnpm when pnpm-workspace.yaml exists', () => {
    fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'packages: []\n')

    expect(detectPackageManager(dir)).toBe('pnpm')
  })

  it('picks npm when only package-lock.json exists', () => {
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}')

    expect(detectPackageManager(dir)).toBe('npm')
  })

  it('falls back to the first available manager without lock files', () => {
    expect(detectPackageManager(dir)).toBe('pnpm')
  })
})
