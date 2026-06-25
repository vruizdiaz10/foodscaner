# Barcode Scanner Improvement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace html5-qrcode with the native BarcodeDetector API on supported devices (iOS 17+, Chrome), keep html5-qrcode as a tuned fallback, and add EAN/UPC checksum validation to silently reject partial barcode reads before they reach the backend.

**Architecture:** Feature-detect `BarcodeDetector` at runtime. Both paths converge in a shared `onBarcodeDetected(raw)` handler that validates the barcode checksum before calling `analyzeBarcode`. A UX hint element is dynamically injected below the viewfinder during active scanning.

**Tech Stack:** Vanilla JS, html5-qrcode v2.3.8 (existing), native BarcodeDetector API, vitest for tests.

## Global Constraints

- Only `app.js` is modified for logic. No static HTML or CSS file changes.
- Version suffix on `app.js` must be bumped in `scan.html` after all tasks are complete.
- Test runner: `npm test` (vitest run, jsdom environment).
- Functions under test must be returned from the `new Function(appCode + '\nreturn { ... }')()` pattern already used in `tests/app.test.js`.
- Barcode formats to support: EAN-13 (13 digits), UPC-A (12 digits), EAN-8 (8 digits), UPC-E (8 digits starting with 0, expanded to UPC-A before lookup).
- BarcodeDetector formats list: `['ean_13', 'upc_a', 'upc_e', 'ean_8']`.

---

### Task 1: EAN checksum validation

**Files:**
- Modify: `app.js` — add `eanChecksum`, `expandUpcE`, `validateBarcode` functions
- Modify: `tests/app.test.js` — add test suite for all three functions

**Interfaces:**
- Produces:
  - `eanChecksum(code: string): boolean` — validates check digit; `code` is a string of all-digit chars including the check digit as the last char; `n = code.length` drives the weight formula
  - `expandUpcE(code: string): string` — takes an 8-digit UPC-E string, returns a 12-digit UPC-A string (number system + 10 payload digits + original check digit)
  - `validateBarcode(raw: string): { valid: boolean, code?: string }` — full pipeline; `code` in the result is the canonical form to send to the backend (EAN-8/EAN-13 as-is, UPC-E expanded to 12-digit UPC-A)

- [ ] **Step 1: Write failing tests**

Add to `tests/app.test.js`:

```js
// ─── eanChecksum ───────────────────────────────────────────────
describe('eanChecksum', () => {
  it('validates a correct EAN-13', () => {
    expect(eanChecksum('4006381333931')).toBe(true)
  })
  it('rejects an EAN-13 with wrong check digit', () => {
    expect(eanChecksum('4006381333932')).toBe(false)
  })
  it('validates a correct UPC-A', () => {
    expect(eanChecksum('036000291452')).toBe(true)
  })
  it('rejects a UPC-A with wrong check digit', () => {
    expect(eanChecksum('036000291453')).toBe(false)
  })
  it('validates a correct EAN-8', () => {
    expect(eanChecksum('40111220')).toBe(true)
  })
  it('rejects an EAN-8 with wrong check digit', () => {
    expect(eanChecksum('40111221')).toBe(false)
  })
})

// ─── expandUpcE ───────────────────────────────────────────────
describe('expandUpcE', () => {
  it('expands UPC-E with last digit 0 → UPC-A', () => {
    // 01234505 → 0 12 0 0000 345 5 (last digit of mid=5, wait...)
    // Use a known pair: UPC-E 01234565 where mid=123456
    // last=6 (>=5): S d1d2d3d4d5 0000 last E → 0 12345 0000 6 5 = 012345000065
    expect(expandUpcE('01234565')).toBe('012345000065')
  })
  it('expands UPC-E with last digit 3 → UPC-A', () => {
    // mid=123435, last=3: S d1d2d3 00000 d4d5 E → 0 123 00000 45 5
    // UPC-E: 01234355 (mid=123435, E=5)
    // expanded: 0 123 00000 45 5 = 012300000455
    expect(expandUpcE('01234355')).toBe('012300000455')
  })
})

// ─── validateBarcode ────────────────────────────────────────────
describe('validateBarcode', () => {
  it('accepts a valid EAN-13', () => {
    const r = validateBarcode('4006381333931')
    expect(r.valid).toBe(true)
    expect(r.code).toBe('4006381333931')
  })
  it('rejects a truncated code (7 digits)', () => {
    expect(validateBarcode('7500227').valid).toBe(false)
  })
  it('rejects a code with bad checksum', () => {
    expect(validateBarcode('4006381333932').valid).toBe(false)
  })
  it('accepts a valid UPC-A', () => {
    const r = validateBarcode('036000291452')
    expect(r.valid).toBe(true)
    expect(r.code).toBe('036000291452')
  })
  it('accepts a valid EAN-8', () => {
    const r = validateBarcode('40111220')
    expect(r.valid).toBe(true)
    expect(r.code).toBe('40111220')
  })
  it('expands a valid UPC-E to UPC-A', () => {
    const r = validateBarcode('01234565')
    expect(r.valid).toBe(true)
    expect(r.code).toBe('012345000065')
  })
  it('strips spaces and dashes before validating', () => {
    expect(validateBarcode('4006381 333931').valid).toBe(true)
  })
  it('rejects non-digit characters', () => {
    expect(validateBarcode('ABCDEFGHIJKLM').valid).toBe(false)
  })
})
```

Also add the three new functions to the `beforeAll` destructuring in `tests/app.test.js`:

```js
let parseApiProduct, isGlutenRelated, extractDietaryFromLabels, eanChecksum, expandUpcE, validateBarcode

beforeAll(() => {
  const fn = new Function(appCode + '\nreturn { parseApiProduct, isGlutenRelated, extractDietaryFromLabels, eanChecksum, expandUpcE, validateBarcode }')
  const exports = fn()
  parseApiProduct = exports.parseApiProduct
  isGlutenRelated = exports.isGlutenRelated
  extractDietaryFromLabels = exports.extractDietaryFromLabels
  eanChecksum = exports.eanChecksum
  expandUpcE = exports.expandUpcE
  validateBarcode = exports.validateBarcode
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test
```

Expected: FAIL with "eanChecksum is not a function" (or similar).

- [ ] **Step 3: Add the three functions to `app.js`**

Add after line 92 (after the allergen emoji map, before `// Application Scanner State`):

```js
// ── Barcode validation ────────────────────────────────────────

function eanChecksum(code) {
  const n = code.length;
  let sum = 0;
  for (let i = 0; i < n - 1; i++) {
    const w = ((n - 1 - i) % 2 === 0) ? 1 : 3;
    sum += parseInt(code[i]) * w;
  }
  return (10 - (sum % 10)) % 10 === parseInt(code[n - 1]);
}

function expandUpcE(code) {
  // code: 8 chars [S, d0, d1, d2, d3, d4, d5, E]
  const S = code[0], E = code[7];
  const d = code.slice(1, 7);
  const last = d[5];
  let expanded;
  if (last <= '2') {
    expanded = `${S}${d[0]}${d[1]}${last}0000${d[2]}${d[3]}${d[4]}${E}`;
  } else if (last === '3') {
    expanded = `${S}${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}${E}`;
  } else if (last === '4') {
    expanded = `${S}${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}${E}`;
  } else {
    expanded = `${S}${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${last}${E}`;
  }
  return expanded;
}

function validateBarcode(raw) {
  const code = raw.replace(/[\s\-]/g, '');
  if (!/^\d+$/.test(code)) return { valid: false };
  const n = code.length;
  if (n !== 8 && n !== 12 && n !== 13) return { valid: false };
  if (eanChecksum(code)) return { valid: true, code };
  if (n === 8 && code[0] === '0') {
    const expanded = expandUpcE(code);
    if (eanChecksum(expanded)) return { valid: true, code: expanded };
  }
  return { valid: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test
```

Expected: all new tests PASS. Existing tests unaffected.

- [ ] **Step 5: Commit**

```
git add app.js tests/app.test.js
git commit -m "feat: add EAN/UPC checksum validation (eanChecksum, expandUpcE, validateBarcode)"
```

---

### Task 2: Refactor scanner to BarcodeDetector + fallback

**Files:**
- Modify: `app.js` — refactor `toggleCamera`, `startScanning`, `stopScanning`, `restartCameraWithSelectedDevice`; add `startScanningNative`, `stopScanningNative`, `startScanningFallback`, `onBarcodeDetected`

**Interfaces:**
- Consumes: `validateBarcode(raw)` from Task 1
- Produces: `onBarcodeDetected(raw: string): void` — validates + triggers `analyzeBarcode`; called by both scanner paths

- [ ] **Step 1: Add state variables for native path**

In `app.js`, after the existing scanner state block (after line 96 `let isScanning = false;`):

```js
const USE_NATIVE_SCANNER = 'BarcodeDetector' in window;
let nativeScanRafId = null;
let nativeScanStream = null;
```

- [ ] **Step 2: Add `onBarcodeDetected` shared handler**

Add this function after `resetCameraButton` (after line 346):

```js
function onBarcodeDetected(rawCode) {
  const result = validateBarcode(rawCode);
  if (!result.valid) return;
  barcodeInput.value = result.code;
  if (navigator.vibrate) navigator.vibrate(100);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) { /* audio not available */ }
  stopScanning();
  analyzeBarcode(result.code);
}
```

- [ ] **Step 3: Add `startScanningNative`**

Add after `onBarcodeDetected`:

```js
async function startScanningNative(cameraId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: cameraId }, facingMode: 'environment' }
    });
    nativeScanStream = stream;
    const placeholder = scannerView.querySelector('.scanner-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    scannerView.appendChild(video);
    await video.play();
    const detector = new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'upc_e', 'ean_8'] });
    const tick = () => {
      if (!isScanning) return;
      detector.detect(video).then(barcodes => {
        if (barcodes.length > 0) onBarcodeDetected(barcodes[0].rawValue);
        else nativeScanRafId = requestAnimationFrame(tick);
      }).catch(() => { nativeScanRafId = requestAnimationFrame(tick); });
    };
    nativeScanRafId = requestAnimationFrame(tick);
  } catch (err) {
    console.error('Error al iniciar BarcodeDetector:', err);
    resetCameraButton();
  }
}
```

- [ ] **Step 4: Add `stopScanningNative`**

Add after `startScanningNative`:

```js
function stopScanningNative() {
  if (nativeScanRafId) { cancelAnimationFrame(nativeScanRafId); nativeScanRafId = null; }
  if (nativeScanStream) { nativeScanStream.getTracks().forEach(t => t.stop()); nativeScanStream = null; }
  const video = scannerView.querySelector('video');
  if (video) video.remove();
  const placeholder = scannerView.querySelector('.scanner-placeholder');
  if (placeholder) placeholder.style.display = '';
}
```

- [ ] **Step 5: Add `startScanningFallback`**

Add after `stopScanningNative`. This replaces the body of the current `startScanning` with the tuned parameters:

```js
function startScanningFallback(cameraId) {
  if (!html5QrCode) return;
  html5QrCode.start(
    cameraId,
    {
      fps: 20,
      qrbox: (width, height) => {
        const minDim = Math.min(width, height);
        return { width: Math.floor(minDim * 0.85), height: Math.floor(minDim * 0.30) };
      }
    },
    (decodedText) => onBarcodeDetected(decodedText),
    () => {}
  ).catch(err => console.error('Error al iniciar scanner:', err));
}
```

- [ ] **Step 6: Replace `startScanning` to branch between paths**

Replace the entire current `startScanning` function (lines 268-311) with:

```js
function startScanning(cameraId) {
  if (USE_NATIVE_SCANNER) {
    startScanningNative(cameraId);
  } else {
    startScanningFallback(cameraId);
  }
}
```

- [ ] **Step 7: Replace `stopScanning` to handle both paths**

Replace the entire current `stopScanning` function (lines 313-323) with:

```js
function stopScanning() {
  if (USE_NATIVE_SCANNER) {
    stopScanningNative();
    resetCameraButton();
  } else {
    if (!html5QrCode) return;
    html5QrCode.stop().then(() => {
      html5QrCode = null;
      resetCameraButton();
    }).catch(err => {
      console.error('Error al detener scanner:', err);
      resetCameraButton();
    });
  }
}
```

- [ ] **Step 8: Update `toggleCamera` to skip html5QrCode init on native path**

In `toggleCamera`, find the block that initializes html5QrCode (around line 252):

```js
      // Initialize scanner object
      html5QrCode = new Html5Qrcode("interactive-scanner");
      isScanning = true;
```

Replace with:

```js
      isScanning = true;
      if (!USE_NATIVE_SCANNER) {
        html5QrCode = new Html5Qrcode("interactive-scanner");
      }
```

- [ ] **Step 9: Update `restartCameraWithSelectedDevice` to handle both paths**

Replace the entire current `restartCameraWithSelectedDevice` function (lines 325-334) with:

```js
function restartCameraWithSelectedDevice() {
  if (!isScanning) return;
  const selectedCameraId = cameraSelect.value;
  if (USE_NATIVE_SCANNER) {
    stopScanningNative();
    startScanningNative(selectedCameraId);
  } else {
    if (!html5QrCode) return;
    html5QrCode.stop().then(() => startScanningFallback(selectedCameraId))
      .catch(err => console.error('Error al cambiar cámara:', err));
  }
}
```

- [ ] **Step 10: Run tests to confirm nothing broke**

```
npm test
```

Expected: all tests still PASS.

- [ ] **Step 11: Manual smoke test**

Open the app in a browser. Toggle the camera. Confirm:
- On Chrome/iOS 17+: camera activates via BarcodeDetector path (no html5-qrcode elements injected)
- Scan a barcode: result appears, scanner stops
- Hold up a partially covered barcode (cover part of it): scanner keeps scanning, does not submit
- On a browser without BarcodeDetector (Firefox): camera activates via html5-qrcode fallback path
- Stop camera: view returns to placeholder

- [ ] **Step 12: Commit**

```
git add app.js
git commit -m "feat: BarcodeDetector native scanner with html5-qrcode fallback"
```

---

### Task 3: UX coaching hint and activity indicator

**Files:**
- Modify: `app.js` — add coaching hint injection and activity timer to `toggleCamera` / `stopScanning`

**Interfaces:**
- Consumes: existing `scannerWrapper` DOM ref (`.scanner-wrapper`)

- [ ] **Step 1: Add coaching hint injection helper**

Add these two functions after `stopScanningNative` (before `startScanningFallback`):

```js
let scanActivityTimer = null;
let scanHintEl = null;

function showScanHint() {
  if (scanHintEl) return;
  scanHintEl = document.createElement('p');
  scanHintEl.id = 'scan-coaching';
  scanHintEl.style.cssText = 'color:rgba(255,255,255,0.6);font-size:0.8rem;text-align:center;margin:8px 0 0;padding:0 16px;line-height:1.4;';
  scanHintEl.textContent = 'Centra el código y mueve el teléfono despacio de lado a lado';
  if (scannerWrapper) scannerWrapper.insertBefore(scanHintEl, scannerWrapper.querySelector('.scanner-controls').nextSibling);
  scanActivityTimer = setTimeout(() => {
    if (scanHintEl && isScanning) scanHintEl.textContent = 'Buscando código...';
  }, 3000);
}

function hideScanHint() {
  if (scanActivityTimer) { clearTimeout(scanActivityTimer); scanActivityTimer = null; }
  if (scanHintEl) { scanHintEl.remove(); scanHintEl = null; }
}
```

- [ ] **Step 2: Call `showScanHint` when scanning starts**

In `toggleCamera`, find the line `startScanning(defaultCam.id);` and add the call before it:

```js
      showScanHint();
      startScanning(defaultCam.id);
```

- [ ] **Step 3: Call `hideScanHint` when scanning stops**

In `resetCameraButton`, add `hideScanHint()` as the first line:

```js
function resetCameraButton() {
  hideScanHint();
  isScanning = false;
  // ... rest unchanged
```

- [ ] **Step 4: Run tests to confirm nothing broke**

```
npm test
```

Expected: all tests still PASS.

- [ ] **Step 5: Manual UX test**

Open the app. Activate camera. Confirm:
- Coaching text ("Centra el código...") appears below the scanner controls immediately
- After ~3 seconds without a scan, text changes to "Buscando código..."
- After a successful scan (or pressing stop), the hint disappears
- No leftover DOM elements after stopping and restarting the camera

- [ ] **Step 6: Bump app.js version in scan.html and commit**

In `scan.html`, find:
```html
<script src="app.js?v=47" defer></script>
```
Change to:
```html
<script src="app.js?v=48" defer></script>
```

Then commit:
```
git add app.js scan.html
git commit -m "feat: scan UX coaching hint and activity indicator"
```

---

## Self-Review Checklist

- **Spec coverage:**
  - ✅ BarcodeDetector primary path → Task 2
  - ✅ html5-qrcode fallback (tuned fps 20, wider qrbox) → Task 2 Step 5
  - ✅ EAN-8 / UPC-A / EAN-13 checksum validation → Task 1
  - ✅ UPC-E expansion to UPC-A → Task 1 (`expandUpcE`)
  - ✅ Coaching hint below viewfinder → Task 3
  - ✅ Activity indicator after 3s → Task 3
  - ✅ Only `app.js` modified (no static HTML/CSS changes) → Task 3 dynamically creates element

- **Type consistency:**
  - `validateBarcode` → `{ valid: boolean, code?: string }` used consistently in `onBarcodeDetected` (Task 2 Step 2)
  - `onBarcodeDetected(rawCode: string)` called in `startScanningNative` (Task 2 Step 3) and `startScanningFallback` (Task 2 Step 5) ✅
  - `stopScanningNative()` called in both `stopScanning` (Task 2 Step 7) and `restartCameraWithSelectedDevice` (Task 2 Step 9) ✅
  - `showScanHint()` / `hideScanHint()` called from `toggleCamera` and `resetCameraButton` ✅

- **No placeholders:** All code blocks are complete and runnable. ✅
