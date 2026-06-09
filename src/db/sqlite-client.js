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
    // schema_migrations 追蹤「哪些 .sql 已套用」— 取代「每次重跑全部 + try/catch
    // 容忍 duplicate」的舊作法。新作法下每個 migration 只跑一次,genuine 錯誤
    // 會直接 throw(不再被 'already exists' 字串靜默吞掉)。
    await this.execScript(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`
    );
    const appliedRows = await this.all('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRows.map((r) => r.filename));

    const files = fs
      .readdirSync(migrationDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue; // 已套用 → 不重跑
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      if (!sql.trim()) continue;
      try {
        await this.execScript(sql);
        await this.run(
          'INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)',
          [file, new Date().toISOString()]
        );
      } catch (err) {
        // 一次性過渡:DB 在引入 schema_migrations 之前就跑過 001-00N(舊 BOB),
        // 那些 column/table 已存在但沒被記錄。第一次重跑會撞 duplicate —
        // 視為「先前已套用」,補登記後繼續。其餘 genuine 錯誤照常 throw。
        const msg = String((err && err.message) || '');
        if (/duplicate column name|already exists/i.test(msg)) {
          console.warn(`[migration] ${file} already applied (pre-tracking); recording: ${msg}`);
          await this.run(
            'INSERT OR IGNORE INTO schema_migrations (filename, applied_at) VALUES (?, ?)',
            [file, new Date().toISOString()]
          );
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
