import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { gunUpsert, gunleriOku, durumOku, durumYaz } from '../src/db.js';

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

test('testD1 bind undefined değeri reddeder', async () => {
  await assert.rejects(db.prepare('SELECT ?').bind(undefined).first(), /undefined/);
});
