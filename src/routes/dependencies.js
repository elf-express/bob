const express = require('express');

function normalizeRow(row) {
  return {
    name: row.name,
    scope: row.scope,
    declaredVersion: row.declared_version,
    installedVersion: row.installed_version,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastChangedAt: row.last_changed_at,
    descKey: row.desc_key,
    descFallback: row.desc_fallback,
    descMode: row.desc_mode,
    manualDesc: row.manual_desc,
    noteText: row.note_text || '',
  };
}

function createDependenciesRouter({ dependencyRepo, dependencyScanService }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const { scope, q } = req.query || {};
      const rows = await dependencyRepo.list({ scope, q });
      const meta = await dependencyRepo.getMeta();
      return res.json({
        success: true,
        data: {
          items: rows.map((row) => normalizeRow(row)),
          lastScanAt: meta.lastScanAt,
          total: meta.total,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  router.post('/scan', async (_req, res) => {
    try {
      const items = await dependencyScanService.scan();
      const scanAt = new Date().toISOString();
      const stats = await dependencyRepo.upsertBatch(items, scanAt);
      return res.json({
        success: true,
        data: {
          ...stats,
          scanAt,
          count: items.length,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  router.put('/description', async (req, res) => {
    try {
      const { name, scope, manualDesc, mode, noteText } = req.body || {};
      if (!name || !scope) {
        return res.status(400).json({ success: false, message: 'Missing name or scope' });
      }
      if (!['dependencies', 'devDependencies', 'runtime'].includes(scope)) {
        return res.status(400).json({ success: false, message: 'Invalid scope' });
      }
      if (!['auto', 'manual'].includes(mode)) {
        return res.status(400).json({ success: false, message: 'mode must be auto or manual' });
      }
      if (mode === 'manual' && !String(manualDesc || '').trim()) {
        return res.status(400).json({ success: false, message: 'manualDesc is required in manual mode' });
      }
      const updated = await dependencyRepo.updateDescriptionMode({
        name,
        scope,
        mode,
        manualDesc: String(manualDesc || ''),
        noteText: String(noteText || ''),
      });
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Dependency not found' });
      }
      return res.json({ success: true, data: normalizeRow(updated) });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  router.put('/note', async (req, res) => {
    try {
      const { name, scope, noteText } = req.body || {};
      if (!name || !scope) {
        return res.status(400).json({ success: false, message: 'Missing name or scope' });
      }
      if (!['dependencies', 'devDependencies', 'runtime'].includes(scope)) {
        return res.status(400).json({ success: false, message: 'Invalid scope' });
      }
      const updated = await dependencyRepo.updateNote({
        name,
        scope,
        noteText: String(noteText || ''),
      });
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Dependency not found' });
      }
      return res.json({ success: true, data: normalizeRow(updated) });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = { createDependenciesRouter };
