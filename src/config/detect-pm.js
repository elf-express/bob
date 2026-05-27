const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * 檢查命令是否可用
 * @param {string} cmd - 命令名稱
 * @returns {boolean} - true 表示可用，false 表示不可用
 */
function isCommandAvailable(cmd) {
  try {
    if (process.platform === 'win32') {
      execSync(`where ${cmd}`, { stdio: 'ignore' });
    } else {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 自動檢測專案使用的包管理器
 * @param {string} projectDir - 專案根目錄路徑
 * @returns {string} - 包管理器名稱 ('pnpm' | 'npm' | 'yarn')
 */
function detectPackageManager(projectDir) {
  // 優先檢查 pnpm-workspace.yaml（monorepo 標誌，即使 lock 被刪也能識別）
  if (fs.existsSync(path.join(projectDir, 'pnpm-workspace.yaml'))) {
    if (isCommandAvailable('pnpm')) {
      return 'pnpm';
    }
  }

  // 根據 lock 文件檢測
  const managers = [
    { name: 'pnpm', lockFile: 'pnpm-lock.yaml' },
    { name: 'npm', lockFile: 'package-lock.json' },
    { name: 'yarn', lockFile: 'yarn.lock' },
  ];

  for (const manager of managers) {
    if (fs.existsSync(path.join(projectDir, manager.lockFile)) && isCommandAvailable(manager.name)) {
      return manager.name;
    }
  }

  // 回退到命令可用性檢測
  for (const manager of managers) {
    if (isCommandAvailable(manager.name)) {
      return manager.name;
    }
  }

  // 最終回退到 npm（通常總是可用）
  return 'npm';
}

module.exports = {
  detectPackageManager,
  isCommandAvailable,
};
