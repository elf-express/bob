# Database Schema (SQLite)

Traditional Chinese version: `README.md`

This folder contains the SQLite database layer for BOB Tools.

- DB file location: `.bob-tools/data/bob-tools.sqlite`
- Migration files: `.bob-tools/src/db/migrations/*.sql`
- Repository files: `.bob-tools/src/db/repositories/*.js`

## Purpose

BOB Tools is DB-first:

- Project binding state
- Scanned command snapshots
- Scanned tree snapshots
- File tags
- File annotations / metadata
- UI config (left menu groups/categories/commands)

Runtime no longer depends on `project-annotations.json` or `bob.config.json`.

## Business Tables

### `project_binding`

Single-row table (`id = 1`) to lock BOB Tools to one target project.

- `target_path`: bound project absolute path
- `bound_at`, `updated_at`
- `allow_rebind`
- `package_manager_override`: nullable override (`npm | pnpm | yarn`)

This override participates in runtime PM resolution:
- `effectivePm = package_manager_override || detectedPm`

### `scan_runs`

Scan execution history and status.

- `scan_type`: `commands | tree | full`
- `status`: `running | success | failed`
- `started_at`, `finished_at`, `error_msg`

### `commands_snapshot`

Latest scanned scripts from target project root `package.json`.

- `scan_id`
- `script_name`, `script_cmd`
- `source_file`, `created_at`

Current behavior: overwrite snapshot on each commands scan.

### `tree_snapshot`

Latest scanned tree nodes from target project.

- `scan_id`
- `rel_path`, `name`
- `is_dir`, `depth`, `parent_path`
- `created_at`

Current behavior: overwrite snapshot on each tree scan.

### `file_tags`

Custom tags by file path.

- `rel_path` (unique)
- `tags_json` (JSON array string)
- `updated_at`

### `file_annotations`

Annotation metadata by file path.

- `rel_path` (unique)
- `annotation`
- `purpose`
- `relations`
- `user_note`
- `updated_at`

### `app_config`

Left-side menu config (groups/categories/commands), single row (`id = 1`).

- `config_json`
- `updated_at`

## SQLite System Tables

You may also see:

- `sqlite_sequence`
- `sqlite_stat1`
- `sqlite_stat4`

These are internal SQLite tables, not business tables.

## Migrations

Current migrations:

- `001_init.sql`: binding, scan, commands/tree snapshots, tags
- `002_annotations.sql`: `file_annotations`
- `003_app_config.sql`: `app_config`
- `004_package_manager_override.sql`: reserved migration slot (no-op content)

## Recent Change Notes

`project_binding.package_manager_override` was added for package manager override support.

For SQLite compatibility (older versions may not support `ADD COLUMN IF NOT EXISTS`):
- `004_package_manager_override.sql` is kept as a no-op migration marker.
- Runtime startup checks schema and backfills column when missing:
  - `ALTER TABLE project_binding ADD COLUMN package_manager_override TEXT`

Implementation entry point:
- `.bob-tools/src/server.js` (`ensureProjectBindingSchema`)
