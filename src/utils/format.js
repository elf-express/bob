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

module.exports = {
  stripAnsi,
  countIssues,
  getLogTimestamp,
};
