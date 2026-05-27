const fs = require('node:fs');
const path = require('node:path');

class SQLiteClient {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async connect() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let sqlite3;
    try {
      // Lazy require to avoid breaking non-sqlite test paths before dependency installation.
      sqlite3 = require('sqlite3');
    } catch (error) {
      throw new Error(
        'sqlite3 is not installed. Run `pnpm install` at project root to install all tooling dependencies.'
      );
    }

    this.db = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) return reject(err);
        resolve(db);
      });
    });

    await this.run('PRAGMA foreign_keys = ON');
  }

  async close() {
    if (!this.db) return;
    await new Promise((resolve, reject) => {
      this.db.close((err) => (err ? reject(err) : resolve()));
    });
    this.db = null;
  }

  async run(sql, params = []) {
    return await new Promise((resolve, reject) => {
      this.db.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async get(sql, params = []) {
    return await new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  async all(sql, params = []) {
    return await new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  async transaction(work) {
    await this.run('BEGIN');
    try {
      const result = await work(this);
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  async runMigrations(migrationDir) {
    const files = fs
      .readdirSync(migrationDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      if (!sql.trim()) continue;
      try {
        await this.execScript(sql);
      } catch (err) {
        // Idempotency fallback:既有 column/index/table 重跑時容忍,避免
        // 「重啟 BOB 因 migration 跑第二次而 crash」。SQLite 沒有
        // ALTER TABLE ADD COLUMN IF NOT EXISTS,所以無法在 SQL 層 idempotent。
        // 長期解法是加 schema_migrations 表追蹤已跑(follow-up)。
        const msg = String(err && err.message || '');
        if (/duplicate column name|already exists/i.test(msg)) {
          console.warn(`[migration] ${file} idempotent skip: ${msg}`);
          continue;
        }
        throw err;
      }
    }
  }

  async execScript(script) {
    return await new Promise((resolve, reject) => {
      this.db.exec(script, (err) => (err ? reject(err) : resolve()));
    });
  }
}

module.exports = { SQLiteClient };
