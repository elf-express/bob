const express = require('express');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { isUnsafeRelPath } = require('../utils/validation.js');

const execFileAsync = promisify(execFile);

/**
 * 創建檔案歷史路由
 * @param {Object} options
 * @param {string} options.projectDir - 專案根目錄
 * @returns {express.Router}
 */
function createHistoryRouter({ projectDir }) {
  const router = express.Router();

  /**
   * GET /api/files/history
   * 獲取指定檔案的 git 提交歷史
   * @param {string} path - 檔案路徑（相對於專案根目錄）
   * @param {number} limit - 返回的提交數上限（預設 20，最大 100）
   * @returns {Object} 包含歷史記錄的 JSON
   */
  router.get('/history', async (req, res) => {
    const filePath = String(req.query.path || '').trim().replace(/\\/g, '/');
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20, 100);

    // 安全檢查:防止路徑遍歷攻擊(segment 比對,容忍檔名含 '..';
    // 拒絕絕對路徑 / 開頭斜線 / 空路徑 / null byte)
    if (isUnsafeRelPath(filePath)) {
      return res.status(400).json({ ok: false, error: 'invalid path' });
    }

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', `-n${limit}`, '--pretty=format:%H|%an|%ae|%aI|%s', '--', filePath],
        { cwd: projectDir, timeout: 5000 }
      );

      /*
       * 解析 git log 輸出
       * 格式：commit_sha|author_name|author_email|author_date|commit_subject
       */
      const history = stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [sha, author, email, date, ...subjectParts] = line.split('|');
          return {
            sha,
            shortSha: sha.slice(0, 7),
            author,
            email,
            date,
            subject: subjectParts.join('|'),
          };
        });

      res.json({ ok: true, path: filePath, history });
    } catch (err) {
      /*
       * 處理 git 命令異常
       * - ENOENT: 非 git 倉庫或檔案不存在
       * - 其他錯誤：回傳 500
       */
      if (err.code === 'ENOENT') {
        return res.json({ ok: true, path: filePath, history: [], notGitRepo: true });
      }
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = { createHistoryRouter };
