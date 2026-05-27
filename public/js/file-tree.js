// Project Explorer / File Tree runtime helpers and UI interactions.
const projectExplorerState = {
  expandedPaths: new Set(),
  currentFile: null,
  dataCache: new Map(), // path -> data
  contextMenuEl: null,
  listenersBound: false,
  quickGuide: {
    refresh: false,
    scanTree: false,
    selectFile: false,
  },
};

function peT(key, fallback = '', params = {}) {
  if (typeof i18n !== 'undefined') {
    const value = i18n.t(key, params);
    if (value && value !== key && !['undefined', 'null'].includes(String(value).trim().toLowerCase())) {
      return value;
    }
  }
  return fallback || key;
}

function formatStatusDate(isoLike) {
  if (!isoLike) return '-';
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return '-';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function hideFileTreeContextMenu() {
  if (projectExplorerState.contextMenuEl) {
    projectExplorerState.contextMenuEl.remove();
    projectExplorerState.contextMenuEl = null;
    return;
  }
  const menu = document.querySelector('.file-tree-context-menu');
  if (menu) menu.remove();
}

function peQuickAction(action) {
  if (action === 'refresh') {
    const btn = document.getElementById('pe-refresh-btn');
    if (btn) btn.click();
    return;
  }
  if (action === 'scanTree') {
    runScanTreeAction();
    return;
  }
  if (action === 'scanScripts') {
    runScanScriptsAction();
  }
}

function updatePeQuickGuide(message = '') {
  const steps = {
    refresh: document.getElementById('pe-quick-step-refresh'),
    scanTree: document.getElementById('pe-quick-step-scanTree'),
    selectFile: document.getElementById('pe-quick-step-selectFile'),
  };
  Object.entries(steps).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle('done', Boolean(projectExplorerState.quickGuide[key]));
  });

  const statusEl = document.getElementById('pe-quick-status');
  const doneCount = Object.values(projectExplorerState.quickGuide).filter(Boolean).length;
  const progressText = doneCount === 3
    ? peT('projectExplorer.quickAllDone', 'Done. You can now read and annotate files.')
    : peT('projectExplorer.quickProgress', 'Completed {done}/3 steps', { done: doneCount });

  if (!statusEl) return;
  if (message) {
    statusEl.textContent = message;
    return;
  }
  statusEl.textContent = progressText;
}

function markPeQuickGuideStep(step, message = '') {
  if (!Object.hasOwn(projectExplorerState.quickGuide, step)) return;
  projectExplorerState.quickGuide[step] = true;
  updatePeQuickGuide(message);
}

function showProjectExplorerGuidePanel() {
  const emptyState = document.getElementById('pe-empty-state');
  const detailsPanel = document.getElementById('pe-file-details');
  if (detailsPanel) detailsPanel.style.display = 'none';
  if (emptyState) emptyState.style.display = 'flex';
}

async function runScanScriptsAction() {
  const statusEl = document.getElementById('pe-scan-status');
  if (statusEl) statusEl.textContent = peT('projectExplorer.scanInProgress', 'Scanning...');
  try {
    const scanResult = await scanCommandsApi();
    let merged = null;

    // Keep command config in sync even when scanning from Project Explorer.
    if (typeof mergeScannedScriptsIntoConfig === 'function' && typeof autoSaveConfig === 'function') {
      merged = mergeScannedScriptsIntoConfig((scanResult && scanResult.scripts) || []);
      const saved = await autoSaveConfig();
      if (!saved) {
        throw new Error(peT('errors.scanSaveFailed', 'Failed to save scan result'));
      }
      if (typeof renderDynamicNavigation === 'function') renderDynamicNavigation();
      if (typeof renderCommands === 'function') renderCommands();
    }

    await refreshProjectExplorerScanStatus();
    if (statusEl && merged) {
      statusEl.textContent = peT(
        'projectExplorer.scanScriptsMerged',
        'Scripts synced: added {added}, updated {updated}, skipped {skipped}',
        merged
      );
      statusEl.title = statusEl.textContent;
    }
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = peT(
        'projectExplorer.scanFailedReason',
        'Scan failed: {message}',
        { message: error?.message || peT('errors.unknown', 'Unknown error') }
      );
    }
  }
}

async function runScanTreeAction() {
  const statusEl = document.getElementById('pe-scan-status');
  if (statusEl) statusEl.textContent = peT('projectExplorer.scanInProgress', 'Scanning...');
  try {
    await scanTreeApi();
    await loadProjectRoot();
    await refreshProjectExplorerScanStatus();
    markPeQuickGuideStep('scanTree', peT('projectExplorer.quickDoneScanTree', 'Tree scan completed'));
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = peT(
        'projectExplorer.scanFailedReason',
        'Scan failed: {message}',
        { message: error?.message || peT('errors.unknown', 'Unknown error') }
      );
    }
  }
}

async function refreshProjectExplorerScanStatus() {
  const statusEl = document.getElementById('pe-scan-status');
  if (!statusEl) return;

  try {
    const scan = await fetchLatestScanSummary();
    const updatedAt = formatStatusDate(scan?.counts?.updatedAt);
    const statusText = peT(
      'projectExplorer.scanStatusUpdatedAt',
      'Updated: {updatedAt}',
      { updatedAt }
    );
    statusEl.textContent = statusText;
    statusEl.title = statusText;
  } catch (error) {
    statusEl.textContent = `${peT('fileTree.loadFailed', 'Load failed:')} ${error.message}`;
    statusEl.title = statusEl.textContent;
  }
}


const style = document.createElement('style');
style.textContent = `
  .file-tree-context-menu {
    position: absolute;
    background: white;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border-radius: 6px;
    padding: 4px;
    z-index: 9999;
    min-width: 160px;
    font-size: 13px;
    color: #334155;
  }
  .file-tree-context-menu-item {
    padding: 6px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 4px;
  }
  .file-tree-context-menu-item:hover {
    background: #f1f5f9;
    color: #0f172a;
  }
  .file-tree-context-menu-separator {
    height: 1px;
    background: #e2e8f0;
    margin: 4px 0;
  }

  .file-tree .tree-row {
    gap: 4px;
    padding-top: 4px;
    padding-bottom: 4px;
  }

  .file-tree .tree-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    font-size: 18px;
    line-height: 1;
    flex-shrink: 0;
  }
  .file-tree img.tree-icon {
    object-fit: contain;
  }

  .file-tree .tree-toggle {
    width: 16px;
    height: 20px;
    line-height: 20px;
    display: inline-block;
    text-align: center;
    position: relative;
    top: 1px;
  }

  .file-tree.config-tree ul > li::before {
    height: 13px;
  }

  .tree-row .tree-copy-btn {
    opacity: 0;
    transition: all 0.2s;
    margin-left: 6px;
    padding: 2px;
    cursor: pointer;
    color: #94a3b8;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    vertical-align: middle;
  }
  .tree-row:hover .tree-copy-btn {
    opacity: 1;
  }
  .tree-copy-btn:hover {
    color: #3b82f6;
    background: #eff6ff;
    transform: scale(1.1);
  }

  .tree-copy-btn.copied {
    color: #10b981 !important;
    background: #d1fae5 !important;
    transform: scale(1.1);
  }
  .pe-toolbar-quick-hint {
    margin-left: 8px;
    font-size: 11px;
    color: #3b82f6;
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.22);
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
  }
  .pe-toolbar-quick-hint.done {
    color: #047857;
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.28);
  }
  .pe-quick-badge {
    margin-left: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #1d4ed8;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 999px;
    padding: 2px 10px;
    white-space: nowrap;
  }
  .pe-quick-badge.done {
    color: #047857;
    background: #ecfdf5;
    border-color: #6ee7b7;
  }
`;
document.head.appendChild(style);

/**
 * Initialize project explorer and bind one-time global listeners.
 * @async
 * @returns {Promise<void>}
 */
function initProjectExplorer() {
  const container = document.getElementById('pe-tree-container');
  if (!container) return;

  if (!projectExplorerState.listenersBound) {
    document.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('.file-tree-context-menu')) return;
      hideFileTreeContextMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideFileTreeContextMenu();
    });
    window.addEventListener('scroll', hideFileTreeContextMenu, true);
    window.addEventListener('wheel', hideFileTreeContextMenu, { passive: true });
    projectExplorerState.listenersBound = true;
  }

  loadProjectRoot();
  refreshProjectExplorerScanStatus();
  updatePeQuickGuide();
}

const FOLDER_OPEN_ICON = '\u{1F4C2}';
const FOLDER_CLOSED_ICON = '\u{1F4C1}';

/**
 * Debounced search over the project tree root.
 */
let searchTimeout;
async function handleSearch(query, rootLi) {
  const rootUl = rootLi.querySelector('ul');
  if (!rootUl) return;

  if (searchTimeout) clearTimeout(searchTimeout);

  if (!query) {
    searchTimeout = setTimeout(async () => {
      try {
        rootUl.innerHTML = `<li class="loading">${i18n.t('fileTree.loading')}</li>`;
        const data = await fetchFiles('');
        rootUl.innerHTML = '';
        data.forEach((childItem) => {
          const childLi = createTreeItemDOM(childItem);
          rootUl.appendChild(childLi);
        });
      } catch (error) {
        console.error(error);
      }
    }, 200);
    return;
  }

  searchTimeout = setTimeout(async () => {
    try {
      rootUl.innerHTML = `<li style="padding:8px 0 8px 24px;color:#94a3b8;font-size:12px;">${i18n.t('fileTree.searching')}</li>`;

      const results = await searchFilesApi(query);
      rootUl.innerHTML = '';

      if (results.length === 0) {
        rootUl.innerHTML = `<li style="padding:8px 0 8px 24px;color:#94a3b8;font-size:12px;">${i18n.t('fileTree.noFilesFound')}</li>`;
        return;
      }

      results.forEach((item) => {
        const li = createTreeItemDOM(item);
        const textSpan = li.querySelector('.tree-text');
        if (textSpan) {
          textSpan.innerHTML = `${item.name} <span style="color:#94a3b8;font-size:10px;margin-left:4px;">(${item.path})</span>`;
          textSpan.title = item.path;
        }
        rootUl.appendChild(li);
      });

      rootUl.style.display = 'block';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (error) {
      console.error(error);
      rootUl.innerHTML = `<li style="color:red;padding:8px;">${peT('fileTree.loadFailed', 'Load failed:')} ${error.message}</li>`;
    }
  }, 300);
}

/**
 * Load root files and render the project tree.
 * @async
 * @returns {Promise<void>}
 */
async function loadProjectRoot() {
  const container = document.getElementById('pe-tree-container');
  if (!container) return;

  container.innerHTML = `<div class="file-tree-loading">${peT('fileTree.loading', 'Loading...')}</div>`;

  try {
    const [data, stats] = await Promise.all([fetchFiles(''), fetchProjectStats()]);

    const rootNode = {
      name: i18n.t('fileTree.root'),
      displayName: `${i18n.t('fileTree.root')} <span style="font-size:10px;background:var(--primary, #3b82f6);color:white;padding:1px 6px;border-radius:10px;margin-left:6px;vertical-align:middle;font-weight:normal;box-shadow: 0 1px 2px rgba(0,0,0,0.1);">${i18n.t('fileTree.fileCount', { 0: stats.fileCount })}</span>`,
      path: '',
      isDirectory: true,
      children: data,
      isRoot: true,
    };

    renderTree(rootNode, container);
    await refreshProjectExplorerScanStatus();
  } catch (error) {
    container.innerHTML = `<div class="file-tree-loading" style="color:var(--danger)">${peT('fileTree.loadFailed', 'Load failed:')} ${error.message}</div>`;
  }
}

// ===== Tree Rendering =====
/**
 * Render a tree from root payload.
 * @param {Object|Array} rootItem
 * @param {HTMLElement} container
 */
function renderTree(rootItem, container) {
  if (!rootItem) {
    container.innerHTML = `<div class="file-tree-loading">${peT('fileTree.loading', 'Loading...')}</div>`;
    return;
  }

  container.innerHTML = '';
  const ul = document.createElement('ul');
  ul.className = 'file-tree config-tree';
  ul.style.marginLeft = '0';

  if (rootItem.isRoot) {
    const rootLi = createTreeItemDOM(rootItem);

    const rootRow = rootLi.querySelector('.tree-row');
    if (rootRow) {
      rootRow.style.position = 'sticky';
      rootRow.style.top = '0';
      rootRow.style.zIndex = '10';
      rootRow.style.backgroundColor = '#fff';
      rootRow.style.borderBottom = '1px solid #e2e8f0';
      rootRow.style.width = '100%';

      const searchContainer = document.createElement('div');
      searchContainer.style.marginLeft = 'auto';
      searchContainer.style.display = 'flex';
      searchContainer.style.alignItems = 'center';
      searchContainer.onclick = (e) => e.stopPropagation();

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = i18n.t('fileTree.searchPlaceholder');
      searchInput.className = 'tree-search-input';
      Object.assign(searchInput.style, {
        padding: '2px 6px',
        fontSize: '12px',
        border: '1px solid #e2e8f0',
        borderRadius: '4px',
        width: '100px',
        height: '22px',
        outline: 'none',
        transition: 'all 0.2s',
        color: '#475569',
        marginRight: '4px',
      });

      searchInput.onfocus = () => {
        searchInput.style.width = '160px';
        searchInput.style.borderColor = '#3b82f6';
        searchInput.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.1)';
      };
      searchInput.onblur = () => {
        if (!searchInput.value) {
          searchInput.style.width = '100px';
          searchInput.style.borderColor = '#e2e8f0';
          searchInput.style.boxShadow = 'none';
        }
      };
      searchInput.oninput = (e) => {
        const q = e.target.value.trim();
        handleSearch(q, rootLi);
      };
      searchContainer.appendChild(searchInput);

      const refreshBtn = document.createElement('div');
      refreshBtn.id = 'pe-refresh-btn';
      refreshBtn.className = 'tree-refresh-btn';
      refreshBtn.innerHTML = '<i data-lucide="refresh-cw"></i>';
      refreshBtn.title = i18n.t('fileTree.refresh');
      refreshBtn.onclick = (e) => {
        e.stopPropagation();
        searchInput.value = '';
        showProjectExplorerGuidePanel();

        const icon = refreshBtn.querySelector('i');
        if (icon) {
          icon.style.transition = 'transform 0.5s';
          icon.style.transform = 'rotate(180deg)';
        }

        setTimeout(async () => {
          await loadProjectRoot();
          markPeQuickGuideStep('refresh', peT('projectExplorer.quickDoneRefresh', 'Tree refreshed'));
        }, 300);
      };

      refreshBtn.style.marginRight = '8px';
      refreshBtn.style.cursor = 'pointer';
      refreshBtn.style.display = 'flex';
      refreshBtn.style.alignItems = 'center';
      refreshBtn.style.justifyContent = 'center';
      refreshBtn.style.width = '24px';
      refreshBtn.style.height = '24px';
      refreshBtn.style.borderRadius = '4px';
      refreshBtn.style.color = '#64748b';
      refreshBtn.onmouseover = () => {
        refreshBtn.style.backgroundColor = '#f1f5f9';
        refreshBtn.style.color = '#3b82f6';
      };
      refreshBtn.onmouseout = () => {
        refreshBtn.style.backgroundColor = 'transparent';
        refreshBtn.style.color = '#64748b';
      };
      searchContainer.appendChild(refreshBtn);

      const statusText = document.createElement('span');
      statusText.id = 'pe-scan-status';
      statusText.style.fontSize = '11px';
      statusText.style.color = '#64748b';
      statusText.style.marginLeft = '8px';
      statusText.style.whiteSpace = 'nowrap';
      statusText.style.display = 'inline-block';
      statusText.style.maxWidth = '360px';
      statusText.style.overflow = 'hidden';
      statusText.style.textOverflow = 'ellipsis';
      statusText.textContent = peT('projectExplorer.scanStatusLoading', 'Loading scan status...');
      searchContainer.appendChild(statusText);

      rootRow.appendChild(searchContainer);

      const icon = refreshBtn.querySelector('i');
      if (icon) {
        icon.style.width = '14px';
        icon.style.height = '14px';
      }
    }

    projectExplorerState.expandedPaths.add(rootItem.path);
    rootLi.classList.remove('collapsed');
    const rowDiv = rootLi.querySelector('.tree-row');
    const toggleSpan = rowDiv.querySelector('.tree-toggle');
    if (toggleSpan) toggleSpan.textContent = '-';

    const childUl = document.createElement('ul');
    childUl.className = 'config-tree';
    childUl.style.display = 'block';
    if (rootItem.children && rootItem.children.length > 0) {
      rootItem.children.forEach((child) => {
        childUl.appendChild(createTreeItemDOM(child));
      });
    }

    rootLi.appendChild(childUl);
    ul.appendChild(rootLi);
  } else if (Array.isArray(rootItem)) {
    rootItem.forEach((item) => {
      ul.appendChild(createTreeItemDOM(item));
    });
  } else {
    ul.appendChild(createTreeItemDOM(rootItem));
  }

  container.appendChild(ul);
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * Build one tree row item and wire its interactions.
 * @param {Object} item
 * @param {string} [item.annotation] Optional annotation text.
 * @returns {HTMLLIElement}
 */
function createTreeItemDOM(item) {
  const li = document.createElement('li');
  if (!item.isDirectory) {
    li.classList.add('tree-item-file');
  }
  const isExpanded = projectExplorerState.expandedPaths.has(item.path);

  const rowDiv = document.createElement('div');
  rowDiv.className = `tree-row ${item.isDirectory ? 'tree-group' : 'tree-command'}`;
  rowDiv.dataset.path = item.path;

  const hasAnnotation = item.annotation && item.annotation.trim().length > 0;
  const iconConfig = getFileIconConfig(item, isExpanded);
  const toggleContent = item.isDirectory ? (isExpanded ? '-' : '+') : '';

  let iconHtml = '';
  if (iconConfig.type === 'image') {
    iconHtml = `<span class="tree-icon"><img src="${iconConfig.value}" style="width:20px;height:20px;"></span>`;
  } else if (iconConfig.type === 'devicon') {
    iconHtml = `<span class="tree-icon"><i class="${iconConfig.value}"></i></span>`;
  } else if (iconConfig.type === 'emoji') {
    iconHtml = `<span class="tree-icon" style="font-size:18px;">${iconConfig.value}</span>`;
  } else {
    iconHtml = `<span class="tree-icon"><i data-lucide="${iconConfig.value}" style="${iconConfig.color ? `color:${iconConfig.color};` : ''}"></i></span>`;
  }

  rowDiv.innerHTML = `
    <span class="tree-toggle">${toggleContent}</span>
    ${iconHtml}
    <span class="tree-text" title="${item.path}" style="flex: 0 1 auto;">${item.displayName || item.name}</span><span class="tree-copy-btn" title="${i18n.t('fileTree.copyName')}" onclick="event.stopPropagation(); navigator.clipboard.writeText('${item.name.replace(/'/g, "\\'")}').then(() => { const btn = this; btn.classList.add('copied'); const icon = btn.querySelector('i'); if(icon) { icon.setAttribute('data-lucide', 'check'); if(typeof lucide!=='undefined')lucide.createIcons(); setTimeout(() => { icon.setAttribute('data-lucide', 'copy'); btn.classList.remove('copied'); if(typeof lucide!=='undefined')lucide.createIcons(); }, 1000); } });"><i data-lucide="copy" style="width:14px;height:14px;"></i></span>
    ${item.purpose ? `<span class="tree-purpose-text" title="${item.purpose.replace(/"/g, '&quot;')}">${item.purpose.length > 20 ? `${item.purpose.substring(0, 20)}...` : item.purpose}</span>` : ''}
    <span style="flex:1;"></span>
    ${hasAnnotation ? '<i data-lucide="message-square" style="width:12px;height:12px;color:#3b82f6;margin-left:auto;"></i>' : ''}
  `;

  if (iconConfig.type === 'image') {
    const img = rowDiv.querySelector('span.tree-icon > img');
    if (img) {
      img.onerror = function onIconError() {
        const fallback = document.createElement('i');
        fallback.setAttribute('data-lucide', 'file');
        fallback.style.color = '#94a3b8';
        fallback.style.width = '20px';
        fallback.style.height = '20px';
        this.replaceWith(fallback);
        if (typeof lucide !== 'undefined') lucide.createIcons();
      };
    }
  }

  rowDiv.onclick = async (e) => {
    e.stopPropagation();
    document.querySelectorAll('#pe-tree-container .tree-row').forEach((el) => el.classList.remove('selected'));
    rowDiv.classList.add('selected');
    showFileDetails(item);

    if (item.isDirectory) {
      await toggleDirectory(item, li, rowDiv);
    }
  };

  rowDiv.oncontextmenu = (e) => {
    e.preventDefault();
    e.stopPropagation();

    document.querySelectorAll('#pe-tree-container .tree-row').forEach((el) => el.classList.remove('selected'));
    rowDiv.classList.add('selected');
    showFileDetails(item);
    showFileTreeContextMenu(e, item, li);
  };

  li.appendChild(rowDiv);

  if (isExpanded && item.isDirectory && !item.isRoot) {
    loadDirectoryContent(item, li);
  } else if (item.isDirectory && !isExpanded) {
    li.classList.add('collapsed');
  }

  return li;
}

/**
 * Render and position context menu for a tree item.
 * @param {MouseEvent} e
 * @returns {void}
 */
function showFileTreeContextMenu(e, _item, _li) {
  try {
    hideFileTreeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'file-tree-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const createItem = (icon, text, onClick) => {
      const div = document.createElement('div');
      div.className = 'file-tree-context-menu-item';
      div.innerHTML = `<i data-lucide="${icon}" style="width:14px;height:14px;"></i> ${text}`;
      div.onclick = (ev) => {
        ev.stopPropagation();
        hideFileTreeContextMenu();
        onClick();
      };
      return div;
    };

    menu.appendChild(
      createItem(
        'shield-alert',
        peT('projectExplorer.fsWriteDisabled', 'File operations are disabled in project explorer'),
        () => showReadOnlyFsAlert()
      )
    );

    document.body.appendChild(menu);
    projectExplorerState.contextMenuEl = menu;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
    }
    if (typeof lucide !== 'undefined') {
      try {
        lucide.createIcons();
      } catch (_error) {
        // Keep menu usable even if icon refresh fails.
      }
    }
  } catch (_error) {
    hideFileTreeContextMenu();
  }
}

/**
 * Notify that file operations are disabled in read-only mode.
 */
function showReadOnlyFsAlert() {
  alert(peT('projectExplorer.fsWriteDisabled', 'File operations are disabled in project explorer'));
}

async function handleCreate(_parentItem, _type) {
  showReadOnlyFsAlert();
}

async function handleDelete(_item) {
  showReadOnlyFsAlert();
}

async function handleRename(_item) {
  showReadOnlyFsAlert();
}

async function refreshNode(item) {
  if (item.isRoot || item.path === '') {
    loadProjectRoot();
    return;
  }

  const selector = `.tree-row[data-path="${item.path}"]`;
  const rowDiv = document.querySelector(selector);
  if (!rowDiv) return;

  const li = rowDiv.parentNode;
  const oldUl = li.querySelector('ul');
  if (oldUl) oldUl.remove();

  projectExplorerState.expandedPaths.add(item.path);
  li.classList.remove('collapsed');
  const toggleSpan = rowDiv.querySelector('.tree-toggle');
  if (toggleSpan) toggleSpan.textContent = '-';

  await loadDirectoryContent(item, li);

  const icon = rowDiv.querySelector('.tree-icon');
  if (icon && item.isDirectory) {
    if (icon.tagName === 'SPAN') {
      icon.textContent = FOLDER_OPEN_ICON;
    } else {
      const newIcon = document.createElement('span');
      newIcon.className = 'tree-icon';
      newIcon.textContent = FOLDER_OPEN_ICON;
      icon.replaceWith(newIcon);
    }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Toggle directory expand/collapse and lazy-load children.
 * @async
 * @returns {Promise<void>}
 */
async function toggleDirectory(item, li, rowDiv) {
  const isExpanded = projectExplorerState.expandedPaths.has(item.path);
  const toggleSpan = rowDiv.querySelector('.tree-toggle');
  const icon = rowDiv.querySelector('.tree-icon');

  if (isExpanded) {
    projectExplorerState.expandedPaths.delete(item.path);
    li.classList.add('collapsed');
    if (toggleSpan) toggleSpan.textContent = '+';
    const childUl = li.querySelector('ul');
    if (childUl) childUl.style.display = 'none';

    if (icon && icon.tagName === 'SPAN') {
      icon.textContent = FOLDER_CLOSED_ICON;
    }
  } else {
    projectExplorerState.expandedPaths.add(item.path);
    li.classList.remove('collapsed');
    if (toggleSpan) toggleSpan.textContent = '-';

    const childUl = li.querySelector('ul');
    if (!childUl) {
      await loadDirectoryContent(item, li);
    } else {
      childUl.style.display = 'block';
    }

    if (icon && icon.tagName === 'SPAN') {
      icon.textContent = FOLDER_OPEN_ICON;
    }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Load one directory's children into an existing list item.
 * @async
 * @returns {Promise<void>}
 */
async function loadDirectoryContent(item, li) {
  let ul = li.querySelector('ul');
  if (!ul) {
    ul = document.createElement('ul');
    ul.className = 'config-tree';
    li.appendChild(ul);
  }

  ul.innerHTML = `<li class="loading" style="padding:8px 0 8px 24px;color:#94a3b8;font-size:12px;">${i18n.t('fileTree.loading')}</li>`;

  try {
    const children = await fetchFiles(item.path);

    ul.innerHTML = '';
    if (children.length === 0) {
      ul.innerHTML = `<li class="empty-dir" style="padding:8px 0 8px 24px;color:#94a3b8;font-size:12px;">${i18n.t('fileTree.emptyDir')}</li>`;
    } else {
      children.forEach((child) => {
        const childLi = createTreeItemDOM(child);
        ul.appendChild(childLi);
      });
    }

    ul.style.display = 'block';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (error) {
    console.error(error);
    ul.innerHTML = `<li class="error" style="padding:8px 0 8px 24px;color:red;font-size:12px;">${i18n.t('fileTree.loadFailed')} ${error.message}</li>`;
  }
}


window.initProjectExplorer = initProjectExplorer;
window.peQuickAction = peQuickAction;
window.markPeQuickGuideStep = markPeQuickGuideStep;

