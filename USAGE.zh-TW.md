# BOB Tools 使用說明（快速版）

這個工具的定位可以直接理解成「附著式工具」：
- 它不自己產生專案內容，而是綁在一個既有專案上
- 它主要幫你「少打指令、少記語法、快速看懂專案」
- 它依賴目標專案的 `package.json scripts`、檔案結構、既有程式碼來運作

## 1. 先決條件

- 目標專案存在（例如本 monorepo 根目錄）
- `node` / `npm` 可用

```bash
cd .bob-tools
npm install
```

## 2. 第一次啟動（綁定目標專案）

```bash
npm run start:bind
```

`start:bind` 內建 `--target ..`，代表把 BOB Tools 綁到上層專案目錄。  
啟動後預設網址：

```text
http://127.0.0.1:3100
```

## 3. 一般啟動

綁定完成後直接：

```bash
npm start
```

## 4. 重新綁定（換專案）

若已綁定 A 專案，再用不同 target 啟動會被拒絕。  
開發情境要改綁定時，請用：

```bash
node src/server.js --target <新目標路徑> --rebind
```

## 5. 你會用到的主要能力

1. 指令掃描與執行
- 掃描目標專案根目錄 `package.json` 的 `scripts`
- 透過 UI/後端執行命令並即時看輸出（SSE）
- 執行紀錄寫入 `.bob-tools/log`

2. 專案檔案掃描與瀏覽
- 快速建立檔案樹快照（排除 `node_modules`、`.git` 等）
- 可搜尋檔名、統計檔案數

3. 檔案理解輔助（重點）
- 幫檔案加 `tag`（系統建議 + 自訂）
- 記錄 `annotation / purpose / relations / userNote`
- 目的就是減少人工記憶成本，讓新加入的人更快看懂專案

4. 設定管理
- 左側選單（groups/categories/commands）存在 SQLite
- 支援驗證、備份、還原、匯入/匯出

## 6. 資料存放位置

- DB：`.bob-tools/data/bob-tools.sqlite`
- Log：`.bob-tools/log/*.log`
- Config backup：`.bob-tools/log/config-backups/*.json`

注意：目前是 DB-first，執行期主要以 SQLite 為準，不依賴 `bob.config.json`。

## 7. 常用 API（給整合或除錯）

```text
GET    /api/project/status
POST   /api/project/bind
POST   /api/scan/commands
POST   /api/scan/tree
GET    /api/scan/latest
POST   /api/run
POST   /api/abort
GET    /api/files
GET    /api/files/search
GET    /api/files/metadata
POST   /api/files/annotate
GET    /api/config
PUT    /api/config
GET    /api/logs
GET    /api/logs/:name
```

## 8. 一句話總結

BOB Tools 不是取代開發者，而是附著在既有專案上，幫你把「指令操作」和「專案理解」流程化，降低人工輸入語法與口耳相傳的成本。
