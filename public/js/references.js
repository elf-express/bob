/* 參考手冊(references view)— 讀 public/refs/*.json,用 BOB 樣式渲染。
 * 安全:除固定 icon 外一律用 textContent / DOM API,不做字串插值(BOB 規範)。 */
(function () {
  'use strict';

  function refreshRefIcons() {
    if (typeof refreshIcons === 'function') refreshIcons();
    else if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  // view 進入點:載入索引 → 填下拉 → 載入第一張(或當前選擇)
  window.renderReferences = function renderReferences() {
    var container = document.getElementById('references-container');
    var select = document.getElementById('references-select');
    if (!container) return;

    fetch('/api/refs')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (select && !select.dataset.loaded) {
          select.textContent = '';
          items.forEach(function (it) {
            var opt = document.createElement('option');
            opt.value = it.file;
            opt.textContent = it.title;
            select.appendChild(opt);
          });
          select.dataset.loaded = '1';
          select.addEventListener('change', function () { loadRefTable(select.value); });
        }
        if (items.length) loadRefTable((select && select.value) || items[0].file);
        else container.textContent = '尚無參考頁(public/refs/ 內加 *.json 即自動出現)';
      })
      .catch(function () { container.textContent = '載入參考索引失敗'; });
  };

  function loadRefTable(file) {
    var container = document.getElementById('references-container');
    if (!container || !file) return;
    fetch('/refs/' + encodeURIComponent(file))
      .then(function (r) { return r.json(); })
      .then(function (data) { renderRefTable(container, data); })
      .catch(function () { container.textContent = '載入參考內容失敗:' + file; });
  }

  function renderRefTable(container, data) {
    container.textContent = '';
    var labels = {};
    (data.legend || []).forEach(function (k) { labels[k.type] = k.label; });

    // header
    var head = document.createElement('div');
    head.className = 'ref-head';
    if (data.eyebrow) { head.appendChild(el('div', 'ref-eyebrow', data.eyebrow)); }
    head.appendChild(el('h1', 'ref-title', data.title || ''));
    if (data.subtitle) { head.appendChild(el('p', 'ref-sub', data.subtitle)); }
    container.appendChild(head);

    // legend
    if (Array.isArray(data.legend) && data.legend.length) {
      var lg = document.createElement('div');
      lg.className = 'ref-legend';
      data.legend.forEach(function (k) {
        var key = document.createElement('span');
        key.className = 'ref-key';
        var dot = document.createElement('span');
        dot.className = 'ref-dot ' + k.type;
        key.appendChild(dot);
        key.appendChild(el('b', null, k.label));
        if (k.desc) key.appendChild(el('span', 'ref-key-desc', k.desc));
        lg.appendChild(key);
      });
      container.appendChild(lg);
    }

    // phases
    (data.phases || []).forEach(function (phase) {
      var band = document.createElement('div');
      band.className = 'ref-band';
      band.appendChild(el('span', null, phase.band || ''));
      band.appendChild(el('div', 'ref-band-ln', ''));
      container.appendChild(band);

      (phase.commands || []).forEach(function (cmd) { container.appendChild(buildRow(cmd, labels)); });

      if (phase.support) {
        var sup = document.createElement('div');
        sup.className = 'ref-support';
        sup.appendChild(el('p', 'ref-support-head', phase.support.head || ''));
        (phase.support.commands || []).forEach(function (cmd) { sup.appendChild(buildRow(cmd, labels)); });
        container.appendChild(sup);
      }
    });

    // notes
    if (Array.isArray(data.notes) && data.notes.length) {
      var notes = document.createElement('div');
      notes.className = 'ref-notes';
      data.notes.forEach(function (n) {
        var p = document.createElement('p');
        p.appendChild(el('b', null, (n.title || '') + ' '));
        p.appendChild(document.createTextNode(n.body || ''));
        notes.appendChild(p);
      });
      container.appendChild(notes);
    }

    refreshRefIcons();
  }

  function buildRow(cmd, labels) {
    var row = document.createElement('div');
    row.className = 'ref-row';

    // command bar
    var bar = document.createElement('div');
    bar.className = 'ref-cmd-bar';
    bar.appendChild(el('span', 'ref-num', cmd.num || ''));
    bar.appendChild(el('code', 'ref-code', cmd.cmd || ''));
    var copy = document.createElement('button');
    copy.className = 'ref-copy';
    copy.title = '複製指令';
    setBtnIcon(copy, 'copy', null);
    copy.addEventListener('click', function () { copyRefCommand(copy, cmd.cmd || ''); });
    bar.appendChild(copy);
    row.appendChild(bar);

    // body: meta + flow
    var body = document.createElement('div');
    body.className = 'ref-body';
    var meta = document.createElement('div');
    meta.className = 'ref-meta';
    meta.appendChild(el('div', 'ref-cn', cmd.name || ''));
    var tag = el('span', 'ref-tag ' + cmd.type, labels[cmd.type] || cmd.type);
    meta.appendChild(tag);
    if (cmd.guard) meta.appendChild(el('div', 'ref-guard', cmd.guard));
    body.appendChild(meta);

    var flow = document.createElement('div');
    flow.className = 'ref-flow';
    var steps = cmd.flow || [];
    steps.forEach(function (step, i) {
      flow.appendChild(el('span', 'ref-chip ' + cmd.type, step));
      if (i < steps.length - 1) flow.appendChild(el('span', 'ref-arr', '→'));
    });
    body.appendChild(flow);
    row.appendChild(body);

    return row;
  }

  function copyRefCommand(btn, cmd) {
    if (!cmd) return;
    var restore = function () {
      setBtnIcon(btn, 'check', '#22c55e');
      setTimeout(function () { setBtnIcon(btn, 'copy', null); }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(restore).catch(function () { fallbackCopy(cmd, restore); });
    } else {
      fallbackCopy(cmd, restore);
    }
  }

  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* noop */ }
    document.body.removeChild(ta);
    if (cb) cb();
  }

  // 設定按鈕內的單一 lucide icon(純 DOM API,不碰 innerHTML)
  function setBtnIcon(btn, name, color) {
    btn.textContent = '';
    btn.style.color = color || '';
    var icon = document.createElement('i');
    icon.setAttribute('data-lucide', name);
    btn.appendChild(icon);
    refreshRefIcons();
  }

  // 小工具:建元素 + className + textContent(全程無 innerHTML 插值)
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
})();
