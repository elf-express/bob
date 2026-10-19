import { describe, expect, it } from 'vitest'

import { validateConfig } from '../services/config-editor.js'
import { buildDefaultConfig } from './default-taxonomy.js'

describe('buildDefaultConfig', () => {
  it('uses BOB-Tools as the default project name', () => {
    expect(buildDefaultConfig().projectName).toBe('BOB-Tools')
  })

  it('uses the given project name', () => {
    expect(buildDefaultConfig('demo').projectName).toBe('demo')
  })

  it('produces a config that passes validateConfig', () => {
    expect(validateConfig(buildDefaultConfig())).toEqual({ valid: true, errors: [] })
  })

  it('lists the five top-level groups in order', () => {
    expect(buildDefaultConfig().groups.map((g) => g.id)).toEqual([
      'uncategorized',
      'application',
      'development',
      'quality',
      'deploy',
    ])
  })

  it('returns a fresh object on every call', () => {
    expect(buildDefaultConfig()).not.toBe(buildDefaultConfig())
  })
})
