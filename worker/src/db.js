// D1 veri katmanı: yalnızca D1 bağlama API'sini kullanır.
// Sütun adları yalnız bu sabitlerden SQL'e girer; çağıranın anahtarları asla.
const GUN_TAM = [
  'sleep_score', 'sleep_seconds', 'hrv_avg', 'resting_hr', 'stress_avg',
  'bb_high', 'bb_low', 'steps', 'intensity_minutes', 'calories',
  'sleep_deep_s', 'sleep_light_s', 'sleep_rem_s', 'sleep_awake_s', 'sleep_need_min', 'nap_seconds',
  'bb_charged', 'bb_drained', 'stress_rest_s', 'stress_low_s', 'stress_med_s', 'stress_high_s',
  'calories_active', 'hr_max',
  'sleep_stress_avg', 'spo2_avg', 'spo2_min', 'resp_avg', 'hrv_weekly_avg', 'floors', 'training_load',
  'hrv_status',
];
const GUN_ALANLARI = [...GUN_TAM, 'raw_json', 'synced_at'];

const AKT_OKUNUR = [
  'date', 'type', 'start_ts', 'duration_s', 'distance_m', 'avg_hr',
  'training_load', 'aerobic_te', 'anaerobic_te', 'calories', 'max_hr', 'total_sets', 'total_reps',
  'avg_cadence', 'avg_stride_m', 'avg_gct_ms', 'avg_power', 'hr_zones_json', 'sets_json',
];
const AKT_ALANLARI = [...AKT_OKUNUR, 'raw_json'];

// Eksik alan null sayılır; var olan dolu değer null ile ezilmez. Gerçek 0 yazılır.
async function upsert(db, tablo, anahtar, anahtarDeger, alanlar, kayit) {
  const sutunlar = [anahtar, ...alanlar];
  const guncelle = alanlar.map((c) => `${c} = COALESCE(excluded.${c}, ${tablo}.${c})`).join(', ');
  const sql = `INSERT INTO ${tablo} (${sutunlar.join(', ')}) VALUES (${sutunlar.map(() => '?').join(', ')}) ` +
    `ON CONFLICT(${anahtar}) DO UPDATE SET ${guncelle}`;
  await db.prepare(sql).bind(anahtarDeger, ...alanlar.map((c) => kayit[c] ?? null)).run();
}

export async function gunUpsert(db, satir) {
  if (typeof satir?.date !== 'string' || satir.date === '') throw new TypeError('gunUpsert: date boş olmayan metin olmalı');
  await upsert(db, 'daily', 'date', satir.date, GUN_ALANLARI, satir);
}

export async function aktiviteUpsert(db, a) {
  if (a?.id === null || a?.id === undefined || String(a.id) === '') throw new TypeError('aktiviteUpsert: id gerekli');
  await upsert(db, 'activities', 'id', String(a.id), AKT_ALANLARI, a);
}

export async function aktiviteleriOku(db, bas, son) {
  const sql = `SELECT id, ${AKT_OKUNUR.join(', ')} FROM activities WHERE date >= ? AND date <= ? ` +
    'ORDER BY start_ts IS NULL, start_ts ASC, id ASC';
  const { results } = await db.prepare(sql).bind(bas, son).all();
  return results;
}

export async function gunleriOku(db, bas, son) {
  const sql = `SELECT date, ${GUN_TAM.join(', ')}, synced_at FROM daily WHERE date >= ? AND date <= ? ORDER BY date ASC`;
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
