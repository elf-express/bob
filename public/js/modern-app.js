
let config = null;
let categories = [];
let currentView = 'config';
let timerInterval = null;
let timerSeconds = 0;
let categorySortable = null;
let commandSortables = [];
let activeRunXhr = null;
let runInProgress = false;
let runAbortRequested = false;
const REPLACEMENT_CHAR = '\uFFFD';
const SUSPICIOUS_QUESTION_REGEX = /\?{2,}|\?[^\x00-\x7F]/;
const LATIN1_MOJIBAKE_REGEX = /(Ã|Â|æ|ç|ð)/;
let dependenciesState = {
  items: [],
  lastScanAt: null,
  scope: '',
  q: '',
  loaded: false,
};

function tr(key, fallback = '', params = {}) {
  if (typeof i18n !== 'undefined') {
    const value = i18n.t(key, params);
    if (
      value &&
      value !== key &&
      !['undefined', 'null'].includes(String(value).trim().toLowerCase())
    ) {
      return value;
    }
  }
  return fallback || key;
}

function hasMojibake(value) {
  if (typeof value !== 'string') return false;
  return (
    value.includes(REPLACEMENT_CHAR) ||
    SUSPICIOUS_QUESTION_REGEX.test(value) ||
    /[\uE000-\uF8FF]/.test(value) ||
    LATIN1_MOJIBAKE_REGEX.test(value)
  );
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text || ['undefined', 'null'].includes(text.toLowerCase()) || hasMojibake(text)) {
    return fallback;
  }
  return text;
}

function groupLabel(group, index = 0) {
  const id = String(group?.id || '').toLowerCase();
  const lang = currentLangCode();
  const localizedById = {
    uncategorized: { 'zh-TW': '未分類', 'zh-CN': '未分类', 'en-US': 'Uncategorized' },
    application: { 'zh-TW': '應用', 'zh-CN': '应用', 'en-US': 'Application' },
    development: { 'zh-TW': '開發', 'zh-CN': '开发', 'en-US': 'Development' },
    quality: { 'zh-TW': '品質', 'zh-CN': '质量', 'en-US': 'Quality' },
    deploy: { 'zh-TW': '部署', 'zh-CN': '部署', 'en-US': 'Deploy' },
  };
  const localized = localizedById[id]?.[lang] || localizedById[id]?.['en-US'] || '';
  if (localized) return localized;
  return normalizeText(group?.name, `Group ${index + 1}`);
}

function groupDescription(group) {
  const id = String(group?.id || '').toLowerCase();
  const lang = currentLangCode();
  const localizedById = {
    uncategorized: {
      'zh-TW': '尚未分類命令',
      'zh-CN': '尚未分类命令',
      'en-US': 'Commands waiting for categorization',
    },
    application: {
      'zh-TW': '專案與環境相關命令',
      'zh-CN': '项目与环境相关命令',
      'en-US': 'Project and environment commands',
    },
    development: {
      'zh-TW': '本機開發流程',
      'zh-CN': '本地开发流程',
      'en-US': 'Local development workflows',
    },
    quality: {
      'zh-TW': '檢查與測試',
      'zh-CN': '检查与测试',
      'en-US': 'Checks and tests',
    },
    deploy: {
      'zh-TW': '建置與發佈',
      'zh-CN': '构建与发布',
      'en-US': 'Build and release',
    },
  };
  const localized = localizedById[id]?.[lang] || localizedById[id]?.['en-US'] || '';
  if (localized) return localized;
  return normalizeText(group?.description, '');
}

function categoryLabel(cat) {
  const id = String(cat?.id || '').trim();
  const lang = currentLangCode();
  const localizedById = {
    uncategorized: { 'zh-TW': '未分類', 'zh-CN': '未分类', 'en-US': 'Uncategorized' },
    'env-install': { 'zh-TW': '環境安裝', 'zh-CN': '环境安装', 'en-US': 'Environment Install' },
    clean: { 'zh-TW': '清理維護', 'zh-CN': '清理维护', 'en-US': 'Cleanup' },
    diag: { 'zh-TW': '診斷', 'zh-CN': '诊断', 'en-US': 'Diagnostics' },
    'web-dev': { 'zh-TW': 'Web 開發', 'zh-CN': 'Web 开发', 'en-US': 'Web Development' },
    'web-build': { 'zh-TW': 'Web 建置', 'zh-CN': 'Web 构建', 'en-US': 'Web Build' },
    'desktop-dev': { 'zh-TW': '桌面開發', 'zh-CN': '桌面开发', 'en-US': 'Desktop Development' },
    'dev-tools': { 'zh-TW': '開發工具', 'zh-CN': '开发工具', 'en-US': 'Dev Tools' },
    check: { 'zh-TW': '程式碼檢查', 'zh-CN': '代码检查', 'en-US': 'Code Check' },
    'lint-fix': { 'zh-TW': '自動修復', 'zh-CN': '自动修复', 'en-US': 'Auto Fix' },
    test: { 'zh-TW': '測試', 'zh-CN': '测试', 'en-US': 'Test' },
    release: { 'zh-TW': '發佈', 'zh-CN': '发布', 'en-US': 'Release' },
    docker: { 'zh-TW': 'Docker', 'zh-CN': 'Docker', 'en-US': 'Docker' },
  };
  const localized = localizedById[id]?.[lang] || localizedById[id]?.['en-US'] || '';
  if (localized) return localized;
  const key = /^[a-z0-9][a-z0-9-]*$/i.test(id) ? `categories.${id}.name` : null;
  const fallback = (key ? tr(key, '') : '') || (id ? id.replace(/-+/g, ' ').trim() : tr('configEditor.unnamedCategory', 'Unnamed Category'));
  return normalizeText(cat?.name, fallback);
}

function refreshIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function uiText(key) {
  return tr(key, key);
}

async function saveWithRollback(rollbackFn, successMsg, errorMsg, options = {}) {
  const saved = await autoSaveConfig();
  if (!saved) {
    if (rollbackFn) rollbackFn();
    showAlert({ type: 'error', title: tr('alerts.saveFailed', 'Save failed'), message: errorMsg });
    return false;
  }
  renderConfigEditor();
  showAlert({ type: 'success', title: tr('alerts.success', 'Success'), message: successMsg });
  return true;
}

function setAllInCategory(categoryId, checked) {
  const checkboxes = document.querySelectorAll(`input[data-category="${categoryId}"]`);
  checkboxes.forEach(cb => cb.checked = checked);
}

let selectedNode = {
  type: null,      // 'group' | 'category' | 'command' | null
  groupIdx: null,
  catIdx: null,
  cmdIdx: null
};

function showModal({ title, html, buttons = [], onClose }) {
  hideContextMenu();
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');
  const closeBtn = document.getElementById('modal-close');

  modalTitle.textContent = title;
  modalBody.innerHTML = html;

  modalFooter.innerHTML = '';
  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.className = btn.primary ? 'btn btn-primary' : 'btn btn-secondary';
    button.textContent = btn.text;
    button.onclick = () => {
      if (btn.onClick) btn.onClick();
    };
    modalFooter.appendChild(button);
  });

  const close = () => {
    overlay.style.display = 'none';
    if (onClose) onClose();
  };

  closeBtn.onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  overlay.style.display = 'flex';
  
  refreshIcons();
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'none';
}

function selectNode(type, groupIdx, catIdx, cmdIdx, event) {
  hideContextMenu();
  event.stopPropagation();
  event.preventDefault();
  
  document.querySelectorAll('.tree-row').forEach(el => {
    el.classList.remove('selected');
  });
  
  selectedNode = { type, groupIdx, catIdx, cmdIdx };
  
  const target = event.currentTarget;
  target.classList.add('selected');
  
  if (event.button === 0 && (type === 'group' || type === 'category')) {
    const li = target.closest('li');
    const childUl = li.querySelector(':scope > ul');
    if (childUl) {
      li.classList.toggle('collapsed');
      const toggle = target.querySelector('.tree-toggle');
      if (toggle && toggle.textContent.trim()) {
        toggle.textContent = li.classList.contains('collapsed') ? '+' : '-';
      }
    }
  }
}

function showContextMenu(event, type, groupIdx, catIdx, cmdIdx) {
  event.preventDefault();
  event.stopPropagation();
  
  selectNode(type, groupIdx, catIdx, cmdIdx, event);
  
  const menu = document.getElementById('context-menu');
  let menuHtml = '';
  
  if (type === 'root') {
    menuHtml = `
      <div class="context-menu-item" onclick="addGroup(); hideContextMenu();">
        <i data-lucide="plus"></i>
        <span>${uiText('ctx.addGroup')}</span>
      </div>
    `;
  } else if (type === 'group') {
    menuHtml = `
      <div class="context-menu-item" onclick="addCategory(${groupIdx}); hideContextMenu();">
        <i data-lucide="plus"></i>
        <span>${uiText('ctx.addCategory')}</span>
      </div>
      <div class="context-menu-item" onclick="editGroup(${groupIdx}); hideContextMenu();">
        <i data-lucide="edit-2"></i>
        <span>${uiText('ctx.editGroup')}</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" onclick="deleteGroup(${groupIdx}); hideContextMenu();">
        <i data-lucide="trash-2"></i>
        <span>${uiText('ctx.deleteGroup')}</span>
      </div>
    `;
  } else if (type === 'category') {
    menuHtml = `
      <div class="context-menu-item" onclick="addCommand(${groupIdx}, ${catIdx}); hideContextMenu();">
        <i data-lucide="plus"></i>
        <span>${uiText('ctx.addCommand')}</span>
      </div>
      <div class="context-menu-item" onclick="editCategory(${groupIdx}, ${catIdx}); hideContextMenu();">
        <i data-lucide="edit-2"></i>
        <span>${uiText('ctx.editCategory')}</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" onclick="deleteCategory(${groupIdx}, ${catIdx}); hideContextMenu();">
        <i data-lucide="trash-2"></i>
        <span>${uiText('ctx.deleteCategory')}</span>
      </div>
    `;
  } else if (type === 'command') {
    const command = config.groups?.[groupIdx]?.categories?.[catIdx]?.commands?.[cmdIdx];
    const showRestore = command?.descMode === 'manual';
    menuHtml = `
      <div class="context-menu-item" onclick="editCommand(${groupIdx}, ${catIdx}, ${cmdIdx}); hideContextMenu();">
        <i data-lucide="edit-2"></i>
        <span>${uiText('ctx.editCommand')}</span>
      </div>
      ${
        showRestore
          ? `
      <div class="context-menu-item" onclick="restoreAutoCommandDescription(${groupIdx}, ${catIdx}, ${cmdIdx}); hideContextMenu();">
        <i data-lucide="refresh-ccw"></i>
        <span>${tr('ctx.restoreAutoDesc', 'Restore Auto Description')}</span>
      </div>
      `
          : ''
      }
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" onclick="deleteCommand(${groupIdx}, ${catIdx}, ${cmdIdx}); hideContextMenu();">
        <i data-lucide="trash-2"></i>
        <span>${uiText('ctx.deleteCommand')}</span>
      </div>
    `;
  }
  
  menu.innerHTML = `
    <div class="context-menu-header">
      <span>${uiText('configEditor.contextMenuTitle')}</span>
      <button
        type="button"
        class="context-menu-close"
        aria-label="${uiText('ctx.closeMenu')}"
        title="${uiText('ctx.closeMenu')}"
        onclick="event.stopPropagation(); hideContextMenu();"
      >
        <i data-lucide="x"></i>
      </button>
    </div>
    ${menuHtml}
  `;
  menu.style.display = 'block';
  menu.style.left = '0px';
  menu.style.top = '0px';

  const menuRect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 8;
  let left = event.clientX;
  let top = event.clientY;

  if (left + menuRect.width + margin > viewportWidth) {
    left = Math.max(margin, viewportWidth - menuRect.width - margin);
  }
  if (top + menuRect.height + margin > viewportHeight) {
    top = Math.max(margin, viewportHeight - menuRect.height - margin);
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  
  refreshIcons();
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.style.display = 'none';
}

document.addEventListener('click', (event) => {
  const menu = document.getElementById('context-menu');
  if (!menu || menu.style.display === 'none') return;
  if (!event.target.closest('#context-menu')) {
    hideContextMenu();
  }
});

document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.tree-group, .tree-category, .tree-command')) {
    e.preventDefault();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideContextMenu();
  }
});

document.addEventListener(
  'scroll',
  () => {
    hideContextMenu();
  },
  true
);

document.addEventListener(
  'wheel',
  () => {
    hideContextMenu();
  },
  { passive: true }
);

function showFormModal({ title, fields = [], onSubmit }) {
  const html = fields.map(field => `
    <div class="form-group">
      <label class="form-label">
        ${field.label}
        ${field.required ? '<span class="required">*</span>' : ''}
      </label>
      ${field.type === 'textarea' ? `
        <textarea 
          class="form-textarea" 
          name="${field.name}" 
          placeholder="${field.placeholder || ''}" 
          ${field.required ? 'required' : ''}
        ></textarea>
      ` : field.type === 'select' ? `
        <select class="form-input" name="${field.name}" ${field.required ? 'required' : ''}>
          ${(field.options || []).map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('')}
        </select>
      ` : `
        <div class="form-input-wrapper">
          <input 
            type="${field.type || 'text'}" 
            class="form-input" 
            name="${field.name}" 
            placeholder="${field.placeholder || ''}" 
            ${field.required ? 'required' : ''}
          />
          <button type="button" class="form-input-clear" title="Clear field" style="display:none;">
            <i data-lucide="x" style="width:14px;height:14px;"></i>
          </button>
        </div>
      `}
      ${field.hint ? `<span class="form-hint">${field.hint}</span>` : ''}
    </div>
  `).join('');

  showModal({
    title,
    html,
    buttons: [
      {
        text: uiText('common.cancel'),
        onClick: () => closeModal()
      },
      {
        text: uiText('common.save'),
        primary: true,
        onClick: async () => {
          const formData = {};
          let valid = true;

          fields.forEach(field => {
            const input = document.querySelector(`[name="${field.name}"]`);
            const value = input.value.trim();

            if (field.required && !value) {
              input.style.borderColor = '#ef4444';
              valid = false;
            } else {
              input.style.borderColor = '';
              formData[field.name] = value;
            }
          });

          if (valid) {
            try {
              if (onSubmit) {
                const submitted = await onSubmit(formData);
                if (submitted === false) return;
              }
              closeModal();
            } catch (error) {
              showAlert({
                type: 'error',
                title: tr('common.error', 'Error'),
                message: error?.message || tr('errors.unknown', 'Unknown error'),
              });
            }
          }
        }
      }
    ]
  });

  fields.forEach(field => {
    const input = document.querySelector(`[name="${field.name}"]`);
    if (input && field.value != null) {
      input.value = field.value;
    }
  });

  document.querySelectorAll('.form-input-wrapper').forEach(wrapper => {
    const input = wrapper.querySelector('.form-input');
    const clearBtn = wrapper.querySelector('.form-input-clear');
    if (!input || !clearBtn) return;

    const toggleClear = () => {
      clearBtn.style.display = input.value.length > 0 ? 'flex' : 'none';
    };
    toggleClear();
    input.addEventListener('input', toggleClear);
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      input.focus();
    });
  });
}

function showConfirm({
  title,
  message,
  onConfirm,
  confirmText = tr('common.confirm', 'Confirm'),
  cancelText = tr('common.cancel', 'Cancel'),
}) {
  showModal({
    title,
    html: `<p style="font-size: 15px; line-height: 1.6; color: #475569;">${message}</p>`,
    buttons: [
      {
        text: cancelText,
        onClick: () => closeModal()
      },
      {
        text: confirmText,
        primary: true,
        onClick: () => {
          closeModal();
          if (onConfirm) onConfirm();
        }
      }
    ]
  });
}

function showAlert({ title, message, type = 'info' }) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  showModal({
    title: `${icons[type]} ${title}`,
    html: `<p style="font-size: 15px; line-height: 1.6; color: #475569;">${message}</p>`,
    buttons: [
      {
        text: tr('common.confirm', 'Confirm'),
        primary: true,
        onClick: () => closeModal()
      }
    ]
  });
}

function ansiToHtml(text) {
  const ansiRegex = /\x1b\[(\d+)(;\d+)*m/g;
  let html = '';
  let lastIndex = 0;
  let currentClasses = [];

  const codeMap = {
    0: 'reset', 1: 'ansi-bold', 2: 'ansi-dim', 3: 'ansi-italic', 4: 'ansi-underline',
    30: 'ansi-black', 31: 'ansi-red', 32: 'ansi-green', 33: 'ansi-yellow',
    34: 'ansi-blue', 35: 'ansi-magenta', 36: 'ansi-cyan', 37: 'ansi-white',
    90: 'ansi-bright-black', 91: 'ansi-bright-red', 92: 'ansi-bright-green',
    93: 'ansi-bright-yellow', 94: 'ansi-bright-blue', 95: 'ansi-bright-magenta',
    96: 'ansi-bright-cyan', 97: 'ansi-bright-white',
    40: 'ansi-bg-black', 41: 'ansi-bg-red', 42: 'ansi-bg-green', 43: 'ansi-bg-yellow',
    44: 'ansi-bg-blue', 45: 'ansi-bg-magenta', 46: 'ansi-bg-cyan', 47: 'ansi-bg-white',
  };

  text.replace(ansiRegex, (match, code, extraCodes, offset) => {
    if (offset > lastIndex) {
      const textSegment = text.slice(lastIndex, offset);
      if (currentClasses.length > 0) {
        html += `<span class="${currentClasses.join(' ')}">${escapeHtml(textSegment)}</span>`;
      } else {
        html += escapeHtml(textSegment);
      }
    }

    const codes = [code, ...(extraCodes ? extraCodes.slice(1).split(';') : [])];
    codes.forEach(c => {
      const num = parseInt(c);
      if (num === 0) currentClasses = [];
      else if (codeMap[num] && !currentClasses.includes(codeMap[num])) {
        currentClasses.push(codeMap[num]);
      }
    });

    lastIndex = offset + match.length;
    return '';
  });

  if (lastIndex < text.length) {
    const textSegment = text.slice(lastIndex);
    if (currentClasses.length > 0) {
      html += `<span class="${currentClasses.join(' ')}">${escapeHtml(textSegment)}</span>`;
    } else {
      html += escapeHtml(textSegment);
    }
  }

  return html || escapeHtml(text);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof i18n !== 'undefined') {
    await i18n.init({
      defaultLanguage: 'en-US',
      detectBrowserLanguage: true,
    });
    updateI18n();
    setupLanguageSwitcher();
  }

  initTheme();
  
  initNavigation();
  
  await loadConfig();
  
  setupEventListeners();
  
  renderView('config');
  
  refreshIcons();
});

function initTheme() {
  const savedTheme = localStorage.getItem('bob-theme') || 'classic-blue';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    const applyThemeSelectColor = () => {
      const selected = themeSelect.options[themeSelect.selectedIndex];
      const color = selected?.getAttribute('data-color') || '#334155';
      themeSelect.style.setProperty('--theme-dot-color', color);
      themeSelect.style.borderColor = color;
    };

    themeSelect.value = savedTheme;
    applyThemeSelectColor();
    themeSelect.addEventListener('change', (e) => {
      const theme = e.target.value;
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('bob-theme', theme);
      applyThemeSelectColor();
    });
  }
}

function initNavigation() {
  const sidebar = document.querySelector('.app-sidebar');
  if (!sidebar) return;
  
  sidebar.addEventListener('click', (e) => {
    hideContextMenu();
    const navItem = e.target.closest('.nav-item');
    if (!navItem) return;
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    navItem.classList.add('active');

    currentView = navItem.dataset.view;
    renderView(currentView);
  });
}

function renderView(view) {
  currentView = view;
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
  
  const viewContainer = document.querySelector(`[data-view-content="${view}"]`);
  if (viewContainer) {
    viewContainer.classList.add('active');
  }

  switch (view) {
    case 'terminal':
      break;
    case 'logs':
      loadLogs();
      break;
    case 'config':
      renderConfigEditor();
      break;
    case 'project-explorer':
      if (typeof initProjectExplorer === 'function') {
        initProjectExplorer();
      }
      break;
    case 'dependencies':
      renderDependenciesView();
      break;
  }
  
  refreshIcons();
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    config = data;
    categories = [];
    if (config.groups) {
      config.groups.forEach(group => {
        if (group.categories) {
          categories.push(...group.categories);
        }
      });
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

function toggleCategoryCard(header) {
  const card = header.parentElement;
  card.classList.toggle('collapsed');
}

function selectAllInCategory(categoryId) {
  setAllInCategory(categoryId, true);
}

function deselectAllInCategory(categoryId) {
  setAllInCategory(categoryId, false);
}

function copyCommandScript(btn, categoryId, cmdIndex) {
  let cmdText = '';
  if (config && config.groups) {
    for (const group of config.groups) {
      if (!group.categories) continue;
      for (const cat of group.categories) {
        if (cat.id === categoryId && cat.commands[cmdIndex]) {
          cmdText = cat.commands[cmdIndex].cmd;
          break;
        }
      }
      if (cmdText) break;
    }
  }
  if (!cmdText) return;

  navigator.clipboard.writeText(cmdText).then(() => {
    const icon = btn.querySelector('i, svg');
    if (icon) {
      const orig = icon.outerHTML;
      btn.innerHTML = '<i data-lucide="check" style="width:13px;height:13px;color:#22c55e;"></i>';
      refreshIcons();
      setTimeout(() => { btn.innerHTML = orig; refreshIcons(); }, 1200);
    }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = cmdText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function copyTerminalErrors() {
  const terminal = document.getElementById('terminal-output');
  if (!terminal) return;

  const rawText = terminal.innerText || terminal.textContent || '';
  if (!rawText.trim()) {
    showAlert({
      type: 'warning',
      title: tr('alerts.noOutput', 'No Output'),
      message: tr('terminal.noOutputToCopy', 'Nothing to copy from terminal output.'),
    });
    return;
  }

  const lines = rawText.split('\n');
  const exitCodeLine = lines.find((l) => /\[EXIT CODE:\s*(\d+)\]/.test(l));
  const exitCodeMatch = exitCodeLine ? exitCodeLine.match(/\[EXIT CODE:\s*(\d+)\]/) : null;
  const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;

  if (exitCode === 0) {
    const tail = lines.slice(-30).join('\n').trim();
    const text = `[Terminal Output - EXIT CODE 0]\n${tail}`;
    navigator.clipboard.writeText(text).then(() => {
      showAlert({ type: 'info', title: tr('alerts.copied', 'Copied'), message: tr('terminal.copiedLast30', 'Copied last 30 lines.') });
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showAlert({ type: 'info', title: tr('alerts.copied', 'Copied'), message: tr('terminal.copiedLast30', 'Copied last 30 lines.') });
    });
    return;
  }

  const excludePatterns = [
    /^stdout\s*\|/,
    /^stderr\s*\|/,
    /^\s*[✓✔✖✗]\s/,
    /^\s*Test Files\s/,
    /^\s*Tests\s+\d/,
    /^\s*Start at\s/,
    /^\s*Duration\s/,
    /^\s*%\s+Coverage/,
    /^-{5,}/,
    /^File\s+\|\s+%/,
    /^\s*RUN\s+v/,
    /^\s*Coverage enabled/,
    /^\s*DEPRECATED/,
  ];

  const errorPatterns = [
    /\bFAIL\b/,
    /\b(error|failed|failure|錯誤|失敗)\b/i,
    /TypeError:/,
    /ReferenceError:/,
    /SyntaxError:/,
    /RangeError:/,
    /Cannot find module/i,
    /Module not found/i,
    /ENOENT/,
    /EACCES/,
    /EPERM/,
    /\bERR[_!]/,
    /\bat\s+\S+\s+\(/,
    /\[EXIT CODE:\s*[^0]/,
    /exit\s*code\s*[^:0]/i,
    /AssertionError/i,
    /Expected.*Received/,
    /expected.*to\s+(be|equal|match|have)/i,
  ];

  const errorLineIndices = new Set();
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (excludePatterns.some((p) => p.test(trimmed))) return;

    if (errorPatterns.some((p) => p.test(line))) {
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 2); j++) {
        errorLineIndices.add(j);
      }
    }
  });

  if (errorLineIndices.size === 0) {
    const tail = lines.slice(-30).join('\n').trim();
    navigator.clipboard.writeText(tr('terminal.tailHeader', '[Terminal Output - last 30 lines]\n{tail}', { tail })).then(() => {
      showAlert({ type: 'info', title: tr('alerts.copied', 'Copied'), message: tr('terminal.copiedFallback', 'No obvious errors found. Copied last 30 lines.') });
    });
    return;
  }

  const sortedIndices = Array.from(errorLineIndices).sort((a, b) => a - b);
  let result = '[Terminal Error Summary]\n';
  let prevIdx = -2;
  for (const idx of sortedIndices) {
    if (idx - prevIdx > 1) result += '\n---\n';
    result += `${lines[idx]}\n`;
    prevIdx = idx;
  }

  navigator.clipboard.writeText(result.trim()).then(() => {
    showAlert({ type: 'success', title: tr('alerts.copied', 'Copied'), message: tr('terminal.copiedErrors', 'Copied {count} error-related lines.', { count: errorLineIndices.size }) });
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = result.trim();
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showAlert({ type: 'success', title: tr('alerts.copied', 'Copied'), message: tr('terminal.copiedErrors', 'Copied {count} error-related lines.', { count: errorLineIndices.size }) });
  });
}
async function runCommands() {
  const checked = Array.from(document.querySelectorAll('.command-checkbox:checked'));
  if (checked.length === 0) {
    alert(tr('alerts.noCommandSelected', 'Please select at least one command'));
    return;
  }
  const commands = checked.map(cb => cb.value);
  await executeCommandList(commands, { switchToTerminal: true, showBusyAlert: true });
}

async function runSingleConfigCommand(groupIdx, catIdx, cmdIdx) {
  const cmd = config?.groups?.[groupIdx]?.categories?.[catIdx]?.commands?.[cmdIdx]?.cmd;
  if (!cmd || !String(cmd).trim()) return;
  const commandText = String(cmd).trim();
  const escapedCmd = escapeHtml(commandText);
  showModal({
    title: tr('configEditor.runCommand', 'Run command'),
    html: `
      <p style="font-size: 14px; color: #334155; margin-bottom: 8px;">
        ${tr('configEditor.runConfirmMessage', 'Run this command now?')}
      </p>
      <pre style="background:#0f172a;color:#e2e8f0;border-radius:8px;padding:10px;overflow:auto;font-size:12px;line-height:1.45;">${escapedCmd}</pre>
    `,
    buttons: [
      {
        text: tr('common.cancel', 'Cancel'),
        onClick: () => closeModal(),
      },
      {
        text: tr('common.confirm', 'Confirm'),
        primary: true,
        onClick: async () => {
          closeModal();
          await executeCommandList([commandText], {
            switchToTerminal: true,
            showBusyAlert: true,
            singleRun: true,
          });
        },
      },
    ],
  });
}

function isRunActive() {
  return Boolean(runInProgress && activeRunXhr && activeRunXhr.readyState !== 4);
}

async function executeCommandList(
  commands,
  { switchToTerminal = true, showBusyAlert = false, singleRun = false } = {}
) {
  if (!Array.isArray(commands) || commands.length === 0) return;

  if (isRunActive()) {
    if (showBusyAlert) {
      showAlert({
        type: 'warning',
        title: tr('alerts.runBusy', 'Execution in progress'),
        message: tr('alerts.runBusy', 'Another command is running. Please stop it first.'),
      });
    }
    return;
  }

  if (switchToTerminal) {
    const terminalNav = document.querySelector('.nav-item[data-view="terminal"]');
    if (terminalNav) terminalNav.click();
  }

  const terminal = document.getElementById('terminal-output');
  const statusEl = document.getElementById('terminal-status');
  const abortBtn = document.getElementById('abort-btn');

  runAbortRequested = false;
  terminal.innerHTML = '';
  statusEl.textContent = i18n.t('status.executing');
  abortBtn.classList.remove('hidden');
  startTimer();
  runInProgress = true;

  try {
    const xhr = new XMLHttpRequest();
    activeRunXhr = xhr;
    xhr.open('POST', '/api/run', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    let lastProcessedIndex = 0;
    let pendingHtml = '';
    let rafScheduled = false;

    function flushToTerminal() {
      if (pendingHtml) {
        terminal.insertAdjacentHTML('beforeend', pendingHtml);
        pendingHtml = '';
        terminal.scrollTop = terminal.scrollHeight;
      }
      rafScheduled = false;
    }

    function scheduleFlush() {
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(flushToTerminal);
      }
    }

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 || xhr.readyState === 4) {
        const newData = xhr.responseText.slice(lastProcessedIndex);
        lastProcessedIndex = xhr.responseText.length;

        const lines = newData.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);
            if (data.text !== undefined) {
              pendingHtml += ansiToHtml(data.text);
            }
            if (data.code !== undefined && data.index !== undefined) {
              pendingHtml += `\n<span class="ansi-yellow ansi-bold">[EXIT CODE: ${data.code}]</span>\n`;
            }
          } catch (_e) {}
        }

        scheduleFlush();
      }

      if (xhr.readyState === 4) {
        flushToTerminal();
        stopTimer();
        abortBtn.classList.add('hidden');
        statusEl.textContent = runAbortRequested ? tr('status.aborted', 'Aborted') : i18n.t('status.completed');
        runAbortRequested = false;
        runInProgress = false;
        activeRunXhr = null;
      }
    };

    xhr.send(JSON.stringify({ commands }));
  } catch (error) {
    terminal.insertAdjacentHTML(
      'beforeend',
      `\n<span class="ansi-red ansi-bold">${tr('common.error', 'Error')}: ${error.message}</span>\n`
    );
    stopTimer();
    abortBtn.classList.add('hidden');
    statusEl.textContent = i18n.t('status.failed');
    runAbortRequested = false;
    runInProgress = false;
    activeRunXhr = null;
  }
}

function startTimer() {
  timerSeconds = 0;
  const timerEl = document.getElementById('timer');
  timerEl.classList.add('running');
  timerInterval = setInterval(() => {
    timerSeconds++;
    const mins = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
    const secs = (timerSeconds % 60).toString().padStart(2, '0');
    timerEl.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timerEl = document.getElementById('timer');
  timerEl.classList.remove('running');
}

async function abortRun() {
  const abortBtn = document.getElementById('abort-btn');
  const statusEl = document.getElementById('terminal-status');
  const terminal = document.getElementById('terminal-output');
  let abortAccepted = false;
  
  try {
    abortBtn.disabled = true;
    abortBtn.textContent = tr('terminal.stopInProgress', 'Stopping...');
    
    const res = await fetch('/api/abort', { method: 'POST' });
    const data = await res.json();
    
    if (data.ok) {
      runAbortRequested = true;
      abortAccepted = true;
      terminal.innerHTML += `\n<span class="ansi-yellow ansi-bold">${tr('terminal.stopRequested', '[Stop request sent]')}</span>\n`;
      terminal.innerHTML += `\n<span class="ansi-cyan">${tr('terminal.stopTerminated', '[Command terminated, not paused. Server remains running.]')}</span>\n`;
      terminal.scrollTop = terminal.scrollHeight;
      statusEl.textContent = tr('status.aborted', 'Aborted');
    } else {
      terminal.innerHTML += `\n<span class="ansi-red ansi-bold">${tr('terminal.stopFailed', '[Stop failed] {message}', { message: data.msg || tr('errors.stopRequestFailed', 'Stop request failed') })}</span>\n`;
      terminal.scrollTop = terminal.scrollHeight;
    }
  } catch (error) {
    terminal.innerHTML += `\n<span class="ansi-red ansi-bold">${tr('terminal.stopFailed', '[Stop failed] {message}', { message: error.message })}</span>\n`;
    terminal.scrollTop = terminal.scrollHeight;
  } finally {
    abortBtn.disabled = false;
    abortBtn.textContent = tr('terminal.stop', 'Stop');
    if (!abortAccepted) {
      stopTimer();
      runAbortRequested = false;
      runInProgress = false;
      activeRunXhr = null;
      abortBtn.classList.add('hidden');
    }
  }
}

async function loadLogs() {
  const tbody = document.getElementById('logs-table-body');
  const emptyState = document.getElementById('logs-empty');
  const table = document.getElementById('logs-table');
  
  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px;"><div class="loading">${tr('fileTree.loading', 'Loading...')}</div></td></tr>`;
  table.style.display = 'table';
  emptyState.style.display = 'none';

  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    
    const logs = Array.isArray(data) ? data : (data.logs || []);

    if (!logs || logs.length === 0) {
      table.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    tbody.innerHTML = logs.map((log, index) => {
      if (!log || !log.filename) {
        console.warn('Invalid log entry:', log);
        return '';
      }
          
      const rowNumber = index + 1;
          
      const date = new Date(log.timestamp);
      const time = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          
      const command = log.command || log.filename;
          
      const duration = log.duration ? formatDuration(log.duration) : '-';
          
      const statusClass = log.exitCode === 0 ? 'success' : 'error';
      const statusText = log.exitCode === 0 ? tr('logs.statusSuccess', 'Success') : tr('logs.statusFailed', 'Failed');
          
      const hasVideo = log.video || false;
          
      return `
        <tr data-log="${log.filename}">
          <td class="col-index">${rowNumber}</td>
          <td class="col-time">${time}</td>
          <td class="col-command">
            <span class="log-command" title="${command}">${command}</span>
          </td>
          <td class="col-status">
            <span class="log-status ${statusClass}">${statusText}</span>
          </td>
          <td class="col-duration">
            <span class="log-duration">${duration}</span>
          </td>
          <td class="col-actions">
            <div class="log-actions">
              <button class="log-action-btn view" 
                      onclick="viewLog('${log.filename}')" 
                      title="${tr('logs.viewContent', 'View content')}">
                <i data-lucide="eye"></i>
              </button>
              <button class="log-action-btn download" 
                      onclick="downloadLog('${log.filename}')" 
                      title="${tr('logs.downloadRecord', 'Download record')}">
                <i data-lucide="download"></i>
              </button>
              ${hasVideo ? `
              <button class="log-action-btn video" 
                      onclick="viewVideo('${log.filename}')" 
                      title="${tr('logs.viewVideo', 'View video')}">
                <i data-lucide="video"></i>
                <span class="video-badge"></span>
              </button>
              ` : ''}
              <button class="log-action-btn delete" 
                      onclick="deleteLog('${log.filename}')" 
                      title="${tr('logs.deleteRecord', 'Delete')}">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).filter(html => html).join('');
    
    refreshIcons();
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 40px;">
            <div class="empty-state">
            <div class="empty-icon">❌</div>
            <div class="empty-text">${tr('errors.loadLogsFailed', 'Failed to load logs: {message}', { message: error.message })}</div>
          </div>
        </td>
      </tr>
    `;
  }
}

function formatDuration(ms) {
  if (!ms) return '-';
  
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

async function downloadLog(filename) {
  try {
    const res = await fetch(`/api/logs/${filename}`);
    if (!res.ok) throw new Error(tr('errors.downloadFailed', 'Download failed: {message}', { message: '' }).replace(/:\s*$/, ''));
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert(tr('errors.downloadFailed', 'Download failed: {message}', { message: error.message }));
  }
}

async function deleteLog(filename) {
  if (!confirm(tr('projectExplorer.deleteConfirm', 'Are you sure to delete {name}?', { name: filename }))) return;
  
  try {
    const res = await fetch(`/api/logs/${filename}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(tr('errors.deleteFailed', 'Delete failed: {message}', { message: '' }).replace(/:\s*$/, ''));
    
    await loadLogs();
  } catch (error) {
    alert(tr('errors.deleteFailed', 'Delete failed: {message}', { message: error.message }));
  }
}

function viewVideo(filename) {
  alert(tr('alerts.importNotImplemented', 'Not implemented yet') + `: ${filename}`);
}

async function viewLog(filename) {
  document.querySelector('.nav-item[data-view="terminal"]').click();
  
  const terminal = document.getElementById('terminal-output');
  const statusEl = document.getElementById('terminal-status');
  
  terminal.innerHTML = `<div class="loading">${tr('terminal.loadingLog', 'Loading log...')}</div>`;
  statusEl.textContent = tr('terminal.viewLogStatus', 'Viewing log: {filename}', { filename });

  try {
    const res = await fetch(`/api/logs/${filename}`);
    const text = await res.text();
    terminal.innerHTML = ansiToHtml(text);
    terminal.scrollTop = terminal.scrollHeight;
  } catch (error) {
    terminal.innerHTML = `<span class="ansi-red ansi-bold">${tr('common.error', 'Error')}: ${error.message}</span>`;
  }
}

function ensureConfigEditorDefaults() {
  if (!config) {
    config = { projectName: 'BOB-Tools', groups: [] };
  }
  if (!Array.isArray(config.groups)) config.groups = [];
}

const SCAN_CATEGORY_META = {
  'env-install': { zhTW: '環境安裝', zhCN: '环境安装', enUS: 'Environment Install', descZhTW: '環境與依賴準備命令', descZhCN: '环境与依赖准备命令', descEnUS: 'Environment and dependency preparation commands' },
  clean: { zhTW: '清理維護', zhCN: '清理维护', enUS: 'Cleanup', descZhTW: '清理與維護命令', descZhCN: '清理与维护命令', descEnUS: 'Cleanup and maintenance commands' },
  diag: { zhTW: '診斷', zhCN: '诊断', enUS: 'Diagnostics', descZhTW: '診斷與調試命令', descZhCN: '诊断与调试命令', descEnUS: 'Diagnostics and debugging commands' },
  test: { zhTW: '測試', zhCN: '测试', enUS: 'Test', descZhTW: '測試相關命令', descZhCN: '测试相关命令', descEnUS: 'Test commands' },
  quality: { zhTW: '品質', zhCN: '质量', enUS: 'Quality', descZhTW: '程式碼品質與驗證', descZhCN: '代码质量与校验', descEnUS: 'Code quality and verification' },
  check: { zhTW: '檢查', zhCN: '检查', enUS: 'Check', descZhTW: '程式碼檢查命令', descZhCN: '代码检查命令', descEnUS: 'Code checking commands' },
  build: { zhTW: '建置', zhCN: '构建', enUS: 'Build', descZhTW: '建置與打包命令', descZhCN: '构建与打包命令', descEnUS: 'Build and package commands' },
  'web-build': { zhTW: 'Web 建置', zhCN: 'Web 构建', enUS: 'Web Build', descZhTW: 'Web 建置與打包命令', descZhCN: 'Web 构建与打包命令', descEnUS: 'Web build and package commands' },
  deploy: { zhTW: '部署', zhCN: '部署', enUS: 'Deploy', descZhTW: '部署與發佈命令', descZhCN: '部署与发布命令', descEnUS: 'Deployment and publish commands' },
  release: { zhTW: '發佈', zhCN: '发布', enUS: 'Release', descZhTW: '發佈與部署命令', descZhCN: '发布与部署命令', descEnUS: 'Release and deploy commands' },
  dev: { zhTW: '開發', zhCN: '开发', enUS: 'Development', descZhTW: '本機開發命令', descZhCN: '本地开发命令', descEnUS: 'Local development commands' },
  'web-dev': { zhTW: 'Web 開發', zhCN: 'Web 开发', enUS: 'Web Development', descZhTW: 'Web 本機開發命令', descZhCN: 'Web 本地开发命令', descEnUS: 'Web local development commands' },
  'desktop-dev': { zhTW: '桌面開發', zhCN: '桌面开发', enUS: 'Desktop Development', descZhTW: '桌面應用開發命令', descZhCN: '桌面应用开发命令', descEnUS: 'Desktop app development commands' },
  'dev-tools': { zhTW: '開發工具', zhCN: '开发工具', enUS: 'Dev Tools', descZhTW: '開發輔助命令', descZhCN: '开发辅助命令', descEnUS: 'Development helper commands' },
  docker: { zhTW: 'Docker', zhCN: 'Docker', enUS: 'Docker', descZhTW: 'Docker 相關命令', descZhCN: 'Docker 相关命令', descEnUS: 'Docker related commands' },
  uncategorized: { zhTW: '未分類', zhCN: '未分类', enUS: 'Uncategorized', descZhTW: '尚未自動分類命令', descZhCN: '尚未自动分类命令', descEnUS: 'Commands not auto-categorized yet' },
};

function currentLangCode() {
  return String(i18n?.currentLanguage || 'zh-TW');
}

function localizedScanMeta(meta) {
  const lang = currentLangCode();
  if (lang === 'zh-CN') {
    return { name: meta.zhCN, description: meta.descZhCN };
  }
  if (lang === 'en-US') {
    return { name: meta.enUS, description: meta.descEnUS };
  }
  return { name: meta.zhTW, description: meta.descZhTW };
}

function findExistingCategoryNameById(categoryId) {
  for (const group of config.groups || []) {
    for (const category of group.categories || []) {
      if (category.id === categoryId) {
        const name = normalizeText(category.name, '');
        if (name) return name;
      }
    }
  }
  return '';
}

function resolveCategoryIdForGroup(group, logicalId) {
  const groupId = String(group?.id || '').toLowerCase();
  const existingIds = new Set((group?.categories || []).map((c) => String(c?.id || '').toLowerCase()));
  const candidatesByLogical = {
    quality: ['check', 'quality'],
    build: groupId === 'development' ? ['web-build', 'build'] : ['build', 'web-build'],
    deploy: ['release', 'deploy'],
    docker: ['docker', 'release', 'deploy'],
    dev: groupId === 'development' ? ['web-dev', 'dev'] : ['dev', 'web-dev'],
    'desktop-dev': ['desktop-dev', 'web-dev', 'dev'],
    'dev-tools': ['dev-tools'],
    test: ['test'],
  };
  const candidates = candidatesByLogical[logicalId] || [logicalId];
  for (const id of candidates) {
    if (existingIds.has(String(id).toLowerCase())) return id;
  }
  return candidates[0];
}

function resolveTargetGroupIndex(logicalId, scriptName) {
  const byGroupId = (id) => config.groups.findIndex((g) => String(g?.id || '').toLowerCase() === id);
  const map = {
    test: 'quality',
    quality: 'quality',
    build: 'development',
    deploy: 'deploy',
    docker: 'deploy',
    dev: 'development',
    'desktop-dev': 'development',
    'dev-tools': 'development',
  };
  const preferredGroupId = map[logicalId];
  if (preferredGroupId) {
    const idx = byGroupId(preferredGroupId);
    if (idx >= 0) return idx;
  }
  return findGroupIndexByRule(scriptName);
}

function findGroupIndexById(groupId) {
  const target = String(groupId || '').toLowerCase();
  if (!target) return -1;
  return (config.groups || []).findIndex((g) => String(g?.id || '').toLowerCase() === target);
}

function normalizeScriptKey(scriptName) {
  return String(scriptName || '').trim().toLowerCase().replace(/:/g, '-');
}

function scriptNameToDescKey(scriptName) {
  const normalized = normalizeScriptKey(scriptName);
  return normalized ? `commandDescriptions.${normalized}` : '';
}

function translateIfExists(key) {
  if (!key || typeof i18n === 'undefined') return '';
  const existsInCurrent = i18n.getNestedValue?.(i18n.messages, key) !== undefined;
  const existsInFallback = i18n.getNestedValue?.(i18n.fallbackMessages, key) !== undefined;
  if (!existsInCurrent && !existsInFallback) return '';
  return normalizeText(i18n.t(key), '');
}

function resolveCommandDescription(command, fallbackScript = '') {
  if (command?.descMode === 'manual') {
    return normalizeText(command?.manualDesc, normalizeText(command?.desc, fallbackScript));
  }
  const byDescKey = translateIfExists(command?.descKey);
  if (byDescKey) return byDescKey;
  const byDefault = translateIfExists('commandDescriptions.__default');
  return normalizeText(command?.desc, byDefault || fallbackScript);
}

function resolveDependencyDescription(item) {
  if (item?.descMode === 'manual' && normalizeText(item?.manualDesc, '')) {
    return normalizeText(item.manualDesc, '');
  }
  const byKey = translateIfExists(item?.descKey);
  if (byKey) return byKey;
  return normalizeText(item?.descFallback, tr('dependencies.defaultDescription', 'Used by this project.'));
}

function normalizeLegacyCategoryPlacement() {
  const groupIndexById = Object.fromEntries(
    (config.groups || []).map((g, i) => [String(g?.id || '').toLowerCase(), i])
  );

  const moveRules = [
    { fromGroup: 'deploy', fromCat: 'build', toGroup: 'development', toCat: 'web-build' },
    { fromGroup: 'development', fromCat: 'check', toGroup: 'quality', toCat: 'check' },
    { fromGroup: 'development', fromCat: 'quality', toGroup: 'quality', toCat: 'check' },
    { fromGroup: 'development', fromCat: 'test', toGroup: 'quality', toCat: 'test' },
    { fromGroup: 'deploy', fromCat: 'deploy', toGroup: 'deploy', toCat: 'release' },
  ];

  for (const rule of moveRules) {
    const fromGroupIdx = groupIndexById[rule.fromGroup];
    const toGroupIdx = groupIndexById[rule.toGroup];
    if (fromGroupIdx === undefined || toGroupIdx === undefined) continue;

    const fromGroup = config.groups[fromGroupIdx];
    const toGroup = config.groups[toGroupIdx];
    if (!Array.isArray(fromGroup?.categories) || !Array.isArray(toGroup?.categories)) continue;

    const fromCatIdx = fromGroup.categories.findIndex((c) => String(c?.id || '').toLowerCase() === rule.fromCat);
    if (fromCatIdx < 0) continue;

    const [fromCategory] = fromGroup.categories.splice(fromCatIdx, 1);
    const toMeta = SCAN_CATEGORY_META[rule.toCat] || SCAN_CATEGORY_META[rule.fromCat] || SCAN_CATEGORY_META.uncategorized;
    const localized = localizedScanMeta(toMeta);
    const toCategory = getOrCreateCategory(
      toGroup,
      rule.toCat,
      findExistingCategoryNameById(rule.toCat) || localized.name,
      localized.description
    );
    if (!Array.isArray(toCategory.commands)) toCategory.commands = [];
    if (Array.isArray(fromCategory?.commands) && fromCategory.commands.length > 0) {
      toCategory.commands.push(...fromCategory.commands);
    }
  }
}

function getOrCreateUncategorizedCategory() {
  ensureConfigEditorDefaults();
  const defaultMeta = localizedScanMeta(SCAN_CATEGORY_META.uncategorized);

  let uncategorizedGroupIdx = config.groups.findIndex((g) => String(g?.id || '').toLowerCase() === 'uncategorized');
  if (uncategorizedGroupIdx < 0) {
    const createdGroup = {
      id: 'uncategorized',
      name: defaultMeta.name,
      description: defaultMeta.description,
      icon: 'inbox',
      collapsed: false,
      categories: [],
    };
    config.groups.unshift(createdGroup);
    uncategorizedGroupIdx = 0;
  }

  const uncategorizedGroup = config.groups[uncategorizedGroupIdx];
  if (!Array.isArray(uncategorizedGroup.categories)) uncategorizedGroup.categories = [];

  let uncategorized = uncategorizedGroup.categories.find((c) => c.id === 'uncategorized');
  if (!uncategorized) {
    uncategorized = {
      id: 'uncategorized',
      name: findExistingCategoryNameById('uncategorized') || tr('categories.uncategorized.name', defaultMeta.name),
      description: tr('categories.uncategorized.description', defaultMeta.description),
      collapsed: false,
      commands: [],
    };
    uncategorizedGroup.categories.unshift(uncategorized);
  }

  // Migrate legacy uncategorized categories from non-uncategorized groups.
  config.groups.forEach((group, idx) => {
    if (idx === uncategorizedGroupIdx || !Array.isArray(group.categories)) return;
    const legacyIdx = group.categories.findIndex((c) => c.id === 'uncategorized');
    if (legacyIdx < 0) return;
    const [legacy] = group.categories.splice(legacyIdx, 1);
    if (legacy && Array.isArray(legacy.commands) && legacy.commands.length > 0) {
      if (!Array.isArray(uncategorized.commands)) uncategorized.commands = [];
      uncategorized.commands.push(...legacy.commands);
    }
  });

  return { groupIdx: uncategorizedGroupIdx, category: uncategorized };
}

function findGroupIndexByRule(scriptName) {
  const key = String(scriptName || '').toLowerCase();

  const rules = [
    { groupKeywords: ['品質', 'quality', 'qa', '檢查'], match: /(^ci:|:ci:|gate|pipeline|workflow|verify|check)/ },
    { groupKeywords: ['測試', 'test', 'qa'], match: /(test|spec|e2e|coverage|vitest|jest|cypress)/ },
    { groupKeywords: ['部署', '發佈', 'deploy', 'release', 'publish'], match: /(deploy|release|publish|docker|k8s|kubectl|helm|compose)/ },
    { groupKeywords: ['開發', 'desktop', '桌面', 'tauri', 'electron'], match: /(tauri|electron|wails|desktop)/ },
    { groupKeywords: ['應用', 'application', 'app'], match: /(prepare|bootstrap|init|start|serve|preview|run|app)/ },
    { groupKeywords: ['開發', 'dev', 'build', '建置'], match: /(dev|build|lint|format|typecheck|clean|compile|watch)/ },
  ];

  for (const rule of rules) {
    if (rule.match.test(key)) {
      const idx = config.groups.findIndex((g) => {
        const id = String(g.id || '').toLowerCase();
        const name = String(g.name || '').toLowerCase();
        return rule.groupKeywords.some((w) => id.includes(w.toLowerCase()) || name.includes(w.toLowerCase()));
      });
      if (idx >= 0) return idx;
    }
  }

  return -1;
}

function getOrCreateCategory(group, categoryId, categoryName, description) {
  if (!Array.isArray(group.categories)) group.categories = [];
  let category = group.categories.find((c) => c.id === categoryId);
  if (!category) {
    category = {
      id: categoryId,
      name: categoryName,
      description,
      collapsed: true,
      commands: [],
    };
    group.categories.push(category);
  }
  if (!normalizeText(category.name, '')) {
    category.name = categoryName;
  }
  if (!normalizeText(category.description, '')) {
    category.description = description;
  }
  if (!Array.isArray(category.commands)) category.commands = [];
  return category;
}

function classifyScriptToCategory(scriptName) {
  const key = String(scriptName || '').toLowerCase();
  if (key === 'bob') {
    return { id: 'dev-tools' };
  }
  if (key === 'stub') {
    return { id: 'dev-tools' };
  }
  if (key === 'prepare') {
    return { id: 'env-install' };
  }
  if (key.startsWith('prepare:')) {
    return { id: 'env-install' };
  }
  if (/(^ci:|:ci:|gate|pipeline|workflow)/.test(key)) {
    return { id: 'quality' };
  }
  if (/(docker|compose|k8s|kubectl|helm)/.test(key)) {
    return { id: 'docker' };
  }
  if (/(obfuscate|minify|uglify|optimi[sz]e)/.test(key)) {
    return { id: 'build' };
  }
  if (/(version|bump|changelog)/.test(key)) {
    return { id: 'deploy' };
  }
  if (/(tauri|electron|wails|desktop)/.test(key)) {
    return { id: 'desktop-dev' };
  }
  if (/(test|spec|e2e|coverage|vitest|jest|cypress)/.test(key)) {
    return { id: 'test' };
  }
  if (/(lint|format|typecheck|check|verify)/.test(key)) {
    return { id: 'quality' };
  }
  if (/(build|compile|bundle|pack)/.test(key)) {
    return { id: 'build' };
  }
  if (/(deploy|release|publish)/.test(key)) {
    return { id: 'deploy' };
  }
  if (/(dev|start|serve|watch|preview)/.test(key)) {
    return { id: 'dev' };
  }
  return null;
}

function commandExistsAnywhere(scriptName, cmdValue) {
  for (const group of config.groups || []) {
    for (const category of group.categories || []) {
      for (const command of category.commands || []) {
        if ((command.scriptName && command.scriptName === scriptName) || command.cmd === cmdValue) {
          return true;
        }
      }
    }
  }
  return false;
}

function findCommandByScriptName(scriptName) {
  for (const group of config.groups || []) {
    for (const category of group.categories || []) {
      for (const command of category.commands || []) {
        if (command.scriptName && command.scriptName === scriptName) {
          return command;
        }
      }
    }
  }
  return null;
}

function findCommandLocationByScriptName(scriptName) {
  for (let groupIdx = 0; groupIdx < (config.groups || []).length; groupIdx += 1) {
    const group = config.groups[groupIdx];
    for (let catIdx = 0; catIdx < (group.categories || []).length; catIdx += 1) {
      const category = group.categories[catIdx];
      for (let cmdIdx = 0; cmdIdx < (category.commands || []).length; cmdIdx += 1) {
        const command = category.commands[cmdIdx];
        if (command.scriptName && command.scriptName === scriptName) {
          return { command, groupIdx, catIdx, cmdIdx };
        }
      }
    }
  }
  return null;
}

function findCommandLocationByScriptNames(scriptNames) {
  const candidates = Array.isArray(scriptNames)
    ? Array.from(new Set(scriptNames.map((n) => String(n || '').trim()).filter(Boolean)))
    : [];
  for (const candidate of candidates) {
    const found = findCommandLocationByScriptName(candidate);
    if (found) return found;
  }
  return null;
}

function mergeScannedScriptsIntoConfig(scripts) {
  ensureConfigEditorDefaults();
  normalizeLegacyCategoryPlacement();
  const result = { added: 0, uncategorized: 0, skipped: 0, updated: 0, removed: 0 };
  const scannedScriptNames = new Set();

  for (const script of scripts || []) {
    const identity = String(script?.name || '').trim();
    const rawName = String(script?.scriptName || '').trim();
    if (identity) scannedScriptNames.add(identity);
    if (rawName) scannedScriptNames.add(rawName);
  }

  for (const script of scripts || []) {
    const scriptIdentity = String(script.name || '').trim();
    const scriptRawName = String(script.scriptName || '').trim();
    const scriptName = scriptIdentity || scriptRawName;
    const scriptNameCandidates = [scriptIdentity, scriptRawName];
    const commandText = String(script.runCmd || script.cmd || '').trim();
    const scriptBody = String(script.cmd || '').trim();
    const descKey = String(script.descKey || scriptNameToDescKey(scriptName));
    const descFallback = String(
      script.descFallback || (scriptBody ? `package scripts: ${scriptName} -> ${scriptBody}` : `Run ${scriptName}`)
    );
    if (!scriptName || !commandText) {
      result.skipped += 1;
      continue;
    }

    const categoryMeta = classifyScriptToCategory(scriptName);
    const explicitGroupIdx = findGroupIndexById(script.groupId);
    const targetGroupIdx = explicitGroupIdx >= 0
      ? explicitGroupIdx
      : (categoryMeta ? resolveTargetGroupIndex(categoryMeta.id, scriptName) : -1);

    const existingLoc = findCommandLocationByScriptNames(scriptNameCandidates);
    if (existingLoc) {
      const existingByScript = existingLoc.command;
      let changed = false;

      if (existingByScript.scriptName !== scriptName) {
        existingByScript.scriptName = scriptName;
        changed = true;
      }
      if (existingByScript.source !== 'scan') {
        existingByScript.source = 'scan';
        changed = true;
      }

      if (existingByScript.cmd !== commandText) {
        existingByScript.cmd = commandText;
        changed = true;
      }
      if (existingByScript.descMode === 'manual') {
        if (!normalizeText(existingByScript.manualDesc, '')) {
          existingByScript.manualDesc = normalizeText(existingByScript.desc, descFallback);
          changed = true;
        }
      } else {
        if (existingByScript.descMode !== 'auto') {
          existingByScript.descMode = 'auto';
          changed = true;
        }
        if (existingByScript.descKey !== descKey) {
          existingByScript.descKey = descKey;
          changed = true;
        }
        if (existingByScript.desc !== descFallback) {
          existingByScript.desc = descFallback;
          changed = true;
        }
      }

      if (targetGroupIdx >= 0 && (categoryMeta || script.categoryId)) {
        const targetGroup = config.groups[targetGroupIdx];
        const resolvedCategoryId = script.categoryId
          ? String(script.categoryId)
          : resolveCategoryIdForGroup(targetGroup, categoryMeta.id);
        const currentCategoryId = String(config.groups[existingLoc.groupIdx]?.categories?.[existingLoc.catIdx]?.id || '');
        const shouldMove =
          existingLoc.groupIdx !== targetGroupIdx || currentCategoryId !== String(resolvedCategoryId);
        if (shouldMove) {
          const meta = SCAN_CATEGORY_META[resolvedCategoryId] || SCAN_CATEGORY_META[categoryMeta?.id];
          const localizedMeta = meta ? localizedScanMeta(meta) : { name: resolvedCategoryId, description: '' };
          const preferredName = findExistingCategoryNameById(resolvedCategoryId) || localizedMeta.name;
          const targetCategory = getOrCreateCategory(
            targetGroup,
            resolvedCategoryId,
            preferredName,
            localizedMeta.description
          );
          const sourceCommands = config.groups[existingLoc.groupIdx]?.categories?.[existingLoc.catIdx]?.commands || [];
          const [moved] = sourceCommands.splice(existingLoc.cmdIdx, 1);
          if (moved) {
            targetCategory.commands.push(moved);
            changed = true;
          }
        }
      }

      if (changed) result.updated += 1;
      else result.skipped += 1;
      continue;
    }

    if (commandExistsAnywhere(scriptName, commandText)) {
      result.skipped += 1;
      continue;
    }

    if (targetGroupIdx >= 0 && (categoryMeta || script.categoryId)) {
      const group = config.groups[targetGroupIdx];
      const resolvedCategoryId = script.categoryId
        ? String(script.categoryId)
        : resolveCategoryIdForGroup(group, categoryMeta.id);
      const meta = SCAN_CATEGORY_META[resolvedCategoryId] || SCAN_CATEGORY_META[categoryMeta?.id];
      const localizedMeta = meta ? localizedScanMeta(meta) : { name: resolvedCategoryId, description: '' };
      const preferredName = findExistingCategoryNameById(resolvedCategoryId) || localizedMeta.name;
      const category = getOrCreateCategory(group, resolvedCategoryId, preferredName, localizedMeta.description);
      category.commands.push({
        scriptName,
        source: 'scan',
        descKey,
        descMode: 'auto',
        manualDesc: '',
        cmd: commandText,
        desc: descFallback,
      });
      result.added += 1;
      continue;
    }

    const { category } = getOrCreateUncategorizedCategory();
    category.commands.push({
      scriptName,
      source: 'scan',
      descKey,
      descMode: 'auto',
      manualDesc: '',
      cmd: commandText,
      desc: descFallback,
    });
    result.added += 1;
    result.uncategorized += 1;
  }

  for (const group of config.groups || []) {
    for (const category of group.categories || []) {
      if (!Array.isArray(category.commands)) continue;
      for (let i = category.commands.length - 1; i >= 0; i -= 1) {
        const command = category.commands[i];
        const scriptName = String(command?.scriptName || '').trim();
        if (!scriptName) continue;

        const descMode = String(command?.descMode || '').toLowerCase();
        const scanManaged = String(command?.source || '').toLowerCase() === 'scan' || descMode === 'auto';
        if (!scanManaged) continue;

        if (!scannedScriptNames.has(scriptName)) {
          category.commands.splice(i, 1);
          result.removed += 1;
        }
      }
    }
  }

  return result;
}

function buildConfigEditorTreeHtml(data) {
  if (!data.groups || data.groups.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🧩</div>
        <div class="empty-text">${tr('commands.emptyState', 'No commands available')}</div>
      </div>
    `;
  }

  let html = `
    <div class="config-editor-toolbar">
      <button id="scan-package-scripts" class="btn btn-primary toolbar-btn toolbar-btn-scan">${tr('projectExplorer.scanScripts', 'Scan package scripts')}</button>
      <button id="save-config" class="btn btn-secondary toolbar-btn">${tr('common.save', 'Save')}</button>
      <button id="add-group" class="btn btn-secondary toolbar-btn">${tr('ctx.addGroup', 'Add Group')}</button>
      <label class="config-toolbar-pm">
        <span class="config-toolbar-label">${tr('configEditor.packageManager', 'Package Manager')}</span>
        <select id="pm-override-select" class="form-select config-toolbar-select">
          <option value="auto">${tr('configEditor.pmAuto', 'Auto')}</option>
          <option value="pnpm">pnpm</option>
          <option value="npm">npm</option>
          <option value="yarn">yarn</option>
        </select>
      </label>
      <button id="apply-pm-override" class="btn btn-secondary toolbar-btn">${tr('common.apply', 'Apply')}</button>
      <span class="cmd-mode-legend">
        <span class="tree-cmd-mode auto">${tr('configEditor.descModeAutoShort', 'Auto')}</span>
        <span>${tr('configEditor.descModeAuto', 'Auto description')}</span>
      </span>
      <span class="cmd-mode-legend">
        <span class="tree-cmd-mode manual">${tr('configEditor.descModeManualShort', 'Manual')}</span>
        <span>${tr('configEditor.descModeManual', 'Manual description')}</span>
      </span>
      <span id="scan-result-hint" class="config-toolbar-hint"></span>
    </div>
    <ul class="config-tree">
      <li class="tree-root-item">
        <div class="tree-row tree-root" onclick="selectNode('root', null, null, null, event)" oncontextmenu="showContextMenu(event, 'root', null, null, null)">
          <span class="tree-icon">🧭</span>
          <span class="tree-text">${tr('configEditor.rootName', 'BOB Tools Settings')}</span>
          <span class="tree-badge">${data.groups.length} ${tr('configEditor.groupsUnit', 'groups')}</span>
        </div>
        <ul>
  `;

  data.groups.forEach((group, groupIdx) => {
    const categories = Array.isArray(group.categories) ? group.categories : [];
    const displayGroupName = groupLabel(group, groupIdx);
    html += `
      <li>
        <div class="tree-row tree-group"
             data-type="group" data-group="${groupIdx}"
             onclick="selectNode('group', ${groupIdx}, null, null, event)"
             oncontextmenu="showContextMenu(event, 'group', ${groupIdx}, null, null)">
          <span class="tree-toggle">${categories.length ? '-' : ''}</span>
          <span class="tree-icon">📁</span>
          <span class="tree-text">${escapeHtml(displayGroupName)}</span>
          <span class="tree-badge">${categories.length} ${tr('configEditor.categoriesUnit', 'categories')}</span>
        </div>
    `;

    if (categories.length > 0) {
      html += '<ul>';
      categories.forEach((cat, catIdx) => {
        const commands = Array.isArray(cat.commands) ? cat.commands : [];
        const displayCategoryName = categoryLabel(cat);
        html += `
          <li class="collapsed">
            <div class="tree-row tree-category"
                 data-type="category" data-group="${groupIdx}" data-cat="${catIdx}"
                 data-drop-group="${groupIdx}" data-drop-cat="${catIdx}"
                 onclick="selectNode('category', ${groupIdx}, ${catIdx}, null, event)"
                 oncontextmenu="showContextMenu(event, 'category', ${groupIdx}, ${catIdx}, null)">
                <span class="tree-toggle">${commands.length ? '+' : ''}</span>
                <span class="tree-icon">📂</span>
                <span class="tree-text">${escapeHtml(displayCategoryName)}</span>
                <span class="tree-badge">${commands.length} ${tr('configEditor.commandsUnit', 'commands')}</span>
              </div>
        `;

        if (commands.length > 0) {
          html += '<ul>';
          commands.forEach((cmd, cmdIdx) => {
            const escapedCmd = escapeHtml(cmd.cmd || '');
            const translatedDesc = resolveCommandDescription(cmd, tr('configEditor.noDescription', 'No description'));
            const escapedDesc = escapeHtml(translatedDesc);
            const isManualMode = cmd.descMode === 'manual';
            const modeClass = isManualMode ? 'manual' : 'auto';
            const modeText = isManualMode
              ? tr('configEditor.descModeManualShort', 'Manual')
              : tr('configEditor.descModeAutoShort', 'Auto');
            const modeTitle = isManualMode
              ? tr('configEditor.descModeManualHint', 'Manual description: user edited and locked')
              : tr('configEditor.descModeAutoHint', 'Auto description: generated from scan rules');
            const modeBadge = `<span class="tree-cmd-mode ${modeClass}" title="${escapeHtml(modeTitle)}" aria-label="${escapeHtml(modeTitle)}">${escapeHtml(modeText)}</span>`;
            html += `
              <li>
                <div class="tree-row tree-command"
                     draggable="true"
                     data-type="command" data-group="${groupIdx}" data-cat="${catIdx}" data-cmd="${cmdIdx}"
                     onclick="selectNode('command', ${groupIdx}, ${catIdx}, ${cmdIdx}, event)"
                     oncontextmenu="showContextMenu(event, 'command', ${groupIdx}, ${catIdx}, ${cmdIdx})">
                  <span class="tree-icon">⌘</span>
                  <code class="tree-cmd-code">${escapedCmd}</code>
                  <button
                    class="tree-run-btn"
                    title="${tr('configEditor.runInTerminal', 'Run in external terminal')}"
                    onclick="event.stopPropagation(); runSingleConfigCommand(${groupIdx}, ${catIdx}, ${cmdIdx})"
                  >
                    <i data-lucide="play" style="width:13px;height:13px;"></i>
                    <span>${tr('configEditor.runCommand', 'Run')}</span>
                  </button>
                  <button class="tree-copy-btn" title="${tr('configEditor.copyCommand', 'Copy command')}" onclick="event.stopPropagation(); copyTreeCmd(this, ${groupIdx}, ${catIdx}, ${cmdIdx})">
                    <i data-lucide="copy" style="width:13px;height:13px;"></i>
                  </button>
                  ${modeBadge}
                  <span class="tree-cmd-desc">${escapedDesc}</span>
                </div>
              </li>
            `;
          });
          html += '</ul>';
        }

        html += '</li>';
      });
      html += '</ul>';
    }

    html += '</li>';
  });

  html += '</ul></li></ul>';
  return html;
}

function enableCommandDragDrop() {
  const commandNodes = document.querySelectorAll('.tree-command[draggable="true"]');
  const categoryNodes = document.querySelectorAll('.tree-category[data-drop-group][data-drop-cat]');

  commandNodes.forEach((node) => {
    node.addEventListener('dragstart', (event) => {
      const payload = {
        fromGroupIdx: Number(node.dataset.group),
        fromCatIdx: Number(node.dataset.cat),
        fromCmdIdx: Number(node.dataset.cmd),
      };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/json', JSON.stringify(payload));
      node.classList.add('dragging');
    });

    node.addEventListener('dragend', () => {
      node.classList.remove('dragging');
      document.querySelectorAll('.tree-category.drop-target').forEach((el) => el.classList.remove('drop-target'));
    });
  });

  categoryNodes.forEach((target) => {
    target.addEventListener('dragover', (event) => {
      event.preventDefault();
      target.classList.add('drop-target');
    });

    target.addEventListener('dragleave', () => target.classList.remove('drop-target'));

    target.addEventListener('drop', async (event) => {
      event.preventDefault();
      target.classList.remove('drop-target');

      let payload;
      try {
        payload = JSON.parse(event.dataTransfer.getData('application/json') || '{}');
      } catch (_e) {
        return;
      }

      const toGroupIdx = Number(target.dataset.dropGroup);
      const toCatIdx = Number(target.dataset.dropCat);

      if ([payload.fromGroupIdx, payload.fromCatIdx, payload.fromCmdIdx, toGroupIdx, toCatIdx].some(Number.isNaN)) {
        return;
      }

      const sourceCategory = config.groups?.[payload.fromGroupIdx]?.categories?.[payload.fromCatIdx];
      const targetCategory = config.groups?.[toGroupIdx]?.categories?.[toCatIdx];
      if (!sourceCategory || !targetCategory || !Array.isArray(sourceCategory.commands)) return;

      const [moved] = sourceCategory.commands.splice(payload.fromCmdIdx, 1);
      if (!moved) return;

      if (!Array.isArray(targetCategory.commands)) targetCategory.commands = [];
      targetCategory.commands.push(moved);

      const ok = await autoSaveConfig();
      if (!ok) {
        sourceCategory.commands.splice(payload.fromCmdIdx, 0, moved);
        targetCategory.commands.pop();
        showAlert({
          type: 'error',
          title: tr('alerts.moveFailed', 'Move failed'),
          message: tr('configEditor.commandUpdateFailed', 'Failed to update command, rolled back'),
        });
        return;
      }

      showAlert({
        type: 'success',
        title: tr('alerts.moveSuccess', 'Move success'),
        message: tr('configEditor.scanResult', 'Moved to {name}.', { name: targetCategory.name }),
      });
      renderConfigEditor();
    });
  });
}

function bindConfigEditorToolbarEvents() {
  const scanBtn = document.getElementById('scan-package-scripts');
  const saveBtn = document.getElementById('save-config');
  const addGroupBtn = document.getElementById('add-group');
  const pmSelect = document.getElementById('pm-override-select');
  const pmApplyBtn = document.getElementById('apply-pm-override');

  if (scanBtn) {
    scanBtn.onclick = async () => {
      scanBtn.disabled = true;
      const originalText = scanBtn.textContent;
      scanBtn.textContent = tr('configEditor.scanning', 'Scanning...');

      try {
        const response = await scanCommandsApi();
        const merged = mergeScannedScriptsIntoConfig(response.scripts || []);
        const ok = await autoSaveConfig();
        if (!ok) throw new Error(tr('errors.scanSaveFailed', 'Failed to save scan result'));

        const hint = document.getElementById('scan-result-hint');
        if (hint) {
          const baseHint = tr(
            'configEditor.scanHint',
            'Added {added}, removed {removed}, uncategorized {uncategorized}, skipped {skipped}',
            merged
          );
          const extraHint =
            merged.uncategorized > 0
              ? ` ${tr('configEditor.uncategorizedHint', 'Uncategorized commands can be dragged to your target category.')}`
              : '';
          hint.textContent = `${baseHint}${extraHint}`;
        }

        showAlert({
          type: 'success',
          title: tr('alerts.scanComplete', 'Scan completed'),
          message: tr('configEditor.scanResult', 'Added {added}, removed {removed}, uncategorized {uncategorized}.', merged),
        });

        renderConfigEditor();
      } catch (error) {
        showAlert({ type: 'error', title: tr('alerts.scanFailed', 'Scan failed'), message: error.message });
      } finally {
        scanBtn.disabled = false;
        scanBtn.textContent = originalText;
      }
    };
  }

  if (saveBtn) {
    saveBtn.onclick = saveConfig;
  }
  if (addGroupBtn) {
    addGroupBtn.onclick = addGroup;
  }

  if (pmApplyBtn && pmSelect) {
    pmApplyBtn.onclick = async () => {
      const value = pmSelect.value || 'auto';
      pmApplyBtn.disabled = true;
      try {
        const res = await fetch('/api/project/pm-override', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageManager: value }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.message || tr('errors.updateFailed', 'Update failed'));
        }
        showAlert({
          type: 'success',
          title: tr('alerts.settingsSaved', 'Settings saved'),
          message: tr('configEditor.pmOverrideSaved', 'Package manager override updated'),
        });
      } catch (error) {
        showAlert({
          type: 'error',
          title: tr('alerts.settingsSaveFailed', 'Save failed'),
          message: error.message,
        });
      } finally {
        pmApplyBtn.disabled = false;
      }
    };

    fetch('/api/project/pm-override')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.success) return;
        pmSelect.value = json.data?.packageManagerOverride || 'auto';
      })
      .catch(() => {});
  }
}

async function renderConfigEditor() {
  const container = document.getElementById('config-categories');
  if (!container) return;

  if (!config) {
    await loadConfig();
  }

  ensureConfigEditorDefaults();
  container.innerHTML = buildConfigEditorTreeHtml(config);

  bindConfigEditorToolbarEvents();
  enableCommandDragDrop();
  refreshIcons();
}
function copyTreeCmd(btn, groupIdx, catIdx, cmdIdx) {
  const cmd = config.groups[groupIdx]?.categories[catIdx]?.commands[cmdIdx];
  if (!cmd) return;
  navigator.clipboard.writeText(cmd.cmd).then(() => {
    const icon = btn.querySelector('i, svg');
    if (icon) {
      const orig = icon.outerHTML;
      btn.innerHTML = '<i data-lucide="check" style="width:13px;height:13px;color:#22c55e;"></i>';
      refreshIcons();
      setTimeout(() => { btn.innerHTML = orig; refreshIcons(); }, 1200);
    }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = cmd.cmd;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function addGroup() {
  showFormModal({
    title: tr('configEditor.addGroupTitle', 'Add Group'),
    fields: [
      { name: 'name', label: tr('configEditor.groupName', 'Group Name'), placeholder: tr('configEditor.groupNamePlaceholder', 'Enter group name'), required: true },
      { name: 'description', label: tr('configEditor.groupDesc', 'Group Description'), placeholder: tr('configEditor.groupDescPlaceholder', 'Enter group purpose'), type: 'textarea', required: true },
      { name: 'icon', label: tr('configEditor.icon', 'Icon'), placeholder: tr('configEditor.iconPlaceholder', 'Enter lucide icon name') },
      { name: 'url', label: tr('configEditor.link', 'Link'), placeholder: tr('configEditor.linkPlaceholder', 'Enter URL') },
      { name: 'tip', label: tr('configEditor.tipText', 'Tooltip Text'), placeholder: tr('configEditor.tipPlaceholder', 'Tooltip shown on hover') },
    ],
    onSubmit: async (formData) => {
      const id = formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      if (!Array.isArray(config.groups)) config.groups = [];
      config.groups.push({
        id,
        name: formData.name,
        description: formData.description,
        icon: formData.icon || '',
        url: formData.url || '',
        tip: formData.tip || '',
        collapsed: false,
        categories: [],
      });
      await saveWithRollback(
        () => config.groups.pop(),
        tr('configEditor.groupAdded', 'Group added and saved'),
        tr('configEditor.groupAddFailed', 'Failed to add group, rolled back'),
        { renderNav: true }
      );
    },
  });
}

function editGroup(groupIdx) {
  const group = config.groups[groupIdx];
  if (!group) return;

  showFormModal({
    title: tr('configEditor.editGroupTitle', 'Edit Group'),
    fields: [
      { name: 'name', label: tr('configEditor.groupName', 'Group Name'), value: group.name, required: true },
      { name: 'description', label: tr('configEditor.groupDesc', 'Group Description'), value: group.description, type: 'textarea', required: true },
      { name: 'icon', label: tr('configEditor.icon', 'Icon'), value: group.icon || '' },
      { name: 'url', label: tr('configEditor.link', 'Link'), value: group.url || '' },
      { name: 'tip', label: tr('configEditor.tipText', 'Tooltip Text'), value: group.tip || '' },
    ],
    onSubmit: async (formData) => {
      const old = { ...group };
      group.name = formData.name;
      group.description = formData.description;
      group.icon = formData.icon || '';
      group.url = formData.url || '';
      group.tip = formData.tip || '';

      await saveWithRollback(
        () => Object.assign(group, old),
        tr('configEditor.groupUpdated', 'Group updated'),
        tr('configEditor.groupUpdateFailed', 'Failed to update group, rolled back'),
        { renderNav: true }
      );
    },
  });
}

function deleteGroup(groupIdx) {
  const group = config.groups[groupIdx];
  if (!group) return;

  if (Array.isArray(group.categories) && group.categories.length > 0) {
    showAlert({
      type: 'error',
      title: tr('alerts.cannotDelete', 'Cannot delete'),
      message: tr('configEditor.groupHasCategories', '"{name}" still has categories. Please clear categories first.', { name: group.name }),
    });
    return;
  }

  showConfirm({
    title: tr('alerts.confirmDelete', 'Confirm Delete'),
    message: tr('configEditor.groupDeleteConfirm', 'Delete group "{name}"?', { name: group.name }),
    confirmText: tr('common.delete', 'Delete'),
    onConfirm: async () => {
      const removed = config.groups.splice(groupIdx, 1)[0];
      await saveWithRollback(
        () => config.groups.splice(groupIdx, 0, removed),
        tr('configEditor.groupDeleted', 'Group deleted'),
        tr('configEditor.groupDeleteFailed', 'Failed to delete group, rolled back'),
        { renderNav: true }
      );
    },
  });
}

function addCategory(groupIdx) {
  const group = config.groups[groupIdx];
  if (!group) return;

  showFormModal({
    title: tr('configEditor.addCategoryTitle', 'Add Category'),
    fields: [
      { name: 'name', label: tr('configEditor.categoryName', 'Category Name'), placeholder: tr('configEditor.categoryNamePlaceholder', 'Enter category name'), required: true },
      { name: 'description', label: tr('configEditor.categoryDesc', 'Category Description'), placeholder: tr('configEditor.categoryDescPlaceholder', 'Describe this category'), type: 'textarea', required: true },
    ],
    onSubmit: async (formData) => {
      const id = formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      if (!Array.isArray(group.categories)) group.categories = [];
      group.categories.push({
        id,
        name: formData.name,
        description: formData.description,
        collapsed: true,
        commands: [],
      });
      await saveWithRollback(
        () => group.categories.pop(),
        tr('configEditor.categoryAdded', 'Category added'),
        tr('configEditor.categoryAddFailed', 'Failed to add category, rolled back')
      );
    },
  });
}

function editCategory(groupIdx, catIdx) {
  const category = config.groups[groupIdx]?.categories[catIdx];
  if (!category) return;

  showFormModal({
    title: tr('configEditor.editCategoryTitle', 'Edit Category'),
    fields: [
      { name: 'name', label: tr('configEditor.categoryName', 'Category Name'), value: category.name, required: true },
      { name: 'description', label: tr('configEditor.categoryDesc', 'Category Description'), value: category.description, type: 'textarea', required: true },
    ],
    onSubmit: async (formData) => {
      const oldName = category.name;
      const oldDesc = category.description;
      category.name = formData.name;
      category.description = formData.description;

      await saveWithRollback(
        () => {
          category.name = oldName;
          category.description = oldDesc;
        },
        tr('configEditor.categoryUpdated', 'Category updated'),
        tr('configEditor.categoryUpdateFailed', 'Failed to update category, rolled back')
      );
    },
  });
}

function deleteCategory(groupIdx, catIdx) {
  const category = config.groups[groupIdx]?.categories[catIdx];
  if (!category) return;

  if (Array.isArray(category.commands) && category.commands.length > 0) {
    showAlert({
      type: 'error',
      title: tr('alerts.cannotDelete', 'Cannot delete'),
      message: tr('configEditor.categoryHasCommands', '"{name}" still has commands. Please clear commands first.', { name: category.name }),
    });
    return;
  }

  showConfirm({
    title: tr('alerts.confirmDelete', 'Confirm Delete'),
    message: tr('configEditor.categoryDeleteConfirm', 'Delete category "{name}"?', { name: category.name }),
    confirmText: tr('common.delete', 'Delete'),
    onConfirm: async () => {
      const removed = config.groups[groupIdx].categories.splice(catIdx, 1)[0];
      await saveWithRollback(
        () => config.groups[groupIdx].categories.splice(catIdx, 0, removed),
        tr('configEditor.categoryDeleted', 'Category deleted'),
        tr('configEditor.categoryDeleteFailed', 'Failed to delete category, rolled back')
      );
    },
  });
}

function addCommand(groupIdx, catIdx) {
  const category = config.groups[groupIdx]?.categories[catIdx];
  if (!category) return;

  showFormModal({
    title: tr('configEditor.addCommandTitle', 'Add Command'),
    fields: [
      { name: 'cmd', label: tr('configEditor.commandContent', 'Command'), placeholder: tr('configEditor.commandContentPlaceholder', 'Enter command'), required: true },
      { name: 'desc', label: tr('configEditor.commandDesc', 'Command Description'), placeholder: tr('configEditor.commandDescPlaceholder', 'Describe this command purpose'), type: 'textarea', required: true },
    ],
    onSubmit: async (formData) => {
      if (!Array.isArray(category.commands)) category.commands = [];
      category.commands.push({
        cmd: formData.cmd,
        desc: formData.desc,
        descMode: 'manual',
        manualDesc: formData.desc,
      });

      await saveWithRollback(
        () => category.commands.pop(),
        tr('configEditor.commandAdded', 'Command added'),
        tr('configEditor.commandAddFailed', 'Failed to add command, rolled back')
      );
    },
  });
}

function editCommand(groupIdx, catIdx, cmdIdx) {
  const command = config.groups[groupIdx]?.categories[catIdx]?.commands[cmdIdx];
  if (!command) return;

  showFormModal({
    title: tr('configEditor.editCommandTitle', 'Edit Command'),
    fields: [
      { name: 'cmd', label: tr('configEditor.commandContent', 'Command'), value: command.cmd, required: true },
      { name: 'desc', label: tr('configEditor.commandDesc', 'Command Description'), value: command.descMode === 'manual' ? (command.manualDesc || command.desc) : command.desc, type: 'textarea', required: true },
    ],
    onSubmit: async (formData) => {
      const oldCmd = command.cmd;
      const oldDesc = command.desc;
      const oldDescMode = command.descMode;
      const oldManualDesc = command.manualDesc;
      command.cmd = formData.cmd;
      command.desc = formData.desc;
      command.descMode = 'manual';
      command.manualDesc = formData.desc;

      await saveWithRollback(
        () => {
          command.cmd = oldCmd;
          command.desc = oldDesc;
          command.descMode = oldDescMode;
          command.manualDesc = oldManualDesc;
        },
        tr('configEditor.commandUpdated', 'Command updated'),
        tr('configEditor.commandUpdateFailed', 'Failed to update command, rolled back')
      );
    },
  });
}

function copyDependencyValue(btn, encodedValue) {
  const value = decodeURIComponent(encodedValue || '');
  navigator.clipboard.writeText(value).then(() => {
    const icon = btn.querySelector('i, svg');
    if (icon) {
      const orig = icon.outerHTML;
      btn.innerHTML = '<i data-lucide="check" style="width:13px;height:13px;color:#22c55e;"></i>';
      refreshIcons();
      setTimeout(() => { btn.innerHTML = orig; refreshIcons(); }, 1200);
    }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

async function restoreAutoCommandDescription(groupIdx, catIdx, cmdIdx) {
  const command = config.groups[groupIdx]?.categories[catIdx]?.commands[cmdIdx];
  if (!command) return;

  const oldDescMode = command.descMode;
  const oldManualDesc = command.manualDesc;
  command.descMode = 'auto';
  command.manualDesc = '';

  await saveWithRollback(
    () => {
      command.descMode = oldDescMode;
      command.manualDesc = oldManualDesc;
    },
    tr('configEditor.commandAutoRestored', 'Command restored to auto description'),
    tr('configEditor.commandAutoRestoreFailed', 'Failed to restore auto description')
  );
}

function deleteCommand(groupIdx, catIdx, cmdIdx) {
  const command = config.groups[groupIdx]?.categories[catIdx]?.commands[cmdIdx];
  if (!command) return;

  showConfirm({
    title: tr('alerts.confirmDelete', 'Confirm Delete'),
    message: tr('configEditor.commandDeleteConfirm', 'Delete command "{name}"?', { name: command.cmd }),
    confirmText: tr('common.delete', 'Delete'),
    onConfirm: async () => {
      const removed = config.groups[groupIdx].categories[catIdx].commands.splice(cmdIdx, 1)[0];

      await saveWithRollback(
        () => config.groups[groupIdx].categories[catIdx].commands.splice(cmdIdx, 0, removed),
        tr('configEditor.commandDeleted', 'Command deleted'),
        tr('configEditor.commandDeleteFailed', 'Failed to delete command, rolled back')
      );
    },
  });
}
async function autoSaveConfig() {
  if (!config) return false;

  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (res.ok) {
      await loadConfig();
      renderConfigEditor();
      return true;
    } else {
      const error = await res.json();
      console.error('Save failed:', error.message);
      return false;
    }
  } catch (error) {
    console.error('Save failed:', error.message);
    return false;
  }
}

async function saveConfig() {
  if (!config) return;

  const ok = await autoSaveConfig();
  if (ok) {
    alert(tr('alerts.settingsSaved', 'Settings saved'));
  } else {
    alert(tr('alerts.settingsSaveFailed', 'Save failed, please try again later'));
  }
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

async function fetchDependencies({ scope = '', q = '' } = {}) {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  if (q) params.set('q', q);
  const query = params.toString();
  const res = await fetch(`/api/dependencies${query ? `?${query}` : ''}`);
  const payload = await res.json();
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.message || tr('errors.unknown', 'Unknown error'));
  }
  dependenciesState.items = payload.data?.items || [];
  dependenciesState.lastScanAt = payload.data?.lastScanAt || null;
  dependenciesState.scope = scope;
  dependenciesState.q = q;
  dependenciesState.loaded = true;
}

function renderDependenciesRows() {
  const tbody = document.getElementById('dependencies-table-body');
  const empty = document.getElementById('dependencies-empty');
  const lastScan = document.getElementById('dependencies-last-scan');
  if (!tbody || !empty || !lastScan) return;

  lastScan.textContent = tr('dependencies.lastScanAt', 'Last scan: {date}', {
    date: formatDateTime(dependenciesState.lastScanAt),
  });

  const items = dependenciesState.items || [];
  if (items.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = '';
    refreshIcons();
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = items.map((item) => {
    const modeText = item.descMode === 'manual'
      ? tr('dependencies.mode.manual', 'Manual')
      : tr('dependencies.mode.auto', 'Auto');
    const modeClass = item.descMode === 'manual' ? 'manual' : 'auto';
    const descText = resolveDependencyDescription(item);
    const nameText = item.name || '';
    const declaredText = item.declaredVersion || '-';
    const installedText = item.installedVersion || '-';
    const encodedName = encodeURIComponent(nameText);
    const encodedDeclared = encodeURIComponent(declaredText);
    const encodedInstalled = encodeURIComponent(installedText);
    const encodedDesc = encodeURIComponent(descText || '-');
    return `
      <tr>
        <td>
          <div class="dependencies-copy-line">
            <code>${escapeHtml(nameText)}</code>
            <button class="tree-copy-btn dependencies-copy-btn" title="${tr('configEditor.copyCommand', 'Copy')}" onclick="event.stopPropagation(); copyDependencyValue(this, '${encodedName}')">
              <i data-lucide="copy" style="width:13px;height:13px;"></i>
            </button>
          </div>
          <div class="muted">${escapeHtml(item.scope || '')}</div>
        </td>
        <td>
          <div class="dependencies-copy-line">
            <span>${escapeHtml(declaredText)}</span>
            <button class="tree-copy-btn dependencies-copy-btn" title="${tr('configEditor.copyCommand', 'Copy')}" onclick="event.stopPropagation(); copyDependencyValue(this, '${encodedDeclared}')">
              <i data-lucide="copy" style="width:13px;height:13px;"></i>
            </button>
          </div>
        </td>
        <td>
          <div class="dependencies-copy-line">
            <span>${escapeHtml(installedText)}</span>
            <button class="tree-copy-btn dependencies-copy-btn" title="${tr('configEditor.copyCommand', 'Copy')}" onclick="event.stopPropagation(); copyDependencyValue(this, '${encodedInstalled}')">
              <i data-lucide="copy" style="width:13px;height:13px;"></i>
            </button>
          </div>
        </td>
        <td class="dependencies-upgrade-date">${escapeHtml(formatDateTime(item.lastChangedAt))}</td>
        <td class="dependencies-desc" title="${escapeHtml(descText)}">
          <div class="dependencies-copy-line">
            <span class="tree-cmd-mode dependencies-mode ${modeClass}">${escapeHtml(modeText)}</span>
            <span class="dependencies-desc-text">${escapeHtml(descText)}</span>
            <button class="tree-copy-btn dependencies-copy-btn" title="${tr('configEditor.copyCommand', 'Copy')}" onclick="event.stopPropagation(); copyDependencyValue(this, '${encodedDesc}')">
              <i data-lucide="copy" style="width:13px;height:13px;"></i>
            </button>
          </div>
        </td>
        <td class="dependencies-note" title="${escapeHtml(item.noteText || '')}">${escapeHtml(item.noteText || '-')}</td>
        <td>
          <button class="log-action-btn view dependencies-edit-btn" title="${tr('dependencies.actions.editDescription', 'Edit')}" onclick="editDependencyDescription('${encodeURIComponent(item.name)}','${item.scope}')">
            <i data-lucide="pencil"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
  refreshIcons();
}

async function renderDependenciesView(forceReload = false) {
  const scopeEl = document.getElementById('dependencies-scope');
  const searchEl = document.getElementById('dependencies-search');
  const scope = scopeEl ? scopeEl.value : dependenciesState.scope;
  const q = searchEl ? searchEl.value.trim() : dependenciesState.q;
  if (!dependenciesState.loaded || forceReload || scope !== dependenciesState.scope || q !== dependenciesState.q) {
    try {
      await fetchDependencies({ scope, q });
    } catch (error) {
      showAlert({ type: 'error', title: tr('dependencies.scanFailed', 'Load failed'), message: error.message });
    }
  }
  renderDependenciesRows();
}

async function rescanDependencies() {
  showAlert({
    type: 'info',
    title: tr('dependencies.scanStarted', 'Dependency scan started'),
    message: tr('dependencies.scanStarted', 'Dependency scan started'),
  });
  const res = await fetch('/api/dependencies/scan', { method: 'POST' });
  const payload = await res.json();
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.message || tr('errors.unknown', 'Unknown error'));
  }
  await renderDependenciesView(true);
  showAlert({
    type: 'success',
    title: tr('dependencies.scanDone', 'Dependency scan completed'),
    message: tr('dependencies.scanDoneWithStats', 'Added {added}, updated {updated}, unchanged {unchanged}', payload.data || {}),
  });
}

window.editDependencyDescription = async (encodedName, scope) => {
  const name = decodeURIComponent(encodedName);
  const item = (dependenciesState.items || []).find((it) => it.name === name && it.scope === scope);
  if (!item) return;
  showFormModal({
    title: tr('dependencies.actions.editDescription', 'Edit description'),
    fields: [
      {
        name: 'mode',
        label: tr('dependencies.modeLabel', 'Description Mode'),
        type: 'select',
        required: true,
        value: item.descMode === 'manual' ? 'manual' : 'auto',
        options: [
          { value: 'auto', label: tr('dependencies.mode.auto', 'Auto') },
          { value: 'manual', label: tr('dependencies.mode.manual', 'Manual') },
        ],
      },
      {
        name: 'manualDesc',
        label: tr('dependencies.columns.description', 'Description'),
        type: 'textarea',
        value: item.descMode === 'manual' ? (item.manualDesc || '') : resolveDependencyDescription(item),
        required: false,
      },
      {
        name: 'noteText',
        label: tr('dependencies.columns.note', 'Note'),
        type: 'textarea',
        value: item.noteText || '',
        required: false,
      },
    ],
    onSubmit: async (values) => {
      const descRes = await fetch('/api/dependencies/description', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scope,
          mode: values.mode === 'manual' ? 'manual' : 'auto',
          manualDesc: values.manualDesc || '',
        }),
      });

      const descPayload = await descRes.json();
      if (!descRes.ok || !descPayload?.success) {
        throw new Error(descPayload?.message || tr('errors.unknown', 'Unknown error'));
      }

      const noteRes = await fetch('/api/dependencies/note', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scope,
          noteText: values.noteText || '',
        }),
      });
      const notePayload = await noteRes.json();
      if (!noteRes.ok || !notePayload?.success) {
        throw new Error(notePayload?.message || tr('errors.unknown', 'Unknown error'));
      }

      await renderDependenciesView(true);
      showAlert({
        type: 'success',
        title: tr('alerts.success', 'Success'),
        message: tr('alerts.settingsSaved', 'Settings saved'),
      });
      return true;
    },
  });
};


function setupEventListeners() {
  document.getElementById('abort-btn')?.addEventListener('click', abortRun);

  document.getElementById('clear-terminal')?.addEventListener('click', () => {
    document.getElementById('terminal-output').innerHTML = '';
    document.getElementById('terminal-status').textContent = i18n.t('status.ready');
  });

  document.getElementById('refresh-logs')?.addEventListener('click', loadLogs);
  document.getElementById('dependencies-refresh')?.addEventListener('click', async () => {
    try {
      await rescanDependencies();
    } catch (error) {
      showAlert({ type: 'error', title: tr('dependencies.scanFailed', 'Scan failed'), message: error.message });
    }
  });
  document.getElementById('dependencies-scope')?.addEventListener('change', () => {
    if (currentView === 'dependencies') {
      renderDependenciesView(true);
    }
  });
  document.getElementById('dependencies-search')?.addEventListener('input', () => {
    if (currentView === 'dependencies') {
      renderDependenciesView(true);
    }
  });
  document.getElementById('clear-all-logs')?.addEventListener('click', async () => {
    if (!confirm(tr('alerts.clearLogsConfirm', 'Are you sure you want to clear all logs?'))) return;
    try {
      const res = await fetch('/api/logs/clear', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.ok) {
        alert(tr('alerts.allLogsCleared', 'Cleared {count} logs', { count: data.deleted }));
        loadLogs();
      } else {
        alert(tr('alerts.clearLogsFailed', 'Clear failed: {message}', { message: data.error || tr('errors.unknown', 'Unknown error') }));
      }
    } catch (error) {
      alert(tr('alerts.clearLogsFailed', 'Clear failed: {message}', { message: error.message }));
    }
  });

  document.getElementById('save-config')?.addEventListener('click', saveConfig);
  document.getElementById('add-group')?.addEventListener('click', addGroup);
  document.getElementById('import-config')?.addEventListener('click', () => {
    alert(tr('alerts.importNotImplemented', 'Import is not implemented yet'));
  });
  document.getElementById('export-config')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/config/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bob.config.${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(tr('errors.exportFailed', 'Export failed: {message}', { message: error.message }));
    }
  });

}

function setupLanguageSwitcher() {
  const languageSelect = document.getElementById('language-select');
  if (!languageSelect || typeof i18n === 'undefined') return;

  languageSelect.value = i18n.currentLanguage;
  languageSelect.addEventListener('change', async (e) => {
    await i18n.setLanguage(e.target.value);
    updateI18n();
  });

  window.addEventListener('languageChanged', () => {
    updateI18n();
  });
}

function updateI18n() {
  if (typeof i18n === 'undefined') return;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = i18n.t(key);
    if (
      translation &&
      translation !== key &&
      !['undefined', 'null'].includes(String(translation).trim().toLowerCase())
    ) {
      el.textContent = translation;
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const translation = tr(key, '');
    if (translation && translation !== key) {
      el.setAttribute('title', translation);
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translation = tr(key, '');
    if (translation && translation !== key) {
      el.setAttribute('placeholder', translation);
    }
  });

  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.querySelectorAll('option').forEach((opt) => {
      const key = opt.getAttribute('data-i18n');
      if (!key) return;
      const translation = tr(key, opt.textContent || '');
      if (translation && translation !== key) opt.textContent = translation;
    });
  }

  const languageSelect = document.getElementById('language-select');
  if (languageSelect) {
    languageSelect.querySelectorAll('option').forEach((opt) => {
      const key = opt.getAttribute('data-i18n');
      if (!key) return;
      const translation = tr(key, opt.textContent || '');
      if (translation && translation !== key) opt.textContent = translation;
    });
  }
  
  renderView(currentView || 'config');
  refreshIcons();
}
