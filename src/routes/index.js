const { createApiRouter } = require('./api.js');
const { createLogsRouter } = require('./logs.js');
const { createRunnerRouter } = require('./runner.js');
const { createConfigRouter } = require('./config.js');
const { createFilesRouter } = require('./files.js');
const { createHistoryRouter } = require('./history.js');
const { createAiAnnotateRouter } = require('./ai-annotate.js');
const { createProjectRouter } = require('./project.js');
const { createScanRouter } = require('./scan.js');
const { createDependenciesRouter } = require('./dependencies.js');
const { FileSystemService } = require('../services/file-system.js');
const { CommandScanService } = require('../services/command-scan-service.js');
const { DependencyScanService } = require('../services/dependency-scan-service.js');
const { ScanRepository } = require('../db/repositories/scan-repository.js');
const { DependencyRepository } = require('../db/repositories/dependency-repository.js');
const { AnnotationRepository } = require('../db/repositories/annotation-repository.js');

/**
 * 創建並掛載所有路由
 * @param {express.Application} app - Express 應用實例
 * @param {Object} options - 配置選項
 * @param {Object} options.config - 應用配置（新結構：groups → categories → commands）
 * @param {string} options.packageManager - 包管理器名稱
 * @param {string} options.logDir - 日誌目錄
 * @param {string} options.backupDir - 備份目錄路徑
 */
function setupRoutes(app, options) {
  const {
    config,
    packageManager,
    packageManagerProvider,
    logDir,
    backupDir,
    db,
    bindingRepo,
    configRepo,
    configProvider,
    projectDir,
  } = options;

  // 資料 API 路由
  const apiRouter = createApiRouter({
    config,
    packageManager,
    packageManagerProvider,
    configProvider,
  });
  app.use('/api', apiRouter);

  // 命令執行路由
  const runnerRouter = createRunnerRouter({
    projectDir,
    logDir,
    packageManager,
    packageManagerProvider,
  });
  app.use('/api', runnerRouter);

  // 日誌管理路由
  const logsRouter = createLogsRouter({
    logDir,
  });
  app.use('/api', logsRouter);

  // 配置管理路由
  const configRouter = createConfigRouter({
    backupDir,
    db,
    configRepo,
  });
  app.use('/api/config', configRouter);

  // 文件管理路由
  const filesRouter = createFilesRouter({
    projectDir,
    db,
  });
  app.use('/api/files', filesRouter);

  // 文件歷史路由
  const historyRouter = createHistoryRouter({
    projectDir,
  });
  app.use('/api/files', historyRouter);

  // AI Annotation 路由
  const annotationRepo = db ? new AnnotationRepository(db) : null;
  const aiAnnotateRouter = createAiAnnotateRouter({
    projectDir,
    annotationRepo,
  });
  app.use('/api/files', aiAnnotateRouter);

  if (db && bindingRepo) {
    const projectRouter = createProjectRouter({ bindingRepo, packageManagerProvider });
    app.use('/api/project', projectRouter);

    const scanRepo = new ScanRepository(db);
    const scanRouter = createScanRouter({
      commandScanService: new CommandScanService(projectDir, packageManager),
      packageManagerProvider,
      fileSystemService: new FileSystemService(projectDir, db),
      scanRepo,
      configRepo,
    });
    app.use('/api/scan', scanRouter);

    const dependencyRepo = new DependencyRepository(db);
    const dependenciesRouter = createDependenciesRouter({
      dependencyRepo,
      dependencyScanService: new DependencyScanService(projectDir, packageManagerProvider),
    });
    app.use('/api/dependencies', dependenciesRouter);
  }
}

module.exports = {
  setupRoutes,
  createApiRouter,
  createLogsRouter,
  createRunnerRouter,
  createConfigRouter,
  createFilesRouter,
  createProjectRouter,
  createScanRouter,
  createDependenciesRouter,
};
