import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { createApiRouter } from './api.js'

function buildApp(options) {
  const app = express()
  app.use('/api', createApiRouter(options))
  return app
}

const grouped = {
  projectName: 'demo',
  groups: [{ id: 'g', categories: [{ id: 'c', commands: [{ cmd: '{{PKG_MANAGER}} run lint' }] }] }],
}

describe('GET /api/data', () => {
  it('replaces the package manager placeholder in groups and flat categories', async () => {
    const res = await request(buildApp({ config: grouped, packageManager: 'pnpm' })).get('/api/data')

    expect(res.body.config.groups[0].categories[0].commands[0].cmd).toBe('pnpm run lint')
    expect(res.body.categories).toEqual([{ id: 'c', commands: [{ cmd: 'pnpm run lint' }] }])
    expect(res.body.config.packageManager).toBe('pnpm')
  })

  it('prefers the providers over the static options', async () => {
    const app = buildApp({
      config: { groups: [] },
      packageManager: 'npm',
      configProvider: async () => grouped,
      packageManagerProvider: async () => 'yarn',
    })

    const res = await request(app).get('/api/data')

    expect(res.body.categories[0].commands[0].cmd).toBe('yarn run lint')
  })

  it('flattens the legacy categories layout', async () => {
    const config = { categories: [{ id: 'c', commands: [{ cmd: '{{PKG_MANAGER}} test' }] }] }

    const res = await request(buildApp({ config, packageManager: 'npm' })).get('/api/data')

    expect(res.body.categories).toEqual([{ id: 'c', commands: [{ cmd: 'npm test' }] }])
    expect(res.body.config.groups).toBeUndefined()
  })

  it('returns empty categories without a config', async () => {
    const res = await request(buildApp({ config: null, packageManager: 'npm' })).get('/api/data')

    expect(res.body).toEqual({ config: { packageManager: 'npm' }, categories: [] })
  })
})
