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
      SELECT rel_path, annotation, purpose, relations, user_note, updated_at
      FROM file_annotations
      `
    );
  }

  async getByPath(relPath) {
    if (!this.db) return null;
    const normalized = this.normalizePath(relPath);
    return await this.db.get(
      `
      SELECT rel_path, annotation, purpose, relations, user_note, updated_at
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
}

module.exports = { AnnotationRepository };
