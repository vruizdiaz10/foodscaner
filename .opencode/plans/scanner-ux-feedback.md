# Plan: UX Scanner — Semáforo de colores

## Objetivo
Feedback visual en tiempo real durante el escaneo de códigos de barras.

## Estados visuales

| Estado | Clase CSS | Color borde | Animación | Cuándo |
|---|---|---|---|---|
| Buscando | `.scanning` | Amarillo `var(--accent)` | Pulso suave 2s | Cámara activa, decodificando |
| Detectado | `.detecting` | Verde `var(--green)` | Flash 300ms → vuelve a amarillo | Código encontrado, validando |
| Fallido | `.failed` | Rojo `var(--chile)` | Flash 500ms → vuelve a amarillo | Validación fallida o error |
| Apagado | (ninguna) | Sin borde | — | Cámara detenida |

## Cambios en `styles.css`

### 1. Estados de scanner-view
```css
/* Buscando - amarillo pulsante */
.scanner-view.scanning {
  border: 2px solid var(--accent);
  box-shadow: 0 0 0 3px rgba(245,166,35,0.2);
  animation: scanPulse 2s ease-in-out infinite;
}

/* Detectado - verde flash */
.scanner-view.detecting {
  border: 2px solid var(--green);
  box-shadow: 0 0 0 3px var(--green-light);
  animation: flashGreen 0.3s ease-out;
}

/* Fallido - rojo flash */
.scanner-view.failed {
  border: 2px solid var(--chile);
  box-shadow: 0 0 0 3px rgba(239,68,68,0.2);
  animation: flashRed 0.5s ease-out;
}
```

### 2. Keyframes
```css
@keyframes scanPulse {
  0%, 100% { opacity: 0.7; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
  50% { opacity: 1; box-shadow: 0 0 0 5px rgba(245,166,35,0.3); }
}

@keyframes flashGreen {
  0% { border-color: var(--green); box-shadow: 0 0 0 4px var(--green-light); }
  100% { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,166,35,0.2); }
}

@keyframes flashRed {
  0% { border-color: var(--chile); box-shadow: 0 0 0 4px rgba(239,68,68,0.3); }
  100% { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,166,35,0.2); }
}
```

### 3. Scan-frame overlay sobre el video
```css
.scanner-view .scan-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
}

.scanner-view.active .scan-frame {
  opacity: 1;
}

/* Esquinas cambian con el estado */
.scanner-view.scanning .scan-frame::before,
.scanner-view.scanning .scan-frame::after,
.scanner-view.scanning .scan-frame span {
  border-color: rgba(245,166,35,0.7);
}

.scanner-view.detecting .scan-frame::before,
.scanner-view.detecting .scan-frame::after,
.scanner-view.detecting .scan-frame span {
  border-color: rgba(22,163,74,0.9);
}

.scanner-view.failed .scan-frame::before,
.scanner-view.failed .scan-frame::after,
.scanner-view.failed .scan-frame span {
  border-color: rgba(239,68,68,0.9);
}
```

## Cambios en `scan.html`

### 4. Scan-frame como hermano del video (overlay)
Mover el `<div class="scan-frame">` fuera de `.scanner-placeholder` y ponerlo como hijo directo de `#interactive-scanner`:
```html
<div id="interactive-scanner" class="scanner-view">
  <div class="scanner-placeholder">
    <!-- scan-frame QUITADO de aquí -->
    <p class="scan-title">La cámara no está activa</p>
    <p class="scan-help">Apunta al código de barras del producto</p>
  </div>
  <!-- scan-frame AHORA aquí, visible sobre el video -->
  <div class="scan-frame"><span></span><span></span></div>
</div>
```

## Cambios en `app.js`

### 5. Función `setScanState(state)`
```js
function setScanState(state) {
  scannerView.classList.remove('scanning', 'detecting', 'failed');
  if (state) scannerView.classList.add(state);
}
```

### 6. Integración en tick()
- Al inicio de `tick()`: `setScanState('scanning')` (se resetea cada frame)
- En `.then(code => ...)`: `setScanState('detecting')`
- En `.catch()`: solo si hubo detección previa → `setScanState('failed')`
- Timeout 15s: ya no necesita cambio de clase (el texto cambia)

### 7. En `stopScanningNative()`:
```js
setScanState(null);  // quitar todas las clases de estado
```

## Archivos a modificar
- `styles.css` — keyframes + clases de estado + scan-frame overlay
- `scan.html` — reubicar scan-frame
- `app.js` — función setScanState + llamadas

## Verificación
1. `npm test` — 61 tests
2. `node -c app.js` — syntax check
3. Deploy a Vercel
4. Probar visualmente: amarillo pulsante → verde flash al detectar → rojo si falla
