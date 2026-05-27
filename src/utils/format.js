/**
 * 移除 ANSI 顏色碼
 * @param {string} text - 原始文本
 * @returns {string} - 移除顏色碼後的文本
 */
function stripAnsi(text) {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

/**
 * 統計錯誤和警告數量
 * @param {string} text - 日誌文本
 * @returns {{errors: number, warnings: number}} - 錯誤和警告計數
 */
function countIssues(text) {
  let errors = 0;
  let warnings = 0;

  for (const line of text.split('\n')) {
    if (/\d+:\d+\s+error\b/.test(line) || /\berror TS\d+/.test(line)) {
      errors++;
    } else if (/\d+:\d+\s+warn/.test(line) || /\[warn\]/.test(line)) {
      warnings++;
    }
  }

  return { errors, warnings };
}

/**
 * 生成日誌時間戳（格式：YYYY-MM-DD_HH-mm-ss）
 * @param {Date} [date=new Date()] - 指定日期時間，預設為當前時間
 * @returns {string} - 時間戳字串
 */
function getLogTimestamp(date = new Date()) {
  const d = date;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * 將任意字串清理成 filename-safe slug
 * - 保留 UTF-8 字元(現代 fs 支援,中文姓名可直接放)
 * - 空白 → 底線
 * - 移除路徑分隔符與 Windows 保留字元: / \ : * ? " < > | + 控制字元
 * - trim 前後底線
 * - 超長截斷(避免 fs 名稱長度限制)
 * @param {string} input
 * @param {number} [maxLen=40]
 * @returns {string} - filename-safe slug,可能為空字串
 */
function toFileSlug(input, maxLen = 40) {
  if (input == null) return '';
  let s = String(input).trim();
  // 空白統一為底線
  s = s.replaceAll(/\s+/g, '_');
  // 移除 filename 不允許的字元(路徑分隔符、Windows 保留、控制字元、null byte)
  s = s.replaceAll(/[/\\:*?"<>|\0\x00-\x1F]/g, '');
  // trim 開頭/結尾的點與底線(避免 `.hiddenfile` 或 `_name`)
  s = s.replaceAll(/^[._-]+|[._-]+$/g, '');
  // 截斷
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/**
 * 解析「人類使用者」的識別 slug,用於 BOB log 檔名 suffix
 *
 * 優先順序:
 *   1. process.env.BOB_USER          (使用者啟動時明確指定)
 *   2. git config user.name           (從 projectDir 取,sanitize)
 *   3. 'human'                        (fallback)
 *
 * **設計核心:不寫死**。每個 clone 範本的人會自動取得自己的識別。
 * 想覆寫:啟動 BOB 時設 BOB_USER,例如:`BOB_USER=TW199501 pnpm bob`
 *
 * @param {string} projectDir - 專案根目錄(取 git config 用)
 * @returns {string} - filename-safe slug,保證非空
 */
function getUserSlug(projectDir) {
  // 1. 環境變數最高優先
  const envUser = toFileSlug(process.env.BOB_USER);
  if (envUser) return envUser;

  // 2. git config user.name
  try {
    const { execFileSync } = require('node:child_process');
    const raw = execFileSync('git', ['config', 'user.name'], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const gitUser = toFileSlug(raw);
    if (gitUser) return gitUser;
  } catch {
    // git not installed / not a repo / config 未設 → 走 fallback
  }

  // 3. fallback
  return 'human';
}

module.exports = {
  stripAnsi,
  countIssues,
  getLogTimestamp,
  toFileSlug,
  getUserSlug,
};
