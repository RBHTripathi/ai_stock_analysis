/* Positional Scan — Overnight Shortlist viewer
 * Loads overnight_shortlist.json (same directory), renders cards, wires up
 * filters / search / sort. Pure vanilla JS — no build step, no framework.
 */
(function () {
  'use strict';

  // ---------- DOM refs ----------
  const grid           = document.getElementById('grid');
  const loader         = document.getElementById('loader');
  const emptyState     = document.getElementById('empty');
  const emptyResetBtn  = document.getElementById('empty-reset');
  const searchInput    = document.getElementById('search');
  const clearSearchBtn = document.getElementById('clear-search');
  const resetBtn       = document.getElementById('reset-btn');
  const sectorSelect   = document.getElementById('sector-filter');
  const sortSelect     = document.getElementById('sort-by');
  const resultCount    = document.getElementById('result-count');
  const meta           = document.getElementById('meta');

  const verdictChips    = document.getElementById('verdict-chips');
  const convictionChips = document.getElementById('conviction-chips');

  const statEls = {
    total: document.getElementById('stat-total'),
    entry: document.getElementById('stat-entry'),
    add:   document.getElementById('stat-add'),
    skip:  document.getElementById('stat-skip'),
    exit:  document.getElementById('stat-exit'),
  };

  // ---------- State ----------
  const VERDICT_ORDER = { ENTRY: 0, ADD: 1, EXIT: 2, SKIP: 3, UNKNOWN: 4 };
  const CONVICTION_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, UNKNOWN: 3 };

  const state = {
    raw: [],
    view: [],
    filterVerdict: 'ALL',
    filterConviction: 'ALL',
    filterSector: 'ALL',
    search: '',
    sort: 'actionable',
  };

  // ---------- Normalize one row ----------
  // The JSON occasionally has malformed / partial entries. Normalize so the
  // renderer can assume every record has the expected fields.
  function normalizeRow(row, idx) {
    if (!row || typeof row !== 'object') return null;

    // Drop rows with no usable stock symbol AND no content.
    const stock = (row.stock || '').toString().trim();
    if (!stock) return null;

    const verdict    = (row.verdict    || '').toString().trim().toUpperCase() || 'UNKNOWN';
    const conviction = (row.conviction || '').toString().trim().toUpperCase() || 'UNKNOWN';
    const sector     = (row.sector     || '').toString().trim() || '—';
    const why        = (row.why        || '').toString().trim();
    const action     = (row.suggested_action || '').toString().trim();

    return {
      _idx: idx,
      stock,
      verdict,
      conviction,
      sector,
      why,
      action,
      _haystack: [stock, sector, verdict, conviction, why, action]
        .join(' ')
        .toLowerCase(),
    };
  }

  // ---------- Rendering ----------
  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function verdictBadge(v) {
    const safe = escapeHTML(v);
    return `<span class="badge badge-verdict-${safe}">${safe || 'UNKNOWN'}</span>`;
  }

  function convictionBadge(c) {
    const safe = escapeHTML(c);
    return `<span class="badge badge-conviction-${safe}">${safe || 'UNKNOWN'}</span>`;
  }

  function cardHTML(row) {
    const v = escapeHTML(row.verdict);
    return `
      <article class="card" data-verdict="${v}" data-idx="${row._idx}">
        <header class="card-head">
          <div>
            <h3 class="card-stock">${escapeHTML(row.stock)}</h3>
            <p class="card-sector">${escapeHTML(row.sector)}</p>
          </div>
          <div class="badges">
            ${verdictBadge(row.verdict)}
            ${convictionBadge(row.conviction)}
          </div>
        </header>
        ${row.why ? `
          <section class="card-section">
            <span class="label">Why</span>
            <p>${escapeHTML(row.why)}</p>
          </section>
        ` : ''}
        ${row.action ? `
          <section class="card-section card-action">
            <span class="label">Suggested action</span>
            <p>${escapeHTML(row.action)}</p>
          </section>
        ` : ''}
      </article>
    `;
  }

  // ---------- Filter + sort ----------
  function applyView() {
    const q = state.search.trim().toLowerCase();

    let view = state.raw.filter((row) => {
      if (state.filterVerdict !== 'ALL' && row.verdict !== state.filterVerdict) return false;
      if (state.filterConviction !== 'ALL' && row.conviction !== state.filterConviction) return false;
      if (state.filterSector !== 'ALL' && row.sector !== state.filterSector) return false;
      if (q && !row._haystack.includes(q)) return false;
      return true;
    });

    view.sort((a, b) => {
      switch (state.sort) {
        case 'stock-asc':  return a.stock.localeCompare(b.stock);
        case 'stock-desc': return b.stock.localeCompare(a.stock);
        case 'conviction':
          return (CONVICTION_ORDER[a.conviction] ?? 99) - (CONVICTION_ORDER[b.conviction] ?? 99)
              || a.stock.localeCompare(b.stock);
        case 'actionable':
        default: {
          const vd = (VERDICT_ORDER[a.verdict] ?? 99) - (VERDICT_ORDER[b.verdict] ?? 99);
          if (vd !== 0) return vd;
          const cd = (CONVICTION_ORDER[a.conviction] ?? 99) - (CONVICTION_ORDER[b.conviction] ?? 99);
          if (cd !== 0) return cd;
          return a.stock.localeCompare(b.stock);
        }
      }
    });

    state.view = view;
  }

  function render() {
    applyView();

    if (state.view.length === 0) {
      grid.hidden = true;
      emptyState.hidden = false;
    } else {
      emptyState.hidden = true;
      grid.hidden = false;
      // Build cards in one pass for performance
      grid.innerHTML = state.view.map(cardHTML).join('');
    }

    const total = state.raw.length;
    const shown = state.view.length;
    resultCount.innerHTML =
      shown === total
        ? `Showing all <strong>${total}</strong> stocks`
        : `Showing <strong>${shown}</strong> of <strong>${total}</strong> stocks`;
  }

  // ---------- Summary stats ----------
  function renderStats() {
    const counts = { ENTRY: 0, ADD: 0, SKIP: 0, EXIT: 0, UNKNOWN: 0 };
    state.raw.forEach((r) => {
      counts[r.verdict] = (counts[r.verdict] || 0) + 1;
    });
    statEls.total.textContent = state.raw.length;
    statEls.entry.textContent = counts.ENTRY;
    statEls.add.textContent   = counts.ADD;
    statEls.skip.textContent  = counts.SKIP;
    statEls.exit.textContent  = counts.EXIT;
  }

  // ---------- Sector dropdown ----------
  function populateSectors() {
    const sectors = Array.from(
      new Set(state.raw.map((r) => r.sector).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    sectors.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sectorSelect.appendChild(opt);
    });
  }

  // ---------- Event wiring ----------
  function setActiveChip(group, value, dataAttr) {
    group.querySelectorAll('.chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset[dataAttr] === value);
    });
  }

  function wireEvents() {
    // Verdict chips
    verdictChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state.filterVerdict = btn.dataset.verdict;
      setActiveChip(verdictChips, state.filterVerdict, 'verdict');
      render();
    });

    // Conviction chips
    convictionChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state.filterConviction = btn.dataset.conviction;
      setActiveChip(convictionChips, state.filterConviction, 'conviction');
      render();
    });

    // Summary-card shortcuts
    document.querySelectorAll('.stat-card.clickable').forEach((card) => {
      card.addEventListener('click', () => {
        const v = card.dataset.filterVerdict;
        if (!v) return;
        state.filterVerdict = v;
        setActiveChip(verdictChips, v, 'verdict');
        render();
        // scroll to results
        document.querySelector('.filters').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // Search input — debounced lightly
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      const v = searchInput.value;
      clearSearchBtn.hidden = v.length === 0;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = v;
        render();
      }, 90);
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.search = '';
      clearSearchBtn.hidden = true;
      render();
      searchInput.focus();
    });

    // Sector + sort
    sectorSelect.addEventListener('change', () => {
      state.filterSector = sectorSelect.value;
      render();
    });

    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      render();
    });

    // Reset
    const reset = () => {
      state.filterVerdict = 'ALL';
      state.filterConviction = 'ALL';
      state.filterSector = 'ALL';
      state.search = '';
      state.sort = 'actionable';
      searchInput.value = '';
      clearSearchBtn.hidden = true;
      sectorSelect.value = 'ALL';
      sortSelect.value = 'actionable';
      setActiveChip(verdictChips, 'ALL', 'verdict');
      setActiveChip(convictionChips, 'ALL', 'conviction');
      render();
    };

    resetBtn.addEventListener('click', reset);
    emptyResetBtn.addEventListener('click', reset);

    // Escape clears search
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.activeElement === searchInput) {
        searchInput.value = '';
        state.search = '';
        clearSearchBtn.hidden = true;
        render();
      }
    });
  }

  // ---------- Load data ----------
  function setMeta(text) { meta.innerHTML = text; }

  function showError(msg) {
    loader.innerHTML = `
      <div class="empty-icon" aria-hidden="true">⚠️</div>
      <p style="color: var(--exit); font-weight: 600;">${escapeHTML(msg)}</p>
      <p style="font-size: 13px;">
        Make sure <code>overnight_shortlist.json</code> is in the same folder as this page.
      </p>
    `;
    setMeta('<span style="color: #fecaca;">Failed to load</span>');
  }

  async function load() {
    let data;
    try {
      data = await loadAny();
    } catch (err) {
      console.error(err);
      showError(err.message || 'Unable to load shortlist.');
      return;
    }

    if (!Array.isArray(data)) {
      showError('JSON is not an array — check overnight_shortlist.json.');
      return;
    }

    state.raw = data.map(normalizeRow).filter(Boolean);

    const today = new Date().toLocaleDateString('en-IN', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    setMeta(`📅 Generated ${today} · ${state.raw.length} stocks`);

    populateSectors();
    renderStats();
    render();

    wireEvents();
  }

  // Try, in order:
  //   1. fetch('overnight_shortlist.json') — server / GitHub Pages
  //      (preferred so updates to the JSON show up immediately)
  //   2. <script id="shortlist-data" type="application/json">…</script>
  //      embedded in the HTML page (works under file:// when no server)
  //   3. XHR fallback for browsers that block fetch() under file://
  async function loadAny() {
    // 1. fetch() the live JSON file first — picks up pipeline updates.
    try {
      const res = await fetch('overnight_shortlist.json', { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (_) { /* fall through */ }

    // 2. XHR fallback — works under file:// in some browsers
    if (location.protocol === 'file:') {
      return await loadJSONViaXHR();
    }
    throw new Error('Unable to load overnight_shortlist.json');
  }

  function loadJSONViaXHR() {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'overnight_shortlist.json', true);
      xhr.onload = () => {
        if (xhr.status === 0 || xhr.status === 200) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) { reject(e); }
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('XHR failed'));
      xhr.send();
    });
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
