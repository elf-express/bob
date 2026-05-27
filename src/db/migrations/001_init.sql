CREATE TABLE IF NOT EXISTS project_binding (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  target_path TEXT NOT NULL,
  bound_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  allow_rebind INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_type TEXT NOT NULL CHECK (scan_type IN ('commands', 'tree', 'full')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  error_msg TEXT
);

CREATE TABLE IF NOT EXISTS commands_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL,
  script_name TEXT NOT NULL,
  script_cmd TEXT NOT NULL,
  source_file TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (scan_id) REFERENCES scan_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tree_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL,
  rel_path TEXT NOT NULL,
  name TEXT NOT NULL,
  is_dir INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  parent_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (scan_id) REFERENCES scan_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS file_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rel_path TEXT NOT NULL UNIQUE,
  tags_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
