# Barcode Scanner Improvement — Design Spec
**Date:** 2026-06-25
**Branch:** figma-redesign

## Problem

Baby boomers on iPhone report two issues:
1. Scanner takes too long to detect a barcode.
2. Partial/truncated barcodes (e.g. `75002275`) reach the backend and return no results — confirmed in API logs.

Root causes:
- `html5-qrcode` fires `onScanSuccess` with partial reads before a full barcode is confirmed.
- The current `qrbox` aspect ratio (7:4) is not optimal for wide 1D barcodes (EAN-13, UPC-A).
- No checksum validation before calling `analyzeBarcode`.
- On older iPhones with `html5-qrcode` (a JS-based decoder), detection is noticeably slower than native alternatives.

## Solution Overview

Three layers:

| Layer | What it does |
|---|---|
| Detection | `BarcodeDetector` native API (iOS 17+, Chrome, Edge) as primary; `html5-qrcode` (tuned) as fallback |
| Validation | EAN checksum verification before `analyzeBarcode`; partial reads silently discarded |
| UX | Coaching hint + activity indicator during scan |

Only `app.js` is modified. No HTML or CSS changes required.

## Layer 1 — Detection

### Feature detection

```js
const useNativeDetector = 'BarcodeDetector' in window;
```

`startScanning` branches based on this flag. Both paths call `onBarcodeDetected(rawCode)`.

### BarcodeDetector path (iOS 17+, Chrome, Edge)

- Request `getUserMedia({ video: { facingMode: 'environment' } })`.
- Create a `<video>` element, assign the stream, and append to `#interactive-scanner`.
- Instantiate `new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'upc_e', 'ean_8'] })`.
- Run a `requestAnimationFrame` loop: `detector.detect(video)` → take first result → pass to `onBarcodeDetected`.
- `stopScanning`: cancel the rAF loop, stop all stream tracks, remove the video element.

### html5-qrcode path (fallback)

Current implementation with two tuning changes:
- `fps: 20` (up from 15) — faster polling.
- `qrbox: { width: minDim * 0.85, height: minDim * 0.30 }` — wider, shorter box better suited for linear 1D barcodes.

### Shared handler

```
onBarcodeDetected(rawCode)
  → validateBarcode(rawCode)   // Layer 2
  → if valid: beep + stopScanning + analyzeBarcode(code)
  → if invalid: silent discard, continue scanning
```

## Layer 2 — Validation

`validateBarcode(raw)` returns `{ valid: boolean, code: string }`.

### Steps

1. **Normalize**: strip whitespace and dashes, assert all remaining chars are digits.
2. **Length filter**: accept only 8, 12, or 13 digits. All other lengths are partial reads → invalid.
3. **Checksum by length**:

**8 digits — try EAN-8 first, then UPC-E expansion:**

- EAN-8 check: standard EAN algorithm on 8 digits. If passes → `{ valid: true, code: raw }`.
- UPC-E expansion: UPC-E always starts with `0`. If first digit is `0`, expand compressed 6-digit payload to 12-digit UPC-A using the standard UPC-E expansion algorithm (based on digit 7). Validate the expanded 12-digit code as UPC-A. If passes → `{ valid: true, code: expandedUpcA }`.
- If neither passes → `{ valid: false }`.

**12 digits — UPC-A:**
- EAN checksum algorithm on 12 digits.

**13 digits — EAN-13:**
- EAN checksum algorithm on 13 digits.

### EAN checksum algorithm (shared by EAN-8, UPC-A, EAN-13)

The GS1 standard assigns weight 3 to odd positions counted from the right, weight 1 to even positions. A single formula covers all lengths:

```
n = total code length (including check digit: 8, 12, or 13)
sum = 0
for i from 0 to n-2:
  digit = code[i]
  weight = ((n - 1 - i) % 2 === 0) ? 1 : 3
  sum += digit * weight
checkDigit = (10 - (sum % 10)) % 10
return checkDigit === parseInt(code[n-1])
```

This correctly handles all three formats without a `startWeight` parameter:
- EAN-13 (n=13): index 0 gets weight 1, index 1 gets weight 3, …
- UPC-A  (n=12): index 0 gets weight 3, index 1 gets weight 1, …
- EAN-8  (n=8):  index 0 gets weight 3, index 1 gets weight 1, …

### UPC-E expansion algorithm

UPC-E (8 digits: `0` + 6 compressed + check digit) expands to UPC-A (12 digits) based on digit 6 (0-indexed position 6, the last compressed digit):

| Digit 6 | Expansion rule |
|---|---|
| 0,1,2 | mfr[0..1] + digit6 + `00000` + item[2..4] |
| 3 | mfr[0..2] + `00000` + item[3..4] |
| 4 | mfr[0..3] + `00000` + item[4] |
| 5-9 | mfr[0..4] + `0000` + digit6 |

Where `mfr` = digits 1–5, `item` = digits 1–5 reinterpreted per rule. After expansion, validate the 12-digit UPC-A checksum.

## Layer 3 — UX

Two additions to the scanner active state:

**Coaching hint (permanent while scanning):**
Below the viewfinder, static text:
> "Centra el código y mueve el teléfono despacio de lado a lado"

Rendered via existing `.scan-help` element (already in DOM, currently shows "Apunta al código de barras del producto"). Text is swapped on camera activation and restored on stop.

**Activity indicator (after 3s without detection):**
A `setTimeout` of 3000ms starts when scanning begins. If no barcode detected by then, the `.scan-title` text changes to a pulsing "Buscando código..." (CSS `@keyframes` pulse on opacity already exists in `styles.css` or added inline). Reset on each successful detection attempt (valid or not).

## Files Changed

| File | Change |
|---|---|
| `app.js` | Detection layer, validation layer, UX hint. Bump version suffix. |

## Success Criteria

1. Truncated barcodes (wrong checksum) no longer reach the backend.
2. On iOS 17+, camera activates and detects an EAN-13 barcode noticeably faster than before.
3. UPC-E barcodes (US imports) are expanded to UPC-A and looked up correctly.
4. On iOS < 17 / Firefox, behavior is identical to today (html5-qrcode fallback) but with better qrbox tuning.
5. The coaching hint and activity indicator are visible during an active scan session.
