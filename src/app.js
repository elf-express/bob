const express = require('express');
const path = require('path');
const { detectPackageManager } = require('./config/index.js');
const { LogStore } = require('./db/index.js');
const { DependencyRepository } = require('./db/repositories/dependency-repository.js');
const { ScanRepository } = require('./db/repositories/scan-repository.js');
const { setupRoutes } = require('./routes/index.js');
const { DependencyScanService } = require('./services/dependency-scan-service.js');
const { CommandScanService } = require('./services/command-scan-service.js');
const { FileSystemService } = require('./services/file-system.js');

async function createApp(options) {
  const {
    projectDir,
    projectName,
    logDir,
    publicDir,
    db,
    bindingRepo,
    configRepo,
  } = options;

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader('Content-Encoding', 'identity');
    next();
  });

  app.use(
    express.static(publicDir, {
      etag: false,
      lastModified: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
      },
    })
  );

  const backupDir = path.join(logDir, 'config-backups');
  const detectedPackageManager = detectPackageManager(projectDir);

  const packageManagerProvider = async () => {
    const binding = bindingRepo ? await bindingRepo.getBinding() : null;
    const override = binding?.package_manager_override || null;
    return override || detectedPackageManager;
  };

  const configProvider = async () => {
    let stored = null;
    if (configRepo) stored = await configRepo.getConfig();
    if (!stored) stored = { projectName, groups: [] };
    return { ...stored, projectDir };
  };

  const initialConfig = await configProvider();

  setupRoutes(app, {
    config: initialConfig,
    packageManager: detectedPackageManager,
    packageManagerProvider,
    logDir,
    backupDir,
    db,
    bindingRepo,
    configRepo,
    configProvider,
    projectDir,
  });

  app.locals.packageManager = await packageManagerProvider();

  if (db) {
    // 範本場景:pnpm bob 啟動時阻塞式完成 tree + commands + dependencies 三掃描,
    // 確保 UI 一打開就是新資料(避免 fire-and-forget 的競態:server 已 listen 但
    // scan 還沒完,使用者看到舊快照)
    // 順序:tree 先(UI 首屏)→ commands(分類頁)→ dependencies(較慢放最後)
    console.log('[startup] running initial scans...');

    // --- tree scan(優先,UI 首屏要顯示) ---
    try {
      const scanRepo = new ScanRepository(db);
      const fileSystemService = new FileSystemService(projectDir, db);
      const scanId = await scanRepo.startRun('tree');
      try {
        const nodes = await fileSystemService.scanTreeSnapshot();
        await scanRepo.replaceTreeSnapshot(scanId, nodes);
        await scanRepo.finishRunSuccess(scanId);
        console.log(`[tree] startup scan: ${nodes.length} entries`);
      } catch (innerError) {
        await scanRepo.finishRunFailed(scanId, innerError.message);
        throw innerError;
      }
    } catch (error) {
      console.warn(`[tree] startup scan failed: ${error.message}`);
    }

    // --- commands scan(package.json scripts) ---
    try {
      const scanRepo = new ScanRepository(db);
      const pm = await packageManagerProvider();
      const commandScanService = new CommandScanService(projectDir, pm);
      const scanId = await scanRepo.startRun('commands');
      try {
        const { sourceFile, scripts } = commandScanService.scanRootPackageScripts();
        await scanRepo.replaceCommandSnapshot(scanId, scripts, sourceFile);
        await scanRepo.finishRunSuccess(scanId);
        console.log(`[commands] startup scan: ${scripts.length} scripts (${sourceFile})`);
      } catch (innerError) {
        await scanRepo.finishRunFailed(scanId, innerError.message);
        throw innerError;
      }
    } catch (error) {
      console.warn(`[commands] startup scan failed: ${error.message}`);
    }

    // --- dependency scan(較慢的放最後,失敗不影響前兩個) ---
    try {
      const dependencyRepo = new DependencyRepository(db);
      const dependencyScanService = new DependencyScanService(projectDir, packageManagerProvider);
      const items = await dependencyScanService.scan();
      await dependencyRepo.upsertBatch(items, new Date().toISOString());
      console.log(`[dependencies] startup scan: ${items.length} packages`);
    } catch (error) {
      console.warn(`[dependencies] startup scan failed: ${error.message}`);
    }

    console.log('[startup] initial scans complete');
  }

  const logStore = new LogStore(logDir);
  const LOG_MAX_AGE_MS = 48 * 60 * 60 * 1000;
  const LOG_PURGE_INTERVAL_MS = 60 * 60 * 1000;

  const purged = logStore.purgeExpired(LOG_MAX_AGE_MS);
  if (purged > 0) {
    console.log(`Purged ${purged} old logs (>48h)`);
  }

  const purgeTimer = setInterval(() => {
    try {
      const n = logStore.purgeExpired(LOG_MAX_AGE_MS);
      if (n > 0) console.log(`Auto purged ${n} expired logs`);
    } catch (_e) {}
  }, LOG_PURGE_INTERVAL_MS);
  purgeTimer.unref();

  return app;
}

module.exports = { createApp };
