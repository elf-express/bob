// file-tree-bottom-panels.js
// T2.2 + T4.2: Bottom panels for the Project Explorer view.
// Left half (panel-history): git change history for the selected file.
// Right half (panel-relations): file relations (outbound / inbound).

/**
 * Fetch git history and file relations for the given file path.
 * Renders both into the bottom panels. Only called when a file node is selected.
 * @param {string} filePath - Relative or absolute path of the selected file.
 */
async function renderBottomPanels(filePath) {
  const container = document.getElementById('bottom-panels-container');
  if (!container) return;

  // Show the panel section when a file is selected.
  container.style.display = 'grid';

  // Fetch history and relations in parallel
  const [historyRes, relationsRes] = await Promise.all([
    fetchHistory(filePath).catch(e => ({ ok: false, error: e.message })),
    fetchRelations(filePath).catch(e => ({ ok: false, error: e.message })),
  ]);

  // Render history panel
  if (historyRes.ok) {
    renderHistoryTable(Array.isArray(historyRes.history) ? historyRes.history : []);
  } else {
    renderHistoryError();
  }

  // Render relations panel
  if (relationsRes.ok) {
    renderRelationsTwoLists(relationsRes);
  } else {
    renderRelationsError();
  }
}

/**
 * Fetch git history for the given file path.
 * @param {string} filePath
 * @returns {Promise<Object>}
 */
async function fetchHistory(filePath) {
  const res = await fetch(
    '/api/files/history?path=' + encodeURIComponent(filePath) + '&limit=20'
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/**
 * Fetch file relations (outbound and inbound) for the given file path.
 * @param {string} filePath
 * @returns {Promise<Object>}
 */
async function fetchRelations(filePath) {
  const res = await fetch('/api/files/relations?path=' + encodeURIComponent(filePath));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/**
 * Render history rows into #file-history-table tbody.
 * Uses only textContent / DOM API — no innerHTML string interpolation.
 * @param {Array} history
 */
function renderHistoryTable(history) {
  const tbody = document.querySelector('#file-history-table tbody');
  if (!tbody) return;

  tbody.replaceChildren();

  if (!history.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'history-empty-cell';
    td.textContent = annT('panels.empty', '無歷史記錄');
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const h of history) {
    const tr = document.createElement('tr');
    tr.title = h.sha || '';

    const tdDate = document.createElement('td');
    tdDate.className = 'col-date';
    tdDate.textContent = (h.date || '').slice(0, 10);

    const tdAuthor = document.createElement('td');
    tdAuthor.className = 'col-author';
    tdAuthor.textContent = h.author || '';

    const tdSubject = document.createElement('td');
    tdSubject.className = 'col-subject';
    tdSubject.textContent = h.subject || '';

    tr.append(tdDate, tdAuthor, tdSubject);
    tbody.appendChild(tr);
  }
}

/**
 * Show an error row in the history table when the API call fails.
 */
function renderHistoryError() {
  const tbody = document.querySelector('#file-history-table tbody');
  if (!tbody) return;

  tbody.replaceChildren();

  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 3;
  td.className = 'history-error-cell';
  td.textContent = annT('panels.error', '載入失敗');
  tr.appendChild(td);
  tbody.appendChild(tr);
}

/**
 * Render file relations (outbound and inbound) into .panel-relations.
 * Uses only textContent / DOM API — no innerHTML string interpolation.
 * @param {Object} data - Response from /api/files/relations
 */
function renderRelationsTwoLists(data) {
  const panel = document.querySelector('.panel-relations');
  if (!panel) return;

  // Clear existing content
  panel.replaceChildren();

  // Create h4 title (reuse existing)
  const h4 = document.createElement('h4');
  h4.className = 'panel-title';
  h4.textContent = annT('panels.relations', 'Related Files');
  panel.appendChild(h4);

  // Outbound section: files I depend on
  panel.appendChild(
    _buildRelationsSection(
      annT('panels.outbound', '↓ I depend on'),
      data.outbound || []
    )
  );

  // Inbound section: files that depend on me
  panel.appendChild(
    _buildRelationsSection(
      annT('panels.inbound', '↑ Depended by'),
      data.inbound || []
    )
  );
}

/**
 * Build a single relation section (title + list of files).
 * @param {string} title - Section title
 * @param {Array} items - Array of { path, via } objects
 * @returns {HTMLElement} section element
 */
function _buildRelationsSection(title, items) {
  const section = document.createElement('section');
  section.className = 'relations-section';

  // Title
  const h5 = document.createElement('h5');
  h5.className = 'relations-title';
  h5.textContent = title;
  section.appendChild(h5);

  // Check for empty state
  if (!items || !items.length) {
    const empty = document.createElement('p');
    empty.className = 'relations-empty';
    empty.textContent = annT('panels.relationsEmpty', '(none)');
    section.appendChild(empty);
    return section;
  }

  // File list
  const ul = document.createElement('ul');
  ul.className = 'relations-list';

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'relations-item';

    const a = document.createElement('a');
    a.href = '#';
    a.className = 'relations-link';
    a.dataset.path = item.path; // dataset auto-escapes
    a.textContent = item.path; // textContent prevents XSS

    li.appendChild(a);
    ul.appendChild(li);
  }

  section.appendChild(ul);
  return section;
}

/**
 * Show an error state in the relations panel.
 */
function renderRelationsError() {
  const panel = document.querySelector('.panel-relations');
  if (!panel) return;

  panel.replaceChildren();

  const h4 = document.createElement('h4');
  h4.className = 'panel-title';
  h4.textContent = annT('panels.relations', 'Related Files');
  panel.appendChild(h4);

  const err = document.createElement('div');
  err.className = 'relations-error';
  err.textContent = annT('panels.error', 'Failed to load');
  panel.appendChild(err);
}

/**
 * Clear both history and relations panels, and hide the bottom panels section.
 * Called when no file is selected (e.g., a directory node is clicked).
 */
function clearBottomPanels() {
  const container = document.getElementById('bottom-panels-container');
  if (container) container.style.display = 'none';

  const tbody = document.querySelector('#file-history-table tbody');
  if (tbody) tbody.replaceChildren();

  const relationsPanel = document.querySelector('.panel-relations');
  if (relationsPanel) relationsPanel.replaceChildren();
}

window.renderBottomPanels = renderBottomPanels;
window.clearBottomPanels = clearBottomPanels;
