const path = require('node:path');

const { AnnotationRepository } = require('../db/repositories/annotation-repository.js');

class AnnotationService {
  constructor(_projectDir, db) {
    this.repo = new AnnotationRepository(db);
  }

  async getAnnotations() {
    const rows = await this.repo.getAll();
    const out = {};

    for (const row of rows) {
      out[row.rel_path] = row.annotation || '';
      if (!out._purposes) out._purposes = {};
      if (!out._relations) out._relations = {};
      if (!out._userNotes) out._userNotes = {};
      out._purposes[row.rel_path] = row.purpose || '';
      out._relations[row.rel_path] = row.relations || '';
      out._userNotes[row.rel_path] = row.user_note || '';
    }

    return out;
  }

  async getMetadata(filePath) {
    const normalizedPath = this.normalizePath(filePath);
    const row = await this.repo.getByPath(normalizedPath);
    if (!row) {
      return { annotation: '', purpose: '', relations: '', userNote: '' };
    }

    return {
      annotation: row.annotation || '',
      purpose: row.purpose || '',
      relations: row.relations || '',
      userNote: row.user_note || '',
    };
  }

  normalizePath(filePath) {
    return String(filePath || '')
      .split(path.sep)
      .join('/');
  }

  async saveAnnotation(filePath, annotation) {
    const normalizedPath = this.normalizePath(filePath);
    const prev = await this.getMetadata(normalizedPath);
    const next = { ...prev, annotation: (annotation || '').trim() };
    await this.repo.upsert(normalizedPath, next);
    return next.annotation;
  }

  async savePurpose(filePath, text) {
    const normalizedPath = this.normalizePath(filePath);
    const prev = await this.getMetadata(normalizedPath);
    const next = { ...prev, purpose: (text || '').trim() };
    await this.repo.upsert(normalizedPath, next);
  }

  async saveRelations(filePath, text) {
    const normalizedPath = this.normalizePath(filePath);
    const prev = await this.getMetadata(normalizedPath);
    const next = { ...prev, relations: (text || '').trim() };
    await this.repo.upsert(normalizedPath, next);
  }

  async saveUserNote(filePath, text) {
    const normalizedPath = this.normalizePath(filePath);
    const prev = await this.getMetadata(normalizedPath);
    const next = { ...prev, userNote: (text || '').trim() };
    await this.repo.upsert(normalizedPath, next);
  }
}

module.exports = { AnnotationService };
