// ===== 專案架構瀏覽器 — 標籤系統 =====
// 定義標籤顯示設定 + 渲染 badge HTML
// 依賴：無（純 UI 工具，供 file-tree.js 和 file-tree-annotation.js 使用）

/**
 * 標籤設定：每個標籤 ID 對應顯示名稱、顏色、深色模式顏色
 */
const TAG_CONFIG = {
  ui:     { label: '介面',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  darkBg: 'rgba(59,130,246,0.25)'  },
  router: { label: '路由',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   darkBg: 'rgba(34,197,94,0.25)'   },
  api:    { label: '介面層',  color: '#f97316', bg: 'rgba(249,115,22,0.12)',  darkBg: 'rgba(249,115,22,0.25)'  },
  store:  { label: '狀態',    color: '#a855f7', bg: 'rgba(168,85,247,0.12)', darkBg: 'rgba(168,85,247,0.25)' },
  utils:  { label: '工具',    color: '#6b7280', bg: 'rgba(107,114,128,0.12)', darkBg: 'rgba(107,114,128,0.25)' },
  config: { label: '設定',    color: '#eab308', bg: 'rgba(234,179,8,0.12)',  darkBg: 'rgba(234,179,8,0.25)'  },
  layout: { label: '版面',    color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  darkBg: 'rgba(6,182,212,0.25)'  },
  hook:   { label: '鉤子',    color: '#ec4899', bg: 'rgba(236,72,153,0.12)', darkBg: 'rgba(236,72,153,0.25)' },
  i18n:   { label: '國際化',  color: '#6366f1', bg: 'rgba(99,102,241,0.12)', darkBg: 'rgba(99,102,241,0.25)' },
  style:  { label: '樣式',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  darkBg: 'rgba(239,68,68,0.25)'  },
  plugin: { label: '外掛',    color: '#14b8a6', bg: 'rgba(20,184,166,0.12)', darkBg: 'rgba(20,184,166,0.25)' },
  type:   { label: '型別',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', darkBg: 'rgba(139,92,246,0.25)' },
  test:   { label: '測試',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', darkBg: 'rgba(245,158,11,0.25)' },
};

/**
 * 所有可用的標籤 ID 列表（供下拉選單使用）
 */
const ALL_TAG_IDS = Object.keys(TAG_CONFIG);

/**
 * 渲染單一標籤 badge HTML
 * @param {string} tagId - 標籤 ID
 * @param {Object} [options] - 選項
 * @param {boolean} [options.removable=false] - 是否顯示移除按鈕
 * @param {string} [options.type='auto'] - 'auto' | 'custom' 用於區分樣式
 * @returns {string} badge HTML 字串
 */
function renderTagBadge(tagId, options = {}) {
  const cfg = TAG_CONFIG[tagId];
  if (!cfg) return '';

  const { removable = false, type = 'auto' } = options;
  const removeBtn = removable
    ? ` <span class="tag-badge-remove" data-tag="${tagId}" title="移除">&times;</span>`
    : '';
  const typeClass = type === 'custom' ? ' tag-badge-custom' : '';

  return `<span class="tag-badge tag-badge-${tagId}${typeClass}" data-tag-id="${tagId}" style="--tag-color:${cfg.color};--tag-bg:${cfg.bg};--tag-dark-bg:${cfg.darkBg};">${cfg.label}${removeBtn}</span>`;
}

/**
 * 渲染多個標籤 badge 的 HTML
 * @param {string[]} tags - 標籤 ID 陣列
 * @param {Object} [options] - 選項
 * @param {boolean} [options.removable=false] - 是否可移除
 * @param {number} [options.max=3] - 最多顯示幾個（超過顯示 +N）
 * @returns {string} HTML 字串
 */
function renderTagBadges(tags, options = {}) {
  if (!tags || tags.length === 0) return '';

  const { max = 3, removable = false } = options;
  const visible = tags.slice(0, max);
  const overflow = tags.length - max;

  let html = visible.map(t => renderTagBadge(t, { removable })).join('');

  if (overflow > 0) {
    html += `<span class="tag-badge tag-badge-overflow" title="${tags.slice(max).map(t => TAG_CONFIG[t]?.label || t).join(', ')}">+${overflow}</span>`;
  }

  return html;
}

/**
 * 渲染標籤選擇下拉選單（用於右側面板自訂標籤）
 * @param {string[]} currentTags - 目前已選的標籤
 * @param {string} filePath - 檔案路徑
 * @returns {string} HTML 字串
 */
function renderTagSelector(currentTags, filePath) {
  const currentSet = new Set(currentTags || []);
  const options = ALL_TAG_IDS.map(id => {
    const cfg = TAG_CONFIG[id];
    const checked = currentSet.has(id) ? 'checked' : '';
    return `
      <label class="tag-selector-item" data-tag="${id}">
        <input type="checkbox" ${checked} value="${id}" onchange="handleTagToggle('${filePath}', '${id}', this.checked)">
        <span class="tag-badge tag-badge-${id}" style="--tag-color:${cfg.color};--tag-bg:${cfg.bg};--tag-dark-bg:${cfg.darkBg};">${cfg.label}</span>
      </label>`;
  }).join('');

  return `
    <div class="tag-selector-dropdown">
      ${options}
    </div>`;
}

/**
 * API: 獲取指定路徑的標籤詳情（自動推測 + 自訂）
 * @async
 * @param {string} filePath - 相對路徑
 * @returns {Promise<{tags: string[], suggested: string[], custom: string[]}>}
 */
async function fetchFileTags(filePath) {
  try {
    const res = await fetch(`/api/files/tags?path=${encodeURIComponent(filePath)}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Failed to fetch tags');
    return json.data;
  } catch (error) {
    console.error('Fetch tags error:', error);
    return { tags: [], suggested: [], custom: [] };
  }
}

/**
 * API: 儲存自訂標籤
 * @async
 * @param {string} filePath - 相對路徑
 * @param {string[]} tags - 自訂標籤陣列
 * @returns {Promise<string[]>} 合併後的標籤
 */
async function saveCustomTags(filePath, tags) {
  try {
    const res = await fetch('/api/files/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, tags }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Save tags failed');
    return json.data;
  } catch (error) {
    console.error('Save tags error:', error);
    throw error;
  }
}

/**
 * 處理標籤切換（checkbox onChange）
 * @param {string} filePath - 檔案路徑
 * @param {string} tagId - 標籤 ID
 * @param {boolean} checked - 是否勾選
 */
async function handleTagToggle(filePath, tagId, checked) {
  try {
    // 從 DOM 收集目前所有勾選的自訂標籤
    const checkboxes = document.querySelectorAll('.tag-selector-item input[type="checkbox"]');
    const selectedTags = [];
    checkboxes.forEach(cb => {
      if (cb.checked) selectedTags.push(cb.value);
    });

    // 儲存到後端
    const mergedTags = await saveCustomTags(filePath, selectedTags);

    // 更新左側樹對應節點的 tag badges
    updateTreeNodeTags(filePath, mergedTags);

    // 更新右側面板的 badge 預覽
    const previewContainer = document.getElementById('tag-preview-badges');
    if (previewContainer) {
      previewContainer.innerHTML = renderTagBadges(mergedTags, { max: 10 });
    }
  } catch (e) {
    console.error('Tag toggle failed:', e);
  }
}

/**
 * 更新左側樹中指定節點的 tag badges
 * @param {string} filePath - 檔案路徑
 * @param {string[]} tags - 標籤陣列
 */
function updateTreeNodeTags(filePath, tags) {
  const row = document.querySelector(`.tree-row[data-path="${filePath}"]`);
  if (!row) return;

  // 移除舊的 badges container
  const old = row.querySelector('.tree-tag-badges');
  if (old) old.remove();

  // 插入新的 badges（在 copy btn 後面、flex spacer 前面）
  if (tags && tags.length > 0) {
    const badgesSpan = document.createElement('span');
    badgesSpan.className = 'tree-tag-badges';
    badgesSpan.innerHTML = renderTagBadges(tags);

    const spacer = row.querySelector('span[style*="flex:1"]');
    if (spacer) {
      row.insertBefore(badgesSpan, spacer);
    } else {
      row.appendChild(badgesSpan);
    }
  }
}

// 導出供全局使用
window.TAG_CONFIG = TAG_CONFIG;
window.ALL_TAG_IDS = ALL_TAG_IDS;
window.renderTagBadge = renderTagBadge;
window.renderTagBadges = renderTagBadges;
window.renderTagSelector = renderTagSelector;
window.fetchFileTags = fetchFileTags;
window.saveCustomTags = saveCustomTags;
window.handleTagToggle = handleTagToggle;
window.updateTreeNodeTags = updateTreeNodeTags;
