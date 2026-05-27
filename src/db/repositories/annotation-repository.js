class AnnotationRepository {
  constructor(db) {
    this.db = db;
  }

  normalizePath(p) {
    return String(p || '').split('\\').join('/');
  }

  async getAll() {
    if (!this.db) return [];
    return await this.db.all(
      `
      SELECT rel_path, annotation, purpose, relations, user_note, updated_at, mode, annotated_by, annotated_at
      FROM file_annotations
      `
    );
  }

  async getByPath(relPath) {
    if (!this.db) return null;
    const normalized = this.normalizePath(relPath);
    return await this.db.get(
      `
      SELECT rel_path, annotation, purpose, relations, user_note, updated_at, mode, annotated_by, annotated_at
      FROM file_annotations
      WHERE rel_path = ?
      `,
      [normalized]
    );
  }

  async upsert(relPath, data) {
    if (!this.db) return;
    const normalized = this.normalizePath(relPath);
    const now = new Date().toISOString();
    const annotation = String(data.annotation || '');
    const purpose = String(data.purpose || '');
    const relations = String(data.relations || '');
    const userNote = String(data.userNote || '');

    const isEmpty = !annotation.trim() && !purpose.trim() && !relations.trim() && !userNote.trim();
    if (isEmpty) {
      await this.db.run('DELETE FROM file_annotations WHERE rel_path = ?', [normalized]);
      return;
    }

    await this.db.run(
      `
      INSERT INTO file_annotations (rel_path, annotation, purpose, relations, user_note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(rel_path) DO UPDATE SET
        annotation = excluded.annotation,
        purpose = excluded.purpose,
        relations = excluded.relations,
        user_note = excluded.user_note,
        updated_at = excluded.updated_at
      `,
      [normalized, annotation, purpose, relations, userNote, now]
    );
  }

  async setMode(relPath, mode) {
    if (!this.db) return;
    const normalized = this.normalizePath(relPath);
    const now = new Date().toISOString();
    await this.db.run(
      `
      INSERT INTO file_annotations (rel_path, mode, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(rel_path) DO UPDATE SET mode = excluded.mode
      `,
      [normalized, mode, now]
    );
  }

  async setAiAnnotation(relPath, data) {
    if (!this.db) return;
    const normalized = this.normalizePath(relPath);
    const now = new Date().toISOString();
    const purpose = String(data.purpose || '');
    const relations = String(data.relations || '');
    await this.db.run(
      `
      INSERT INTO file_annotations
        (rel_path, annotation, purpose, relations, user_note, updated_at, mode, annotated_by, annotated_at)
      VALUES (?, '', ?, ?, '', ?, 'ai', 'ai-generator', ?)
      ON CONFLICT(rel_path) DO UPDATE SET
        purpose = excluded.purpose,
        relations = excluded.relations,
        updated_at = excluded.updated_at,
        mode = 'ai',
        annotated_by = excluded.annotated_by,
        annotated_at = excluded.annotated_at
      `,
      [normalized, purpose, relations, now, now]
    );
  }

  /**
   * 反查所有 annotation.relations 欄位含 targetPath 的 row(inbound references)
   * 用於 GET /api/files/relations 的「被誰依賴」清單
   *
   * 實作策略:SQL LIKE 全表掃 — relations 欄位是逗號分隔字串,
   * 含 targetPath 子字串可能誤抓子路徑(例如查 "foo" 會 hit "foo-bar")。
   * 用 LIKE '%,<target>,%' 跟邊界 case '%,<target>' / '<target>,%' / '= <target>' 四連集合,
   * 並過濾自身(避免 self-reference)。
   * @param {string} targetPath
   * @returns {Promise<Array<{rel_path: string, relations: string}>>}
   */
  async findInboundReferences(targetPath) {
    if (!this.db) return [];
    const t = this.normalizePath(targetPath);
    if (!t) return [];
    // 邊界:relations="" 或 IS NULL 不可能含 targetPath,跳過
    // LIKE 用 ',<t>,' 取 sandwich; 也檢查 head/tail/exact 三種 case
    const rows = await this.db.all(
      `
      SELECT rel_path, relations FROM file_annotations
      WHERE rel_path != ?
        AND relations IS NOT NULL AND relations != ''
        AND (
          relations = ?
          OR relations LIKE ?
          OR relations LIKE ?
          OR relations LIKE ?
        )
      `,
      [t, t, `${t},%`, `%,${t}`, `%,${t},%`]
    );
    return rows;
  }

  async getBatch(relPaths) {
    if (!this.db || !Array.isArray(relPaths) || relPaths.length === 0) return {};
    const normalized = relPaths.map((p) => this.normalizePath(p));
    const placeholders = normalized.map(() => '?').join(',');
    const rows = await this.db.all(
      `
      SELECT rel_path, annotation, purpose, relations, user_note, mode, annotated_by, annotated_at, updated_at
      FROM file_annotations
      WHERE rel_path IN (${placeholders})
      `,
      normalized
    );
    const result = {};
    for (const r of rows) {
      result[r.rel_path] = r;
    }
    return result;
  }
}

module.exports = { AnnotationRepository };
