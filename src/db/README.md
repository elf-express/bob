# 資料庫說明（SQLite）
English version: `README.en.md`

BOB Tools 目前採用 DB-first 設計，資料庫位置如下：
- DB 檔案：`.bob-tools/data/bob-tools.sqlite`
- Migration 檔案：`.bob-tools/src/db/migrations/*.sql`
- Repository：`.bob-tools/src/db/repositories/*.js`

## 設計重點
- 設定、掃描快照、註解與標籤都存進 SQLite。
- UI 不再依賴 `bob.config.json` 或 `project-annotations.json`。
- 設定主體（groups/categories/commands）儲存在 `app_config`。

## 主要資料表
### `project_binding`
單列（`id = 1`）綁定目前 BOB Tools 對應的專案。
- `target_path`
- `bound_at`
- `updated_at`
- `allow_rebind`
- `package_manager_override`（可為 `NULL`，值可為 `npm|pnpm|yarn`）

### `scan_runs`
記錄每次掃描執行狀態。
- `scan_type`：`commands | tree | full`
- `status`：`running | success | failed`
- `started_at` / `finished_at` / `error_msg`

### `commands_snapshot`
保存最近一次 command 掃描快照（通常來自 root `package.json scripts`）。
- `scan_id`
- `script_name`
- `script_cmd`
- `source_file`
- `created_at`

### `tree_snapshot`
保存最近一次專案樹掃描快照。
- `scan_id`
- `rel_path`
- `name`
- `is_dir`
- `depth`
- `parent_path`
- `created_at`

### `file_tags`
檔案標籤。
- `rel_path`（unique）
- `tags_json`
- `updated_at`

### `file_annotations`
檔案註解與用途資訊。
- `rel_path`（unique）
- `annotation`
- `purpose`
- `relations`
- `user_note`
- `updated_at`

### `app_config`
儲存設定頁完整 config（groups/categories/commands），單列（`id = 1`）。
- `config_json`
- `updated_at`

## Migration 清單
- `001_init.sql`：建立 `project_binding`、`scan_runs`、`commands_snapshot`、`tree_snapshot`、`file_tags`
- `002_annotations.sql`：建立 `file_annotations`
- `003_app_config.sql`：建立 `app_config`
- `004_package_manager_override.sql`：保留遷移序號（內容為 no-op）

## 這次異動說明（重要）
本次新增 `project_binding.package_manager_override` 欄位，用於 package manager 覆寫策略（`effectivePm = override || detectedPm`）。

考量部分 SQLite 版本不支援 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`：
- `004_package_manager_override.sql` 不直接執行破壞相容性的 SQL。
- 由啟動流程在 runtime 檢查 schema，若缺欄位再執行：
  - `ALTER TABLE project_binding ADD COLUMN package_manager_override TEXT`

對應程式位置：`.bob-tools/src/server.js`（`ensureProjectBindingSchema`）。

## SQLite 系統表
下列表為 SQLite 內部維護，非業務資料表：
- `sqlite_sequence`
- `sqlite_stat1`
- `sqlite_stat4`
