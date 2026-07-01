# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el panel admin en un dashboard: sidebar con conteos, sección "Resumen" con métricas agregadas, y tabla de logs con nombre de producto, fila expandible y columna fuente.

**Architecture:** Nuevo endpoint `GET /api/admin/stats` que pagina toda la colección `scan_logs` (helper `fireListAll`), agrega con función pura `computeStats` (nuevo `api/stats.js`, testeable), cachea 5 min en memoria. Frontend sigue siendo un solo `admin/index.html` + `admin/admin.js` vanilla que muestra/oculta secciones. Nuevo campo `_source` en scan_logs marcado fire-and-forget en los puntos de resolución.

**Tech Stack:** Node/Express (CommonJS), Firestore REST API, vanilla JS/CSS, vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-admin-dashboard-design.md`

## Global Constraints

- Sin dependencias nuevas. Gráfica con barras CSS puras.
- UI en español, estética Yomi existente (variables `--paper`, `--ink`, `--border`, `--chile`, `--font-mono`, `--font-display`, `--radius-sm` de `/styles.css`).
- Backend CommonJS (`require`/`module.exports`), patrones Firestore REST fire-and-forget existentes en `api/firestore.js`.
- Zona horaria de agregación diaria: `America/Mexico_City`.
- Auth admin: middleware `requireAdmin` existente (header `x-admin-token`).
- Fuera de alcance: filtros por fecha, export CSV, TTL de logs, auto-refresh, agrupación de repetidos.

---

### Task 1: `computeStats` (función pura + test)

**Files:**
- Create: `api/stats.js`
- Test: `tests/stats.test.js`

**Interfaces:**
- Produces: `computeStats(items, names = new Map(), now = Date.now())` → objeto `{ total, today, uniqueProducts, notFoundPct, ocrPct, byDay, topProducts, byCountry, byOS }`. `items` es el array que devuelve `fireListDocs` (`[{ id, data }]`), `names` es `Map<barcode, nombre>`. NO incluye `counts` (lo añade el endpoint en Task 3).

- [ ] **Step 1: Write the failing test**

Crear `tests/stats.test.js`:

```js
import { describe, it, expect } from 'vitest'

const { computeStats } = (await import('../api/stats.js'))

// 2026-07-01 12:00 hora CDMX (UTC-6) expresado en UTC
const NOW = Date.parse('2026-07-01T18:00:00Z')
const DAY = 86400000
const log = (data) => ({ id: 'x', data })

describe('computeStats', () => {
  it('returns zeros for empty collection', () => {
    const s = computeStats([], new Map(), NOW)
    expect(s.total).toBe(0)
    expect(s.today).toBe(0)
    expect(s.uniqueProducts).toBe(0)
    expect(s.notFoundPct).toBe(0)
    expect(s.ocrPct).toBe(0)
    expect(s.byDay).toHaveLength(30)
    expect(s.byDay[29].date).toBe('2026-07-01')
    expect(s.byDay[0].date).toBe('2026-06-02')
    expect(s.byDay.every(d => d.count === 0)).toBe(true)
    expect(s.topProducts).toEqual([])
  })

  it('counts totals, today, uniques and percentages', () => {
    const items = [
      log({ ts: NOW, barcode: 'A', country: 'MX', os: 'Android' }),
      log({ ts: NOW - 1000, barcode: 'A', country: 'MX', os: 'iOS', hasOcr: true }),
      log({ ts: NOW - 2 * DAY, barcode: 'B', country: 'US', os: 'Android', notFound: true }),
      log({ ts: NOW - 3 * DAY, barcode: 'C', country: 'MX', os: 'Windows', hasNutritionOcr: true }),
    ]
    const s = computeStats(items, new Map([['A', 'Pan Bimbo']]), NOW)
    expect(s.total).toBe(4)
    expect(s.today).toBe(2)
    expect(s.uniqueProducts).toBe(3)
    expect(s.notFoundPct).toBe(25)
    expect(s.ocrPct).toBe(50)
  })

  it('builds byDay series zero-filled for 30 days', () => {
    const items = [
      log({ ts: NOW, barcode: 'A' }),
      log({ ts: NOW - 2 * DAY, barcode: 'A' }),
      log({ ts: NOW - 2 * DAY, barcode: 'B' }),
      log({ ts: NOW - 40 * DAY, barcode: 'C' }), // fuera de ventana: no aparece
    ]
    const s = computeStats(items, new Map(), NOW)
    expect(s.byDay[29]).toEqual({ date: '2026-07-01', count: 1 })
    expect(s.byDay[27]).toEqual({ date: '2026-06-29', count: 2 })
    expect(s.byDay[28]).toEqual({ date: '2026-06-30', count: 0 })
    expect(s.total).toBe(4) // total sí cuenta todo
  })

  it('ranks topProducts with names and byCountry/byOS descending', () => {
    const items = [
      log({ ts: NOW, barcode: 'A', country: 'MX', os: 'Android' }),
      log({ ts: NOW, barcode: 'A', country: 'MX', os: 'Android' }),
      log({ ts: NOW, barcode: 'B', country: 'US', os: 'iOS' }),
    ]
    const s = computeStats(items, new Map([['A', 'Pan Bimbo']]), NOW)
    expect(s.topProducts[0]).toEqual({ barcode: 'A', name: 'Pan Bimbo', count: 2 })
    expect(s.topProducts[1]).toEqual({ barcode: 'B', name: '', count: 1 })
    expect(s.byCountry[0]).toEqual({ key: 'MX', count: 2 })
    expect(s.byOS[0]).toEqual({ key: 'Android', count: 2 })
  })

  it('ignores items with null data and caps topProducts at 10', () => {
    const items = [log(null)]
    for (let i = 0; i < 12; i++) items.push(log({ ts: NOW, barcode: 'B' + i }))
    const s = computeStats(items, new Map(), NOW)
    expect(s.total).toBe(13) // el null cuenta en total pero no rompe
    expect(s.topProducts).toHaveLength(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stats.test.js`
Expected: FAIL — `Cannot find module '../api/stats.js'`

- [ ] **Step 3: Write implementation**

Crear `api/stats.js`:

```js
// Agregación pura de scan_logs para /api/admin/stats. Sin I/O: testeable.
const TZ = 'America/Mexico_City';
const DAY = 86400000;

// 'en-CA' da formato YYYY-MM-DD
const dayOf = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });

function computeStats(items, names = new Map(), now = Date.now()) {
  const total = items.length;
  const todayKey = dayOf(now);
  let today = 0, notFound = 0, ocr = 0;
  const perBarcode = new Map(), perDay = new Map(), perCountry = new Map(), perOS = new Map();

  for (const item of items) {
    const d = item && item.data;
    if (!d) continue;
    if (d.ts && dayOf(d.ts) === todayKey) today++;
    if (d.notFound) notFound++;
    if (d.hasOcr || d.hasNutritionOcr) ocr++;
    if (d.barcode) perBarcode.set(d.barcode, (perBarcode.get(d.barcode) || 0) + 1);
    if (d.ts) { const k = dayOf(d.ts); perDay.set(k, (perDay.get(k) || 0) + 1); }
    if (d.country) perCountry.set(d.country, (perCountry.get(d.country) || 0) + 1);
    if (d.os) perOS.set(d.os, (perOS.get(d.os) || 0) + 1);
  }

  const byDay = [];
  for (let i = 29; i >= 0; i--) {
    const date = dayOf(now - i * DAY);
    byDay.push({ date, count: perDay.get(date) || 0 });
  }

  const topProducts = [...perBarcode.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([barcode, count]) => ({ barcode, name: names.get(barcode) || '', count }));

  const ranked = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));

  return {
    total,
    today,
    uniqueProducts: perBarcode.size,
    notFoundPct: total ? Math.round(notFound / total * 100) : 0,
    ocrPct: total ? Math.round(ocr / total * 100) : 0,
    byDay,
    topProducts,
    byCountry: ranked(perCountry),
    byOS: ranked(perOS)
  };
}

module.exports = { computeStats };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stats.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Run full suite (no regressions)**

Run: `npx vitest run`
Expected: PASS todo

- [ ] **Step 6: Commit**

```bash
git add api/stats.js tests/stats.test.js
git commit -m "feat: computeStats aggregation for admin dashboard"
```

---

### Task 2: Firestore helpers — `fireListAll`, `fireMarkScanSource`, exponer `_source`

**Files:**
- Modify: `api/firestore.js`

**Interfaces:**
- Consumes: `fireListDocs(col, pageToken)`, `getAccessToken()`, `docPath(col, id)` (existentes en el mismo archivo).
- Produces: `fireListAll(col)` → `Array<{id, data}> | null`; `fireMarkScanSource(id, source)` fire-and-forget; `fireListDocs` ahora expone `data.source` cuando el doc tiene `_source`. Ambas exportadas en `module.exports`.

- [ ] **Step 1: Add `fireListAll` after `fireListDocs` (después de la línea ~273)**

```js
// ponytail: full scan paginado; si scan_logs supera ~5000 docs, migrar a contadores incrementales.
async function fireListAll(col, maxPages = 100) {
  let all = [], pageToken = null;
  for (let i = 0; i < maxPages; i++) {
    const page = await fireListDocs(col, pageToken);
    if (!page) return null;
    all = all.concat(page.items);
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  return all;
}
```

- [ ] **Step 2: Add `fireMarkScanSource` after `fireMarkScanConfidence` (después de la línea ~330)**

```js
async function fireMarkScanSource(id, source) {
  const token = await getAccessToken(); if (!token) return;
  fetch(docPath('scan_logs', id) + '?updateMask.fieldPaths=_source', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { _source: { stringValue: source } } }),
    signal: AbortSignal.timeout(5000)
  }).catch(() => {});
}
```

- [ ] **Step 3: Expose `_source` in `fireListDocs`**

En `fireListDocs`, junto a las líneas que mapean `_confidence` (~línea 268), añadir:

```js
    if (parsed && d.fields?._source?.stringValue) parsed.source = d.fields._source.stringValue;
```

(queda junto a `if (parsed && d.fields?._confidence?.stringValue) ...`)

- [ ] **Step 4: Export both functions**

En el `module.exports` al final de `api/firestore.js`, añadir `fireListAll` y `fireMarkScanSource` a la lista exportada.

- [ ] **Step 5: Verify syntax and no regressions**

Run: `node -e "require('./api/firestore.js'); console.log('ok')"`
Expected: `ok`

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/firestore.js
git commit -m "feat: fireListAll, fireMarkScanSource and _source exposure in firestore helpers"
```

---

### Task 3: API — endpoint `/api/admin/stats`, marcas de fuente, nombres en logs

**Files:**
- Modify: `api/index.js`

**Interfaces:**
- Consumes: `computeStats` (Task 1), `fireListAll` / `fireMarkScanSource` (Task 2), `fireListDocs`, `memoryCache`, `memoryAiCache`, `requireAdmin` (existentes).
- Produces: `GET /api/admin/stats` → JSON del spec (`computeStats()` + `counts`); `GET /api/admin/scan_logs` ahora incluye `data.productName`; scan_logs nuevos llevan `_source` = `'cache' | 'db' | 'ia'`.

- [ ] **Step 1: Import new helpers**

En la línea 6 de `api/index.js`, añadir `fireListAll` y `fireMarkScanSource` al destructuring del require de `./firestore`. Después de esa línea añadir:

```js
const { computeStats } = require('./stats');
```

- [ ] **Step 2: Mark source at cache-hit returns**

Dentro de `app.get('/api/product/:barcode', ...)`, en el bloque `if (cached) { ... }` (~líneas 319-350) hay **tres** `return res.json(cached.response);` (edad fresca ~332, OFF no modificado ~340, fallback TTL ~346). Inmediatamente **antes de cada uno** de los tres, añadir:

```js
        fireMarkScanSource(_scanLogId, 'cache');
```

- [ ] **Step 3: Mark source at DB and AI resolution returns**

En el mismo endpoint hay cuatro `return res.json(respData);` de resolución externa. Antes de cada uno añadir la marca correspondiente:

| Línea aprox. | Contexto (línea previa `setCacheEntry`/`respData`) | Marca |
|---|---|---|
| ~506 | `"USDA FoodData Central"` | `fireMarkScanSource(_scanLogId, 'db');` |
| ~794 | `bestSource` (Open Food Facts) | `fireMarkScanSource(_scanLogId, 'db');` |
| ~823 | `"UpcItemDb"` | `fireMarkScanSource(_scanLogId, 'db');` |
| ~848 | `"Groq+USDA"` (producto generado por IA) | `fireMarkScanSource(_scanLogId, 'ia');` |
| ~857 | `sourceLabel: 'OCR'` (solo datos OCR locales) | `fireMarkScanSource(_scanLogId, 'db');` |

El caso not-found (~860) ya marca `fireMarkScanNotFound` y no cambia.

- [ ] **Step 4: Add `barcodeNameMap` helper**

Antes de `app.get('/api/admin/cache-all', ...)` (~línea 1230), añadir:

```js
// Mapa barcode -> nombre de producto desde cache L2 + L1. Best-effort: null-safe.
async function barcodeNameMap() {
  const map = new Map();
  const l2 = await fireListDocs('product_cache', null);
  for (const item of (l2?.items || [])) {
    const p = item.data?.response?.product;
    const n = p?.product_name || p?.name || '';
    if (n) map.set(item.id, n);
  }
  for (const [bc, entry] of Object.entries(memoryCache)) {
    const p = entry.response?.product;
    const n = p?.product_name || p?.name || '';
    if (n) map.set(bc, n);
  }
  return map;
}
```

- [ ] **Step 5: Add stats endpoint with 5-min module cache**

Después de `app.get('/api/admin/login-check', ...)` (~línea 1228), añadir:

```js
// ponytail: cache módulo 5 min; en Vercel cada instancia tiene el suyo — suficiente a esta escala.
let statsCache = { data: null, ts: 0 };
const STATS_TTL = 5 * 60 * 1000;

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  if (statsCache.data && Date.now() - statsCache.ts < STATS_TTL && !req.query.fresh) {
    return res.json(statsCache.data);
  }
  const logs = await fireListAll('scan_logs');
  if (!logs) return res.status(500).json({ error: 'Error al listar documentos' });

  const names = await barcodeNameMap();
  const data = computeStats(logs, names);

  const counts = { scan_logs: logs.length };
  for (const col of ['reports', 'products_ocr', 'products_nutrition']) {
    const items = await fireListAll(col);
    counts[col] = items ? items.length : 0;
  }
  const l2Ai = await fireListDocs('ai_cache', null);
  const cacheKeys = new Set([
    ...Object.keys(memoryCache), ...names.keys(),
    ...Object.keys(memoryAiCache), ...(l2Ai?.items || []).map(i => i.id)
  ]);
  counts.cache = cacheKeys.size;
  data.counts = counts;

  statsCache = { data, ts: Date.now() };
  res.json(data);
});
```

Nota: `names.keys()` solo cubre productos con nombre; el conteo de cache es aproximado hacia abajo — aceptable para el sidebar (el tab Cache muestra el número exacto).

- [ ] **Step 6: Enrich scan_logs listing with product names**

Reemplazar el handler `app.get('/api/admin/:collection', ...)` (~línea 1342) por:

```js
app.get('/api/admin/:collection', requireAdmin, validCol, async (req, res) => {
  const result = await fireListDocs(req.params.collection, req.query.pageToken || null);
  if (!result) return res.status(500).json({ error: 'Error al listar documentos' });
  if (req.params.collection === 'scan_logs') {
    const names = await barcodeNameMap();
    for (const it of result.items) {
      if (it.data?.barcode) it.data.productName = names.get(it.data.barcode) || '';
    }
  }
  res.json(result);
});
```

- [ ] **Step 7: Verify locally**

Run: `node -e "require('./api/index.js'); console.log('ok')"`
Expected: `ok`

Run: `npx vitest run`
Expected: PASS

Smoke (requiere `.env` con `ADMIN_TOKEN` y credenciales Firebase; PowerShell):

```powershell
node api/index.js
# en otra terminal (sustituir TOKEN por el valor de ADMIN_TOKEN en .env):
curl.exe -s -H "x-admin-token: TOKEN" http://localhost:3000/api/admin/stats
```

Expected: JSON con `total`, `byDay` (30 entradas), `topProducts`, `counts`. Segunda llamada inmediata responde igual (cache). Detener el server tras verificar.

- [ ] **Step 8: Commit**

```bash
git add api/index.js
git commit -m "feat: /api/admin/stats endpoint, scan source marking, product names in logs"
```

---

### Task 4: Frontend — layout dashboard con sidebar

**Files:**
- Modify: `admin/index.html`
- Modify: `admin/admin.js`

**Interfaces:**
- Consumes: nada nuevo del backend (esta task es solo estructura).
- Produces: nav con `data-col="resumen"` y spans `.nav-count[data-count=<col>]`; `#section-title`; sección Resumen renderiza placeholder "Cargando…" vía `loadStats()` stub que Task 5 completa. IDs existentes (`tabs`, `filter-input`, `doc-list`, `load-more`, `stats-bar`, `logout-btn`, modal, login) se conservan.

- [ ] **Step 1: Replace page structure in `admin/index.html`**

Reemplazar el bloque `<div class="admin-wrap">...</div>` completo (líneas ~115-136) por:

```html
<div class="admin-layout">
  <aside class="sidebar">
    <div class="sidebar-brand">Yomi Admin</div>
    <nav class="side-nav" id="tabs">
      <button class="tab-btn active" data-col="resumen">📊 Resumen</button>
      <button class="tab-btn" data-col="scan_logs">📋 Logs <span class="nav-count" data-count="scan_logs"></span></button>
      <button class="tab-btn" data-col="reports">🚩 Reportes <span class="nav-count" data-count="reports"></span></button>
      <button class="tab-btn" data-col="products_ocr">📷 OCR <span class="nav-count" data-count="products_ocr"></span></button>
      <button class="tab-btn" data-col="products_nutrition">📊 Nutrición <span class="nav-count" data-count="products_nutrition"></span></button>
      <button class="tab-btn" data-col="cache">💾 Cache <span class="nav-count" data-count="cache"></span></button>
    </nav>
  </aside>
  <main class="main-area">
    <div class="admin-header">
      <h1 id="section-title">Resumen</h1>
      <button class="btn" id="logout-btn" style="font-size:0.8rem;padding:6px 12px;">Cerrar sesión</button>
    </div>
    <div class="toolbar" id="toolbar">
      <input id="filter-input" type="text" placeholder="Filtrar por ID / código de barras…">
    </div>
    <div class="stats-bar" id="stats-bar"></div>
    <div class="doc-list" id="doc-list"></div>
    <div class="load-more" id="load-more"></div>
  </main>
</div>
```

(login overlay y modal quedan igual, fuera de `.admin-layout`.)

- [ ] **Step 2: Replace layout CSS**

En el `<style>` de `admin/index.html`, **eliminar** las reglas `.admin-wrap`, `.admin-header`, `.admin-header h1`, `.admin-header .badge`, `.tabs` y **añadir**:

```css
    .admin-layout { display: flex; min-height: 100vh; }
    .sidebar { width: 200px; flex-shrink: 0; border-right: 2px solid var(--border); padding: 20px 12px; box-sizing: border-box; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
    .sidebar-brand { font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; color: var(--ink); margin-bottom: 18px; padding: 0 8px; }
    .side-nav { display: flex; flex-direction: column; gap: 6px; }
    .side-nav .tab-btn { text-align: left; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .nav-count { font-size: 0.68rem; color: var(--text-muted); }
    .tab-btn.active .nav-count { color: inherit; }
    .main-area { flex: 1; min-width: 0; max-width: 1100px; padding: 24px; box-sizing: border-box; }
    .admin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .admin-header h1 { font-family: var(--font-display); font-size: 1.4rem; color: var(--ink); margin: 0; }
    @media (max-width: 720px) {
      .admin-layout { flex-direction: column; }
      .sidebar { width: auto; height: auto; position: static; display: flex; align-items: center; border-right: none; border-bottom: 2px solid var(--border); overflow-x: auto; padding: 10px 12px; }
      .sidebar-brand { margin: 0 12px 0 0; font-size: 0.9rem; white-space: nowrap; }
      .side-nav { flex-direction: row; }
      .side-nav .tab-btn { white-space: nowrap; }
      .main-area { padding: 16px; }
    }
```

Las reglas existentes `.tab-btn`, `.tab-btn:hover`, `.tab-btn.active`, `.toolbar`, etc. se conservan tal cual.

- [ ] **Step 3: Wire navigation in `admin/admin.js`**

3a. Añadir referencias tras la línea 15 (`const modalClose = ...`):

```js
  const sectionTitle = document.getElementById('section-title');
  const toolbarEl = document.getElementById('toolbar');
```

3b. Cambiar línea 18 `let currentCol = 'scan_logs';` → `let currentCol = 'resumen';`

3c. Añadir mapa de títulos y stub tras la línea 22 (`let lastCacheData = null;`):

```js
  const SECTION_TITLES = { resumen: 'Resumen', scan_logs: 'Logs de escaneo', reports: 'Reportes', products_ocr: 'OCR ingredientes', products_nutrition: 'OCR nutrición', cache: 'Cache' };

  async function loadStats() {
    docList.innerHTML = '<div class="empty-msg">Cargando…</div>';
    statsBar.textContent = '';
    loadMoreEl.innerHTML = '';
  }
```

3d. En el handler de click de `tabsEl` (línea ~71), tras `currentCol = btn.dataset.col;` añadir:

```js
    sectionTitle.textContent = SECTION_TITLES[currentCol] || currentCol;
    toolbarEl.style.display = currentCol === 'resumen' ? 'none' : 'flex';
```

3e. Al inicio de `loadCollection` (línea ~92), como primera línea del cuerpo añadir:

```js
    if (currentCol === 'resumen') { await loadStats(); return; }
```

3f. Al final del archivo, antes de `checkLogin();`, añadir (estado inicial: Resumen sin toolbar):

```js
  toolbarEl.style.display = 'none';
```

- [ ] **Step 4: Verify visually**

Run: `node api/index.js` y abrir `http://localhost:3000/admin/` (login con ADMIN_TOKEN).
Expected: sidebar izquierda con 6 ítems, "Resumen" activo con "Cargando…", click en Logs/Reportes/Cache carga las vistas actuales con título correcto y toolbar visible. En viewport móvil (DevTools) la sidebar pasa a barra horizontal. Sin errores de consola.

Run: `npx vitest run`
Expected: PASS (el DOM de `tests/setup.js` es de scan.html, no de admin — no afecta).

- [ ] **Step 5: Commit**

```bash
git add admin/index.html admin/admin.js
git commit -m "feat: admin dashboard layout with sidebar navigation"
```

---

### Task 5: Frontend — sección Resumen (métricas)

**Files:**
- Modify: `admin/index.html` (CSS)
- Modify: `admin/admin.js`

**Interfaces:**
- Consumes: `GET /api/admin/stats` (Task 3), `loadStats()` stub y `.nav-count[data-count]` (Task 4), `escHtml` existente.
- Produces: `renderStats(s)` — render completo de Resumen; sidebar counts poblados desde `s.counts`.

- [ ] **Step 1: Add Resumen CSS**

En el `<style>` de `admin/index.html`, añadir al final:

```css
    /* Resumen */
    .stat-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px; }
    .stat-card { border: 2px solid var(--border); border-radius: var(--radius-sm); background: var(--paper); box-shadow: 2px 2px 0 var(--border); padding: 14px; }
    .stat-card .num { font-family: var(--font-mono); font-size: 1.6rem; font-weight: 600; color: var(--ink); }
    .stat-card .lbl { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
    .stats-h { font-family: var(--font-display); font-size: 1rem; color: var(--ink); margin: 20px 0 10px; }
    .chart { display: flex; align-items: flex-end; gap: 3px; height: 120px; border: 2px solid var(--border); border-radius: var(--radius-sm); background: var(--paper); padding: 10px; box-sizing: border-box; }
    .chart .bar { flex: 1; background: var(--green); min-height: 2px; border-radius: 2px 2px 0 0; }
    .stats-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
    @media (max-width: 720px) { .stats-cols { grid-template-columns: 1fr; } }
    .bk-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 0.8rem; color: var(--ink); }
    .bk-key { width: 80px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bk-bar { flex: 1; height: 10px; background: var(--surface); border-radius: 3px; overflow: hidden; }
    .bk-bar span { display: block; height: 100%; background: var(--green); }
    .bk-n { font-family: var(--font-mono); font-size: 0.75rem; width: 36px; text-align: right; }
```

- [ ] **Step 2: Implement `loadStats` + `renderStats` in `admin/admin.js`**

Reemplazar el stub `loadStats` de Task 4 por:

```js
  async function loadStats() {
    docList.innerHTML = '<div class="empty-msg">Cargando…</div>';
    statsBar.textContent = '';
    loadMoreEl.innerHTML = '';
    const r = await apiFetch('/api/admin/stats');
    if (!r.ok) { docList.innerHTML = '<div class="empty-msg">Error al cargar.</div>'; return; }
    renderStats(await r.json());
  }

  function renderStats(s) {
    document.querySelectorAll('.nav-count').forEach(el => {
      const c = s.counts && s.counts[el.dataset.count];
      el.textContent = (c != null) ? c : '';
    });
    const max = Math.max(1, ...s.byDay.map(d => d.count));
    const bars = s.byDay.map(d =>
      `<div class="bar" style="height:${Math.max(2, Math.round(d.count / max * 100))}%" title="${escHtml(d.date)}: ${d.count}"></div>`
    ).join('');
    const topRows = s.topProducts.map(p => `<tr>
      <td class="mono"><a class="barcode-link" target="_blank" rel="noopener" href="https://www.yomi.mx/scan.html?barcode=${encodeURIComponent(p.barcode)}">${escHtml(p.barcode)}</a></td>
      <td>${escHtml(p.name || '—')}</td>
      <td class="mono">${p.count}</td>
    </tr>`).join('');
    const breakdown = list => (list && list.length)
      ? list.slice(0, 8).map(r => {
          const pct = s.total ? Math.round(r.count / s.total * 100) : 0;
          return `<div class="bk-row"><span class="bk-key" title="${escHtml(r.key)}">${escHtml(r.key)}</span><span class="bk-bar"><span style="width:${pct}%"></span></span><span class="bk-n">${r.count}</span></div>`;
        }).join('')
      : '<div class="empty-msg" style="padding:10px 0;">Sin datos.</div>';
    docList.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card"><div class="num">${s.total}</div><div class="lbl">Escaneos</div></div>
        <div class="stat-card"><div class="num">${s.today}</div><div class="lbl">Hoy</div></div>
        <div class="stat-card"><div class="num">${s.uniqueProducts}</div><div class="lbl">Productos únicos</div></div>
        <div class="stat-card"><div class="num">${s.notFoundPct}%</div><div class="lbl">No encontrados</div></div>
        <div class="stat-card"><div class="num">${s.ocrPct}%</div><div class="lbl">Con OCR</div></div>
      </div>
      <h3 class="stats-h">Escaneos por día (30 días)</h3>
      <div class="chart">${bars}</div>
      <div class="stats-cols">
        <div>
          <h3 class="stats-h">Top productos</h3>
          <table class="log-table"><thead><tr><th>Código</th><th>Producto</th><th>#</th></tr></thead>
          <tbody>${topRows || '<tr><td colspan="3" class="empty-msg">Sin datos.</td></tr>'}</tbody></table>
        </div>
        <div>
          <h3 class="stats-h">País</h3>${breakdown(s.byCountry)}
          <h3 class="stats-h">Sistema</h3>${breakdown(s.byOS)}
        </div>
      </div>`;
  }
```

- [ ] **Step 3: Verify visually**

Run: `node api/index.js`, abrir `http://localhost:3000/admin/`, login.
Expected: Resumen muestra 5 tarjetas con números reales, gráfica de 30 barras (hover muestra `YYYY-MM-DD: N`), top productos con nombres donde el cache los tiene, desgloses País/Sistema con barras. Sidebar muestra conteos (ej. "Logs 324"). Sin errores de consola.

- [ ] **Step 4: Commit**

```bash
git add admin/index.html admin/admin.js
git commit -m "feat: Resumen dashboard section with metrics, chart and breakdowns"
```

---

### Task 6: Frontend — tabla de logs: nombre, fuente, fila expandible

**Files:**
- Modify: `admin/index.html` (CSS)
- Modify: `admin/admin.js`

**Interfaces:**
- Consumes: `data.productName` y `data.source` del endpoint de logs (Task 3); `renderLogs`, handler de clicks de `docList`, `escHtml`, badges y tooltip de confianza existentes.
- Produces: tabla logs con columnas Fecha/Hora · Código+Producto · Ubicación · Sistema · Confianza · Fuente · ✕; fila de detalle expandible con IP/UA/notas/ID.

- [ ] **Step 1: Add CSS**

En el `<style>` de `admin/index.html`, añadir:

```css
    /* Logs expandibles */
    .log-row { cursor: pointer; }
    .log-pname { color: var(--text-muted); font-size: 0.75rem; }
    tr.log-detail td { background: var(--surface); font-size: 0.75rem; padding: 10px 14px; }
    .log-detail-grid { display: flex; flex-direction: column; gap: 4px; word-break: break-all; }
```

- [ ] **Step 2: Replace `renderLogs` in `admin/admin.js`**

Reemplazar la función `renderLogs` completa (líneas ~208-243) por:

```js
  const SOURCE_LABELS = { cache: '💾 Cache', ia: '🤖 IA', db: '🌐 DB' };

  function renderLogs(items) {
    if (!items.length) { docList.innerHTML = '<div class="empty-msg">Sin logs todavía.</div>'; return; }
    const rows = items.map(item => {
      const d = item.data || {};
      const fecha = d.ts ? new Date(d.ts).toLocaleString('es-MX') : '—';
      const loc = [d.city, d.region, d.country].filter(Boolean).join(', ') || '—';
      const bc = d.barcode || '';
      const badges = [
        d.notFound    ? '<span class="log-badge log-badge-red">No encontrado</span>'      : '',
        d.hasOcr      ? '<span class="log-badge log-badge-blue">📷 Ingredientes</span>'   : '',
        d.hasNutritionOcr ? '<span class="log-badge log-badge-blue">📊 Nutrición</span>' : '',
        reportBarcodes?.has(bc) ? '<span class="log-badge log-badge-orange">🚩 Reporte</span>' : ''
      ].filter(Boolean).join(' ');
      const pname = d.productName ? `<div class="log-pname">${escHtml(d.productName)}</div>` : '';
      const barcodeCell = bc
        ? `<a href="https://www.yomi.mx/scan.html?barcode=${encodeURIComponent(bc)}" target="_blank" rel="noopener" class="barcode-link">${escHtml(bc)}</a> ${badges}${pname}`
        : '—';
      const confMap = { alta: '🟢 Alta', media: '🟡 Media', baja: '🔴 Baja' };
      const confLabel = d.confidence ? (confMap[d.confidence.toLowerCase()] || escHtml(d.confidence)) : null;
      const confCell = confLabel
        ? `<span class="conf-wrap">${confLabel}<span class="conf-tooltip"><span class="conf-tooltip-level">Confianza del análisis: ${confLabel}</span>${d.confidenceNotes ? `<span class="conf-tooltip-notes">${escHtml(d.confidenceNotes)}</span>` : ''}</span></span>`
        : '—';
      const srcCell = SOURCE_LABELS[d.source] || (d.source ? escHtml(d.source) : '—');
      const detailRows = [
        `<span><b>ID:</b> ${escHtml(item.id)}</span>`,
        `<span><b>IP:</b> ${escHtml(d.ip || '—')}</span>`,
        `<span><b>User-Agent:</b> ${escHtml(d.ua || '—')}</span>`,
        `<span><b>Fuente:</b> ${srcCell}</span>`,
        d.confidenceNotes ? `<span><b>Notas de confianza:</b> ${escHtml(d.confidenceNotes)}</span>` : ''
      ].filter(Boolean).join('');
      return `<tr class="log-row">
        <td class="mono">${escHtml(fecha)}</td>
        <td class="mono">${barcodeCell}</td>
        <td>${escHtml(loc)}</td>
        <td>${escHtml(d.os || '—')}</td>
        <td>${confCell}</td>
        <td>${srcCell}</td>
        <td><button class="del-log btn-del" data-action="del" data-id="${escHtml(item.id)}">✕</button></td>
      </tr>
      <tr class="log-detail" hidden><td colspan="7"><div class="log-detail-grid">${detailRows}</div></td></tr>`;
    }).join('');
    docList.innerHTML = `<table class="log-table">
      <thead><tr><th>Fecha/Hora</th><th>Código</th><th>Ubicación</th><th>Sistema</th><th>Confianza</th><th>Fuente</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
```

(Cambios vs. original: columna IP eliminada, columna Fuente añadida, nombre de producto bajo el código, cada fila va seguida de un `<tr class="log-detail" hidden>`.)

- [ ] **Step 3: Add row-toggle to the `docList` click handler**

En el listener `docList.addEventListener('click', ...)` (línea ~286), justo después de obtener `btn` y **antes** de `if (!btn) return;`, reemplazar ese inicio por:

```js
    const btn = e.target.closest('[data-action]');
    if (!btn) {
      const row = e.target.closest('tr.log-row');
      if (row && !e.target.closest('a')) {
        const det = row.nextElementSibling;
        if (det && det.classList.contains('log-detail')) det.hidden = !det.hidden;
      }
      return;
    }
    const id = btn.dataset.id;
```

(El resto del handler queda igual.)

- [ ] **Step 4: Verify visually**

Run: `node api/index.js`, abrir admin, sección Logs.
Expected: tabla sin columna IP, con columna Fuente ("—" en logs viejos, `💾 Cache`/`🌐 DB`/`🤖 IA` en logs posteriores al deploy de Task 3); nombre de producto bajo el código donde el cache lo resuelve; click en fila abre detalle con ID/IP/UA/fuente; click de nuevo lo cierra; links y botón ✕ siguen funcionando (borrar pide confirm). Hacer un escaneo de prueba en `scan.html` local y recargar logs: fila nueva muestra fuente.

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add admin/index.html admin/admin.js
git commit -m "feat: logs table with product name, source column and expandable detail row"
```

---

### Task 7: Verificación end-to-end y push

**Files:**
- Ninguno nuevo (solo verificación).

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS todo.

- [ ] **Step 2: Manual E2E with Playwright (patrón del proyecto) o navegador**

Con `node api/index.js` corriendo, flujo completo en `http://localhost:3000/admin/`:
1. Login con token → aterriza en Resumen con métricas y sidebar con conteos.
2. Navegar por las 6 secciones; toolbar oculta solo en Resumen; títulos correctos.
3. Logs: expandir/cerrar fila, verificar fuente y nombre.
4. Cache y Reportes funcionan como antes (regresión).
5. Móvil (viewport 390px): sidebar horizontal, stat cards apiladas, gráfica legible.

- [ ] **Step 3: Push**

```bash
git push origin master
```

(Vercel despliega automático desde master. Verificar en producción `https://www.yomi.mx/admin/` tras el deploy.)
