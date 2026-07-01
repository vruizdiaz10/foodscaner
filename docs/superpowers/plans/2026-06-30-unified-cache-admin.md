# Unified Cache Admin Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace confusing product_cache/ai_cache tabs with single "Cache" tab showing L1+L2 unified entries with layer badges and easy delete.

**Architecture:** New API endpoint aggregates L1 (memory objects) + L2 (Firestore) into unified response. Admin UI renders two sections (Products, AI) with L1/L2 badges and delete buttons per layer.

**Tech Stack:** Node.js (Vercel serverless), Firestore REST API, vanilla JS/HTML admin panel.

## Global Constraints

- Existing 61 tests must pass after each task (`npx vitest run`)
- No new dependencies — use existing `fireListDocs`, `fireDeleteDoc`, `memoryCache`, `memoryAiCache`
- Admin auth: `x-admin-token` header + `requireAdmin` middleware
- AI cache key = `[name|brand|ingredients|sugars|carbs|fiber|isBeverage]` (NOT barcode)
- Product cache key = barcode

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `api/index.js` | Modify | Add 2 endpoints: `GET /api/admin/cache-all`, `DELETE /api/admin/cache-all/:type/:key` |
| `admin/index.html` | Modify | Replace `product_cache`/`ai_cache` tabs with single "Cache" tab, add section header CSS |
| `admin/admin.js` | Modify | Add `renderCacheAll()`, Cache tab handler, delete-with-layer logic |

---

### Task 1: API — GET /api/admin/cache-all

**Files:**
- Modify: `api/index.js:1222-1228` (add new endpoint before existing `:collection` route)

**Interfaces:**
- Consumes: `memoryCache`, `memoryAiCache` (in-memory objects), `fireListDocs()` from firestore.js
- Produces: `{ product: [...], ai: [...] }` response shape

**Why before Task 2:** GET must work before DELETE references the same data shape.

- [ ] **Step 1: Add GET endpoint in api/index.js**

Insert after line 1222 (`app.get('/api/admin/login-check', ...)`), before line 1224 (`app.get('/api/admin/:collection', ...)`):

```javascript
app.get('/api/admin/cache-all', requireAdmin, async (req, res) => {
  // Product cache: merge L1 (memory) + L2 (Firestore)
  const l1ProductKeys = Object.keys(memoryCache);
  const l2Product = await fireListDocs('product_cache', null);
  const l2ProductIds = new Set((l2Product?.items || []).map(i => i.id));

  const productMap = new Map();
  for (const barcode of l1ProductKeys) {
    const entry = memoryCache[barcode];
    productMap.set(barcode, {
      barcode,
      source: entry.source || 'unknown',
      inL1: true,
      inL2: l2ProductIds.has(barcode),
      cachedAt: entry.cachedAt || 0
    });
  }
  for (const item of (l2Product?.items || [])) {
    if (!productMap.has(item.id)) {
      const d = item.data || {};
      productMap.set(item.id, {
        barcode: item.id,
        source: d.source || 'unknown',
        inL1: false,
        inL2: true,
        cachedAt: d.cachedAt || 0
      });
    }
  }

  // AI cache: merge L1 (memory) + L2 (Firestore)
  const l1AiKeys = Object.keys(memoryAiCache);
  const l2Ai = await fireListDocs('ai_cache', null);
  const l2AiIds = new Set((l2Ai?.items || []).map(i => i.id));

  const aiMap = new Map();
  for (const key of l1AiKeys) {
    const entry = memoryAiCache[key];
    const resp = entry.response || {};
    aiMap.set(key, {
      key,
      displayName: key.split('|')[0] || key.substring(0, 60),
      model: resp._model || '',
      inL1: true,
      inL2: l2AiIds.has(key),
      cachedAt: entry.cachedAt || 0
    });
  }
  for (const item of (l2Ai?.items || [])) {
    if (!aiMap.has(item.id)) {
      const d = item.data || {};
      const resp = d.response || d;
      aiMap.set(item.id, {
        key: item.id,
        displayName: item.id.split('|')[0] || item.id.substring(0, 60),
        model: resp._model || '',
        inL1: false,
        inL2: true,
        cachedAt: d.cachedAt || 0
      });
    }
  }

  res.json({
    product: [...productMap.values()].sort((a, b) => b.cachedAt - a.cachedAt),
    ai: [...aiMap.values()].sort((a, b) => b.cachedAt - a.cachedAt)
  });
});
```

- [ ] **Step 2: Verify endpoint doesn't break existing routes**

Run: `npx vitest run`
Expected: 61 tests pass

- [ ] **Step 3: Commit**

```bash
git add api/index.js
git commit -m "feat(admin): add GET /api/admin/cache-all endpoint"
```

---

### Task 2: API — DELETE /api/admin/cache-all/:type/:key

**Files:**
- Modify: `api/index.js` (add after GET endpoint from Task 1)

**Interfaces:**
- Consumes: `memoryCache`, `memoryAiCache`, `fireRemoveCache()`, `fireDeleteDoc()` from firestore.js
- Produces: `{ status: 'deleted', type, key, layer }` response

**Why separate from Task 1:** Independent endpoint, can be tested separately.

- [ ] **Step 1: Add DELETE endpoint in api/index.js**

Insert after the GET endpoint added in Task 1:

```javascript
app.delete('/api/admin/cache-all/:type/:key', requireAdmin, async (req, res) => {
  const { type, key } = req.params;
  const layer = req.query.layer || 'all'; // l1 | l2 | all

  if (type === 'product') {
    if (layer === 'l1' || layer === 'all') delete memoryCache[key];
    if (layer === 'l2' || layer === 'all') await fireRemoveCache(key);
  } else if (type === 'ai') {
    if (layer === 'l1' || layer === 'all') delete memoryAiCache[key];
    if (layer === 'l2' || layer === 'all') await fireDeleteDoc('ai_cache', key);
  } else {
    return res.status(400).json({ error: 'Tipo inválido (use product|ai)' });
  }

  res.json({ status: 'deleted', type, key, layer });
});
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run`
Expected: 61 tests pass

- [ ] **Step 3: Commit**

```bash
git add api/index.js
git commit -m "feat(admin): add DELETE /api/admin/cache-all/:type/:key endpoint"
```

---

### Task 3: Admin HTML — Replace cache tabs with unified "Cache" tab

**Files:**
- Modify: `admin/index.html:113-120` (tabs section)

**Interfaces:**
- Consumes: none (pure HTML/CSS)
- Produces: tab structure for admin.js to bind to

- [ ] **Step 1: Replace tabs HTML**

Replace lines 113-120 in `admin/index.html`:

**Before:**
```html
  <div class="tabs" id="tabs">
    <button class="tab-btn active" data-col="scan_logs">Logs</button>
    <button class="tab-btn" data-col="reports">Reportes</button>
    <button class="tab-btn" data-col="products_ocr">products_ocr</button>
    <button class="tab-btn" data-col="products_nutrition">products_nutrition</button>
    <button class="tab-btn" data-col="product_cache">product_cache</button>
    <button class="tab-btn" data-col="ai_cache">ai_cache</button>
  </div>
```

**After:**
```html
  <div class="tabs" id="tabs">
    <button class="tab-btn active" data-col="scan_logs">Logs</button>
    <button class="tab-btn" data-col="reports">Reportes</button>
    <button class="tab-btn" data-col="products_ocr">products_ocr</button>
    <button class="tab-btn" data-col="products_nutrition">products_nutrition</button>
    <button class="tab-btn" data-col="cache">Cache</button>
  </div>
```

- [ ] **Step 2: Add section header CSS**

Add after line 65 (`.log-badge-orange` styles):

```css
    /* Cache tab */
    .cache-section { margin-bottom: 24px; }
    .cache-section h3 { font-family: var(--font-display); font-size: 1rem; color: var(--ink); margin: 0 0 12px; }
    .cache-badge { display: inline-block; font-size: 0.68rem; font-weight: 600; border-radius: 3px; padding: 1px 5px; vertical-align: middle; margin-left: 3px; border: 1px solid; }
    .cache-badge-l1 { background: #e8f0fe; color: #1a56c4; border-color: #a8c0f0; }
    .cache-badge-l2 { background: #d4edda; color: #155724; border-color: #c3e6cb; }
    .cache-badge-both { background: #e8d4f0; color: #6c3483; border-color: #d2b4de; }
    .cache-source { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); }
```

- [ ] **Step 3: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): replace cache tabs with unified Cache tab"
```

---

### Task 4: Admin JS — renderCacheAll + Cache tab logic

**Files:**
- Modify: `admin/admin.js:70-80` (tab click handler), `admin/admin.js:171-199` (renderList), `admin/admin.js:84-98` (loadCollection)

**Interfaces:**
- Consumes: `GET /api/admin/cache-all`, `DELETE /api/admin/cache-all/:type/:key`
- Produces: `renderCacheAll()` function, tab switching for `data-col="cache"`

**Why last task:** Depends on API endpoints (Tasks 1-2) and HTML tab structure (Task 3).

- [ ] **Step 1: Add renderCacheAll function in admin/admin.js**

Insert after `renderReports` function (after line 122):

```javascript
  function renderCacheAll(data) {
    const { product = [], ai = [] } = data;
    let html = '';

    // Product section
    html += '<div class="cache-section"><h3>📦 Productos</h3>';
    if (!product.length) {
      html += '<div class="empty-msg">Sin productos cacheados.</div>';
    } else {
      html += product.map(item => {
        const badge = item.inL1 && item.inL2 ? 'L1+L2' : item.inL1 ? 'L1' : 'L2';
        const badgeCls = item.inL1 && item.inL2 ? 'cache-badge-both' : item.inL1 ? 'cache-badge-l1' : 'cache-badge-l2';
        const date = item.cachedAt ? new Date(item.cachedAt * 1000).toLocaleString('es-MX') : '—';
        return `<div class="doc-item">
          <div>
            <div class="doc-id">${escHtml(item.barcode)}</div>
            <div class="doc-meta"><span class="cache-source">${escHtml(item.source)}</span> · ${escHtml(date)}</div>
          </div>
          <div class="doc-actions">
            <span class="cache-badge ${badgeCls}">${badge}</span>
            <button class="btn-del" data-action="del-cache" data-type="product" data-key="${escHtml(item.barcode)}" data-layer="${escHtml(badge === 'L1+L2' ? 'all' : badge.toLowerCase())}">✕</button>
          </div>
        </div>`;
      }).join('');
    }
    html += '</div>';

    // AI section
    html += '<div class="cache-section"><h3>🤖 Análisis IA</h3>';
    if (!ai.length) {
      html += '<div class="empty-msg">Sin análisis IA cacheados.</div>';
    } else {
      html += ai.map(item => {
        const badge = item.inL1 && item.inL2 ? 'L1+L2' : item.inL1 ? 'L1' : 'L2';
        const badgeCls = item.inL1 && item.inL2 ? 'cache-badge-both' : item.inL1 ? 'cache-badge-l1' : 'cache-badge-l2';
        const date = item.cachedAt ? new Date(item.cachedAt * 1000).toLocaleString('es-MX') : '—';
        const displayName = item.displayName.length > 60 ? item.displayName.substring(0, 60) + '…' : item.displayName;
        return `<div class="doc-item">
          <div>
            <div class="doc-id">${escHtml(displayName)}</div>
            <div class="doc-meta">${escHtml(item.model || '—')} · ${escHtml(date)}</div>
          </div>
          <div class="doc-actions">
            <span class="cache-badge ${badgeCls}">${badge}</span>
            <button class="btn-view" data-action="view-cache" data-key="${escHtml(item.key)}">Ver</button>
            <button class="btn-del" data-action="del-cache" data-type="ai" data-key="${escHtml(item.key)}" data-layer="${escHtml(badge === 'L1+L2' ? 'all' : badge.toLowerCase())}">✕</button>
          </div>
        </div>`;
      }).join('');
    }
    html += '</div>';

    docList.innerHTML = html;
  }
```

- [ ] **Step 2: Modify loadCollection to handle cache tab**

Replace the existing `loadCollection` function (lines 84-98) with:

```javascript
  async function loadCollection(append = false) {
    if (!append) { allItems = []; nextPageToken = null; docList.innerHTML = '<div class="empty-msg">Cargando…</div>'; loadMoreEl.innerHTML = ''; }
    if (currentCol === 'scan_logs' && !append) await loadBarcodeFlags();

    // Special handling for unified cache tab
    if (currentCol === 'cache') {
      const r = await apiFetch('/api/admin/cache-all');
      if (!r.ok) { docList.innerHTML = '<div class="empty-msg">Error al cargar.</div>'; return; }
      const data = await r.json();
      renderCacheAll(data);
      statsBar.textContent = (data.product.length + data.ai.length) + ' entradas cacheadas';
      loadMoreEl.innerHTML = '';
      return;
    }

    const url = '/api/admin/' + currentCol + (nextPageToken ? '?pageToken=' + encodeURIComponent(nextPageToken) : '');
    const r = await apiFetch(url);
    if (!r.ok) { docList.innerHTML = '<div class="empty-msg">Error al cargar.</div>'; return; }
    const data = await r.json();
    allItems = allItems.concat(data.items || []);
    nextPageToken = data.nextPageToken || null;
    renderList();
    loadMoreEl.innerHTML = nextPageToken
      ? '<button class="btn" id="btn-load-more" style="font-size:0.85rem;">Cargar más</button>'
      : '';
    if (nextPageToken) document.getElementById('btn-load-more').addEventListener('click', () => loadCollection(true));
  }
```

- [ ] **Step 3: Add cache delete handler in docList click event**

Replace the `docList.addEventListener('click', ...)` block (lines 202-239) with:

```javascript
  docList.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.dataset.action === 'view') {
      const item = allItems.find(i => i.id === id);
      if (!item) return;
      modalTitle.textContent = id;
      const d = item.data || {};
      const imgB64 = d.image;
      const dataWithoutImg = imgB64 ? { ...d, image: '[base64 image]' } : d;
      modalContent.textContent = JSON.stringify(dataWithoutImg, null, 2);
      let existingImg = modalOverlay.querySelector('.report-preview-img');
      if (existingImg) existingImg.remove();
      if (imgB64) {
        const img = document.createElement('img');
        img.className = 'report-preview-img';
        img.src = 'data:image/jpeg;base64,' + imgB64;
        img.style.cssText = 'max-width:100%;border-radius:6px;margin-top:12px;display:block;';
        modalOverlay.querySelector('.modal-body').appendChild(img);
      }
      modalOverlay.classList.add('open');
    } else if (btn.dataset.action === 'del') {
      if (!confirm('¿Eliminar "' + id + '" de ' + currentCol + '?')) return;
      btn.disabled = true;
      btn.textContent = '…';
      const r = await apiFetch('/api/admin/' + currentCol + '/' + encodeURIComponent(id), { method: 'DELETE' });
      if (r.ok) {
        allItems = allItems.filter(i => i.id !== id);
        renderList();
      } else {
        alert('Error al eliminar.');
        btn.disabled = false;
        btn.textContent = 'Eliminar';
      }
    } else if (btn.dataset.action === 'del-cache') {
      const type = btn.dataset.type;
      const key = btn.dataset.key;
      const layer = btn.dataset.layer;
      if (!confirm('¿Eliminar "' + key.substring(0, 40) + '" del cache?')) return;
      btn.disabled = true;
      btn.textContent = '…';
      const r = await apiFetch('/api/admin/cache-all/' + type + '/' + encodeURIComponent(key) + '?layer=' + layer, { method: 'DELETE' });
      if (r.ok) {
        loadCollection(); // refresh
      } else {
        alert('Error al eliminar.');
        btn.disabled = false;
        btn.textContent = '✕';
      }
    } else if (btn.dataset.action === 'view-cache') {
      const key = btn.dataset.key;
      modalTitle.textContent = key;
      modalContent.textContent = key;
      modalOverlay.classList.add('open');
    }
  });
```

- [ ] **Step 4: Add filter support for cache tab**

Replace the filter input handler (line 82) with:

```javascript
  filterInput.addEventListener('input', () => {
    if (currentCol === 'cache') {
      // Re-fetch and let renderCacheAll handle it (simple approach)
      loadCollection();
    } else {
      renderList();
    }
  });
```

- [ ] **Step 5: Verify all tests pass**

Run: `npx vitest run`
Expected: 61 tests pass

- [ ] **Step 6: Commit**

```bash
git add admin/admin.js
git commit -m "feat(admin): add unified Cache tab with L1/L2 badges and delete"
```

---

### Task 5: Clean up old cache tab references

**Files:**
- Modify: `api/firestore.js:249` (remove product_cache/ai_cache from ADMIN_COLLECTIONS)

**Interfaces:**
- Consumes: existing `ADMIN_COLLECTIONS` array
- Produces: updated array without cache collections

- [ ] **Step 1: Remove cache collections from ADMIN_COLLECTIONS**

In `api/firestore.js:249`, change:

**Before:**
```javascript
const ADMIN_COLLECTIONS = ['scan_logs', 'reports', 'products_ocr', 'products_nutrition', 'product_cache', 'ai_cache'];
```

**After:**
```javascript
const ADMIN_COLLECTIONS = ['scan_logs', 'reports', 'products_ocr', 'products_nutrition'];
```

- [ ] **Step 2: Verify tests pass**

Run: `npx vitest run`
Expected: 61 tests pass

- [ ] **Step 3: Commit**

```bash
git add api/firestore.js
git commit -m "chore: remove product_cache/ai_cache from ADMIN_COLLECTIONS"
```

---

### Task 6: Deploy and verify

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: 61 tests pass

- [ ] **Step 2: Deploy to Vercel**

Run: `vercel --prod --yes`

- [ ] **Step 3: Manual verification**

1. Open `https://www.yomi.mx/admin`
2. Login with admin token
3. Click "Cache" tab
4. Verify 📦 Productos section shows cached products with L1/L2 badges
5. Verify 🤖 Análisis IA section shows cached analyses with L1/L2 badges
6. Click delete on an entry → verify removed
7. Verify Logs, Reportes, products_ocr, products_nutrition tabs still work

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "feat: unified cache admin tab — L1/L2 visibility + delete"
```
