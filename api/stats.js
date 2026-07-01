// Agregación pura de scan_logs para /api/admin/stats. Sin I/O: testeable.
const TZ = 'America/Mexico_City';
const DAY = 86400000;

// 'en-CA' da formato YYYY-MM-DD
const dayOf = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });

function computeStats(items, names = new Map(), now = Date.now()) {
  const total = items.length;
  const todayKey = dayOf(now);
  let today = 0, notFound = 0, ocr = 0;
  const perBarcode = new Map(), perDay = new Map(), perCountry = new Map(), perOS = new Map();

  for (const item of items) {
    const d = item && item.data;
    if (!d) continue;
    if (d.ts && dayOf(d.ts) === todayKey) today++;
    if (d.notFound) notFound++;
    if (d.hasOcr || d.hasNutritionOcr) ocr++;
    if (d.barcode) perBarcode.set(d.barcode, (perBarcode.get(d.barcode) || 0) + 1);
    if (d.ts) { const k = dayOf(d.ts); perDay.set(k, (perDay.get(k) || 0) + 1); }
    if (d.country) perCountry.set(d.country, (perCountry.get(d.country) || 0) + 1);
    if (d.os) perOS.set(d.os, (perOS.get(d.os) || 0) + 1);
  }

  const byDay = [];
  for (let i = 29; i >= 0; i--) {
    const date = dayOf(now - i * DAY);
    byDay.push({ date, count: perDay.get(date) || 0 });
  }

  const topProducts = [...perBarcode.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([barcode, count]) => ({ barcode, name: names.get(barcode) || '', count }));

  const ranked = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));

  return {
    total,
    today,
    uniqueProducts: perBarcode.size,
    notFoundPct: total ? Math.round(notFound / total * 100) : 0,
    ocrPct: total ? Math.round(ocr / total * 100) : 0,
    byDay,
    topProducts,
    byCountry: ranked(perCountry),
    byOS: ranked(perOS)
  };
}

module.exports = { computeStats };
