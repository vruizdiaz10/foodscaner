# Camera HUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the scanner's secondary camera controls (torch, zoom, camera selector) from a vertical column below the viewfinder into a translucent HUD strip overlaid at the bottom of the live video, styled like iOS/Android native camera apps.

**Architecture:** A new `#camera-hud` div lives inside `.scanner-view` as an absolute overlay. `setupScanControls(track, caps)` shows/populates it; `teardownScanControls()` hides and clears it. Torch and zoom stay DOM elements; zoom levels are generated dynamically from hardware capabilities. The camera-switch button flips cameras directly on touch devices and opens a JS-generated popover on desktop.

**Tech Stack:** Vanilla JS, HTML, CSS — no build step, no frameworks. `styles.css?v=38 → v=39`, `app.js?v=56 → v=57`.

## Global Constraints

- Vanilla JS + HTML + CSS only — no libraries, no build tools.
- `#camera-select` (the native `<select>`) remains in the DOM and stays the source of truth for available cameras — JS populates it as before; the HUD reads from it.
- Torch and zoom controls only appear when `track.getCapabilities()` reports hardware support.
- `#btn-toggle-camera` ("Activar cámara") stays below the viewfinder — it is not part of the HUD.
- CSS variables: `--green`, `--chile`, `--accent`, `--ink`, `--card`, `--border`, `--surface`, `--shadow-hover`, `--radius-sm`, `--font-body` (no `--font-mono` — all fonts are Inter).
- Cache-bust: bump version suffix on `styles.css` and `app.js` `<script>`/`<link>` tags in `scan.html` with each task that modifies those files.

---

### Task 1: CSS — HUD overlay styles

**Files:**
- Modify: `styles.css` (around line 458 — after existing btn-torch/zoom-control block)
- Modify: `scan.html` (bump `styles.css?v=38` → `styles.css?v=39`)

**Interfaces:**
- Produces: `.camera-hud`, `.hud-btn`, `.hud-torch.on`, `.zoom-levels`, `.zoom-btn`, `.zoom-btn.active`, `.camera-popover`, `.camera-popover-option`, `.camera-popover-option.active` — all used by Tasks 2 and 3.

- [ ] **Step 1: Remove old dead styles**

In `styles.css`, find and delete these 4 lines (currently around line 458-461):

```css
.btn-torch.on { background: var(--green); border-color: var(--green); color: #fff; }
.zoom-control { display: flex; align-items: center; gap: 8px; }
.zoom-control label { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
.zoom-slider { flex: 1; accent-color: var(--green); }
```

- [ ] **Step 2: Add HUD styles in their place**

In `styles.css`, at the same location (after `.btn-camera:active` block), insert:

```css
/* ── Camera HUD overlay ─────────────────────────── */
.camera-hud {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: linear-gradient(to top, rgba(0,0,0,0.55), transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  z-index: 10;
}

.hud-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  border: 1.5px solid rgba(255,255,255,0.3);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s;
  padding: 0;
}

.hud-btn:active { opacity: 0.75; }

.hud-torch.on {
  background: var(--green);
  border-color: var(--green);
}

.zoom-levels {
  display: flex;
  gap: 2px;
  background: rgba(0,0,0,0.35);
  border-radius: 20px;
  padding: 3px;
}

.zoom-btn {
  padding: 4px 10px;
  border-radius: 16px;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(255,255,255,0.65);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  line-height: 1;
}

.zoom-btn.active {
  background: rgba(255,255,255,0.92);
  color: #000;
}

.camera-popover {
  position: absolute;
  bottom: 56px;
  right: 0;
  min-width: 200px;
  background: var(--card);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-hover);
  overflow: hidden;
  z-index: 20;
}

.camera-popover-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}

.camera-popover-option:hover { background: var(--surface); }

.camera-popover-option.active {
  font-weight: 600;
  color: var(--green);
}

.camera-popover-option .pop-check {
  width: 14px;
  flex-shrink: 0;
  font-size: 0.8rem;
}
```

- [ ] **Step 3: Bump styles version in scan.html**

In `scan.html`, change:
```html
<link rel="stylesheet" href="styles.css?v=38">
```
to:
```html
<link rel="stylesheet" href="styles.css?v=39">
```

- [ ] **Step 4: Verify visually**

Open browser DevTools on `scan.html`. In the Styles panel, confirm `.camera-hud`, `.hud-btn`, `.zoom-btn.active`, `.camera-popover` all exist. No console errors.

- [ ] **Step 5: Commit**

```bash
git add styles.css scan.html
git commit -m "feat: camera HUD — CSS overlay styles"
```

---

### Task 2: HTML + JS — HUD structure, torch and zoom

**Files:**
- Modify: `scan.html` (restructure `.scanner-view` and `.scanner-controls`; bump `app.js?v=56` → `v=57`)
- Modify: `app.js` (update DOM refs; rewrite `setupScanControls` and `teardownScanControls`)

**Interfaces:**
- Consumes: `.camera-hud`, `.hud-btn`, `.hud-torch.on`, `.zoom-levels`, `.zoom-btn`, `.zoom-btn.active` from Task 1.
- Produces: `cameraHud`, `btnCameraSwitch` DOM refs; updated `setupScanControls(track, caps)` and `teardownScanControls()` — used by Task 3.

- [ ] **Step 1: Restructure scan.html — move HUD into .scanner-view**

Locate the `<div id="interactive-scanner" class="scanner-view">` block (around line 77). Replace its contents so it looks exactly like this:

```html
<div id="interactive-scanner" class="scanner-view">
  <div class="scanner-placeholder">
    <p class="scan-title">La cámara no está activa</p>
    <p class="scan-help">Apunta al código de barras del producto</p>
  </div>

  <!-- Camera HUD: overlay visible only with active camera -->
  <div class="camera-hud hidden" id="camera-hud">
    <button id="btn-torch" type="button" class="hud-btn hud-torch hidden" aria-label="Linterna">
      <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18h6"/><path d="M10 22h4"/>
        <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>
      </svg>
    </button>
    <div id="zoom-wrapper" class="zoom-levels hidden"></div>
    <button id="btn-camera-switch" type="button" class="hud-btn hud-switch" aria-label="Cambiar cámara">
      <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 7h-9"/><path d="M14 17H5"/>
        <polyline points="17 4 20 7 17 10"/><polyline points="8 14 5 17 8 20"/>
      </svg>
    </button>
  </div>

  <div class="scan-frame"><span></span><span></span></div>
</div>
```

- [ ] **Step 2: Simplify .scanner-controls in scan.html**

Locate the `<div class="scanner-controls">` block (around line 85). Replace its contents so it contains only the toggle button and the (permanently hidden) camera select:

```html
<div class="scanner-controls">
  <button id="btn-toggle-camera" class="btn btn-camera">
    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>
    Activar cámara
  </button>
  <div class="camera-select-container hidden" id="camera-select-wrapper" style="display:none">
    <label for="camera-select">Cámara:</label>
    <select id="camera-select" class="styled-select"></select>
  </div>
</div>
```

Note: `style="display:none"` on `#camera-select-wrapper` permanently hides it from layout. The `<select>` inside stays in the DOM and is still populated by JS — the HUD reads from it.

- [ ] **Step 3: Bump app.js version in scan.html**

Change:
```html
<script src="app.js?v=56" defer></script>
```
to:
```html
<script src="app.js?v=57" defer></script>
```

- [ ] **Step 4: Update DOM refs in app.js**

Find these three lines (around line 43-45 in `app.js`):
```js
const torchBtn   = document.getElementById('btn-torch');
const zoomWrap   = document.getElementById('zoom-wrapper');
const zoomSlider = document.getElementById('zoom-slider');
```

Replace them with (remove `zoomSlider`, add `cameraHud` and `btnCameraSwitch`):
```js
const torchBtn        = document.getElementById('btn-torch');
const zoomWrap        = document.getElementById('zoom-wrapper');
const cameraHud       = document.getElementById('camera-hud');
const btnCameraSwitch = document.getElementById('btn-camera-switch');
```

- [ ] **Step 5: Rewrite setupScanControls in app.js**

Find the current `setupScanControls` function (around line 595) which looks like:
```js
function setupScanControls(track, caps) {
  if (caps.torch) {
    torchBtn.classList.remove('hidden');
    torchBtn.onclick = async () => { ... };
  }
  if (caps.zoom) {
    zoomWrap.classList.remove('hidden');
    zoomSlider.min = caps.zoom.min;
    ...
  }
}
```

Replace the entire function with:
```js
function setupScanControls(track, caps) {
  cameraHud.classList.remove('hidden');

  if (caps.torch) {
    torchBtn.classList.remove('hidden');
    torchBtn.onclick = async () => {
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(() => {});
      torchBtn.classList.toggle('on', torchOn);
    };
  }

  if (caps.zoom && caps.zoom.max >= 2) {
    const levels = [1, 2, 3].filter(l => l <= caps.zoom.max);
    levels.forEach(level => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'zoom-btn' + (level === 1 ? ' active' : '');
      btn.textContent = level + '×';
      btn.dataset.zoom = level;
      btn.onclick = () => {
        track.applyConstraints({ advanced: [{ zoom: level }] }).catch(() => {});
        zoomWrap.querySelectorAll('.zoom-btn').forEach(b => b.classList.toggle('active', b === btn));
      };
      zoomWrap.appendChild(btn);
    });
    zoomWrap.classList.remove('hidden');
  }

  setupCameraSwitch();
}
```

(`×` is the × multiplication sign, matches what iOS Camera uses for zoom labels.)

- [ ] **Step 6: Rewrite teardownScanControls in app.js**

Find the current `teardownScanControls` function (around line 616):
```js
function teardownScanControls() {
  torchOn = false;
  torchBtn.classList.add('hidden'); torchBtn.classList.remove('on'); torchBtn.onclick = null;
  zoomWrap.classList.add('hidden'); zoomSlider.oninput = null;
}
```

Replace it with:
```js
function teardownScanControls() {
  torchOn = false;
  torchBtn.classList.add('hidden');
  torchBtn.classList.remove('on');
  torchBtn.onclick = null;
  zoomWrap.classList.add('hidden');
  zoomWrap.innerHTML = '';
  btnCameraSwitch.onclick = null;
  closeCameraPopover();
  cameraHud.classList.add('hidden');
}
```

(`closeCameraPopover` is defined in Task 3. Add a stub for now so the file doesn't error:)

```js
function closeCameraPopover() {}
function setupCameraSwitch() {}
```

Place these two stub functions immediately after `teardownScanControls`.

- [ ] **Step 7: Verify in browser**

Open `scan.html`. Hard-refresh (Ctrl+Shift+R). Click "Activar cámara":
- Camera starts.
- HUD strip appears at the bottom of the viewfinder.
- If on a device with torch hardware: torch button (🔦 icon, circular) appears on the left.
- If on a device with zoom hardware (zoom.max ≥ 2): zoom pill with level buttons appears in the center.
- If hardware not available: only the camera-switch button (🔄 icon) appears on the right.
- Camera-switch button does nothing yet (stub).
- Stop camera → HUD disappears, no console errors.

- [ ] **Step 8: Commit**

```bash
git add scan.html app.js
git commit -m "feat: camera HUD — HTML structure, torch toggle, zoom preset buttons"
```

---

### Task 3: JS — Camera switch (flip on mobile, popover on desktop)

**Files:**
- Modify: `app.js` (replace `setupCameraSwitch` and `closeCameraPopover` stubs with real implementations)

**Interfaces:**
- Consumes: `btnCameraSwitch`, `cameraHud`, `cameraSelect`, `restartCameraWithSelectedDevice`, `esc()` from existing `app.js`; `.camera-popover`, `.camera-popover-option`, `.camera-popover-option.active`, `.pop-check` from Task 1 CSS.
- Produces: working camera-switch behavior on all platforms.

- [ ] **Step 1: Replace stub functions in app.js**

Find the two stubs added at the end of Task 2:
```js
function closeCameraPopover() {}
function setupCameraSwitch() {}
```

Replace them with the full implementations:

```js
const isTouchDevice = navigator.maxTouchPoints > 1;

function setupCameraSwitch() {
  if (isTouchDevice) {
    btnCameraSwitch.onclick = () => {
      const opts = cameraSelect.options;
      if (opts.length < 2) return;
      cameraSelect.selectedIndex = (cameraSelect.selectedIndex + 1) % opts.length;
      restartCameraWithSelectedDevice();
    };
  } else {
    btnCameraSwitch.onclick = (e) => {
      e.stopPropagation();
      if (document.getElementById('camera-popover')) {
        closeCameraPopover();
        return;
      }
      openCameraPopover();
    };
  }
}

function openCameraPopover() {
  const popover = document.createElement('div');
  popover.id = 'camera-popover';
  popover.className = 'camera-popover';

  Array.from(cameraSelect.options).forEach(opt => {
    const isActive = opt.value === cameraSelect.value;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'camera-popover-option' + (isActive ? ' active' : '');
    btn.innerHTML = `<span class="pop-check">${isActive ? '✓' : ''}</span>${esc(opt.text)}`;
    btn.onclick = () => {
      cameraSelect.value = opt.value;
      restartCameraWithSelectedDevice();
      closeCameraPopover();
    };
    popover.appendChild(btn);
  });

  cameraHud.appendChild(popover);

  requestAnimationFrame(() => {
    document.addEventListener('click', closeCameraPopover, { once: true });
    document.addEventListener('keydown', handlePopoverEsc);
  });
}

function closeCameraPopover() {
  const popover = document.getElementById('camera-popover');
  if (popover) popover.remove();
  document.removeEventListener('keydown', handlePopoverEsc);
}

function handlePopoverEsc(e) {
  if (e.key === 'Escape') closeCameraPopover();
}
```

Note: `esc()` is already defined at the top of `app.js` (line 5) — it escapes HTML entities. Use it on `opt.text` to prevent XSS from camera labels.

- [ ] **Step 2: Verify on desktop**

Open `scan.html` on desktop (Chrome/Edge). Hard-refresh. Activate camera with multiple webcams connected:
- Camera-switch button appears in the HUD.
- Click it → a popover appears above the button listing all cameras. The active camera has a ✓ checkmark.
- Click a different camera option → camera restarts with that camera, popover closes.
- Click the switch button again → popover opens. Click outside → popover closes.
- Press Escape → popover closes.

- [ ] **Step 3: Verify on mobile**

Open `scan.html` on iPhone or Android with two or more cameras:
- Activate camera.
- Tap the camera-switch button → camera switches to next camera (no popover, no menu).
- Tap again → cycles back.
- If only one camera available → tap does nothing (no crash).

- [ ] **Step 4: Verify teardown**

Activate camera, open popover (desktop), then click "Detener Cámara":
- Popover closes.
- HUD hides.
- No `teardownScanControls` errors in console.
- Re-activate camera → HUD appears fresh, popover not present.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: camera HUD — flip on mobile, popover on desktop"
```

---

## Verification final

Con la cámara activa en un móvil con linterna y zoom:

```
┌─────────────────────────────────┐
│                                 │
│         [live video]            │
│          [scan-frame]           │
│                                 │
│ ┌─────────────────────────────┐ │
│ │  [🔦]   [1×][2×]   [🔄]  │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
      [ Activar cámara / Detener ]
```

- Torch button: circular, blanco translúcido → verde sólido al activar.
- Zoom buttons: pastilla oscura, nivel activo con pastilla blanca.
- Switch button: circular, blanco translúcido.
- En desktop: click en switch → popover con lista de cámaras.
- En móvil: tap en switch → flip directo.
- Detener cámara → todo desaparece, sin errores.
