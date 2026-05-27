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

async function callAiAnnotate(filePath, purposeInput, relationsInput) {
  try {
    const res = await fetch('/api/files/ai-annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath }),
    });
    const data = await res.json();
    if (data.ok && data.generated) {
      purposeInput.value = data.generated.purpose || '';
      relationsInput.value = data.generated.relations || '';
    } else {
      // Failure: log warning, do not overwrite existing inputs.
      console.warn('ai-annotate failed:', data.error);
    }
  } catch (err) {
    console.warn('ai-annotate network error:', err);
  }
}

function renderAnnotationPanelByMode(filePath, container, annotation) {
  // Determine mode via client-side policy mirror.
  const mode = (typeof window.getAnnotationModeClient === 'function')
    ? window.getAnnotationModeClient(filePath)
    : 'ai';

  // Clear the placeholder container.
  while (container.firstChild) container.removeChild(container.firstChild);

  const purpose = safeText(annotation.purpose);
  const relations = safeText(annotation.relations);
  const userNote = safeText(annotation.userNote);

  if (mode === 'skip') {
    // Skip mode: show notice, no inputs needed.
    const notice = document.createElement('div');
    notice.style.cssText = 'padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;color:#64748b;font-size:13px;';
    notice.textContent = annT('annotation.skipNotice', 'This file does not need annotation (media / log)');
    container.appendChild(notice);
    return;
  }

  if (mode === 'manual') {
    // Manual mode: show hint + simple purpose/relations form (no AI generate button).
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-bottom:8px;padding:8px 10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;color:#92400e;font-size:12px;';
    hint.textContent = annT('annotation.manualHint', 'This file type does not use AI. Please fill manually');
    container.appendChild(hint);

    _appendPurposeRelationsInputs(container, purpose, relations);

    const userNoteWrap = _buildUserNoteRow(userNote);
    container.appendChild(userNoteWrap);
    return;
  }

  if (mode === 'optional') {
    // Optional mode: show hint + simplified form (no AI generate button).
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-bottom:8px;padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;color:#166534;font-size:12px;';
    hint.textContent = annT('annotation.optionalHint', 'Documentation file — annotation optional');
    container.appendChild(hint);

    _appendPurposeRelationsInputs(container, purpose, relations);

    const userNoteWrap = _buildUserNoteRow(userNote);
    container.appendChild(userNoteWrap);
    return;
  }

  // ai mode (default): AI section header + generate button + purpose/relations + user note.
  const aiHeader = document.createElement('label');
  aiHeader.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;font-weight:600;font-size:13px;color:#334155;flex-shrink:0;';
  const aiIcon = document.createElement('span');
  aiIcon.style.color = '#8b5cf6';
  aiIcon.textContent = '\u{1F916}';
  aiHeader.appendChild(aiIcon);
  const aiLabelText = document.createTextNode(' ' + annT('annotation.aiSection', 'AI Description'));
  aiHeader.appendChild(aiLabelText);
  container.appendChild(aiHeader);

  const inputsWrap = document.createElement('div');
  inputsWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:8px;min-height:0;';
  _appendPurposeRelationsInputs(inputsWrap, purpose, relations);
  container.appendChild(inputsWrap);

  // Generate / Regenerate button — only in ai mode.
  const generateBtn = document.createElement('button');
  generateBtn.style.cssText = 'margin-top:6px;background:var(--primary,#8b5cf6);color:white;border:none;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;align-self:flex-start;transition:all 0.2s;';
  generateBtn.textContent = annT('annotation.generate', 'Generate / Regenerate');
  generateBtn.onclick = async () => {
    const purposeInput = container.querySelector('#meta-purpose-input');
    const relationsInput = container.querySelector('#meta-relations-input');
    if (!purposeInput || !relationsInput) return;
    const origText = generateBtn.textContent;
    generateBtn.disabled = true;
    generateBtn.textContent = annT('projectExplorer.loading', 'Loading...');
    await callAiAnnotate(filePath, purposeInput, relationsInput);
    generateBtn.textContent = origText;
    generateBtn.disabled = false;
  };
  container.appendChild(generateBtn);

  const userNoteWrap = _buildUserNoteRow(userNote);
  container.appendChild(userNoteWrap);
}

function _appendPurposeRelationsInputs(container, purpose, relations) {
  // Purpose textarea — built with DOM API to prevent XSS.
  const purposeWrap = document.createElement('div');
  purposeWrap.style.cssText = 'flex:2;display:flex;flex-direction:column;min-height:0;';

  const purposeLabel = document.createElement('div');
  purposeLabel.style.cssText = 'font-size:11px;color:#94a3b8;margin-bottom:4px;';
  purposeLabel.textContent = annT('projectExplorer.purpose', 'Purpose');
  purposeWrap.appendChild(purposeLabel);

  const purposeInput = document.createElement('textarea');
  purposeInput.id = 'meta-purpose-input';
  purposeInput.style.cssText = 'flex:1;width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;resize:none;font-size:13px;font-family:inherit;transition:border-color 0.2s;min-height:60px;box-sizing:border-box;';
  purposeInput.placeholder = annT('annotation.purposePlaceholder', 'What does this file do?');
  purposeInput.value = purpose;
  purposeWrap.appendChild(purposeInput);
  container.appendChild(purposeWrap);

  // Relations textarea — built with DOM API to prevent XSS.
  const relationsWrap = document.createElement('div');
  relationsWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;';

  const relationsLabel = document.createElement('div');
  relationsLabel.style.cssText = 'font-size:11px;color:#94a3b8;margin-bottom:4px;';
  relationsLabel.textContent = annT('projectExplorer.relations', 'Relations');
  relationsWrap.appendChild(relationsLabel);

  const relationsInput = document.createElement('textarea');
  relationsInput.id = 'meta-relations-input';
  relationsInput.style.cssText = 'flex:1;width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;resize:none;font-size:13px;font-family:inherit;transition:border-color 0.2s;min-height:48px;box-sizing:border-box;';
  relationsInput.placeholder = annT('annotation.relationsPlaceholder', 'Related files (comma-separated)');
  relationsInput.value = relations;
  relationsWrap.appendChild(relationsInput);
  container.appendChild(relationsWrap);
}

function _buildUserNoteRow(userNote) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:8px;display:flex;align-items:center;gap:6px;';

  const noteLabel = document.createElement('div');
  noteLabel.style.cssText = 'font-size:11px;color:#94a3b8;white-space:nowrap;';
  noteLabel.textContent = annT('annotation.userNote', 'Your note (optional)');
  wrap.appendChild(noteLabel);

  const noteInput = document.createElement('input');
  noteInput.id = 'user-note-input';
  noteInput.type = 'text';
  noteInput.style.cssText = 'flex:1;padding:5px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;font-family:inherit;';
  noteInput.placeholder = annT('projectExplorer.userNotePlaceholder', 'My note...');
  noteInput.value = userNote;
  wrap.appendChild(noteInput);

  return wrap;
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
  const tagsHtml = buildTagsSectionHtml(item);

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

      <div id="annotation-mode-panel" style="flex:1;display:flex;flex-direction:column;min-height:0;margin-bottom:12px;">
      </div>

      <div style="flex-shrink:0;border-top:1px solid #e2e8f0;padding-top:10px;display:flex;align-items:center;gap:8px;">
        <button id="save-annotation-btn" style="background:var(--primary, #3b82f6);color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;transition:all 0.2s;">
          ${annT('projectExplorer.save', 'Save')}
        </button>
      </div>
    </div>`;

  // Inject mode-aware annotation panel via DOM API (XSS-safe, no innerHTML + user content).
  const modePanel = document.getElementById('annotation-mode-panel');
  if (modePanel) {
    renderAnnotationPanelByMode(
      item.path,
      modePanel,
      { purpose: item.purpose, relations: item.relations, userNote: item.userNote }
    );
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();

  const saveBtn = document.getElementById('save-annotation-btn');
  if (saveBtn) saveBtn.onclick = () => handleSaveAnnotation(item);

  loadTagDetails(item);

  // T2.2: render bottom panels (history for files; clear for directories).
  if (typeof window.renderBottomPanels === 'function' && !item.isDirectory) {
    window.renderBottomPanels(item.path);
  } else if (typeof window.clearBottomPanels === 'function') {
    window.clearBottomPanels();
  }
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
