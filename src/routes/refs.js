const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

// 參考手冊資料放在 public/refs/*.json;此 route 掃目錄列出「有哪些表」給前端做索引。
// 各表內容本身由 express.static 直接服務(GET /refs/<file>),不經過這裡。
const REFS_DIR = path.resolve(__dirname, '..', '..', 'public', 'refs');

function createRefsRouter() {
  const router = express.Router();

  // GET /api/refs — 掃 public/refs/*.json,回 [{ id, title, file }]
  router.get('/', (_req, res) => {
    let items = [];
    try {
      const files = fs.readdirSync(REFS_DIR).filter((f) => f.endsWith('.json'));
      items = files
        .map((file) => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(REFS_DIR, file), 'utf8'));
            return { id: data.id || file.replace(/\.json$/, ''), title: data.title || file, file };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
    } catch {
      items = [];
    }
    res.json({ items });
  });

  return router;
}

module.exports = { createRefsRouter };
