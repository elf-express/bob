const path = require('node:path');

/**
 * 驗證檔案名稱是否安全（防止路徑遍歷攻擊）
 * @param {string} name - 檔案名稱
 * @returns {boolean} - 是否安全
 */
function validateFileName(name) {
  if (!name || typeof name !== 'string') return false;
  // 長度限制（避免過長檔名導致檔案系統問題）
  if (name.length > 255) return false;
  // 過濾 null byte（可被用於截斷檔名）
  if (name.includes('\0')) return false;
  // 過濾路徑遍歷與目錄分隔符
  return !name.includes('..') && !name.includes('/') && !name.includes('\\');
}

/**
 * 判斷「相對路徑」是否不安全（防路徑遍歷)。relations / history / ai-annotate
 * 三個 route 共用,確保驗證一致。
 *
 * 與 validateFileName 不同:相對路徑允許 '/' 分隔,只禁止 '..' 「區段」、
 * 絕對路徑、開頭斜線、null byte。用 segment 比對而非子字串,避免誤殺
 * 合法檔名(例如 'config..backup.js' 含 '..' 但不是 traversal)。
 * @param {string} p - 相對路徑(呼叫端通常已 trim + 反斜線轉斜線)
 * @returns {boolean} - true 表示不安全,應拒絕
 */
function isUnsafeRelPath(p) {
  const s = String(p || '').trim().replace(/\\/g, '/');
  if (!s) return true;
  if (s.includes('\0')) return true;
  if (path.isAbsolute(s) || s.startsWith('/')) return true;
  return s.split('/').some((seg) => seg === '..');
}

module.exports = {
  validateFileName,
  isUnsafeRelPath,
};
