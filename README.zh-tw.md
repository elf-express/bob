# BOB Tools - 開發構建助手

English version: `README.md`

BOB Tools 是附著在單一目標專案上的本地工具，主要提供：

- 指令管理與執行（左側選單 + 終端輸出）
- 專案檔案樹掃描與瀏覽
- 檔案標籤與註解
- 日誌與設定管理

BOB Tools 已改為 **DB-first（SQLite）**，執行期不再依賴 `bob.config.json` 或 `project-annotations.json`。

---

## 快速開始

```bash
cd .bob-tools
npm install
```

首次綁定並啟動：

```bash
npm run start:bind
```

已綁定後一般啟動：

```bash
npm start
```

預設網址：

```text
http://127.0.0.1:3100
```

---

## 從 GitHub Packages 安裝

`@elf-express/bob` 發佈在 GitHub Packages。套件即使是公開的，安裝也需要 GitHub 認證。

1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** 建立 token，scope 只勾 `read:packages`（GitHub Packages 只接受 classic token）。
2. 把 token 存成使用者環境變數 `NODE_AUTH_TOKEN`，設定後重開終端機（PowerShell）：

   ```powershell
   [Environment]::SetEnvironmentVariable('NODE_AUTH_TOKEN', '<你的 token>', 'User')
   ```

3. 在 `~/.npmrc`（Windows：`%USERPROFILE%\.npmrc`）加入下面兩行，token 留給環境變數，不要寫實際值：

   ```ini
   @elf-express:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```

4. 安裝，並在目標專案根目錄第一次綁定啟動：

   ```bash
   npm i -g @elf-express/bob
   cd <目標專案>
   bob --target .
   ```

---

## 單專案綁定模式

BOB Tools 採單專案綁定：

- 第一次啟動必須提供目標專案（`start:bind` 已內含 `--target ..`）
- 若已綁定，改用不同 target 啟動會被拒絕
- 開發期可用 `--rebind` 強制重綁

綁定狀態儲存在 `project_binding` 資料表。

---

## 核心功能

### 1) 指令掃描與執行

- 掃描目標專案根目錄 `package.json` 的 `scripts`
- 寫入 `commands_snapshot`
- 重掃時覆蓋舊快照（不累加）

### 2) 專案檔案樹掃描

- 掃描目錄結構並建立樹快照
- 寫入 `tree_snapshot`
- 重掃時覆蓋舊快照（不累加）

### 3) 標籤與註解

- `file_tags`：檔案標籤
- `file_annotations`：註解、用途、關聯、使用者備註

### 4) 左側選單設定

- 選單資料（groups/categories/commands）儲存在 `app_config`
- `/api/config` 的 CRUD 以 SQLite 為主資料來源

---

## 資料庫

- DB 檔案：`.bob-tools/data/bob-tools.sqlite`
- Schema 說明：
  - 中文：`.bob-tools/src/db/README.md`
  - English：`.bob-tools/src/db/README.en.md`

主要業務資料表：

- `project_binding`
- `scan_runs`
- `commands_snapshot`
- `tree_snapshot`
- `file_tags`
- `file_annotations`
- `app_config`

---

## 主要 API

- `GET /api/data`
- `GET /api/config`
- `PUT /api/config`
- `POST /api/config/validate`
- `GET /api/config/backups`
- `POST /api/config/restore/:name`
- `GET /api/config/export`
- `POST /api/config/import`
- `GET /api/project/status`
- `POST /api/project/bind`
- `POST /api/scan/commands`
- `POST /api/scan/tree`
- `GET /api/scan/latest`
- `GET /api/files`
- `GET /api/files/tags`
- `POST /api/files/tags`
- `GET /api/files/metadata`
- `POST /api/files/annotate`
- `POST /api/files/create`
- `POST /api/files/delete`
- `POST /api/files/rename`
- `GET /api/logs`
- `GET /api/logs/:name`
- `DELETE /api/logs/clear`
- `POST /api/run`
- `POST /api/abort`

---

## 測試

```bash
npm test
npm run test:watch
npm run test:coverage
```

---

## 設計原則

- 一次只綁定一個目標專案
- 不自動回寫目標專案的 `package.json`
- 工具執行資料集中在 SQLite
- 掃描快照使用覆蓋策略，避免資料無限制膨脹

---

## 發版步驟

分支怎麼走見 `BRANCHING.md`，版號與 tag 的規則見 elf-cicd-versioning；這裡只寫 bob 專屬的部分。

- 套件：`@elf-express/bob`，由 `.github/workflows/release.yml`（Actions 名稱 Release）發佈到 GitHub Packages。
- 版號：只用 `pnpm version:patch`／`version:minor`／`version:major` 改，`pnpm version:show` 查目前版號。
- 發版後驗收：該 tag 的 Release run 裡 `verify`、`publish` 都成功；套件頁出現新版本；本機 `npm i -g @elf-express/bob@<版號>` 後 `bob` 能啟動。
- 重建既有 tag：Actions → Release → Run workflow，輸入 `vX.Y.Z`；已發佈的版本會跳過發佈，run 仍為成功。
