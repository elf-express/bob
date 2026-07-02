#!/usr/bin/env node
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('./app.js');
const { findAvailablePort } = require('./utils/port.js');
const { SQLiteClient } = require('./db/sqlite-client.js');
const { BindingRepository } = require('./db/repositories/binding-repository.js');
const { ConfigRepository } = require('./db/repositories/config-repository.js');
const { buildDefaultConfig } = require('./config/default-taxonomy.js');

const DEFAULT_PORT = 3800;
const PROJECT_NAME = 'BOB-Tools';
const TOOL_DIR = path.resolve(__dirname, '..');
const LOG_DIR = path.join(TOOL_DIR, 'log');
const PUBLIC_DIR = path.join(TOOL_DIR, 'public');
const DB_FILE = path.join(TOOL_DIR, 'data', 'bob-tools.sqlite');
const MIGRATION_DIR = path.join(__dirname, 'db', 'migrations');
// BOB 已合進專案(scripts/tools/bob/),--target 與預設值改以 CWD 解析
// 這樣 `pnpm bob` 從專案根目錄執行時,--target . 永遠指到專案根目錄
const DEFAULT_TARGET_DIR = process.cwd();

function isToolPathOrInside(targetPath) {
  const resolved = path.resolve(String(targetPath || ''));
  const toolPath = path.resolve(TOOL_DIR);
  return resolved === toolPath || resolved.startsWith(`${toolPath}${path.sep}`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { target: null, rebind: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--target') out.target = args[i + 1] ? path.resolve(process.cwd(), args[i + 1]) : null;
    if (arg === '--rebind') out.rebind = true;
  }
  return out;
}

async function resolveBoundProject({ bindingRepo, cliTarget, rebind }) {
  const existing = await bindingRepo.getBinding();
  const badToolBinding = Boolean(existing && isToolPathOrInside(existing.target_path));

  if (cliTarget && isToolPathOrInside(cliTarget)) {
    throw new Error(`Invalid binding target: ${cliTarget}. Target cannot be .bob-tools or its subdirectories.`);
  }
  if (!existing) {
    if (!cliTarget) {
      throw new Error('No project binding found. Start with: npm run start:bind');
    }
    const binding = await bindingRepo.upsertBinding(
      cliTarget,
      1,
      existing?.package_manager_override || null
    );
    return binding.target_path;
  }

  if (badToolBinding) {
    const safeTarget = cliTarget || DEFAULT_TARGET_DIR;
    const binding = await bindingRepo.upsertBinding(
      safeTarget,
      1,
      existing?.package_manager_override || null
    );
    return binding.target_path;
  }

  if (cliTarget && cliTarget !== existing.target_path) {
    if (!rebind) {
      throw new Error(
        `Already bound to ${existing.target_path}. Use --rebind to change binding in development.`
      );
    }
    const binding = await bindingRepo.upsertBinding(
      cliTarget,
      1,
      existing?.package_manager_override || null
    );
    return binding.target_path;
  }

  return existing.target_path;
}

async function ensureConfigSeeded({ configRepo }) {
  const exists = await configRepo.exists();
  if (exists) return;
  const initial = buildDefaultConfig(PROJECT_NAME);
  await configRepo.upsertConfig(initial);
}

async function ensureProjectBindingSchema(db) {
  const columns = await db.all('PRAGMA table_info(project_binding)');
  const hasPmOverride = Array.isArray(columns)
    && columns.some((col) => String(col?.name || '').toLowerCase() === 'package_manager_override');
  if (!hasPmOverride) {
    await db.run('ALTER TABLE project_binding ADD COLUMN package_manager_override TEXT');
  }
}

async function ensureDependencyInventorySchema(db) {
  const tables = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dependency_inventory'"
  );
  if (!Array.isArray(tables) || tables.length === 0) return;

  const columns = await db.all('PRAGMA table_info(dependency_inventory)');
  const hasNoteText = Array.isArray(columns)
    && columns.some((col) => String(col?.name || '').toLowerCase() === 'note_text');
  if (!hasNoteText) {
    await db.run("ALTER TABLE dependency_inventory ADD COLUMN note_text TEXT NOT NULL DEFAULT ''");
  }
}

function cleanupNestedToolArtifacts() {
  const nestedToolDir = path.join(TOOL_DIR, '.bob-tools');
  if (!fs.existsSync(nestedToolDir)) return;

  const entries = fs.readdirSync(nestedToolDir, { withFileTypes: true });
  const safeToRemove = entries.length === 0 || entries.every((e) => e.isDirectory() && e.name === '__tests__');
  if (!safeToRemove) return;

  try {
    fs.rmSync(nestedToolDir, { recursive: true, force: true });
    console.warn(`[cleanup] Removed unexpected nested tool directory: ${nestedToolDir}`);
  } catch (error) {
    console.warn(`[cleanup] Failed to remove nested tool directory: ${error.message}`);
  }
}

(async () => {
  const cli = parseArgs(process.argv);
  cleanupNestedToolArtifacts();

  const sqlite = new SQLiteClient(DB_FILE);
  await sqlite.connect();
  await sqlite.runMigrations(MIGRATION_DIR);
  await ensureProjectBindingSchema(sqlite);
  await ensureDependencyInventorySchema(sqlite);
  const bindingRepo = new BindingRepository(sqlite);
  const configRepo = new ConfigRepository(sqlite);
  await ensureConfigSeeded({ configRepo });

  let projectDir;
  try {
    projectDir = await resolveBoundProject({
      bindingRepo,
      cliTarget: cli.target,
      rebind: cli.rebind,
    });
  } catch (error) {
    console.error(`Binding error: ${error.message}`);
    process.exit(1);
  }

  const app = await createApp({
    projectDir,
    projectName: PROJECT_NAME,
    logDir: LOG_DIR,
    publicDir: PUBLIC_DIR,
    db: sqlite,
    bindingRepo,
    configRepo,
  });

  const port = await findAvailablePort(DEFAULT_PORT);
  if (port === 0) {
    console.error(`No available port found in range ${DEFAULT_PORT}-${DEFAULT_PORT + 9}`);
    process.exit(1);
  }

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(
      [
        '='.repeat(50),
        'BOB Tools',
        `Bound Project: ${projectDir}`,
        `Package Manager: ${app.locals.packageManager || 'N/A'}`,
        `URL: http://127.0.0.1:${port}`,
        '='.repeat(50),
      ].join('\n')
    );
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use`);
    } else {
      console.error('Server start failed:', err.message);
    }
    process.exit(1);
  });
})();
