class TagRepository {
  constructor(db) {
    this.db = db;
  }

  normalizePath(p) {
    return String(p || '').split('\\').join('/');
  }

  async getAllCustomTags() {
    if (!this.db) return {};
    const rows = await this.db.all('SELECT rel_path, tags_json FROM file_tags');
    const out = {};
    for (const row of rows) {
      try {
        out[row.rel_path] = JSON.parse(row.tags_json);
      } catch (_e) {
        out[row.rel_path] = [];
      }
    }
    return out;
  }

  async getCustomTagsByPath(filePath) {
    if (!this.db) return [];
    const normalized = this.normalizePath(filePath);
    const row = await this.db.get('SELECT tags_json FROM file_tags WHERE rel_path = ?', [normalized]);
    if (!row) return [];
    try {
      return JSON.parse(row.tags_json);
    } catch (_e) {
      return [];
    }
  }

  async setCustomTags(filePath, tags) {
    if (!this.db) return;
    const normalized = this.normalizePath(filePath);
    const now = new Date().toISOString();
    if (Array.isArray(tags) && tags.length > 0) {
      await this.db.run(
        `
        INSERT INTO file_tags (rel_path, tags_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(rel_path) DO UPDATE SET
          tags_json = excluded.tags_json,
          updated_at = excluded.updated_at
        `,
        [normalized, JSON.stringify(tags), now]
      );
      return;
    }

    await this.db.run('DELETE FROM file_tags WHERE rel_path = ?', [normalized]);
  }

  async hasAnyTag() {
    if (!this.db) return false;
    const row = await this.db.get('SELECT COUNT(1) AS c FROM file_tags');
    return Number(row?.c || 0) > 0;
  }
}

module.exports = { TagRepository };
