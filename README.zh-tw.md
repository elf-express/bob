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
