const { isUnsafeRelPath } = require('../utils/validation.js');

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
  // lazy require:只在實際建立 router 時才載入 express。
  // 讓 anti-hallucination verifier 能 require 本檔的純函式(parseRelations /
  // relationsInclude)而不需安裝 express —— CI basics job 不跑 pnpm install。
  const express = require('express');
  const router = express.Router();

  /**
   * GET /api/files/relations?path=<filepath>
   * @returns {{ ok: boolean, path: string, outbound: Array<{path, via}>, inbound: Array<{path, via}> }}
   */
  router.get('/relations', async (req, res) => {
    const filePath = String(req.query.path || '').trim().replace(/\\/g, '/');

    // 安全:防止 path traversal(segment 比對,容忍檔名含 '..')
    if (isUnsafeRelPath(filePath)) {
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

      // inbound: 反查全表(coarse SQL prefilter)後,用 relationsInclude 做
      // 逗號分隔的精確比對 — 同時排除「子字串誤抓」與「逗號後帶空白漏抓」
      const inboundRows = await annotationRepo.findInboundReferences(filePath);
      const inbound = inboundRows
        .filter((r) => relationsInclude(r.relations, filePath))
        .map((r) => ({
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

/**
 * 判斷一個 relations 字串(逗號分隔)是否「精確」含 target 路徑。
 * 重用 parseRelations 做 token 化(tolerate 逗號後空白),並把兩側反斜線
 * 正規化為斜線後比對 — 避免 SQL LIKE 子字串誤抓(foo vs foo-bar)。
 * @param {string|null|undefined} raw - relations 欄位原始字串
 * @param {string} target - 目標相對路徑
 * @returns {boolean}
 */
function relationsInclude(raw, target) {
  const t = String(target || '').trim().replace(/\\/g, '/');
  if (!t) return false;
  return parseRelations(raw).some((p) => p.replace(/\\/g, '/') === t);
}

module.exports = { createRelationsRouter, parseRelations, relationsInclude };
