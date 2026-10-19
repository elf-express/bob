import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'

import { killTree } from './process.js'

describe('killTree', () => {
  it('terminates a running child process', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    })
    await once(child, 'spawn')
    const exited = once(child, 'exit')

    killTree(child.pid)

    const [code, signal] = await exited
    expect(code === 0 && signal === null).toBe(false)
  })

  it('ignores a pid that does not exist', () => {
    expect(() => killTree(999999)).not.toThrow()
  })
})
