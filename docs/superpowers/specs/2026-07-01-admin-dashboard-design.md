# Rediseño del panel de administración: layout dashboard + métricas + logs enriquecidos

**Fecha:** 2026-07-01
**Estado:** Aprobado por usuario (sesión brainstorming)

## Objetivo

El panel admin actual (`admin/index.html` + `admin/admin.js`) es elemental: tabs planos, tabla de logs sin contexto, sin métricas. Este rediseño lo convierte en un dashboard con visión general, tabla de logs con más información por fila, y estructura visual de app admin.

## Alcance

1. Layout dashboard con sidebar de navegación.
2. Nueva sección "Resumen" con métricas agregadas.
3. Tabla de logs mejorada: nombre de producto, fila expandible, columna fuente.
4. Backend: endpoint `/api/admin/stats`, campo `_source` en scan_logs, enriquecimiento de logs con nombres.

**Fuera de alcance (YAGNI):** filtros por rango de fecha, export CSV, TTL/limpieza de logs, auto-refresh, agrupación de escaneos repetidos, frameworks o librerías nuevas.

## 1. Layout dashboard

```
┌────────────┬──────────────────────────────┐
│  YOMI      │  Header: título sección + 🚪 │
│  ADMIN     ├──────────────────────────────┤
│            │                              │
│ 📊 Resumen │   Zona de contenido          │
│ 📋 Logs    │   (métricas / tabla / cache) │
│ 🚩 Reportes│                              │
│ 📷 OCR     │                              │
│ 📊 Nutric. │                              │
│ 💾 Cache   │                              │
└────────────┴──────────────────────────────┘
```

- Sidebar fija izquierda (~200 px), estética Yomi actual (variables `--paper`/`--ink`, bordes 2 px, fuente mono). Ítem activo con fondo invertido (ink sobre paper).
- Cada ítem de navegación muestra conteo de documentos (ej. "Logs · 324") alimentado por `stats.counts`. Sin conteo disponible → solo etiqueta.
- Secciones: Resumen (nueva, página de inicio tras login), Logs (`scan_logs`), Reportes, OCR (`products_ocr`), Nutrición (`products_nutrition`), Cache.
- Móvil (`max-width` breakpoint existente): sidebar colapsa a barra horizontal scrolleable arriba, mismo patrón visual que los tabs actuales. Sin menú hamburguesa.
- Se mantiene: un solo `index.html` + `admin.js` vanilla. Navegación muestra/oculta secciones. Sin router.

## 2. Sección "Resumen"

Consume `GET /api/admin/stats`. Contenido de arriba hacia abajo:

**Fila de stat cards (5):** Total escaneos · Hoy · Productos únicos · % No encontrados · % Con OCR.

**Gráfica "Escaneos por día" (últimos 30 días):** barras CSS puras (divs con altura proporcional). `title`/hover muestra fecha + conteo. Días sin datos = barra cero. Sin librería de charts.

**Dos columnas:**
- **Top 10 productos:** barcode (link a `scan.html?barcode=`) + nombre de producto + conteo.
- **Desglose:** dos mini-tablas — País y Sistema operativo — con conteo y barra proporcional inline.

## 3. Tabla de logs mejorada

Columnas: Fecha/Hora · Código + Nombre producto · Ubicación · Sistema · Confianza · Fuente · ✕

- **Nombre de producto:** viene enriquecido del endpoint de logs (campo `productName`); si no se resuelve, solo se muestra el código.
- **Fila expandible:** click en la fila inserta un `<tr>` de detalle debajo con: IP, UA completo, notas de confianza, flags (badges actuales), fuente, ID del doc. Reemplaza el modal para logs (el modal sigue para otras colecciones).
- **Columna Fuente:** `cache` / `ia` / `db`; logs con flag `notFound` muestran ese estado. Logs antiguos sin campo → "—".
- **Columna IP se elimina de la tabla** y pasa al detalle expandible.
- Badges actuales (No encontrado, OCR ingredientes, OCR nutrición, Reporte) se conservan junto al código.

## 4. Backend

### 4.1 `GET /api/admin/stats`

- Auth: mismo header `x-admin-token` que el resto de rutas admin.
- Pagina la colección completa `scan_logs` en loop con `fireListDocs`; igualmente cuenta documentos de `reports`, `products_ocr`, `products_nutrition` y entradas de cache.
- **Agregación como función pura** `computeStats(items)` exportada para test. Calcula: total, hoy (día calendario en `America/Mexico_City`, igual que la serie `byDay`), productos únicos, % notFound, % con OCR, serie `byDay` (30 días), `topProducts` (10, con nombre vía índice de nombres), `byCountry`, `byOS`.
- **Cache en memoria a nivel módulo** `{ data, ts }` con TTL 5 min. `?fresh=1` fuerza recomputar.

Respuesta:

```json
{
  "total": 324, "today": 12, "uniqueProducts": 87,
  "notFoundPct": 9, "ocrPct": 34,
  "byDay": [{ "date": "2026-06-02", "count": 5 }],
  "topProducts": [{ "barcode": "750...", "name": "Bimbo Cero", "count": 21 }],
  "byCountry": [{ "key": "MX", "count": 300 }],
  "byOS": [{ "key": "Android", "count": 200 }],
  "counts": { "scan_logs": 324, "reports": 5, "products_ocr": 40, "products_nutrition": 38, "cache": 92 }
}
```

### 4.2 Campo fuente en scan_logs

- Nueva función `fireMarkScanSource(id, source)` en `api/firestore.js`, mismo patrón fire-and-forget con `updateMask` que `fireMarkScanConfidence` (campo `_source`, stringValue).
- Se invoca en `api/index.js` en los tres puntos de resolución del escaneo: hit de cache (`'cache'`), respuesta IA (`'ia'`), fallback base de datos (`'db'`). `notFound` ya existe como flag separado y no cambia.
- `fireListDocs` expone `_source` como `data.source` (mismo patrón que `_confidence`).

### 4.3 Nombres de producto en logs

- El endpoint `GET /api/admin/scan_logs` enriquece cada item con `productName`, reutilizando el índice nombre↔barcode que ya construye el endpoint cache-all.
- Barcode sin entrada en el índice → sin `productName`, la UI muestra solo el código.

## Manejo de errores

- `stats` falla (Firestore caído, sin token) → 500; la sección Resumen muestra "Error al cargar." (patrón actual) y el sidebar omite los conteos. El resto del panel funciona normal.
- Enriquecimiento de nombres falla → los logs se devuelven sin `productName`; no bloquea la lista.

## Verificación

- **Test vitest** para `computeStats`: agregación por día, top productos, porcentajes, colección vacía.
- UI verificada manualmente con Playwright (patrón habitual del proyecto): login, Resumen renderiza métricas, fila de log expande, sidebar navega.

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `admin/index.html` | Layout sidebar, sección Resumen, estilos nuevos |
| `admin/admin.js` | Navegación secciones, render Resumen, fila expandible, columna fuente/nombre |
| `api/index.js` | Ruta `/api/admin/stats`, llamadas `fireMarkScanSource`, enriquecimiento de logs |
| `api/firestore.js` | `fireMarkScanSource`, exponer `_source`, helper de paginación completa |
| `tests/` | Test de `computeStats` |
