# BOB Tools - Development Build Assistant

Traditional Chinese version: `README.zh-tw.md`

BOB Tools is a local utility attached to one target project. It provides:

- Command management and execution (left menu + terminal output)
- Project file-tree scanning and browsing
- File tags and annotations
- Logs and configuration management

BOB Tools is now **DB-first (SQLite)**. Runtime no longer depends on `bob.config.json` or `project-annotations.json`.

---

## Quick Start

```bash
cd .bob-tools
npm install
```

First-time bind + start:

```bash
npm run start:bind
```

Normal start (after binding):

```bash
npm start
```

Default URL:

```text
http://127.0.0.1:3100
```

---

## Single-Project Binding Mode

BOB Tools uses single-project binding:

- First run must provide a target project (`start:bind` already includes `--target ..`)
- If already bound, starting with a different target is rejected
- In development, use `--rebind` to force rebind

Binding state is stored in table `project_binding`.

---

## Core Features

### 1) Command Scan and Execution

- Scans root `package.json` scripts of the target project
- Stored in `commands_snapshot`
- Re-scan overwrites old snapshot (not append)

### 2) Project File-Tree Scan

- Scans directory structure and builds tree snapshot
- Stored in `tree_snapshot`
- Re-scan overwrites old snapshot (not append)

### 2.1) Project Explorer Read-Only File System Policy

- Project Explorer is a **read + annotation + snapshot** workspace, not a file manager.
- Writing tool data is allowed (SQLite): tags, annotations, scan snapshots.
- Writing target project files is disabled in Project Explorer.
- Disabled APIs return:
  - `403`
  - `{ "success": false, "code": "FS_WRITE_DISABLED", "message": "File system write is disabled in project explorer." }`

### 3) Tags and Annotations

- `file_tags`: file tags
- `file_annotations`: annotation, purpose, relations, user note

### 4) Left Menu Configuration

- Menu data (groups/categories/commands) stored in `app_config`
- `/api/config` CRUD uses SQLite as primary source

### 5) Package Manager Override

- PM detection comes from bound project context
- Optional override is stored in `project_binding.package_manager_override`
- Runtime resolution rule:
  - `effectivePm = package_manager_override || detectedPm`
- Override APIs:
  - `GET /api/project/pm-override`
  - `PUT /api/project/pm-override`

---

## Database

- DB file: `.bob-tools/data/bob-tools.sqlite`
- Schema docs:
  - Chinese: `.bob-tools/src/db/README.md`
  - English: `.bob-tools/src/db/README.en.md`

Main business tables:

- `project_binding`
- `scan_runs`
- `commands_snapshot`
- `tree_snapshot`
- `file_tags`
- `file_annotations`
- `app_config`

Migration notes:

- `004_package_manager_override.sql` is a reserved no-op marker.
- Startup performs runtime schema backfill for `package_manager_override` when missing.

---

## Main APIs

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
- `GET /api/project/pm-override`
- `PUT /api/project/pm-override`
- `POST /api/scan/commands`
- `POST /api/scan/tree`
- `GET /api/scan/latest`
- `GET /api/files`
- `GET /api/files/tags`
- `POST /api/files/tags`
- `GET /api/files/metadata`
- `POST /api/files/annotate`
- `POST /api/files/create` (disabled, returns `403 FS_WRITE_DISABLED`)
- `POST /api/files/delete` (disabled, returns `403 FS_WRITE_DISABLED`)
- `POST /api/files/rename` (disabled, returns `403 FS_WRITE_DISABLED`)
- `GET /api/logs`
- `GET /api/logs/:name`
- `DELETE /api/logs/clear`
- `POST /api/run`
- `POST /api/abort`

---

## Tests

```bash
npm test
npm run test:watch
npm run test:coverage
```

---

## Design Principles

- Bind to one target project at a time
- Do not automatically rewrite target project `package.json`
- Keep tool runtime data in SQLite
- Use overwrite strategy for scan snapshots to avoid unbounded growth
- Keep Project Explorer file operations read-only against target project files
