const express = require('express');
const { upgradeConfigCommandsFromScripts } = require('../services/config-command-upgrader.js');

function createScanRouter({ commandScanService, packageManagerProvider, fileSystemService, scanRepo, configRepo }) {
  const router = express.Router();

  router.post('/commands', async (_req, res) => {
    const scanId = await scanRepo.startRun('commands');
    const startedAt = new Date().toISOString();
    try {
      if (packageManagerProvider && commandScanService?.setPackageManager) {
        commandScanService.setPackageManager(await packageManagerProvider());
      }
      const { sourceFile, scripts } = commandScanService.scanRootPackageScripts();
      await scanRepo.replaceCommandSnapshot(scanId, scripts, sourceFile);

      let configSync = { attempted: false, changed: false, updated: 0, deduped: 0 };
      if (configRepo?.getConfig && configRepo?.upsertConfig) {
        configSync.attempted = true;
        try {
          const currentConfig = await configRepo.getConfig();
          if (currentConfig) {
            const upgraded = upgradeConfigCommandsFromScripts(currentConfig, scripts);
            configSync = { attempted: true, ...upgraded };
            if (upgraded.changed) {
              await configRepo.upsertConfig(currentConfig);
            }
          }
        } catch (error) {
          configSync = {
            attempted: true,
            changed: false,
            updated: 0,
            deduped: 0,
            error: error.message,
          };
        }
      }

      await scanRepo.finishRunSuccess(scanId);
      return res.json({
        success: true,
        data: {
          scanId,
          scanType: 'commands',
          status: 'success',
          startedAt,
          finishedAt: new Date().toISOString(),
          sourceFile,
          count: scripts.length,
          scripts,
          configSync,
        },
      });
    } catch (error) {
      await scanRepo.finishRunFailed(scanId, error.message);
      return res.status(500).json({
        success: false,
        data: {
          scanId,
          scanType: 'commands',
          status: 'failed',
        },
        message: error.message,
      });
    }
  });

  router.post('/tree', async (_req, res) => {
    const scanId = await scanRepo.startRun('tree');
    const startedAt = new Date().toISOString();
    try {
      const nodes = await fileSystemService.scanTreeSnapshot();
      await scanRepo.replaceTreeSnapshot(scanId, nodes);
      await scanRepo.finishRunSuccess(scanId);
      return res.json({
        success: true,
        data: {
          scanId,
          scanType: 'tree',
          status: 'success',
          startedAt,
          finishedAt: new Date().toISOString(),
          count: nodes.length,
        },
      });
    } catch (error) {
      await scanRepo.finishRunFailed(scanId, error.message);
      return res.status(500).json({
        success: false,
        data: {
          scanId,
          scanType: 'tree',
          status: 'failed',
          startedAt,
        },
        message: error.message,
      });
    }
  });

  router.get('/latest', async (_req, res) => {
    try {
      const summary = await scanRepo.getLatestSummary();
      return res.json({ success: true, data: summary });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = { createScanRouter };
