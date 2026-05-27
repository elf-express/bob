CREATE TABLE IF NOT EXISTS dependency_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('runtime', 'dependencies', 'devDependencies')),
  declared_version TEXT,
  installed_version TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL,
  desc_key TEXT,
  desc_fallback TEXT,
  desc_mode TEXT NOT NULL DEFAULT 'auto' CHECK(desc_mode IN ('auto', 'manual')),
  manual_desc TEXT,
  note_text TEXT NOT NULL DEFAULT '',
  UNIQUE(name, scope)
);
