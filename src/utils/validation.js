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

module.exports = {
  validateFileName,
};
