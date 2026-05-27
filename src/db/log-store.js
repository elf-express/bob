const fs = require('node:fs');
const path = require('node:path');

/**
 * 日誌資料存取層
 * 封裝 logs 目錄下 .log 檔案的所有 I/O
 * 未來可替換為 SQLite 或其他持久化方案
 */
class LogStore {
  /**
   * @param {string} logDir - 日誌目錄絕對路徑
   */
  constructor(logDir) {
    this.logDir = logDir;
  }

  /**
   * 確保日誌目錄存在
   */
  ensureDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 列出所有 .log 檔案名（降序，最新在前）
   * @param {number} [limit=100] - 最大返回數量
   * @returns {string[]} 檔名陣列
   *
   * 排序邏輯:**按檔名內的 timestamp 部分**,不依賴整體字典序。
   * 原因:前綴 ai-/agent- 會破壞「字典序 = 時間序」假設(g < i 導致 agent 一律排到 ai 之後)。
   * 提取 YYYY-MM-DD_HH-MM-SS(-mmm 可選)作為排序鍵,所有格式統一。
   * fallback 用整個 filename(舊檔或非標準命名仍能工作)。
   */
  listFileNames(limit = 100) {
    this.ensureDir();
    const tsRegex = /(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d{3})?)/;
    const tsKey = (f) => {
      const m = f.match(tsRegex);
      return m ? m[1] : f;
    };
    return fs
      .readdirSync(this.logDir)
      .filter((f) => f.endsWith('.log'))
      .sort((a, b) => tsKey(b).localeCompare(tsKey(a)))
      .slice(0, limit);
  }

  /**
   * 讀取日誌內容
   * @param {string} fileName - 檔名
   * @returns {string} 日誌文字內容
   */
  readLog(fileName) {
    const filePath = path.join(this.logDir, fileName);
    return fs.readFileSync(filePath, 'utf8');
  }

  /**
   * 取得日誌檔案的 stat 資訊
   * @param {string} fileName - 檔名
   * @returns {fs.Stats}
   */
  statLog(fileName) {
    const filePath = path.join(this.logDir, fileName);
    return fs.statSync(filePath);
  }

  /**
   * 日誌檔是否存在
   * @param {string} fileName - 檔名
   * @returns {boolean}
   */
  logExists(fileName) {
    return fs.existsSync(path.join(this.logDir, fileName));
  }

  /**
   * 建立日誌寫入串流（append 模式）
   * @param {string} fileName - 檔名
   * @returns {fs.WriteStream}
   */
  createWriteStream(fileName) {
    this.ensureDir();
    const filePath = path.join(this.logDir, fileName);
    return fs.createWriteStream(filePath, { flags: 'a' });
  }

  /**
   * 刪除指定日誌
   * @param {string} fileName - 檔名
   */
  deleteLog(fileName) {
    const filePath = path.join(this.logDir, fileName);
    fs.unlinkSync(filePath);
  }

  /**
   * 清除已過期的日誌檔案
   * @param {number} maxAgeMs - 最大保留時間（毫秒），預設 48 小時
   * @returns {number} 刪除的檔案數量
   */
  purgeExpired(maxAgeMs = 48 * 60 * 60 * 1000) {
    this.ensureDir();
    const now = Date.now();
    let count = 0;
    const files = fs.readdirSync(this.logDir).filter((f) => f.endsWith('.log'));
    for (const f of files) {
      try {
        const filePath = path.join(this.logDir, f);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          count++;
        }
      } catch (_e) {
        // 忽略單一檔案的錯誤，繼續處理其他
      }
    }
    return count;
  }

  /**
   * 清空所有日誌
   * @returns {number} 刪除的檔案數量
   */
  clearAll() {
    this.ensureDir();
    const files = fs.readdirSync(this.logDir).filter((f) => f.endsWith('.log'));
    for (const f of files) {
      fs.unlinkSync(path.join(this.logDir, f));
    }
    return files.length;
  }
}

module.exports = { LogStore };
