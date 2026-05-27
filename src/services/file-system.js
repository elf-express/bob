const fs = require('node:fs');
const path = require('node:path');

const { AnnotationService } = require('./annotation-service');

/**
 * 文件系統服務
 * 提供文件列表和整合註解功能
 */
class FileSystemService {
  /**
   * @param {string} projectDir - 專案根目錄
   */
  constructor(projectDir, db) {
    this.projectDir = path.resolve(projectDir);
    this.annotationService = new AnnotationService(projectDir, db);
    this.fileSystemWriteEnabled = false;
  }

  assertWriteEnabled() {
    if (this.fileSystemWriteEnabled) return;
    const error = new Error('File system write is disabled in project explorer.');
    error.code = 'FS_WRITE_DISABLED';
    throw error;
  }

  /**
   * 路徑沙箱驗證：確保解析後的絕對路徑在 projectDir 內
   * 防空路徑遍歷攻擊（如 ../../etc/passwd）
   * @param {string} relativePath - 相對路徑
   * @returns {string} 安全的絕對路徑
   * @throws {Error} 路徑超出專案根目錄時拋出錯誤
   */
  _safePath(relativePath) {
    const resolved = path.resolve(this.projectDir, relativePath);
    // 確保 resolved 在 projectDir 之下（允許剛好等於 projectDir 本身）
    if (!resolved.startsWith(this.projectDir + path.sep) && resolved !== this.projectDir) {
      throw new Error(`Path traversal denied: ${relativePath}`);
    }
    return resolved;
  }

  /**
   * 創建目錄
   * @param {string} relativePath - 相對路徑
   */
  async createDirectory(relativePath) {
    this.assertWriteEnabled();
    const fullPath = this._safePath(relativePath);
    await fs.promises.mkdir(fullPath, { recursive: true });
    return true;
  }

  /**
   * 創建文件
   * @param {string} relativePath - 相對路徑
   * @param {string} content - 文件內容
   */
  async createFile(relativePath, content = '') {
    this.assertWriteEnabled();
    const fullPath = this._safePath(relativePath);
    // 確保目錄存在
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, content);
    return true;
  }

  /**
   * 刪除文件或目錄
   * @param {string} relativePath - 相對路徑
   */
  async deletePath(relativePath) {
    this.assertWriteEnabled();
    const fullPath = this._safePath(relativePath);
    await fs.promises.rm(fullPath, { recursive: true, force: true });
    return true;
  }

  /**
   * 獲取專案檔案統計 (檔案總數)
   * 排除 node_modules, .git 等
   */
  async getProjectStats() {
    let count = 0;
    const projectDir = this.projectDir;

    async function walk(dir) {
      try {
        const files = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const file of files) {
          // 忽略常見的龐大目錄
          if (file.isDirectory()) {
            if (['.bob-tools', '.git', '.idea', '.vscode', 'build', 'coverage', 'dist', 'node_modules'].includes(file.name)) continue;
            const entryPath = path.join(dir, file.name);
            await walk(entryPath);
          } else {
            count++;
          }
        }
      } catch {
        // ignore
      }
    }

    await walk(projectDir);
    return { fileCount: count };
  }

  /**
   * 獲取目錄內容，包含註解
   * @param {string} relativePath - 相對路徑，預設為根目錄
   * @returns {Array} 文件列表
   */
  async listFiles(relativePath = '') {
    const fullPath = this._safePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Directory not found: ${relativePath}`);
    }

    const stats = await fs.promises.stat(fullPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${relativePath}`);
    }

    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
    const annotations = await this.annotationService.getAnnotations();

    const result = entries
      .filter((entry) => {
        // 過濾掉不想要顯示的系統目錄
        if (entry.isDirectory()) {
          return !['.bob-tools', '.git', '.idea', '.vscode', 'coverage', 'dist', 'node_modules'].includes(entry.name);
        }
        return true;
      })
      .map((entry) => {
        const entryPath = path.join(relativePath, entry.name);
        const normalizedPath = entryPath.split(path.sep).join('/');

        return {
          name: entry.name,
          path: normalizedPath,
          isDirectory: entry.isDirectory(),
          annotation: annotations[normalizedPath] || null,
          purpose: (annotations._purposes && annotations._purposes[normalizedPath]) || '',
          relations: (annotations._relations && annotations._relations[normalizedPath]) || '',
          userNote: (annotations._userNotes && annotations._userNotes[normalizedPath]) || '',
        };
      });

    // Sort directories first, then files
    result.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory ? -1 : 1;
    });

    return result;
  }

  /**
   * 重命名文件或目錄
   * @param {string} oldPath - 舊路徑
   * @param {string} newPath - 新路徑
   */
  async renamePath(oldPath, newPath) {
    this.assertWriteEnabled();
    const fullOldPath = this._safePath(oldPath);
    const fullNewPath = this._safePath(newPath);
    // 確保目標目錄存在
    await fs.promises.mkdir(path.dirname(fullNewPath), { recursive: true });
    await fs.promises.rename(fullOldPath, fullNewPath);
    return true;
  }

  /**
   * 掃描整個專案並輸出扁平樹節點快照
   * @returns {Promise<Array<{rel_path:string,name:string,is_dir:boolean,depth:number,parent_path:string}>>}
   */
  async scanTreeSnapshot() {
    const ignoredDirs = new Set(['.bob-tools', '.git', '.idea', '.vscode', 'build', 'coverage', 'dist', 'node_modules']);
    const nodes = [];

    const walk = async (dirAbs, relBase) => {
      const entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;

        const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
        const parentPath = relBase || '';
        const depth = relPath.split('/').length;
        nodes.push({
          rel_path: relPath,
          name: entry.name,
          is_dir: entry.isDirectory(),
          depth,
          parent_path: parentPath,
        });

        if (entry.isDirectory()) {
          await walk(path.join(dirAbs, entry.name), relPath);
        }
      }
    };

    await walk(this.projectDir, '');
    return nodes;
  }

  /**
   * 搜尋檔案
   * @param {string} query - 搜尋關鍵字
   * @returns {Array} 搜尋結果列表
   */
  async searchFiles(query) {
    if (!query) return [];
    const results = [];
    const lowerQuery = query.toLowerCase();
    const projectDir = this.projectDir;
    const annotations = await this.annotationService.getAnnotations();

    async function walk(dir) {
      try {
        const files = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const file of files) {
          const entryPath = path.join(dir, file.name);
          const relativePath = path.relative(projectDir, entryPath).split(path.sep).join('/');

          // 忽略常見的龐大目錄
          if (file.isDirectory() && ['.bob-tools', '.git', 'build', 'coverage', 'dist', 'node_modules'].includes(file.name)) continue;

          if (file.name.toLowerCase().includes(lowerQuery)) {
            results.push({
              name: file.name,
              path: relativePath,
              isDirectory: file.isDirectory(),
              annotation: annotations[relativePath] || null,
            });
          }

          if (file.isDirectory()) {
            await walk(entryPath);
          }
        }
      } catch (error) {
        // 忽略存取錯誤
        console.error(`Error walking ${dir}:`, error.message);
      }
    }

    await walk(projectDir);
    // 限制結果數量，避免過多
    return results.slice(0, 100);
  }

  /**
   * 添加或更新註解
   * @param {string} filePath - 文件路徑
   * @param {string} annotation - 註解內容
   */
  async updateAnnotation(filePath, annotation) {
    return await this.annotationService.saveAnnotation(filePath, annotation);
  }
}

module.exports = { FileSystemService };
