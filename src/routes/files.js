const express = require('express');
const { FileSystemService } = require('../services/file-system');
const { TagService } = require('../services/tag-service');
const { AnnotationService } = require('../services/annotation-service');

/**
 * 創建文件管理路由
 * @param {Object} options
 * @param {string} options.projectDir - 專案根目錄
 */
function createFilesRouter({ projectDir, db }) {
  const router = express.Router();
  const fileSystem = new FileSystemService(projectDir, db);
  const tagService = new TagService(projectDir, db);
  const annotationService = new AnnotationService(projectDir, db);
  const writeDisabledResponse = {
    success: false,
    code: 'FS_WRITE_DISABLED',
    message: 'File system write is disabled in project explorer.',
  };

  // 獲取文件列表（含標籤）
  // GET /api/files?path=xxx
  router.get('/', async (req, res) => {
    try {
      const dirPath = req.query.path || '';
      const files = await fileSystem.listFiles(dirPath);
      // 為每個項目附加標籤
      const filesWithTags = await Promise.all(
        files.map(async (item) => ({
          ...item,
          tags: await tagService.getTags(item.path),
        }))
      );
      res.json({ success: true, data: filesWithTags });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 獲取統計資訊
  // GET /api/files/stats
  router.get('/stats', async (req, res) => {
    try {
      const stats = await fileSystem.getProjectStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 搜尋檔案
  // GET /api/files/search?q=xxx
  router.get('/search', async (req, res) => {
    try {
      const query = req.query.q || '';
      const files = await fileSystem.searchFiles(query);
      res.json({ success: true, data: files });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 獲取指定路徑的標籤
  // GET /api/files/tags?path=xxx
  router.get('/tags', async (req, res) => {
    try {
      const filePath = req.query.path || '';
      const tags = await tagService.getTags(filePath);
      const suggested = tagService.suggestTags(filePath);
      const custom = await tagService.getCustomTags();
      const normalizedPath = filePath.split(require('path').sep).join('/');
      const customTags = custom[normalizedPath] || [];
      res.json({
        success: true,
        data: { tags, suggested, custom: customTags },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 儲存自訂標籤
  // POST /api/files/tags
  router.post('/tags', async (req, res) => {
    try {
      const { path: filePath, tags } = req.body;
      if (!filePath) {
        return res.status(400).json({ success: false, message: 'Missing path' });
      }
      await tagService.setCustomTag(filePath, tags || []);
      res.json({ success: true, data: await tagService.getTags(filePath) });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 取得指定路徑的完整 metadata（annotation + purpose + relations）
  // GET /api/files/metadata?path=xxx
  router.get('/metadata', async (req, res) => {
    try {
      const filePath = req.query.path || '';
      const metadata = await annotationService.getMetadata(filePath);
      res.json({ success: true, data: metadata });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 添加/更新註解
  // POST /api/files/annotate
  router.post('/annotate', async (req, res) => {
    try {
      const { file, content, purpose, relations, userNote } = req.body;
      if (!file) {
        return res.status(400).json({ success: false, message: 'Missing file path' });
      }
      
      const annotation = await fileSystem.updateAnnotation(file, content);

      // 儲存功能說明與關聯影響（如果有傳入）
      if (purpose !== undefined) {
        await annotationService.savePurpose(file, purpose);
      }
      if (relations !== undefined) {
        await annotationService.saveRelations(file, relations);
      }
      if (userNote !== undefined) {
        await annotationService.saveUserNote(file, userNote);
      }

      res.json({ success: true, data: annotation });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 創建文件或目錄
  // POST /api/files/create
  router.post('/create', async (req, res) => {
    return res.status(403).json(writeDisabledResponse);
  });

  // 刪除文件或目錄
  // POST /api/files/delete
  router.post('/delete', async (req, res) => {
    return res.status(403).json(writeDisabledResponse);
  });

  // 重命名文件或目錄
  // POST /api/files/rename
  router.post('/rename', async (req, res) => {
    return res.status(403).json(writeDisabledResponse);
  });

  return router;
}

module.exports = { createFilesRouter };
