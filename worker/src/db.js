// D1 veri katmanı: yalnızca D1 bağlama API'sini kullanır.
const SAYISAL = [
  'sleep_score', 'sleep_seconds', 'hrv_avg', 'resting_hr', 'stress_avg',
  'bb_high', 'bb_low', 'steps', 'intensity_minutes', 'calories',
];
const GUN_ALANLARI = [...SAYISAL, 'raw_json', 'synced_at'];

// Eksik alan null sayılır; var olan dolu değer null ile ezilmez.
export async function gunUpsert(db, satir) {
  const sutunlar = ['date', ...GUN_ALANLARI];
  const guncelle = GUN_ALANLARI.map((c) => `${c} = COALESCE(excluded.${c}, daily.${c})`).join(', ');
  const sql = `INSERT INTO daily (${sutunlar.join(', ')}) VALUES (${sutunlar.map(() => '?').join(', ')}) ` +
    `ON CONFLICT(date) DO UPDATE SET ${guncelle}`;
  await db.prepare(sql).bind(...sutunlar.map((c) => satir[c] ?? null)).run();
}

export async function gunleriOku(db, bas, son) {
  const sql = `SELECT date, ${SAYISAL.join(', ')}, synced_at FROM daily WHERE date >= ? AND date <= ? ORDER BY date ASC`;
  const { results } = await db.prepare(sql).bind(bas, son).all();
  return results;
}

export async function durumOku(db, anahtar) {
  const r = await db.prepare('SELECT value FROM sync_state WHERE key = ?').bind(anahtar).first();
  return r ? JSON.parse(r.value) : null;
}

export async function durumYaz(db, anahtar, deger) {
  await db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(anahtar, JSON.stringify(deger)).run();
}
