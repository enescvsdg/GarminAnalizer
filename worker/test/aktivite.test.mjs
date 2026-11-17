import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aktiviteBicimle, setleriCevir, bolgeleriCevir, haftaBasi, okumaBasi, aktiviteYaniti,
} from '../src/stats/aktivite.js';
import { gunEkle } from '../src/zaman.js';

const satir = (ek = {}) => ({
  id: '1', date: '2026-11-10', type: 'running', start_ts: Date.UTC(2026, 10, 10, 5, 0), duration_s: 1800,
  distance_m: 5000, avg_hr: 140, training_load: 100, aerobic_te: 3.1, anaerobic_te: 0.4, calories: 320, max_hr: 171,
  total_sets: null, total_reps: null, avg_cadence: 168, avg_stride_m: 1.05, avg_gct_ms: 250, avg_power: 210,
  hr_zones_json: '[60,300,900,500,40]', sets_json: null, ...ek,
});
const gecerliJson = (v) => JSON.parse(JSON.stringify(v));

test('aktiviteBicimle: alanlar contract adlarına eşlenir, raw_json yok', () => {
  const a = aktiviteBicimle({ ...satir(), raw_json: '{"gizli":1}' });
  assert.deepEqual(a, {
    id: '1', tarih: '2026-11-10', tur: 'running', baslangic: Date.UTC(2026, 10, 10, 5, 0), sure_s: 1800, mesafe_m: 5000,
    ort_nabiz: 140, max_nabiz: 171, yuk: 100, aerobik: 3.1, anaerobik: 0.4, kalori: 320, bolgeler: [60, 300, 900, 500, 40],
    kadans: 168, adim_boyu_m: 1.05, yer_temas_ms: 250, guc: 210, set: null, tekrar: null, setler: null,
  });
  assert.ok(!JSON.stringify(a).includes('raw_json'));
});

test('aktiviteBicimle: eksik değerler null, 0 uydurulmaz, NaN/undefined sızmaz', () => {
  const bos = satir({
    type: '', start_ts: undefined, duration_s: null, distance_m: NaN, avg_hr: undefined, training_load: Infinity,
    aerobic_te: 'x', anaerobic_te: null, calories: null, max_hr: null, avg_cadence: null, avg_stride_m: null,
    avg_gct_ms: null, avg_power: null, hr_zones_json: null, sets_json: null,
  });
  const a = aktiviteBicimle(bos);
  for (const k of ['tur', 'baslangic', 'sure_s', 'mesafe_m', 'ort_nabiz', 'yuk', 'aerobik', 'anaerobik', 'kalori', 'max_nabiz',
    'kadans', 'adim_boyu_m', 'yer_temas_ms', 'guc', 'bolgeler', 'set', 'tekrar', 'setler']) {
    assert.equal(a[k], null, k);
  }
  assert.deepEqual(gecerliJson(a), a);
});

test('gerçek 0 değeri korunur (null ile karışmaz)', () => {
  const a = aktiviteBicimle(satir({ distance_m: 0, anaerobic_te: 0 }));
  assert.equal(a.mesafe_m, 0);
  assert.equal(a.anaerobik, 0);
});

test('bolgeleriCevir: 5 sayılı dizi; bozuk, kısa ya da sayı olmayan null', () => {
  assert.deepEqual(bolgeleriCevir('[1,2,3,4,5]'), [1, 2, 3, 4, 5]);
  assert.deepEqual(bolgeleriCevir('[0,0,0,0,0]'), [0, 0, 0, 0, 0]);
  for (const kotu of [null, undefined, '', '{', '[1,2,3]', '[1,2,3,4,"x"]', '[1,2,3,4,null]', '{"a":1}', '5', '"x"', '[1,2,3,4,5,6]']) {
    assert.equal(bolgeleriCevir(kotu), null, String(kotu));
  }
});

test('setleriCevir: Garmin summarizedExerciseSets biçimi (kategori başına toplam)', () => {
  const garmin = JSON.stringify([
    { category: 'BENCH_PRESS', reps: 30, volume: 0, duration: 266330.39, sets: 3, maxWeight: 0 },
    { category: 'SQUAT', reps: 12, volume: 0, duration: 120000, sets: 2, maxWeight: 60000 },
  ]);
  const s = setleriCevir(garmin);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { tur: 'BENCH_PRESS', tekrar: 30, sure_s: 266, set: 3 });
  assert.deepEqual(s[1], { tur: 'SQUAT', tekrar: 12, agirlik_kg: 60, sure_s: 120, set: 2 });
  assert.deepEqual(gecerliJson(s), s);
});

test('setleriCevir: sade biçim (tur/tekrar/agirlik_kg/sure_s) korunur', () => {
  const s = setleriCevir(JSON.stringify([{ tur: 'curl', tekrar: 10, agirlik_kg: 12.5, sure_s: 40 }]));
  assert.deepEqual(s, [{ tur: 'curl', tekrar: 10, agirlik_kg: 12.5, sure_s: 40 }]);
});

test('setleriCevir: bozuk JSON, dizi olmayan, boş ya da tanınmayan biçim null', () => {
  for (const kotu of [null, undefined, '', '{bozuk', '{"a":1}', '[]', '[1,2,3]', '[null]', '[{}]', '[{"x":"y"}]', '"metin"', 'null']) {
    assert.equal(setleriCevir(kotu), null, String(kotu));
  }
});

test('setleriCevir: tanınmayan girdiler atlanır, geçerli olanlar kalır; sayı olmayan alan düşer', () => {
  const s = setleriCevir(JSON.stringify([null, 5, { category: 'ROW', reps: 'x', sets: 2, duration: NaN }, { reps: 8 }]));
  assert.deepEqual(s, [{ tur: 'ROW', set: 2 }, { tekrar: 8 }]);
});

test('aktiviteBicimle: set/tekrar ve setler dolar', () => {
  const a = aktiviteBicimle(satir({
    type: 'strength_training', total_sets: 24, total_reps: 380, hr_zones_json: null,
    sets_json: JSON.stringify([{ category: 'SQUAT', reps: 12, duration: 60000, sets: 2, maxWeight: 0 }]),
  }));
  assert.equal(a.set, 24);
  assert.equal(a.tekrar, 380);
  assert.equal(a.setler.length, 1);
});

test('haftaBasi: Pazartesi başlangıçlı', () => {
  assert.equal(haftaBasi('2026-11-09'), '2026-11-09'); // Pazartesi
  assert.equal(haftaBasi('2026-11-12'), '2026-11-09');
  assert.equal(haftaBasi('2026-11-15'), '2026-11-09'); // Pazar
  assert.equal(haftaBasi('2026-11-16'), '2026-11-16');
  assert.equal(haftaBasi('2026-01-01'), '2025-12-29');
});

test('okumaBasi: aralık başı haftasından ve 12 tamamlanmış haftadan eskisini kapsar', () => {
  assert.equal(okumaBasi('2026-11-12', 7), '2026-08-17'); // bu hafta 11-09, 12 hafta önce 08-17
  assert.equal(okumaBasi('2026-11-12', 400), haftaBasi(gunEkle('2026-11-12', -399)));
});

const BUGUN = '2026-11-12'; // Perşembe, hafta 11-09

test('aktiviteYaniti: yeniden eskiye sıralı, aralık dışı aktivite listede yok ama hafta toplamında', () => {
  const satirlar = [
    satir({ id: 'a', date: '2026-10-01', start_ts: 1 }),
    satir({ id: 'b', date: '2026-11-10', start_ts: 5 }),
    satir({ id: 'c', date: '2026-11-10', start_ts: 9 }),
    satir({ id: 'd', date: '2026-11-11', start_ts: null }),
  ];
  const y = aktiviteYaniti(satirlar, BUGUN, 7);
  assert.deepEqual(y.aktiviteler.map((a) => a.id), ['d', 'c', 'b']);
  assert.equal(y.haftalar[0].bas, '2026-11-09');
  assert.equal(y.haftalar[0].adet, 3);
  assert.equal(y.yukBant, null);
});

test('haftalar: aktivitesiz hafta adet 0, yuk null, sure_s 0; yeniden eskiye', () => {
  const satirlar = [
    satir({ id: 'a', date: '2026-11-10', training_load: 100, duration_s: 600 }),
    satir({ id: 'b', date: '2026-11-11', training_load: null, duration_s: 900 }),
    satir({ id: 'c', date: '2026-10-27', training_load: 50, duration_s: 300 }),
  ];
  const y = aktiviteYaniti(satirlar, BUGUN, 28);
  assert.deepEqual(y.haftalar.map((h) => h.bas), ['2026-11-09', '2026-11-02', '2026-10-26', '2026-10-19', '2026-10-12']); // 16 Eki Cuma ilk gün
  assert.deepEqual(y.haftalar[0], { bas: '2026-11-09', yuk: 100, sure_s: 1500, adet: 2 });
  assert.deepEqual(y.haftalar[1], { bas: '2026-11-02', yuk: null, sure_s: 0, adet: 0 });
  assert.deepEqual(y.haftalar[2], { bas: '2026-10-26', yuk: 50, sure_s: 300, adet: 1 });
});

test('hafta sınırı: İstanbul Pazar gecesi vs UTC; yerel tarih belirler', () => {
  // Pazar 15 Kas 23:30 İstanbul = 20:30 UTC; Pazartesi 16 Kas 00:30 İstanbul = Pazar 21:30 UTC
  const pazar = satir({ id: 'p', date: '2026-11-15', start_ts: Date.UTC(2026, 10, 15, 20, 30) });
  const pzt = satir({ id: 'z', date: '2026-11-16', start_ts: Date.UTC(2026, 10, 15, 21, 30) });
  const y = aktiviteYaniti([pazar, pzt], '2026-11-16', 14);
  assert.equal(y.haftalar[0].bas, '2026-11-16');
  assert.equal(y.haftalar[0].adet, 1);
  assert.equal(y.haftalar[1].bas, '2026-11-09');
  assert.equal(y.haftalar[1].adet, 1);
  // UTC'ye göre Pazartesi 00:30'daki aktivite Pazar sayılırdı; yerel tarih kazanır
  assert.equal(haftaBasi(pzt.date), '2026-11-16');
});

test('yukBant: 12 tamamlanmış haftanın medyan ∓ 1.5×MAD×1.4826; en az 6 hafta', () => {
  const yuklar = [100, 120, 80, 110, 90, 100, 130, 70, 100, 105, 95, 115];
  const satirlar = yuklar.map((y, i) => satir({ id: `h${i}`, date: gunEkle('2026-11-02', -7 * i), training_load: y }));
  satirlar.push(satir({ id: 'buhafta', date: '2026-11-10', training_load: 9999 })); // tamamlanmamış hafta bandı bozmaz
  const y = aktiviteYaniti(satirlar, BUGUN, 56);
  const med = 100;
  const sirali = yuklar.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const gercekMad = (sirali[5] + sirali[6]) / 2;
  const yarim = 1.5 * gercekMad * 1.4826;
  assert.ok(Math.abs(y.yukBant.min - Math.round((med - yarim) * 10) / 10) < 1e-9);
  assert.ok(Math.abs(y.yukBant.max - Math.round((med + yarim) * 10) / 10) < 1e-9);
});

test('yukBant: min asla negatif olmaz (çok değişken yükte 0\'a kenetlenir)', () => {
  const yuklar = [10, 400, 20, 500, 5, 450, 15, 600];
  const satirlar = yuklar.map((y, i) => satir({ id: `v${i}`, date: gunEkle('2026-11-02', -7 * i), training_load: y }));
  const b = aktiviteYaniti(satirlar, BUGUN, 56).yukBant;
  assert.equal(b.min, 0);
  assert.ok(b.max > 0);
});

test('yukBant: 6 hafta tamam, 5 hafta null; yalnız yükü olan haftalar sayılır', () => {
  const yap = (n) => Array.from({ length: n }, (_, i) => satir({ id: `h${i}`, date: gunEkle('2026-11-02', -7 * i), training_load: 100 + i }));
  assert.equal(aktiviteYaniti(yap(5), BUGUN, 56).yukBant, null);
  const alti = aktiviteYaniti(yap(6), BUGUN, 56).yukBant;
  assert.ok(alti && Number.isFinite(alti.min) && Number.isFinite(alti.max) && alti.min <= alti.max);
  // yükü null olan haftalar sayılmaz
  const yukSuz = yap(6).map((s, i) => (i < 2 ? { ...s, training_load: null } : s));
  assert.equal(aktiviteYaniti(yukSuz, BUGUN, 56).yukBant, null);
  // 12 haftadan eski haftalar sayılmaz
  const eski = Array.from({ length: 6 }, (_, i) => satir({ id: `e${i}`, date: gunEkle('2026-11-02', -7 * (13 + i)), training_load: 100 }));
  assert.equal(aktiviteYaniti(eski, BUGUN, 56).yukBant, null);
});

test('yukBant gun=7 iken de hesaplanır (okuma aralığı genişler)', () => {
  const satirlar = Array.from({ length: 8 }, (_, i) => satir({ id: `h${i}`, date: gunEkle('2026-11-02', -7 * i), training_load: 100 + i }));
  const y = aktiviteYaniti(satirlar, BUGUN, 7);
  assert.ok(y.yukBant);
  assert.equal(y.haftalar.length, 2); // 6-12 Kas iki haftaya yayılır
});

test('yanıt JSON gidiş-dönüşünde değişmez (NaN/undefined yok)', () => {
  const y = aktiviteYaniti([satir(), satir({ id: '2', training_load: null, hr_zones_json: 'bozuk', sets_json: '{' })], BUGUN, 28);
  assert.deepEqual(gecerliJson(y), y);
});

test('boş veri: aktiviteler [], haftalar aralık kadar, yukBant null', () => {
  const y = aktiviteYaniti([], BUGUN, 56);
  assert.deepEqual(y.aktiviteler, []);
  assert.equal(y.haftalar.length, 9); // 18 Eyl Cuma .. 12 Kas
  assert.ok(y.haftalar.every((h) => h.adet === 0 && h.yuk === null && h.sure_s === 0));
  assert.equal(y.yukBant, null);
});
