const express = require('express');
const { CommandRunner } = require('../services/command-runner.js');

/**
 * 建立命令執行路由
 * @param {Object} options
 * @param {string} options.projectDir
 * @param {string} options.logDir
 * @param {string} options.packageManager
 * @returns {express.Router}
 */
function createRunnerRouter(options) {
  const router = express.Router();
  const { projectDir, logDir, packageManager, packageManagerProvider } = options;

  // 目前僅允許單一執行器在前景運作
  let activeRunner = null;

  /**
   * POST /api/run
   * 使用 SSE 回傳命令執行輸出
   */
  router.post('/run', async (req, res) => {
    const commands = req.body?.commands || [];

    if (!commands.length) {
      return res.status(400).json({ error: 'no commands' });
    }

    let effectivePm = packageManager;
    try {
      effectivePm = packageManagerProvider ? await packageManagerProvider() : packageManager;
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to resolve package manager' });
    }

    const runner = new CommandRunner({
      projectDir,
      logDir,
      packageManager: effectivePm,
    });

    activeRunner = runner;
    runner.run(commands, res);

    res.on('close', () => {
      if (activeRunner === runner) {
        activeRunner = null;
      }
    });
  });

  /**
   * POST /api/abort
   * 中止目前執行中的命令
   */
  router.post('/abort', (req, res) => {
    if (!activeRunner || !activeRunner.isRunning()) {
      return res.json({ ok: false, msg: 'No running command to abort' });
    }

    activeRunner.abort();
    activeRunner = null;
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { createRunnerRouter };
