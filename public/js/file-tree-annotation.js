function annT(key, fallback = '', params = {}) {
  if (typeof i18n !== 'undefined') {
    const value = i18n.t(key, params);
    if (value && value !== key && !['undefined', 'null'].includes(String(value).trim().toLowerCase())) {
      return value;
    }
  }
  return fallback || key;
}

function safeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim();
  if (!str || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'null') return fallback;
  return String(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function showFileDetails(item) {
  projectExplorerState.currentFile = item;
  if (typeof window.markPeQuickGuideStep === 'function') {
    window.markPeQuickGuideStep(
      'selectFile',
      annT('projectExplorer.quickDoneSelectFile', 'File selected, details loaded')
    );
  }

  // Always refresh metadata from API when selecting a node.
  if (typeof fetchFileMetadataApi === 'function' && item?.path !== undefined) {
    try {
      const metadata = await fetchFileMetadataApi(item.path);
      item.annotation = safeText(metadata.annotation);
      item.purpose = safeText(metadata.purpose);
      item.relations = safeText(metadata.relations);
      item.userNote = safeText(metadata.userNote);
    } catch (_error) {
      // Keep rendering with current in-memory value if metadata fetch fails.
    }
  }

  const emptyState = document.getElementById('pe-empty-state');
  const detailsPanel = document.getElementById('pe-file-details');

  if (emptyState) emptyState.style.display = 'none';
  if (detailsPanel) detailsPanel.style.display = 'block';

  const iconConfig = getFileIconConfig(item, false);
  let iconHtml = '';
  if (iconConfig.type === 'image') {
    iconHtml = `<img src="${iconConfig.value}" style="width:32px;height:32px;margin-right:12px;">`;
  } else if (iconConfig.type === 'devicon') {
    iconHtml = `<i class="${iconConfig.value}" style="font-size:32px;margin-right:12px;"></i>`;
  } else if (iconConfig.type === 'emoji') {
    iconHtml = `<span style="font-size:32px;margin-right:12px;">${iconConfig.value}</span>`;
  } else {
    iconHtml = `<i data-lucide="${iconConfig.value}" style="width:32px;height:32px;margin-right:12px;${iconConfig.color ? `color:${iconConfig.color}` : ''}"></i>`;
  }

  const annotation = safeText(item.annotation);
  const purpose = safeText(item.purpose);
  const relations = safeText(item.relations);
  const userNote = safeText(item.userNote);

  const tagsHtml = buildTagsSectionHtml(item);

  const typeLabel = item.isDirectory
    ? annT('projectExplorer.typeFolder', 'folder')
    : annT('projectExplorer.typeFile', 'file');

  detailsPanel.innerHTML = `
    <div class="file-details-content" style="padding:20px;display:flex;flex-direction:column;height:100%;">
      <div style="display:flex;align-items:center;margin-bottom:12px;flex-shrink:0;">
        ${iconHtml}
        <div>
          <h3 style="margin:0;font-size:16px;line-height:1.2;">${escapeHtml(item.name)}</h3>
          <p style="color:#64748b;font-size:12px;margin:4px 0 0 0;">${escapeHtml(item.path)}</p>
        </div>
      </div>

      <div style="margin-bottom:12px;flex-shrink:0;">
        <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-weight:600;font-size:13px;color:#334155;">
          <span style="color:#3b82f6;">&#9997;</span> ${annT('projectExplorer.annotation', 'Annotation')}
        </label>
        <textarea id="file-annotation-input" rows="2" style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;resize:none;font-size:13px;font-family:inherit;transition:border-color 0.2s;" placeholder="${escapeHtml(annT('projectExplorer.annotationPlaceholder', 'Short annotation...'))}">${escapeHtml(annotation)}</textarea>
      </div>

      ${tagsHtml}

      <div style="flex:1;display:flex;flex-direction:column;min-height:0;margin-bottom:12px;">
        <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-weight:600;font-size:13px;color:#334155;flex-shrink:0;">
          <span style="color:#8b5cf6;">&#129302;</span> ${annT('projectExplorer.aiDescription', 'AI Description')}
        </label>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;min-height:0;">
          <div style="flex:2;display:flex;flex-direction:column;min-height:0;">
            <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">${annT('projectExplorer.purpose', 'Purpose')}</div>
            <textarea id="meta-purpose-input" style="flex:1;width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;resize:none;font-size:13px;font-family:inherit;transition:border-color 0.2s;" placeholder="${escapeHtml(annT('projectExplorer.purposePlaceholder', 'Describe this {type}', { type: typeLabel }))}">${escapeHtml(purpose)}</textarea>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;min-height:0;">
            <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">${annT('projectExplorer.relations', 'Relations')}</div>
            <textarea id="meta-relations-input" style="flex:1;width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;resize:none;font-size:13px;font-family:inherit;transition:border-color 0.2s;" placeholder="${escapeHtml(annT('projectExplorer.relationsPlaceholder', 'Describe impacts and dependencies'))}">${escapeHtml(relations)}</textarea>
          </div>
        </div>
      </div>

      <div style="flex-shrink:0;border-top:1px solid #e2e8f0;padding-top:10px;display:flex;align-items:center;gap:8px;">
        <input id="user-note-input" type="text" style="flex:1;padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;font-family:inherit;" placeholder="${escapeHtml(annT('projectExplorer.userNotePlaceholder', 'My note...'))}" value="${escapeHtml(userNote)}">
        <button id="save-annotation-btn" style="background:var(--primary, #3b82f6);color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;transition:all 0.2s;">
          ${annT('projectExplorer.save', 'Save')}
        </button>
      </div>
    </div>`;

  if (typeof lucide !== 'undefined') lucide.createIcons();

  const saveBtn = document.getElementById('save-annotation-btn');
  if (saveBtn) saveBtn.onclick = () => handleSaveAnnotation(item);

  loadTagDetails(item);
}

async function handleSaveAnnotation(item) {
  const textarea = document.getElementById('file-annotation-input');
  const purposeInput = document.getElementById('meta-purpose-input');
  const relationsInput = document.getElementById('meta-relations-input');
  const userNoteInput = document.getElementById('user-note-input');
  const btn = document.getElementById('save-annotation-btn');
  if (!textarea || !btn) return;

  const content = safeText(textarea.value);
  const purpose = purposeInput ? safeText(purposeInput.value) : '';
  const relations = relationsInput ? safeText(relationsInput.value) : '';
  const userNote = userNoteInput ? safeText(userNoteInput.value) : '';
  const originalText = btn.textContent;

  try {
    btn.textContent = annT('fileTree.saving', 'Saving...');
    btn.disabled = true;

    await saveAnnotationApi(item.path, content, { purpose, relations, userNote });

    item.annotation = content;
    item.purpose = purpose;
    item.relations = relations;
    item.userNote = userNote;

    const rowDiv = document.querySelector(`.tree-row[data-path="${item.path}"]`);
    if (rowDiv) {
      const existingIcon = rowDiv.querySelector('i[data-lucide="message-square"]');
      if (existingIcon) existingIcon.remove();

      if (content) {
        const msgIcon = document.createElement('i');
        msgIcon.setAttribute('data-lucide', 'message-square');
        msgIcon.style.width = '12px';
        msgIcon.style.height = '12px';
        msgIcon.style.color = '#3b82f6';
        msgIcon.style.marginLeft = 'auto';
        rowDiv.appendChild(msgIcon);
      }

      const purposeSpan = rowDiv.querySelector('.tree-purpose-text');
      if (purpose) {
        const displayText = purpose.length > 20 ? `${purpose.substring(0, 20)}...` : purpose;
        if (purposeSpan) {
          purposeSpan.textContent = displayText;
          purposeSpan.title = purpose;
        } else {
          const newSpan = document.createElement('span');
          newSpan.className = 'tree-purpose-text';
          newSpan.title = purpose;
          newSpan.textContent = displayText;
          const spacer = rowDiv.querySelector('span[style*="flex:1"]');
          if (spacer) spacer.before(newSpan);
        }
      } else if (purposeSpan) {
        purposeSpan.remove();
      }
    }

    btn.textContent = annT('fileTree.saved', 'Saved');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 1500);
  } catch (error) {
    alert(`${annT('alerts.saveFailed', 'Save failed')} ${error.message}`);
    btn.textContent = originalText;
    btn.disabled = false;
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function buildTagsSectionHtml(item) {
  const initialBadges = (item.tags && item.tags.length > 0 && typeof renderTagBadges === 'function')
    ? renderTagBadges(item.tags, { max: 10 })
    : `<span style="color:#94a3b8;font-size:12px;">${annT('projectExplorer.loading', 'Loading...')}</span>`;

  return `
    <div class="tags-section" style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <label style="font-weight:500;font-size:14px;">${annT('projectExplorer.tagCategory', 'Tag Category')}</label>
        <button id="tag-edit-toggle" onclick="toggleTagEditor()" style="background:none;border:1px solid #e2e8f0;border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;color:#64748b;">
          ${annT('projectExplorer.edit', 'Edit')}
        </button>
      </div>
      <div id="tag-preview-badges" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
        ${initialBadges}
      </div>
      <div id="tag-editor-container" style="display:none;">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">${annT('projectExplorer.selectCustomTags', 'Select custom tags')}</div>
        <div id="tag-selector-area">
          <span style="color:#94a3b8;font-size:12px;">${annT('projectExplorer.loading', 'Loading...')}</span>
        </div>
      </div>
    </div>`;
}

async function loadTagDetails(item) {
  if (typeof fetchFileTags !== 'function') return;

  const data = await fetchFileTags(item.path);

  const previewContainer = document.getElementById('tag-preview-badges');
  if (previewContainer && typeof renderTagBadges === 'function') {
    if (data.tags && data.tags.length > 0) {
      previewContainer.innerHTML = renderTagBadges(data.tags, { max: 10 });
    } else {
      previewContainer.innerHTML = `<span style="color:#94a3b8;font-size:12px;">${annT('projectExplorer.noTags', 'No tags')}</span>`;
    }
  }

  const selectorArea = document.getElementById('tag-selector-area');
  if (selectorArea && typeof renderTagSelector === 'function') {
    selectorArea.innerHTML = renderTagSelector(data.custom || [], item.path);
  }
}

function toggleTagEditor() {
  const container = document.getElementById('tag-editor-container');
  const btn = document.getElementById('tag-edit-toggle');
  if (!container) return;

  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = isHidden ? annT('projectExplorer.collapse', 'Collapse') : annT('projectExplorer.edit', 'Edit');
}

window.toggleTagEditor = toggleTagEditor;
