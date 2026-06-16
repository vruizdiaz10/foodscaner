require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { Firestore } = require('@google-cloud/firestore');

const KEY = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!KEY) { console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set'); process.exit(1); }

const serviceAccount = JSON.parse(KEY);
const db = new Firestore({
  projectId: serviceAccount.project_id,
  credentials: { client_email: serviceAccount.client_email, private_key: serviceAccount.private_key }
});
const CACHE_COL = db.collection('product_cache');
const AI_CACHE_COL = db.collection('ai_cache');

async function migrate() {
  const cachePath = '/tmp/foodscaner_cache.json';
  const aiCachePath = '/tmp/foodscaner_ai_cache.json';
  let total = 0;

  if (fs.existsSync(cachePath)) {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const entries = Object.entries(data);
    for (const [barcode, entry] of entries) {
      await CACHE_COL.doc(barcode).set(entry);
      total++;
      if (total % 10 === 0) console.log(`Migrated ${total} product cache entries...`);
    }
    console.log(`Migrated ${entries.length} product cache entries.`);
  }

  if (fs.existsSync(aiCachePath)) {
    const data = JSON.parse(fs.readFileSync(aiCachePath, 'utf8'));
    const entries = Object.entries(data);
    for (const [key, entry] of entries) {
      await AI_CACHE_COL.doc(key).set(entry);
      total++;
    }
    console.log(`Migrated ${entries.length} AI cache entries.`);
  }

  console.log(`Done. Total: ${total} entries migrated.`);
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
