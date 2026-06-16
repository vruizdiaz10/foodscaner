<div align="center">
  <h1>
    <span style="color: #10b981;">yo</span><span style="color: #f8fafc;">mi</span>
  </h1>
  <p><strong>¿Puedo comerlo? Escanea y lo sabes en segundos.</strong></p>
  <p>
    <a href="https://yomiscan.vercel.app" target="_blank">yomiscan.vercel.app</a>
  </p>
</div>

---

## ¿Qué es Yomi?

Yomi es un identificador nutricional de alimentos que escanea códigos de barras con tu cámara o los ingresa manualmente para obtener al instante:

- ✅ **Clasificación alimento / no-alimento** — detecta si es un producto comestible
- 🟠 **Sellos NOM-051 mexicanos** — exceso de calorías, azúcares, grasas saturadas y sodio
- 🌿 **Tipo de dieta** — 10 atributos (vegano, halal, orgánico, etc.) con fuente (BD vs IA)
- ⚠️ **Alérgenos** — grid de iconos detectado/trazas/libre + sección de trazas
- 🚫 **No recomendado para** — grupos de población con certeza (rojo) o inferido por IA (amarillo)
- 🔥 **Calorías** con barra de progreso y nivel de energía
- 🍬 **Azúcares** con nivel según umbrales UK NHS
- 🩺 **4 widgets de salud** — diabetes, hipertensión, colesterol, densidad calórica
- 🧠 **Análisis con IA** — cadena de 7 proveedores (Groq → OpenRouter → Gemini)
- ⚡ **Caché persistente** — L1 en `/tmp/` + L2 en Firestore

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML5, CSS3 (Glassmorphism), JavaScript vanilla |
| Escáner | [html5-qrcode](https://github.com/mebjas/html5-qrcode) |
| Backend | Node.js + Express (serverless en Vercel) |
| APIs externas | Open Food Facts, UPCItemDb, GTINHub, USDA FoodData Central |
| AI | Groq (5 modelos), OpenRouter, Gemini 2.5 Flash |
| Caché L1 | JSON en `/tmp/` (TTL: 1h OFF, 24h OFF stale, 7d fuentes no-OFF) |
| Caché L2 | Firestore (persistente entre instancias Vercel) |
| Despliegue | [Vercel](https://vercel.com) |

---

## Pipeline de búsqueda

```
Frontend → API (Express) → Caché L1 (/tmp/) → Caché L2 (Firestore)
  → OFF Mundial → OFF MX → USDA (por código)
  → UPCItemDb → GTINHub → Groq + USDA (último recurso)
```

## Pipeline de IA

Consulta secuencial de 7 proveedores (cada uno HTTP independiente desde el frontend):

1. Groq `llama-3.3-70b-versatile` (7s)
2. Groq `llama-3.1-8b-instant` (7s)
3. Groq `llama3-8b-8192` (7s)
4. Groq `gemma2-9b-it` (7s)
5. Groq `qwen-2.5-32b` (7s)
6. OpenRouter `openrouter/free` (12s)
7. Gemini 2.5 Flash (14s)

---

## Cache refresco

- Los datos cacheados muestran badge `📦 Caché` + botón `🔄 Actualizar`
- Al hacer clic, se elimina el caché (L1 + Firestore) y se re-consulta desde las fuentes originales
- `DELETE /api/cache/:barcode` — endpoint para borrado programático

---

## Ejecutar localmente

```bash
npm install
npm start
# Abre http://localhost:3000
```

## Variables de entorno

- `GROQ_API_KEY` — console.groq.com
- `USDA_API_KEY` — fdc.nal.usda.gov
- `OPENROUTER_API_KEY` — openrouter.ai
- `GEMINI_API_KEY` — aistudio.google.com
- `FIREBASE_SERVICE_ACCOUNT_KEY` — JSON completo del service account (Firestore)

## Despliegue

```bash
npx vercel --prod
```

---

## Tests

```bash
npm test        # 44 tests (11 backend + 33 frontend)
```

---

## Licencia

Datos nutricionales: [Open Food Facts](https://world.openfoodfacts.org/) (ODbL) · [UPCItemDb](https://www.upcitemdb.com/) · [GTINHub](https://www.gtinhub.com/) · [USDA FoodData Central](https://fdc.nal.usda.gov/) · [Groq](https://groq.com/)
