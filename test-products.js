const TABLE_BASE_URL = 'https://yomiscan.vercel.app'; // Usa tu URL de producción
// const TABLE_BASE_URL = 'http://localhost:5002'; // O local para testing

// Productos con códigos reales de Open Food Facts
const MEXICAN_PRODUCTS = [
  { name: 'Fanta Orange', barcode: '5449000131805' },
  { name: 'Coca-Cola 330ml', barcode: '5000112606678' },
  { name: 'Sprite 355ml', barcode: '5449000145516' },
  { name: 'Doritos Nacho Cheese', barcode: '0028000048257' },
  { name: 'Lay\'s Classic', barcode: '0028000141049' },
  { name: 'Ramen Maruchan Chicken', barcode: '0070662100020' },
  { name: 'Oreo Cookies', barcode: '0044000050127' },
  { name: 'Cheez-It Crackers', barcode: '0016000273004' },
  { name: 'Tropicana Orange Juice', barcode: '0051000027100' },
  { name: 'Campbell Soup', barcode: '0051000004000' },
  { name: 'Heinz Ketchup', barcode: '0057000001016' },
  { name: 'Nestle Aero Chocolate', barcode: '0746395300047' },
  { name: 'M&M\'s Peanut', barcode: '0040000689999' },
  { name: 'Reese\'s Peanut Butter Cup', barcode: '0034000073305' },
  { name: 'Skittles Original', barcode: '0040000689975' },
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scanProduct(barcode) {
  try {
    const response = await fetch(`${TABLE_BASE_URL}/api/product/${barcode}`);
    const data = await response.json();
    return data;
  } catch (error) {
    return { error: error.message, status: 0 };
  }
}

async function runScan() {
  console.log(`\n🔍 Escaneando ${MEXICAN_PRODUCTS.length} productos mexicanos...\n`);

  const results = [];

  for (let i = 0; i < MEXICAN_PRODUCTS.length; i++) {
    const product = MEXICAN_PRODUCTS[i];
    console.log(`[${i + 1}/${MEXICAN_PRODUCTS.length}] Escaneando: ${product.name} (${product.barcode})...`);

    const scanResult = await scanProduct(product.barcode);

    // Determinar confianza basado en cantidad de datos disponibles
    let confidence = 'N/A';
    if (scanResult.status === 1) {
      const p = scanResult.product;
      const dataPoints = [
        p.nutrients || false,
        p.allergens || false,
        p.gluten?.hasGluten !== undefined,
        p.calories?.value > 0,
      ].filter(Boolean).length;

      if (dataPoints >= 3) confidence = 'Alta';
      else if (dataPoints >= 2) confidence = 'Media';
      else confidence = 'Baja';
    }

    // Contar fuentes buscadas
    const sourcesBuscadas = scanResult.sourceResults
      ? scanResult.sourceResults.map(r => `${r.source}${r.found ? ' ✓' : ''}`).join(' | ')
      : '—';

    results.push({
      index: i + 1,
      name: product.name,
      barcode: product.barcode,
      found: scanResult.status === 1,
      source: scanResult.sourceLabel || scanResult.source || '—',
      confidence: confidence,
      sourcesBuscadas: sourcesBuscadas,
      hasGluten: scanResult.product?.gluten?.hasGluten !== undefined ? (scanResult.product.gluten.hasGluten ? 'Sí' : 'No') : 'N/A',
      calories: scanResult.product?.calories?.value ? `${scanResult.product.calories.value} kcal` : '—',
      allergens: scanResult.product?.allergens?.length > 0 ? scanResult.product.allergens.join(', ') : '—',
    });

    // Delay entre escaneos (5 segundos para no saturar LLM)
    if (i < MEXICAN_PRODUCTS.length - 1) {
      await sleep(5000);
    }
  }

  return results;
}

async function main() {
  const startTime = Date.now();
  const results = await runScan();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n📊 RESULTADOS DEL ESCANEO\n');
  console.log('═'.repeat(150));

  // Tabla ASCII
  const headers = ['#', 'Producto', 'Código', 'Encontrado', 'Fuente Principal', 'Confianza', 'Fuentes Buscadas'];
  const colWidths = [3, 22, 13, 11, 25, 11, 50];

  // Encabezado
  console.log(
    headers
      .map((h, i) => h.padEnd(colWidths[i]))
      .join('│')
  );
  console.log('─'.repeat(160));

  // Filas
  results.forEach(row => {
    const values = [
      String(row.index).padEnd(colWidths[0]),
      row.name.substring(0, 21).padEnd(colWidths[1]),
      row.barcode.substring(0, 12).padEnd(colWidths[2]),
      (row.found ? '✓ Sí' : '✗ No').padEnd(colWidths[3]),
      row.source.substring(0, 24).padEnd(colWidths[4]),
      row.confidence.padEnd(colWidths[5]),
      row.sourcesBuscadas.substring(0, 49).padEnd(colWidths[6]),
    ];
    console.log(values.join('│'));
  });

  console.log('═'.repeat(150));

  // Estadísticas
  const found = results.filter(r => r.found).length;
  const notFound = results.filter(r => !r.found).length;
  const success = ((found / results.length) * 100).toFixed(1);

  console.log(`\n📈 ESTADÍSTICAS:`);
  console.log(`   Productos encontrados: ${found}/${results.length} (${success}%)`);
  console.log(`   Productos no encontrados: ${notFound}/${results.length}`);
  console.log(`   Tiempo total: ${duration}s`);
  console.log(`   Delay entre escaneos: 5s`);

  // Exportar JSON
  const fs = require('fs');
  fs.writeFileSync('scan-results.json', JSON.stringify(results, null, 2));
  console.log(`\n✅ Resultados guardados en: scan-results.json`);
}

main().catch(console.error);
