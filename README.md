# 🍎 Yomi - Identificador Nutricional de Alimentos

**Yomi** es una aplicación web que identifica productos alimenticios por código de barras y proporciona análisis nutritivo, información de alérgenos, contenido de gluten y recomendaciones dietéticas mediante inteligencia artificial.

**URL:** https://www.yomi.mx

---

## 📋 Tabla de Contenidos

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Flujo de Búsqueda](#flujo-de-búsqueda)
- [Sistema de Caché](#sistema-de-caché)
- [Base de Datos](#base-de-datos)
- [OCR de Ingredientes](#ocr-de-ingredientes)
- [Modelos de IA](#modelos-de-ia)
- [Stack Tecnológico](#stack-tecnológico)

---

## ✨ Características

- 📱 **Escaneo de Códigos de Barras**: Captura mediante cámara web o entrada manual
- 🔍 **Búsqueda Multi-Fuente**: Integración con 6 bases de datos de productos
- 🧠 **Análisis con IA**: Procesamiento inteligente de datos nutricionales
- 📸 **OCR de Ingredientes**: Captura y análisis automático de listas de ingredientes
- ⚡ **Caché Inteligente**: L1 (memoria) y L2 (Firestore) para rendimiento óptimo
- 🌐 **Verificación Manual**: Base de datos de productos verificados sin expiración
- 🎨 **Interfaz Responsiva**: Diseño adaptable para móvil y desktop
- 📊 **Análisis Completo**: Calorías, alérgenos, gluten, nutriscore, dieta

---

## 🏗️ Arquitectura

```
Frontend (QR Scanner + Tesseract.js OCR)
           ↓ REST API
Backend (Express.js - Product Search, AI Analysis, Cache Management)
           ↓
APIs (OFF, USDA, GTINHub) + Firebase (Firestore) + AI (Groq/OpenRouter)
```

---

## 🔍 Flujo de Búsqueda

### Jerarquía de Fuentes (L0 → L3)

**L0: Base Verificada** (Permanente)
- `products-verified.json`
- Sin expiración
- Máxima prioridad

**L1: Caché en Memoria**
- Open Food Facts: 24h TTL
- Otros: 6h TTL
- Respuesta <10ms

**L2: Caché Firestore** (7 días)
- `products_cache_v2` collection
- Datos enriquecidos con IA
- Validación por OFF last_modified_t

**L3: APIs de Producto** (Fresh Fetch)
- Open Food Facts: 🌍 Mundial, 🇲🇽 México, 🇺🇸 USA
- USDA FoodData Central
- UpcItemDb + GTINHub

### Búsqueda Exhaustiva

Se intenta todas las fuentes antes de retornar, mostrando cobertura completa en `sourceResults`.

---

## 💾 Sistema de Caché

### Dos Capas

| Capa | Ubicación | TTL | Velocidad |
|------|-----------|-----|-----------|
| L1 | Memoria RAM | 6-24h | <10ms |
| L2 | Firestore | 7d | 100-500ms |

### Validación

- **Open Food Facts**: Compara `last_modified_t` con servidor
- **Otros**: Simple TTL
- **Stale-While-Revalidate**: Retorna caché antiguo mientras revalida

---

## 🗄️ Base de Datos (Firestore)

### Collections

| Collection | TTL | Propósito |
|-----------|-----|----------|
| `products_verified` | ∞ | Productos verificados manualmente |
| `products_cache_v2` | 7d | Cache enriquecido con IA |
| `ai_cache` | 24h | Resultados de análisis IA |
| `products_ocr` | ∞ | Ingredientes capturados por OCR |

### Estructura (products_verified)

```json
{
  "barcode": {
    "name": "Nombre",
    "brand": "Marca",
    "ingredients": "texto",
    "allergens": ["array"],
    "gluten": {"hasGluten": bool, "details": "info"},
    "calories": {"value": num, "level": "str", "percent": num},
    "verified": true,
    "source": "manual"
  }
}
```

---

## 📸 OCR de Ingredientes

### Flujo E2E

1. **Tesseract.js** → OCR de foto en navegador
2. **Queue + Groq** → 5 modelos en paralelo (2.5s delay entre llamadas)
3. **LLM** → Limpieza, corrección, normalización
4. **Firebase** → Guardado permanente en `products_ocr`
5. **Rescaneo** → Ingredientes aparecen automáticamente

### Rate Limiting

- Delay de **2.5 segundos** entre llamadas a Groq
- Evita error 429 (Too Many Requests)
- Procesa serialmente con queue

---

## 🤖 Modelos de IA

### Groq (Preferido)
- Velocidad: 1-3 segundos
- Modelos: llama-3.3-70b, llama-3.1-8b-instant, gemma-7b-it, mixtral-8x7b
- Costo: ~$0.59-0.79 / MTok

### OpenRouter (Fallback)
- Modelo: Free tier
- Sin rate limiting
- Si Groq falla

---

## 🛠️ Stack Tecnológico

**Frontend**: HTML5, CSS3, Vanilla JS  
**Libraries**: html5-qrcode (QR), Tesseract.js (OCR)  
**Backend**: Express.js, Node.js 24  
**Database**: Firebase Firestore  
**AI**: Groq API, OpenRouter  
**Hosting**: Vercel  

---

## 📦 Setup

```bash
git clone https://github.com/vruiz-wadil/foodscaner.git
cd foodscaner
npm install
cp .env.example .env  # Add credentials
npm run dev          # Local
vercel deploy --prod # Production
```

---

## 🔐 Environment Variables

```env
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...
GEMINI_API_KEY=AIza...
```

---

## 📊 Debugging

```bash
# Firebase credentials check
curl https://www.yomi.mx/api/debug/firebase

# OCR data in Firebase
curl https://www.yomi.mx/api/ocr/debug/7501011169630

# View logs
vercel logs https://foodscaner-xxx.vercel.app --level error
```

---

## 🤝 Contributing

1. Fork → Branch → Commit → Push → PR
2. Test locally before submitting
3. Follow existing code style

---

## 📝 License

MIT License

---

## 🔗 Links

- **Website**: https://www.yomi.mx
- **Email**: soporte@wadilworks.com
