import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommandRunner } from './command-runner.js'

function createFakeRes() {
  const res = new EventEmitter()
  res.chunks = []
  res.headers = {}
  res.writableEnded = false
  res.writableFinished = false
  res.setHeader = (key, value) => {
    res.headers[key] = value
  }
  res.flushHeaders = () => {}
  res.write = (chunk) => {
    res.chunks.push(chunk)
    return true
  }
  res.end = () => {
    res.writableEnded = true
    res.writableFinished = true
    res.emit('finish')
  }
  return res
}

function parseEvents(res) {
  return res.chunks.map((chunk) => {
    const [, event, data] = chunk.match(/^event: (.+)\ndata: (.+)\n\n$/)
    return { event, data: JSON.parse(data) }
  })
}

function waitForLogClose(runner) {
  const stream = runner.logStream
  if (!stream || stream.closed) return Promise.resolve()
  return new Promise((resolve) => stream.once('close', resolve))
}

describe('CommandRunner', () => {
  let dir
  let runner
  let res

  beforeEach(() => {
    vi.stubEnv('BOB_USER', 'tester')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-runner-'))
    runner = new CommandRunner({ projectDir: dir, logDir: path.join(dir, 'log'), packageManager: 'pnpm' })
    res = createFakeRes()
  })

  afterEach(async () => {
    runner.abort()
    await waitForLogClose(runner)
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('sets server-sent event headers', async () => {
    const finished = new Promise((resolve) => res.once('finish', resolve))

    runner.run(['node -e "0"'], res)

    await finished
    expect(res.headers).toMatchObject({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  })

  it('names the log after the timestamp and user slug', async () => {
    const finished = new Promise((resolve) => res.once('finish', resolve))

    const logFile = runner.run(['node -e "0"'], res)

    await finished
    expect(logFile).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-tester\.log$/)
  })

  it('counts issues in the output and reports them when done', async () => {
    const finished = new Promise((resolve) => res.once('finish', resolve))

    const logFile = runner.run(['node -e "console.log(\'  1:1  error  no-undef\')"'], res)

    await finished
    expect(parseEvents(res).at(-1)).toEqual({
      event: 'done',
      data: { total: 1, logFile, warnings: 0, errors: 1 },
    })
  })

  it('continues with the next command after a failure', async () => {
    const finished = new Promise((resolve) => res.once('finish', resolve))

    runner.run(['node -e "process.exit(3)"', 'node -e "0"'], res)

    await finished
    const codes = parseEvents(res)
      .filter((e) => e.event === 'cmd-end')
      .map((e) => e.data.code)
    expect(codes).toEqual([3, 0])
  })

  it('stops the running command and ends the response on abort', async () => {
    runner.run(['node -e "setInterval(() => {}, 1000)"'], res)
    await vi.waitFor(() => expect(res.chunks.join('')).toContain('Child process spawned'), { timeout: 5000 })

    runner.abort()

    expect(runner.isRunning()).toBe(false)
    expect(res.writableEnded).toBe(true)
  })

  it('aborts when the client disconnects early', async () => {
    runner.run(['node -e "setInterval(() => {}, 1000)"'], res)

    res.emit('close')

    expect(runner.aborted).toBe(true)
  })

  it('stops sending after the response fails to write', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    runner.res = {
      writableEnded: false,
      write: () => {
        throw new Error('socket closed')
      },
    }

    runner.send('stdout', { text: 'x' })

    expect(runner.aborted).toBe(true)
  })
})
