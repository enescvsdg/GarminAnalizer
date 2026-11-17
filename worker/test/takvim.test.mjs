import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takvimYaniti, okumaBasi } from '../src/stats/takvim.js';
import { apiYaniti } from '../src/stats/ozet.js';
import { OLCUMLER } from '../src/stats/baseline.js';
import { gunEkle } from '../src/zaman.js';

const BUGUN = '2026-11-12';
const KART_IDLERI = OLCUMLER.filter((o) => o.kart).map((o) => o.id);

// Deterministik sahte veri: bazı günler tamamen eksik, bazılarında yalnız birkaç alan var.
function sahte(n) {
  const satirlar = [];
  for (let i = n + 40; i >= 0; i -= 1) {
    const date = gunEkle(BUGUN, -i);
    if (i % 11 === 5) continue; // veri olmayan gün
    const s = { date };
    s.sleep_score = 60 + ((i * 7) % 35);
    s.bb_high = 50 + ((i * 5) % 45);
    s.hrv_avg = 40 + ((i * 3) % 25);
    s.resting_hr = 48 + ((i * 2) % 12);
    s.stress_avg = 20 + ((i * 13) % 30);
    s.training_load = i % 4 === 0 ? null : 20 + ((i * 17) % 200);
    if (i % 9 !== 0) s.sleep_deep_s = 3000 + i;
    satirlar.push(s);
  }
  return satirlar;
}

test('okumaBasi: ilk günün 28 günlük bandı için 28 gün öncesi', () => {
  assert.equal(okumaBasi('2026-11-12', 28), gunEkle('2026-11-12', -(27 + 28)));
});

test('her gün contract şeklinde; eskiden yeniye; aralıktaki her gün', () => {
  const y = takvimYaniti(sahte(60), BUGUN, 60);
  assert.equal(y.gunler.length, 60);
  assert.equal(y.gunler[0].tarih, gunEkle(BUGUN, -59));
  assert.equal(y.gunler[59].tarih, BUGUN);
  for (const g of y.gunler) {
    assert.deepEqual(Object.keys(g).sort(), ['e', 'hukum', 'kartlar', 'tarih']);
    assert.deepEqual(Object.keys(g.kartlar).sort(), [...KART_IDLERI].sort());
    for (const k of Object.values(g.kartlar)) {
      assert.deepEqual(Object.keys(k).sort(), ['durum', 'v']);
      assert.ok(k.v === null || Number.isFinite(k.v));
      assert.ok(k.durum === null || ['lo', 'ok', 'hi'].includes(k.durum));
      assert.equal(k.v === null, k.durum === null);
    }
    assert.ok(g.e === null || (g.e >= 0 && g.e <= 1));
    assert.equal(typeof g.hukum, 'string');
  }
});

test('apiYaniti ile aynı e, hüküm, değer ve durum (her günün kendi bandı)', () => {
  const satirlar = sahte(60);
  const t = takvimYaniti(satirlar, BUGUN, 60);
  const a = apiYaniti(satirlar, BUGUN, 60, null);
  assert.equal(a.gunler.length, t.gunler.length);
  for (let i = 0; i < 60; i += 1) {
    assert.equal(t.gunler[i].tarih, a.gunler[i].tarih);
    assert.equal(t.gunler[i].e, a.gunler[i].e, a.gunler[i].tarih);
    assert.equal(t.gunler[i].hukum, a.gunler[i].hukum, a.gunler[i].tarih);
    for (const id of KART_IDLERI) assert.equal(t.gunler[i].kartlar[id].v, a.gunler[i].d[id], `${a.gunler[i].tarih} ${id}`);
  }
});

test('durum: bandın dışı lo/hi, içi ok (yalnız bu gün için bant kontrolü)', () => {
  // 28 gün sabit uyku 80 → sigma = tabanSigma 4; son gün uyku 40 → lo; 120 → hi
  const satirlar = [];
  for (let i = 40; i >= 1; i -= 1) {
    satirlar.push({ date: gunEkle(BUGUN, -i), sleep_score: 80, bb_high: 70, hrv_avg: 55, resting_hr: 52, stress_avg: 30, training_load: 80 });
  }
  satirlar.push({ date: BUGUN, sleep_score: 40, bb_high: 70, hrv_avg: 55, resting_hr: 52, stress_avg: 30 });
  const g = takvimYaniti(satirlar, BUGUN, 28).gunler.at(-1);
  assert.equal(g.kartlar.uyku.durum, 'lo');
  assert.equal(g.kartlar.bb.durum, 'ok');
  assert.equal(g.kartlar.yuk.v, 80); // dünkü yük
  assert.equal(g.kartlar.yuk.durum, 'ok');
  const yuksek = takvimYaniti([...satirlar.slice(0, -1), { ...satirlar.at(-1), sleep_score: 120 }], BUGUN, 28).gunler.at(-1);
  assert.equal(yuksek.kartlar.uyku.durum, 'hi');
});

test('veri yoksa her gün e null, hüküm şablon, kartlar null', () => {
  const y = takvimYaniti([], BUGUN, 28);
  assert.equal(y.gunler.length, 28);
  for (const g of y.gunler) {
    assert.equal(g.e, null);
    assert.equal(g.hukum, 'Bugün için yeterli veri yok.');
    for (const k of Object.values(g.kartlar)) assert.deepEqual(k, { v: null, durum: null });
  }
});

test('yalnız kart: true ölçümler; derin/spo2/solunum yok', () => {
  const g = takvimYaniti(sahte(30), BUGUN, 28).gunler[0];
  for (const id of ['derin', 'spo2', 'solunum']) assert.equal(g.kartlar[id], undefined);
});

test('400 gün: tamamlanır, her gün şekilli, yanıt < 200 KB, JSON gidiş-dönüşü eşit', () => {
  const satirlar = sahte(400);
  const t0 = performance.now();
  const y = takvimYaniti(satirlar, BUGUN, 400);
  const ms = performance.now() - t0;
  assert.equal(y.gunler.length, 400);
  const tarihler = new Set(y.gunler.map((g) => g.tarih));
  assert.equal(tarihler.size, 400);
  for (let i = 1; i < 400; i += 1) assert.ok(y.gunler[i - 1].tarih < y.gunler[i].tarih);
  for (const g of y.gunler) {
    assert.equal(Object.keys(g.kartlar).length, KART_IDLERI.length);
    assert.equal(typeof g.hukum, 'string');
  }
  const govde = JSON.stringify(y);
  assert.ok(govde.length < 200 * 1024, `boyut ${govde.length}`);
  assert.deepEqual(JSON.parse(govde), y);
  assert.ok(ms < 2000, `çok yavaş: ${ms} ms`); // doğrusal hesap; ikinci dereceden olsaydı bu sınır aşılırdı
});

test('uzun veri doğrusal: 400 gün 100 günün birkaç katından fazla sürmez', () => {
  const kisa = sahte(100);
  const uzun = sahte(400);
  takvimYaniti(kisa, BUGUN, 100); // ısınma
  const zaman = (f) => { const t = performance.now(); f(); return performance.now() - t; };
  const a = Math.max(zaman(() => takvimYaniti(kisa, BUGUN, 100)), 1);
  const b = zaman(() => takvimYaniti(uzun, BUGUN, 400));
  assert.ok(b < a * 12, `100g ${a} ms, 400g ${b} ms`); // doğrusal ~4x; ikinci dereceden ~16x
});
