<div align="center">
  <h1>
    <span style="color: #10b981;">yo</span><span style="color: #f8fafc;">mi</span>
  </h1>
  <p><strong>¿Puedo comerlo? Escanea y lo sabes en segundos.</strong></p>
  <p>
    <a href="https://foodscaner.vercel.app" target="_blank">🌐 foodscaner.vercel.app</a>
  </p>
</div>

---

## ¿Qué es Yomi?

Yomi es un identificador nutricional de alimentos que te permite escanear códigos de barras con tu cámara o ingresarlos manualmente para obtener al instante:

- ✅ Si el producto es un **alimento** o no
- 🌾 **Gluten** — detecta presencia en ingredientes
- 🔥 **Calorías** por cada 100g con indicador visual
- ⚠️ **Alérgenos** — leche, cacahuates, soya, nueces, etc.
- 🅰️ **Nutri-Score** — calidad nutricional de la A a la E

## Arquitectura

```
                    ┌──────────────┐
                    │   Frontend   │
                    │  (index.html │
                    │   app.js     │
                    │   styles.css)│
                    └──────┬───────┘
                           │ fetch()
                    ┌──────▼───────┐
                    │  API Layer   │
                    │  (Express)   │
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────┐   ┌────────────┐   ┌──────────┐
    │  Local   │   │    Open    │   │   USDA   │
    │  JSON DB │   │ Food Facts │   │ FoodData │
    │          │   │ (World/MX) │   │ Central  │
    └──────────┘   └────────────┘   └──────────┘
```

### Pipeline de búsqueda

Cada código de barras se consulta en este orden hasta encontrar una coincidencia:

1. **Base de Datos Local** (`local_mexican_products.json`)
2. **Open Food Facts** (mundial) — `world.openfoodfacts.org`
3. **Open Food Facts** (MX) — `mx.openfoodfacts.org`
4. **USDA FoodData Central** — API gratuita del Departamento de Agricultura de EE.UU.
5. **UpcItemDb** — fallback global
6. **GTINHub** — fallback final

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML5, CSS3 (Glassmorphism), JavaScript vanilla |
| Escáner | [html5-qrcode](https://github.com/mebjas/html5-qrcode) |
| Backend | Node.js + Express |
| API externas | Open Food Facts, USDA FoodData Central, UpcItemDb, GTINHub |
| Base de datos | JSON local (productos mexicanos) |
| Despliegue | [Vercel](https://vercel.com) (serverless + static) |

## Ejecutar localmente

```bash
npm install
npm start
# Abre http://localhost:3000
```

## Despliegue

El proyecto está configurado para Vercel con `vercel.json`. Para desplegar:

```bash
vercel --prod
```

## Licencia

Datos nutricionales: [Open Food Facts](https://world.openfoodfacts.org/) (ODbL) · [USDA FoodData Central](https://fdc.nal.usda.gov/) (CC0 1.0)
