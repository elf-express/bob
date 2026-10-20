const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DB_RELATIVE = path.join('data', 'bob-tools.sqlite')

/**
 * 取得 bob 的資料根目錄：BOB_HOME 有值就用它，否則 ~/.bob
 * @param {NodeJS.ProcessEnv} [env] - 環境變數
 * @param {string} [homeDir] - 使用者家目錄
 * @returns {string} 資料根目錄（絕對路徑）
 */
function resolveBobHome(env = process.env, homeDir = os.homedir()) {
  const fromEnv = String(env.BOB_HOME || '').trim()
  return fromEnv ? path.resolve(fromEnv) : path.join(homeDir, '.bob')
}

/**
 * 新位置還沒有 DB、舊位置有時，把舊的 data/ 與 log/ 複製到新位置；舊檔保留，新位置已有的 log 不覆寫。
 * 新位置的 data/ 已存在（但沒有 DB）時不動它，直接丟錯
 * @param {{ legacyRoot: string, bobHome: string }} options - 舊資料根目錄與新資料根目錄
 * @returns {boolean} 是否有複製
 */
function copyLegacyData({ legacyRoot, bobHome }) {
  if (path.resolve(legacyRoot) === path.resolve(bobHome)) return false

  const dataDir = path.join(bobHome, 'data')
  const staging = path.join(bobHome, 'data.copying')
  // 上次複製中斷留下的暫存目錄一律丟掉
  fs.rmSync(staging, { recursive: true, force: true })

  if (fs.existsSync(path.join(bobHome, DB_RELATIVE))) return false
  if (!fs.existsSync(path.join(legacyRoot, DB_RELATIVE))) return false
  if (fs.existsSync(dataDir)) {
    throw new Error(
      `${dataDir} exists but has no bob-tools.sqlite. Move it away or set BOB_HOME to another directory; the old data is still in ${legacyRoot}.`,
    )
  }

  // data/ 先完整複製到暫存目錄再改名，中途失敗不會留下半份 DB
  fs.cpSync(path.join(legacyRoot, 'data'), staging, { recursive: true })
  fs.renameSync(staging, dataDir)

  const legacyLog = path.join(legacyRoot, 'log')
  if (fs.existsSync(legacyLog)) {
    fs.cpSync(legacyLog, path.join(bobHome, 'log'), { recursive: true, force: false })
  }
  return true
}

module.exports = {
  resolveBobHome,
  copyLegacyData,
}
