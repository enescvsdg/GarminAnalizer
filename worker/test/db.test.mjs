import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { gunUpsert, gunleriOku, durumOku, durumYaz, aktiviteUpsert, aktiviteleriOku } from '../src/db.js';

let db;
beforeEach(() => { db = testD1(); });

test('aynı gün iki kez yazılınca tek satır kalır', async () => {
  await gunUpsert(db, { date: '2026-11-12', steps: 1000 });
  await gunUpsert(db, { date: '2026-11-12', steps: 2000 });
  const satirlar = await gunleriOku(db, '2026-11-01', '2026-11-30');
  assert.equal(satirlar.length, 1);
  assert.equal(satirlar[0].steps, 2000);
});

test('upsert dolu değeri null ile ezmez', async () => {
  await gunUpsert(db, { date: '2026-11-12', sleep_score: 54, hrv_avg: 41 });
  await gunUpsert(db, { date: '2026-11-12', sleep_score: null, hrv_avg: 43 });
  const [s] = await gunleriOku(db, '2026-11-12', '2026-11-12');
  assert.equal(s.sleep_score, 54); assert.equal(s.hrv_avg, 43);
});

test('eksik alan null okunur, 0 değil', async () => {
  await gunUpsert(db, { date: '2026-11-12' });
  const [s] = await gunleriOku(db, '2026-11-12', '2026-11-12');
  assert.equal(s.steps, null);
  assert.equal(s.sleep_score, null);
  assert.equal(s.synced_at, null);
});

test('gunleriOku aralığı kapsar ve sıralar', async () => {
  for (const d of ['2026-11-12', '2026-11-10', '2026-11-14', '2026-11-11', '2026-11-09']) {
    await gunUpsert(db, { date: d, steps: 1, raw_json: '{"a":1}' });
  }
  const satirlar = await gunleriOku(db, '2026-11-10', '2026-11-12');
  assert.deepEqual(satirlar.map((s) => s.date), ['2026-11-10', '2026-11-11', '2026-11-12']);
  assert.equal('raw_json' in satirlar[0], false);
});

test('durumYaz/durumOku nesneyi korur; yoksa null', async () => {
  assert.equal(await durumOku(db, 'yok'), null);
  const deger = { son: '2026-11-12', n: 3, liste: [1, null] };
  await durumYaz(db, 'sync', deger);
  assert.deepEqual(await durumOku(db, 'sync'), deger);
  await durumYaz(db, 'sync', { son: 'x' });
  assert.deepEqual(await durumOku(db, 'sync'), { son: 'x' });
});

test('raw_json ve synced_at da null ile ezilmez', async () => {
  await gunUpsert(db, { date: '2026-11-12', raw_json: '{"a":1}', synced_at: 111 });
  await gunUpsert(db, { date: '2026-11-12', steps: 5 });
  const r = await db.prepare('SELECT raw_json, synced_at FROM daily WHERE date = ?').bind('2026-11-12').first();
  assert.equal(r.raw_json, '{"a":1}');
  assert.equal(r.synced_at, 111);
});

test('testD1 bind undefined değeri eşzamanlı reddeder', () => {
  assert.throws(() => db.prepare('SELECT ?').bind(undefined), /undefined/);
});

test('batch içinde başarısız ifade tüm batch\'i geri alır', async () => {
  const ekle = (d) => db.prepare('INSERT INTO daily (date) VALUES (?)').bind(d);
  await assert.rejects(db.batch([ekle('2026-11-01'), ekle('2026-11-02'), ekle('2026-11-01')]));
  const { results } = await db.prepare('SELECT date FROM daily').all();
  assert.equal(results.length, 0);
});

test('ek sütunlar yazılır ve okunur', async () => {
  await gunUpsert(db, {
    date: '2026-11-12', spo2_avg: 96.5, sleep_deep_s: 4200, hrv_status: 'BALANCED', training_load: 0,
    hr_max: 171, floors: 12.5, sleep_need_min: 480,
  });
  const [s] = await gunleriOku(db, '2026-11-12', '2026-11-12');
  assert.equal(s.spo2_avg, 96.5);
  assert.equal(s.sleep_deep_s, 4200);
  assert.equal(s.hrv_status, 'BALANCED');
  assert.equal(s.training_load, 0);
  assert.equal(s.hr_max, 171);
  assert.equal(s.floors, 12.5);
  assert.equal(s.sleep_need_min, 480);
  assert.equal(s.resp_avg, null);
  assert.equal(s.stress_high_s, null);
});

test('gerçek sıfır korunur ve sıfır dolu değeri ezer', async () => {
  await gunUpsert(db, { date: '2026-11-12', steps: 0 });
  let [s] = await gunleriOku(db, '2026-11-12', '2026-11-12');
  assert.equal(s.steps, 0);
  await gunUpsert(db, { date: '2026-11-13', steps: 5, training_load: 80 });
  await gunUpsert(db, { date: '2026-11-13', steps: 0, training_load: 0 });
  [s] = await gunleriOku(db, '2026-11-13', '2026-11-13');
  assert.equal(s.steps, 0);
  assert.equal(s.training_load, 0);
});

test('tarihsiz gunUpsert TypeError fırlatır ve satır eklemez', async () => {
  for (const kotu of [{}, { date: null }, { date: '' }, { date: 20261112 }]) {
    await assert.rejects(gunUpsert(db, { ...kotu, steps: 1 }), TypeError);
  }
  const { results } = await db.prepare('SELECT date FROM daily').all();
  assert.equal(results.length, 0);
});

test('aktiviteUpsert aynı id ile tek satır tutar, null ile ezmez', async () => {
  await aktiviteUpsert(db, { id: 123, date: '2026-11-12', type: 'running', start_ts: 10, avg_hr: 150, raw_json: '{"a":1}', hr_zones_json: '[1]' });
  await aktiviteUpsert(db, { id: '123', avg_hr: null, distance_m: 5000, training_load: 0, total_sets: 4 });
  const { results } = await db.prepare('SELECT * FROM activities').all();
  assert.equal(results.length, 1);
  const r = results[0];
  assert.equal(r.id, '123');
  assert.equal(r.type, 'running');
  assert.equal(r.avg_hr, 150);
  assert.equal(r.distance_m, 5000);
  assert.equal(r.training_load, 0);
  assert.equal(r.total_sets, 4);
  assert.equal(r.raw_json, '{"a":1}');
  assert.equal(r.hr_zones_json, '[1]');
  assert.equal(r.aerobic_te, null);
  await aktiviteUpsert(db, { id: 123, training_load: 3 });
  await aktiviteUpsert(db, { id: 123, training_load: 0 });
  const g = await db.prepare('SELECT training_load FROM activities WHERE id = ?').bind('123').first();
  assert.equal(g.training_load, 0);
});

test('aktiviteleriOku tarih aralığını kapsar, start_ts ile sıralar, raw_json döndürmez', async () => {
  await aktiviteUpsert(db, { id: 1, date: '2026-11-12', start_ts: 300, raw_json: '{}' });
  await aktiviteUpsert(db, { id: 2, date: '2026-11-10', start_ts: 100, sets_json: '[]' });
  await aktiviteUpsert(db, { id: 3, date: '2026-11-11', start_ts: null });
  await aktiviteUpsert(db, { id: 4, date: '2026-11-11', start_ts: 200 });
  await aktiviteUpsert(db, { id: 5, date: '2026-11-09', start_ts: 50 });
  await aktiviteUpsert(db, { id: 6, date: '2026-11-13', start_ts: 400 });
  const r = await aktiviteleriOku(db, '2026-11-10', '2026-11-12');
  assert.deepEqual(r.map((a) => a.id), ['2', '4', '1', '3']);
  assert.equal('raw_json' in r[0], false);
  assert.equal(r[0].sets_json, '[]');
});

test('kimliksiz aktiviteUpsert TypeError fırlatır', async () => {
  for (const kotu of [{}, { id: null }, { id: undefined }, { id: '' }]) {
    await assert.rejects(aktiviteUpsert(db, { ...kotu, date: '2026-11-12' }), TypeError);
  }
  const { results } = await db.prepare('SELECT id FROM activities').all();
  assert.equal(results.length, 0);
});

test('abonelikYaz: yazar, aynı uç noktada günceller, en çok 5 tutar (en eskiden siler)', async () => {
  const { abonelikYaz, abonelikleriOku, abonelikSil } = await import('../src/db.js');
  const { testD1 } = await import('./helpers/d1.mjs');
  const db = testD1();
  for (let i = 1; i <= 6; i += 1) await abonelikYaz(db, { endpoint: `https://e/${i}`, p256dh: `p${i}`, auth: `a${i}` }, i * 10);
  let liste = await abonelikleriOku(db);
  assert.deepEqual(liste.map((a) => a.endpoint), [2, 3, 4, 5, 6].map((i) => `https://e/${i}`));
  await abonelikYaz(db, { endpoint: 'https://e/2', p256dh: 'yeni', auth: 'yeni' }, 100);
  liste = await abonelikleriOku(db);
  assert.equal(liste.length, 5);
  assert.deepEqual(liste.at(-1), { endpoint: 'https://e/2', p256dh: 'yeni', auth: 'yeni', created_at: 100 });
  await abonelikSil(db, 'https://e/3');
  await abonelikSil(db, 'https://e/yok');
  assert.equal((await abonelikleriOku(db)).length, 4);
});
