import { EventEmitter, once } from 'node:events'
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

// 寫下自身 PID、stdin 收到 EOF 就結束，最長存活 30 秒；shell 被殺時孫程序也會跟著結束
const LONG_RUNNING =
  "node -e \"require('fs').writeFileSync('grandchild.pid', String(process.pid)); " +
  "process.stdin.on('end', () => process.exit()).resume(); setTimeout(() => process.exit(), 30000)\""

async function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  try {
    await Promise.race([promise.catch(() => {}), timeout])
  } finally {
    clearTimeout(timer)
  }
}

function waitForLogClose(runner) {
  const stream = runner.logStream
  if (!stream || stream.closed) return Promise.resolve()
  const closed = once(stream, 'close')
  if (!stream.writableEnded) stream.end()
  return withTimeout(closed, 2000)
}

async function stopChild(child) {
  child.stdin.destroy()
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGKILL')
  await withTimeout(exited, 3000)
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

async function stopGrandchild(pidFile) {
  if (!fs.existsSync(pidFile)) return
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  if (!pid) return
  try {
    await vi.waitFor(() => expect(isAlive(pid)).toBe(false), { timeout: 3000 })
  } catch {
    process.kill(pid, 'SIGKILL')
  }
}

describe('CommandRunner', () => {
  let dir
  let runner
  let res
  let children

  function run(commands) {
    const logFile = runner.run(commands, res)
    children.push(runner.currentChild)
    return logFile
  }

  beforeEach(() => {
    children = []
    vi.stubEnv('BOB_USER', 'tester')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-runner-'))
    runner = new CommandRunner({ projectDir: dir, logDir: path.join(dir, 'log'), packageManager: 'pnpm' })
    res = createFakeRes()
  })

  afterEach(async () => {
    try {
      children.push(runner.currentChild)
      runner.abort()
      await Promise.all(children.filter(Boolean).map(stopChild))
      await stopGrandchild(path.join(dir, 'grandchild.pid'))
      await waitForLogClose(runner)
    } finally {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('sets server-sent event headers', async () => {
    const finished = new Promise((resolve) => res.once('finish', resolve))

    run(['node -e "0"'])

    await finished
    expect(res.headers).toMatchObject({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  })

  it('names the log after the timestamp and user slug', async () => {
    const finished = new Promise((resolve) => res.once('finish', resolve))

    const logFile = run(['node -e "0"'])

    await finished
    expect(logFile).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-tester\.log$/)
  })

  it('counts issues in the output and reports them when done', async () => {
    const finished = new Promise((resolve) => res.once('finish', resolve))

    const logFile = run(['node -e "console.log(\'  1:1  error  no-undef\')"'])

    await finished
    expect(parseEvents(res).at(-1)).toEqual({
      event: 'done',
      data: { total: 1, logFile, warnings: 0, errors: 1 },
    })
  })

  it('continues with the next command after a failure', async () => {
    const finished = new Promise((resolve) => res.once('finish', resolve))

    run(['node -e "process.exit(3)"', 'node -e "0"'])

    await finished
    const codes = parseEvents(res)
      .filter((e) => e.event === 'cmd-end')
      .map((e) => e.data.code)
    expect(codes).toEqual([3, 0])
  })

  it('stops the running command and ends the response on abort', async () => {
    run([LONG_RUNNING])
    await vi.waitFor(() => expect(res.chunks.join('')).toContain('Child process spawned'), { timeout: 5000 })

    runner.abort()

    expect(runner.isRunning()).toBe(false)
    expect(res.writableEnded).toBe(true)
  })

  it('aborts when the client disconnects early', async () => {
    run([LONG_RUNNING])

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
