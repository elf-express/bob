const { execSync } = require('node:child_process');

/**
 * 殺死進程樹（包含子進程）
 * @param {number} pid - 進程 ID
 */
function killTree(pid) {
  try {
    if (process.platform === 'win32') {
      // Windows: 使用 taskkill 殺死進程樹
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      // Unix/Linux/macOS: 使用負 PID 殺死進程組
      process.kill(-pid, 'SIGKILL');
    }
  } catch (error) {
    // 忽略錯誤（進程可能已結束）
  }
}

module.exports = {
  killTree,
};
