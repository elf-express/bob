# BOB Tools — 變更紀錄

> BOB 自此屬於 team-project-template,所有變動在此記錄。
> 不再從上游 `bob-web-monorepo-framework` 同步,範本就是維護點。

---

## [Unreleased] — 2026-05-27

### 改

- **Sidebar 重構** — 整套 UI 簡化
  - 移除上方「Command Management」動態群組捷徑(`#dynamic-nav-groups`)
  - 移除 commands 主視圖(`<section data-view-content="commands">`)
  - 移除對應的 `renderDynamicNavigation()`、`renderCommands()` 函式(JS)
  - 移除對應的 `.command-*` / `.group-*` / `.category-*` / `.cmd-copy-btn` / `.categories-grid` CSS 規則
  - Sidebar 順序改為:**執行(原 Config)→ 終端機 → 結構 → 日誌 → 套件**
  - Config 改名為「執行」(`nav.config` i18n:Run / 執行 / 执行),icon 從 `settings` 改為 `play`
  - 預設首頁從 `commands` 改為 `config`(現名為「執行」)
  - 移除三語系 i18n 鍵:`nav.commands`、`nav.commandManagement`

### 加

- **Auto-scan on startup** — `app.js` 啟動時阻塞式跑 tree → commands → dependencies 三掃描,確保 UI 一打開就是新資料(不再是 fire-and-forget 競態)
- **新搬入工具** `scripts/find-unused-i18n.mjs` 已適配為 multi-target,可掃 BOB 自己的 locales(同層讀取 `i18n-check.config.mjs`)
- **背景 daemon 模式** — `pnpm bob:bg` / `bob:stop` / `bob:status`(`scripts/bob-daemon.mjs`)
  - 解放終端機:背景啟動後立即返回 prompt
  - PID file `.bob.pid` 管理程序生命週期
  - 輪詢 `/api/health` 確認 server ready 再返回
  - Windows `taskkill` fallback(`SIGTERM` 不支援時)
  - Daemon log 寫入 `scripts/tools/bob/log/daemon.log`,超過 5MB 自動 rotate

### 已知遺留

- **孤兒函式**:`runCommands()`(`modern-app.js` line ~877)已沒有呼叫者,可在下次 dead code sweep 清掉
- **孤兒 i18n keys**:本次重構讓 `commands.expandAll`、`commands.collapseAll`、`commands.execute`、`commands.emptyState`、`commands.emptyGroup`、`commands.invalidGroup`、`commands.commandCount`、`commands.selectAll`、`commands.deselectAll` 等 9 個 key 變成未引用(原由 `renderCommands` 或 HTML 引用)。下輪清理時可一併刪除
- **AI 描述功能**:右側 panel `用途` / `關聯` 欄位仍是空殼,缺 AI generator 後端
- **execution log 自動刷新**:跑完 script 後 BOB UI 的「執行紀錄」需手動 refresh,可加 file watcher 自動觸發

---

## 維護備忘

- BOB 內部 dev infra(`__tests__/`、`eslint.config.mjs`、`vitest.config.js`、自己的 `package.json`)已移除 — 全部用範本根 `package.json` 統管
- BOB 相依套件(`express`、`multer`、`sqlite3`)合進根 `devDependencies`
- BOB runtime 狀態(`data/`、`log/`)由根 `.gitignore` 排除
