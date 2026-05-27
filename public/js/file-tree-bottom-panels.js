// file-tree-bottom-panels.js
// T2.2: Bottom panels for the Project Explorer view.
// Left half (panel-history): git change history for the selected file.
// Right half (panel-relations): Phase 4 placeholder — not implemented here.

/**
 * Fetch git history for the given file path and render it into
 * #file-history-table. Only called when a file node is selected.
 * @param {string} filePath - Relative or absolute path of the selected file.
 */
async function renderBottomPanels(filePath) {
  const container = document.getElementById('bottom-panels-container');
  if (!container) return;

  // Show the panel section when a file is selected.
  container.style.display = 'grid';

  let history = [];
  try {
    const res = await fetch(
      '/api/files/history?path=' + encodeURIComponent(filePath) + '&limit=20'
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    history = Array.isArray(data.history) ? data.history : [];
  } catch (_err) {
    renderHistoryError();
    return;
  }

  renderHistoryTable(history);
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
 * Clear the history table and hide the bottom panels section.
 * Called when no file is selected (e.g., a directory node is clicked).
 */
function clearBottomPanels() {
  const container = document.getElementById('bottom-panels-container');
  if (container) container.style.display = 'none';

  const tbody = document.querySelector('#file-history-table tbody');
  if (tbody) tbody.replaceChildren();
}

window.renderBottomPanels = renderBottomPanels;
window.clearBottomPanels = clearBottomPanels;
