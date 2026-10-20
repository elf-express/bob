const { spawn } = require('node:child_process')
const process = require('node:process')

const { LogStore } = require('../db/index.js')
const { countIssues, getLogTimestamp, getUserSlug, stripAnsi } = require('../utils/format.js')
const { killTree } = require('../utils/process.js')

// 執行中的 runner；關閉 bob 時逐一中止
const RUNNERS = new Set()

class CommandRunner {
  /**
   * @param {object} options - Runner options.
   * @param {string} options.projectDir - Project working directory.
   * @param {string} options.logDir - Log output directory.
   * @param {string} options.packageManager - Package manager name.
   */
  constructor(options) {
    this.projectDir = options.projectDir
    this.logDir = options.logDir
    this.logStore = new LogStore(options.logDir)
    this.packageManager = options.packageManager

    this.aborted = false
    this.currentChild = null
    this.logStream = null
    this.res = null
    this.errors = 0
    this.warnings = 0
    this.currentIndex = 0
    this.cmdStartTime = null
  }

  /**
   * Abort current execution.
   */
  abort() {
    if (this.aborted) return
    RUNNERS.delete(this)

    // 先送出 aborted：send() 看到 aborted 旗標就不再寫入
    this.send('aborted', { index: this.currentIndex })
    this.aborted = true

    if (this.currentChild) {
      killTree(this.currentChild.pid)
      this.currentChild = null
    }

    this.safeLogWrite('\n[ABORTED BY USER]\n')
    if (this.logStream && !this.logStream.destroyed && !this.logStream.writableEnded) {
      this.logStream.end()
    }

    try {
      if (this.res) this.res.end()
    } catch {
      // 連線可能已關閉，送出中止通知失敗時忽略
    }
  }

  /**
   * Execute command at current index and chain next one.
   * @param {string[]} commands - Commands to execute.
   * @param {string} logFileName - Current log file name.
   */
  executeNext(commands, logFileName) {
    if (this.aborted) return

    if (this.currentIndex >= commands.length) {
      this.safeLogWrite(
        `\n${'='.repeat(60)}\nWarnings: ${this.warnings}, Errors: ${this.errors}\n${'='.repeat(60)}\n`,
      )

      if (this.logStream && !this.logStream.destroyed && !this.logStream.writableEnded) {
        this.logStream.end()
      }

      this.send('done', {
        total: commands.length,
        logFile: logFileName,
        warnings: this.warnings,
        errors: this.errors,
      })

      RUNNERS.delete(this)
      this.res.end()
      return
    }

    const cmd = commands[this.currentIndex]
    const header = `\n[${this.currentIndex + 1}/${commands.length}] ${cmd}\n${'-'.repeat(50)}\n`

    this.safeLogWrite(header)
    process.stdout.write(header)
    this.send('cmd-start', {
      index: this.currentIndex,
      total: commands.length,
      cmd,
      header,
    })

    this.cmdStartTime = Date.now()

    const debugInfo = `[DEBUG] Spawning command in cwd: ${this.projectDir}\n[DEBUG] Command: ${cmd}\n`
    this.safeLogWrite(debugInfo)
    process.stdout.write(debugInfo)
    if (!this.aborted) this.send('stdout', { text: debugInfo })

    const child = spawn(cmd, {
      cwd: this.projectDir,
      shell: true,
      // POSIX：子程序自成 process group，killTree 的 kill(-pid) 才殺得到整棵樹
      detached: process.platform !== 'win32',
      stdio: 'pipe',
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    })

    this.currentChild = child

    child.on('spawn', () => {
      const spawnMsg = `[DEBUG] Child process spawned with PID: ${child.pid}\n`
      this.safeLogWrite(spawnMsg)
      process.stdout.write(spawnMsg)
      if (!this.aborted) this.send('stdout', { text: spawnMsg })
    })

    child.stdout.on('data', (data) => {
      const text = data.toString()
      process.stdout.write(text)
      this.safeLogWrite(text)

      const issues = countIssues(stripAnsi(text))
      this.errors += issues.errors
      this.warnings += issues.warnings

      if (!this.aborted) this.send('stdout', { text })
    })

    child.stderr.on('data', (data) => {
      const text = data.toString()
      process.stderr.write(text)
      this.safeLogWrite(text)

      const issues = countIssues(stripAnsi(text))
      this.errors += issues.errors
      this.warnings += issues.warnings

      if (!this.aborted) this.send('stderr', { text })
    })

    child.on('close', (code) => {
      this.currentChild = null

      let durationMs = 0
      if (this.cmdStartTime) {
        durationMs = Date.now() - this.cmdStartTime
        this.cmdStartTime = null
      }

      this.safeLogWrite(`\n[EXIT CODE: ${code}]\n[DURATION: ${durationMs}ms]\n`)

      if (!this.aborted) this.send('cmd-end', { index: this.currentIndex, code })
      this.currentIndex++
      this.executeNext(commands, logFileName)
    })

    child.on('error', (error) => {
      this.currentChild = null
      this.safeLogWrite(`[ERROR] ${error.message}\n`)
      if (!this.aborted) this.send('stderr', { text: `[ERROR] ${error.message}\n` })
      this.errors++
      this.currentIndex++
      this.executeNext(commands, logFileName)
    })
  }

  /**
   * @returns {boolean} Whether a command is currently running.
   */
  isRunning() {
    return !this.aborted && this.currentChild !== null
  }

  /**
   * Run a command batch.
   * @param {string[]} commands - Commands to execute.
   * @param {object} res - Express response object.
   * @returns {string} Created log file name.
   */
  run(commands, res) {
    this.res = res
    RUNNERS.add(this)
    this.aborted = false
    this.errors = 0
    this.warnings = 0
    this.currentIndex = 0

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    if (res.socket) {
      res.socket.setNoDelay(true)
      res.socket.setTimeout(0)
    }

    // log 命名:<timestamp>-<userSlug>.log
    //   timestamp 在前 → 字典序 = 時間序(BOB UI 列表自動正確排序)
    //   suffix 是執行者識別,讓人類掃描列表時一眼分辨「是誰跑的」
    //   userSlug 動態從 BOB_USER env / git config user.name 取,不寫死;
    //   詳見 utils/format.js getUserSlug() 的優先級規則
    const userSlug = getUserSlug(this.projectDir)
    const logFileName = `${getLogTimestamp()}-${userSlug}.log`
    this.logStream = this.logStore.createWriteStream(logFileName)

    this.safeLogWrite(
      `${'='.repeat(60)}\nCommand batch start: ${commands.length} command(s)\nStart: ${new Date().toLocaleString('zh-TW')}\nPackage manager: ${this.packageManager}\n${'='.repeat(60)}\n\n`,
    )

    res.on('close', () => {
      RUNNERS.delete(this)
      if (!res.writableFinished && !this.aborted) {
        this.abort()
      }
    })

    this.executeNext(commands, logFileName)
    return logFileName
  }

  /**
   * Safely write text to current log stream.
   * @param {string} text - Log text.
   */
  safeLogWrite(text) {
    if (this.logStream && !this.logStream.destroyed && !this.logStream.writableEnded) {
      this.logStream.write(text)
    }
  }

  /**
   * Send one SSE event.
   * @param {string} event - Event name.
   * @param {object} data - Event payload.
   */
  send(event, data) {
    if (this.aborted || !this.res || this.res.writableEnded) return

    try {
      const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      this.res.write(chunk)
    } catch (error) {
      console.error('send() error:', error.message)
      this.aborted = true
    }
  }
}

/**
 * 中止所有執行中的命令（關閉 bob 時用）
 * @returns {number} 中止的 runner 數
 */
function abortAllRunners() {
  const runners = [...RUNNERS]
  for (const runner of runners) runner.abort()
  return runners.length
}

module.exports = {
  CommandRunner,
  abortAllRunners,
}
