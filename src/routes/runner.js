const express = require('express')
const { CommandRunner } = require('../services/command-runner.js')

/**
 * 從設定收集可執行的指令，鍵與值都是去除前後空白的指令字串；
 * 同時收錄原始字串與替換 {{PKG_MANAGER}} 後的字串
 * @param {Object|null} config - 設定（groups → categories → commands，或舊格式 categories）
 * @param {string} packageManager - 套件管理器名稱
 * @returns {Map<string, string>}
 */
function buildAllowedCommands(config, packageManager) {
  const allowed = new Map()
  const categories = []
  for (const group of config?.groups || []) {
    categories.push(...(group?.categories || []))
  }
  categories.push(...(config?.categories || []))

  for (const category of categories) {
    for (const command of category?.commands || []) {
      if (typeof command?.cmd !== 'string') continue
      const raw = command.cmd.trim()
      const resolved = command.cmd.replace(/\{\{PKG_MANAGER\}\}/g, packageManager).trim()
      if (raw) allowed.set(raw, raw)
      if (resolved) allowed.set(resolved, resolved)
    }
  }
  return allowed
}

/**
 * 建立命令執行路由
 * @param {Object} options
 * @param {string} options.projectDir
 * @param {string} options.logDir
 * @param {string} options.packageManager
 * @param {Function} [options.configProvider] - 取得目前設定
 * @returns {express.Router}
 */
function createRunnerRouter(options) {
  const router = express.Router()
  const { projectDir, logDir, packageManager, packageManagerProvider, configProvider } = options

  // 目前僅允許單一執行器在前景運作
  let activeRunner = null

  /**
   * POST /api/run
   * 只執行設定中存在的指令，使用 SSE 回傳命令執行輸出
   */
  router.post('/run', async (req, res) => {
    const requested = req.body?.commands

    if (!Array.isArray(requested) || requested.length === 0) {
      return res.status(400).json({ error: 'no commands' })
    }
    if (!requested.every((cmd) => typeof cmd === 'string')) {
      return res.status(400).json({ error: 'commands must be strings' })
    }

    let effectivePm = packageManager
    let allowed
    try {
      effectivePm = packageManagerProvider ? await packageManagerProvider() : packageManager
      const config = configProvider ? await configProvider() : null
      allowed = buildAllowedCommands(config, effectivePm)
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to resolve package manager' })
    }

    // 實際執行的是從設定取出的值，不是請求帶來的字串
    const commands = []
    for (const cmd of requested) {
      const configured = allowed.get(cmd.trim())
      if (configured === undefined) {
        return res.status(400).json({ error: 'command not in configuration' })
      }
      commands.push(configured)
    }

    const runner = new CommandRunner({
      projectDir,
      logDir,
      packageManager: effectivePm,
    })

    activeRunner = runner
    runner.run(commands, res)

    res.on('close', () => {
      if (activeRunner === runner) {
        activeRunner = null
      }
    })
  })

  /**
   * POST /api/abort
   * 中止目前執行中的命令
   */
  router.post('/abort', (req, res) => {
    if (!activeRunner || !activeRunner.isRunning()) {
      return res.json({ ok: false, msg: 'No running command to abort' })
    }

    activeRunner.abort()
    activeRunner = null
    return res.json({ ok: true })
  })

  return router
}

module.exports = { createRunnerRouter }
