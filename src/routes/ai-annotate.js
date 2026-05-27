const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const { generateAnnotation } = require('../services/ai-annotation-service.js');

/**
 * Create AI annotation router
 * @param {Object} options
 * @param {string} options.projectDir - Project root directory
 * @param {Object} options.annotationRepo - AnnotationRepository instance
 * @returns {express.Router}
 */
function createAiAnnotateRouter({ projectDir, annotationRepo }) {
  const router = express.Router();

  /**
   * POST /api/files/ai-annotate
   * Read file → run rule-based generator → upsert into file_annotations (mode='ai')
   * Return generated result
   */
  router.post('/ai-annotate', express.json(), async (req, res) => {
    const relPath = String(req.body?.path || '').trim().replace(/\\/g, '/');

    // Security: prevent path traversal (same strategy as history.js)
    if (
      !relPath ||
      relPath.includes('..') ||
      path.isAbsolute(relPath) ||
      relPath.startsWith('/')
    ) {
      return res.status(400).json({ ok: false, error: 'invalid path' });
    }

    const absPath = path.join(projectDir, relPath);
    let content;
    try {
      content = await fs.readFile(absPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ ok: false, error: 'file not found' });
      }
      return res.status(500).json({ ok: false, error: err.message });
    }

    // Skip files too large for generator (avoid OOM / meaningless parsing)
    if (content.length > 500000) {
      return res.status(413).json({ ok: false, error: 'file too large for ai-annotate' });
    }

    const generated = generateAnnotation(relPath, content);

    try {
      if (annotationRepo) {
        await annotationRepo.setAiAnnotation(relPath, {
          purpose: generated.purpose,
          relations: generated.relations,
          tags: generated.tags,
        });
      }
    } catch (err) {
      // DB write failure does not block response (return generated to frontend; frontend can retry)
      return res.json({
        ok: true,
        path: relPath,
        generated,
        warning: `db write failed: ${err.message}`,
      });
    }

    res.json({ ok: true, path: relPath, generated });
  });

  return router;
}

module.exports = { createAiAnnotateRouter };
