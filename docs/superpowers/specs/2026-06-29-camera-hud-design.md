# Camera HUD — Diseño de controles de escáner

## Objetivo

Rediseñar los controles de la cámara (linterna, zoom, selector de cámara) para que aparezcan superpuestos sobre el viewfinder, al estilo de las apps de cámara nativas de iOS y Android, en lugar de apilados verticalmente debajo del video.

## Contexto

### Estado actual

Los controles secundarios (`#btn-torch`, `#zoom-wrapper`, `#camera-select-wrapper`) se muestran en `.scanner-controls`, un flex-column debajo del `.scanner-view`. Aparecen uno a uno a medida que el hardware los soporta, lo que resulta en un layout fragmentado que consume espacio vertical innecesario.

### Restricciones

- Vanilla JS + HTML + CSS sin frameworks.
- Los controles solo existen cuando la cámara está activa (`setupScanControls` / `teardownScanControls`).
- El `<select id="camera-select">` se mantiene como fuente de verdad de cámaras disponibles (JS ya lo popula); el HUD lo consume internamente.
- La linterna y el zoom solo se muestran si `track.getCapabilities()` reporta soporte de hardware.
- El botón "Activar cámara" (`#btn-toggle-camera`) permanece fuera del viewfinder — es la CTA primaria y existe antes de que haya video.

---

## Arquitectura

### HTML

Se añade un `<div class="camera-hud" id="camera-hud">` **dentro** de `.scanner-view`, entre `.scanner-placeholder` y `.scan-frame`. Está oculto por defecto (`hidden`).

```html
<div id="interactive-scanner" class="scanner-view">
  <div class="scanner-placeholder">...</div>

  <!-- HUD: overlay sobre el video, visible solo con cámara activa -->
  <div class="camera-hud hidden" id="camera-hud">
    <button id="btn-torch" class="hud-btn hud-torch hidden" aria-label="Linterna">
      <!-- SVG linterna -->
    </button>

    <div class="zoom-levels hidden" id="zoom-wrapper">
      <!-- Botones generados por JS según caps.zoom.max -->
    </div>

    <button class="hud-btn hud-switch" id="btn-camera-switch" aria-label="Cambiar cámara">
      <!-- SVG flip/cámara -->
    </button>
  </div>

  <div class="scan-frame">...</div>
</div>
```

El `<div id="camera-select-wrapper">` y el `<select id="camera-select">` se mueven fuera del flujo visible (o se mantienen ocultos permanentemente con `display:none`). El select sigue siendo populado por JS y el HUD lo lee.

### Layout del HUD

```
┌─────────────────────────────────┐
│                                 │
│         [ viewfinder ]          │
│          [ scan-frame ]         │
│                                 │
│ ┌─────────────────────────────┐ │
│ │  [🔦]   [1×][2×][3×]  [🔄]│ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
      [ Activar cámara ]
```

- Posición: `position: absolute; bottom: 0; left: 0; right: 0`
- Fondo: `linear-gradient(to top, rgba(0,0,0,0.55), transparent)` + `backdrop-filter: blur(6px)`
- Flex row, `justify-content: space-between`, `align-items: center`
- Padding: `12px 16px`

---

## Componentes

### Botón circular (`.hud-btn`)

Aplica a linterna y al botón de cambio de cámara.

- Tamaño: 40×40 px, `border-radius: 50%`
- Fondo: `rgba(255,255,255,0.15)`
- Borde: `1.5px solid rgba(255,255,255,0.3)`
- Ícono SVG blanco, 20×20 px
- `cursor: pointer`, sin `outline` visible (se añade `:focus-visible`)

**Estado activo (linterna encendida):**
- Fondo: `var(--green)` sólido
- Borde: `var(--green)`

### Pastilla de zoom (`.zoom-levels` + `.zoom-btn`)

`.zoom-levels`: contenedor pill oscuro semitransparente.
- `display: flex; gap: 2px`
- Fondo: `rgba(0,0,0,0.35)`
- `border-radius: 20px; padding: 3px`

`.zoom-btn`: cada nivel de zoom.
- Padding: `4px 10px`
- `border-radius: 16px`
- Fuente: `0.75rem`, `font-weight: 700` (usa `var(--font-mono)`)
- Color: `rgba(255,255,255,0.65)` por defecto
- Sin borde ni fondo en estado inactivo

`.zoom-btn.active`:
- Fondo: `rgba(255,255,255,0.92)`
- Color: `#000`

### Popover de cámaras (desktop) — generado por JS

Div creado dinámicamente al hacer clic en `#btn-camera-switch` en desktop. No existe en el HTML base.

```
┌─────────────────────────┐
│ ✓  Cámara integrada FHD │   ← opción activa, checkmark verde
│    Logitech C920        │
│    OBS Virtual Camera   │
└─────────────────────────┘
```

- `position: absolute; bottom: 56px; right: 0`
- `min-width: 200px`
- Fondo: `var(--card)`, borde `var(--border)`, `border-radius: var(--radius-sm)`
- `box-shadow: var(--shadow-hover)`
- Cada opción: botón full-width, padding `10px 14px`, texto `0.875rem`
- Opción activa: checkmark `var(--green)` a la izquierda, texto `font-weight: 600`
- Cierre: clic en opción, clic fuera (`document` click-listener de un solo uso), tecla Escape

---

## Comportamiento

### Detección móvil vs. desktop

```js
const isTouchDevice = navigator.maxTouchPoints > 1;
```

- `true` → botón `#btn-camera-switch` cicla directamente por las opciones del `#camera-select`
- `false` → botón abre el popover de cámaras

### `setupScanControls(track, caps)`

Reemplaza la lógica actual de mostrar torch y zoom slider por separado:

1. Mostrar `#camera-hud` (quitar clase `hidden`)
2. Si `caps.torch`: mostrar `#btn-torch`, configurar toggle
3. Si `caps.zoom`: calcular niveles disponibles, generar botones, mostrar `#zoom-wrapper`
4. Configurar `#btn-camera-switch` como flip o popover según `isTouchDevice`

### Niveles de zoom

```js
const MAX_LEVELS = [1, 2, 3];
const levels = MAX_LEVELS.filter(l => l <= (caps.zoom?.max ?? 0));
// Si levels.length < 2 → no mostrar zoom
```

Nivel inicial: `1`. Al cambiar de cámara: resetear a `1` y aplicar `track.applyConstraints({ advanced: [{ zoom: 1 }] })`.

Al tocar un botón de zoom:
```js
track.applyConstraints({ advanced: [{ zoom: value }] });
zoomBtns.forEach(b => b.classList.toggle('active', b.dataset.zoom == value));
```

### `teardownScanControls()`

1. Ocultar `#camera-hud`
2. Eliminar popover si existe
3. Limpiar botones de zoom generados dinámicamente de `#zoom-wrapper`
4. Remover event listeners del popover

### Popover — ciclo de vida

```
clic en #btn-camera-switch (desktop)
  → si ya existe popover: cerrarlo y salir
  → crear div.camera-popover, popularlo con opciones del #camera-select
  → appendChild al #camera-hud
  → requestAnimationFrame → document.addEventListener('click', closeOnOutside, { once: true })

clic en opción:
  → actualizar #camera-select.value
  → disparar 'change' event en #camera-select (reutiliza lógica existente de cambio de cámara)
  → cerrar popover

closeOnOutside(e):
  → si e.target no está dentro del popover → cerrar popover

tecla Escape:
  → cerrar popover (listener en document, removido al cerrar)
```

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `scan.html` | Añadir `#camera-hud` dentro de `.scanner-view`; mover/ocultar `#camera-select-wrapper` |
| `styles.css` | Añadir estilos de `.camera-hud`, `.hud-btn`, `.zoom-levels`, `.zoom-btn`, `.camera-popover`; eliminar estilos de `.scanner-controls` torch/zoom que quedan obsoletos |
| `app.js` | Reescribir `setupScanControls` y `teardownScanControls`; añadir lógica de popover y flip |

---

## Lo que NO cambia

- El flujo de detección de cámara y decodificación de barcode (`tick`, `startScanningNative`, etc.) no se toca.
- El botón "Activar cámara" (`#btn-toggle-camera`) no se mueve.
- La lógica de `#camera-select` como fuente de verdad de cámaras disponibles se reutiliza tal cual.
- Los estados visuales del viewfinder (scanning / detecting / failed) no cambian.
