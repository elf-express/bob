const express = require('express');
const path = require('node:path');

/**
 * 創建關聯檔案路由
 *
 * Phase 4(對應 Plan T4.1 + Spec §2.2):
 *   outbound = 從 file_annotations.relations 欄位解析(本檔聲明我依賴誰)
 *   inbound  = 反查全表,找 relations 含本路徑的其他 annotation(誰依賴我)
 *
 * 路徑驗證跟 history.js / ai-annotate.js 一致(spec §14.4 — 反斜線轉斜線後再驗 ..)
 *
 * @param {Object} options
 * @param {Object} options.annotationRepo - AnnotationRepository 實例
 * @returns {express.Router}
 */
function createRelationsRouter({ annotationRepo }) {
  const router = express.Router();

  /**
   * GET /api/files/relations?path=<filepath>
   * @returns {{ ok: boolean, path: string, outbound: Array<{path, via}>, inbound: Array<{path, via}> }}
   */
  router.get('/relations', async (req, res) => {
    const filePath = String(req.query.path || '').trim().replace(/\\/g, '/');

    // 安全:防止 path traversal
    if (
      !filePath ||
      filePath.includes('..') ||
      path.isAbsolute(filePath) ||
      filePath.startsWith('/')
    ) {
      return res.status(400).json({ ok: false, error: 'invalid path' });
    }

    if (!annotationRepo) {
      return res.json({ ok: true, path: filePath, outbound: [], inbound: [] });
    }

    try {
      // outbound: 解析自身 annotation.relations(逗號分隔)
      const self = await annotationRepo.getByPath(filePath);
      const outbound = parseRelations(self && self.relations).map((p) => ({
        path: p,
        via: 'annotation.relations',
      }));

      // inbound: 反查全表
      const inboundRows = await annotationRepo.findInboundReferences(filePath);
      const inbound = inboundRows.map((r) => ({
        path: r.rel_path,
        via: 'annotation.relations',
      }));

      res.json({ ok: true, path: filePath, outbound, inbound });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

/**
 * 解析 annotation.relations 逗號分隔字串為陣列
 * 過濾空字串與 self-reference(預留用,relations 欄位裡通常不會放自己)
 * @param {string|null|undefined} raw
 * @returns {string[]}
 */
function parseRelations(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = { createRelationsRouter, parseRelations };
