// ===== 專案架構瀏覽器 — API 層 =====
// 所有與後端通訊的 fetch 函數，供 file-tree.js 及 file-tree-annotation.js 呼叫

/**
 * API: 獲取檔案列表
 * @async
 * @param {string} path - 相對路徑
 * @returns {Promise<Array<Object>>} 檔案列表
 */
async function fetchFiles(path) {
  try {
    const url = `/api/files?path=${encodeURIComponent(path)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Unknown error');
    return json.data;
  } catch (error) {
    console.error('Fetch files error:', error);
    throw error;
  }
}

/**
 * API: 搜尋檔案
 * @async
 * @param {string} query - 搜尋關鍵字
 * @returns {Promise<Array<Object>>} 搜尋結果
 */
async function searchFilesApi(query) {
  try {
    const response = await fetch(`/api/files/search?q=${encodeURIComponent(query)}`);
    const result = await response.json();
    if (result.success) {
      return result.data;
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Search failed:', error);
    throw error;
  }
}

/**
 * API: 獲取專案統計
 * @async
 * @returns {Promise<Object>} 統計資料
 */
async function fetchProjectStats() {
  try {
    const res = await fetch('/api/files/stats');
    const json = await res.json();
    return json.success ? json.data : { fileCount: 0 };
  } catch (e) {
    console.error(e);
    return { fileCount: 0 };
  }
}

/**
 * API: 儲存註釋（含功能說明、關聯影響）
 * @async
 * @param {string} file - 檔案路徑
 * @param {string} content - 註釋內容
 * @param {Object} [extra] - 額外欄位
 * @param {string} [extra.purpose] - 功能說明
 * @param {string} [extra.relations] - 關聯影響
 * @param {string} [extra.userNote] - 使用者備註
 * @returns {Promise<Object>} API 回應資料
 * @throws {Error} 當儲存失敗時拋出錯誤
 */
async function saveAnnotationApi(file, content, extra = {}) {
  try {
    const body = { file, content };
    if (extra.purpose !== undefined) body.purpose = extra.purpose;
    if (extra.relations !== undefined) body.relations = extra.relations;
    if (extra.userNote !== undefined) body.userNote = extra.userNote;

    const res = await fetch('/api/files/annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Save failed');
    return json.data;
  } catch (error) {
    console.error('Save annotation error:', error);
    throw error;
  }
}

/**
 * API: 建立檔案或目錄
 * @async
 * @param {string} type - 'file' | 'directory'
 * @param {string} path - 目標路徑
 * @param {string} [content=''] - 檔案內容
 * @returns {Promise<Object>} API 回應物件
 */
async function createFileApi(type, path, content = '') {
  const res = await fetch('/api/files/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, path, content })
  });
  const json = await res.json();
  if (!json.success) {
    const error = new Error(json.message || 'Create failed');
    error.code = json.code;
    throw error;
  }
  return json;
}

/**
 * API: 刪除檔案或目錄
 * @async
 * @param {string} path - 目標路徑
 * @returns {Promise<Object>} API 回應物件
 * @throws {Error} 當刪除失敗時拋出錯誤
 */
async function deleteApi(path) {
  const res = await fetch('/api/files/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  const json = await res.json();
  if (!json.success) {
    const error = new Error(json.message || 'Delete failed');
    error.code = json.code;
    throw error;
  }
  return json;
}

/**
 * API: 重新命名
 * @async
 * @param {string} oldPath - 原路徑
 * @param {string} newPath - 新路徑
 * @returns {Promise<Object>} API 回應物件
 */
async function renameApi(oldPath, newPath) {
  const res = await fetch('/api/files/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath })
  });
  const json = await res.json();
  if (!json.success) {
    const error = new Error(json.message || 'Rename failed');
    error.code = json.code;
    throw error;
  }
  return json;
}

/**
 * API: 專案綁定狀態
 */
async function fetchProjectBindingStatus() {
  const res = await fetch('/api/project/status');
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Fetch project status failed');
  return json.data;
}

/**
 * API: 掃描根 package scripts
 */
async function scanCommandsApi() {
  const res = await fetch('/api/scan/commands', { method: 'POST' });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Scan commands failed');
  return json.data;
}

/**
 * API: 掃描檔案樹快照
 */
async function scanTreeApi() {
  const res = await fetch('/api/scan/tree', { method: 'POST' });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Scan tree failed');
  return json.data;
}

/**
 * API: 取得最新掃描摘要
 */
async function fetchLatestScanSummary() {
  const res = await fetch('/api/scan/latest');
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Fetch latest scan failed');
  return json.data;
}

/**
 * API: 取得單一檔案/資料夾 metadata
 * @param {string} path
 * @returns {Promise<Object>}
 */
async function fetchFileMetadataApi(path) {
  const res = await fetch(`/api/files/metadata?path=${encodeURIComponent(path)}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Fetch metadata failed');
  return json.data || {};
}
