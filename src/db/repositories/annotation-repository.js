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
   * 反查所有 annotation.relations 欄位含 targetPath 的 row(inbound references）。
   * 用於 GET /api/files/relations 的「被誰依賴」清單。
   *
   * 實作策略:這裡只做「粗篩」— SQL LIKE '%<t>%' 把可能含 targetPath 的 row
   * 全撈出來。精確的逗號分隔成員判定交給呼叫端的 relationsInclude()(重用
   * parseRelations)。這樣分工的原因:
   *   - 純 SQL LIKE 無法同時處理「子字串誤抓」(foo vs foo-bar)與
   *     「逗號後帶空白」("a, foo, b") — 前者要邊界、後者要 tokenize。
   *   - 粗篩寧可多撈(over-match 安全,後段 filter 會剔除),不可漏撈。
   * @param {string} targetPath
   * @returns {Promise<Array<{rel_path: string, relations: string}>>}
   */
  async findInboundReferences(targetPath) {
    if (!this.db) return [];
    const t = this.normalizePath(targetPath);
    if (!t) return [];
    const rows = await this.db.all(
      `
      SELECT rel_path, relations FROM file_annotations
      WHERE rel_path != ?
        AND relations IS NOT NULL AND relations != ''
        AND relations LIKE '%' || ? || '%'
      `,
      [t, t]
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
