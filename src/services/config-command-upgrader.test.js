import { describe, expect, it } from 'vitest'

import { upgradeConfigCommandsFromScripts } from './config-command-upgrader.js'

function configWith(commands) {
  return { groups: [{ id: 'g', categories: [{ id: 'c', commands }] }] }
}

describe('upgradeConfigCommandsFromScripts', () => {
  it.each([null, undefined, {}, { groups: 'x' }])('reports no change for config %j', (config) => {
    expect(upgradeConfigCommandsFromScripts(config, [])).toEqual({ changed: false, updated: 0, deduped: 0 })
  })

  it('rewrites cmd from the script matched by identity', () => {
    const config = configWith([{ scriptName: 'web:dev', cmd: 'old' }])
    const scripts = [{ name: 'web:dev', scriptName: 'dev', runCmd: 'pnpm --filter web run dev' }]

    const result = upgradeConfigCommandsFromScripts(config, scripts)

    expect(result).toEqual({ changed: true, updated: 1, deduped: 0 })
    expect(config.groups[0].categories[0].commands[0]).toEqual({
      scriptName: 'web:dev',
      cmd: 'pnpm --filter web run dev',
    })
  })

  it('upgrades a unique raw script name to its identity', () => {
    const config = configWith([{ scriptName: 'lint', cmd: 'npm run lint' }])
    const scripts = [{ name: 'web:lint', scriptName: 'lint', runCmd: 'pnpm --filter web run lint' }]

    upgradeConfigCommandsFromScripts(config, scripts)

    expect(config.groups[0].categories[0].commands[0]).toEqual({
      scriptName: 'web:lint',
      cmd: 'pnpm --filter web run lint',
    })
  })

  it('leaves a command alone when its raw script name is ambiguous', () => {
    const config = configWith([{ scriptName: 'lint', cmd: 'npm run lint' }])
    const scripts = [
      { name: 'a:lint', scriptName: 'lint', runCmd: 'pnpm --filter a run lint' },
      { name: 'b:lint', scriptName: 'lint', runCmd: 'pnpm --filter b run lint' },
    ]

    const result = upgradeConfigCommandsFromScripts(config, scripts)

    expect(result.updated).toBe(0)
    expect(config.groups[0].categories[0].commands[0].cmd).toBe('npm run lint')
  })

  it('ignores scripts without a run command', () => {
    const config = configWith([{ scriptName: 'dev', cmd: 'x' }])

    const result = upgradeConfigCommandsFromScripts(config, [{ name: 'dev', runCmd: '' }])

    expect(result.changed).toBe(false)
    expect(config.groups[0].categories[0].commands[0].cmd).toBe('x')
  })

  it('removes duplicate commands inside a category', () => {
    const config = configWith([
      { scriptName: 'dev', cmd: 'pnpm run dev' },
      { scriptName: ' dev ', cmd: 'pnpm run dev ' },
      { scriptName: 'build', cmd: 'pnpm run build' },
    ])

    const result = upgradeConfigCommandsFromScripts(config, null)

    expect(result).toEqual({ changed: true, updated: 0, deduped: 1 })
    expect(config.groups[0].categories[0].commands).toHaveLength(2)
  })

  it('reports no change when commands already match the scripts', () => {
    const config = configWith([{ scriptName: 'dev', cmd: 'pnpm run dev' }])
    const scripts = [{ name: 'dev', scriptName: 'dev', runCmd: 'pnpm run dev' }]

    expect(upgradeConfigCommandsFromScripts(config, scripts)).toEqual({
      changed: false,
      updated: 0,
      deduped: 0,
    })
  })
})
