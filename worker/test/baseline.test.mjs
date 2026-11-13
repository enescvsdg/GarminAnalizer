import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medyan, mad, OLCUMLER, gunDegerleri, bant, durum, ustUsteSapma } from '../src/stats/baseline.js';
import { gunEkle } from '../src/zaman.js';

// seri(başlangıç, [değerler], alan) → ardışık günlere yayılmış GunSatiri[]
function seri(baslangic, degerler, alan) {
  return degerler.map((v, i) => ({ date: gunEkle(baslangic, i), [alan]: v }));
}
const uyku = OLCUMLER.find((o) => o.id === 'uyku');

test('medyan ve mad', () => {
  assert.equal(medyan([1, 9, 3]), 3);
  assert.equal(medyan([1, 2, 3, 4]), 2.5);
  assert.equal(mad([1, 2, 3, 4, 100]), 1);
  assert.equal(medyan([]), null);
  assert.equal(mad([]), null);
});

test('14 dolu günden az ise varsayılan bant, kisisel false', () => {
  const s = seri('2026-10-15', Array(13).fill(80), 'sleep_score'); // 15..27 Eki
  const b = bant(s, uyku, '2026-11-12');
  assert.equal(b.min, 70);
  assert.equal(b.max, 85);
  assert.equal(b.kisisel, false);
  assert.equal(b.medyan, 77.5);
  assert.equal(b.sigma, 5);
});

test('28 gün sabit 80 uyku: sigma tabana oturur', () => {
  const s = seri('2026-10-15', Array(28).fill(80), 'sleep_score'); // 15 Eki..11 Kas
  const b = bant(s, uyku, '2026-11-12');
  assert.equal(b.medyan, 80);
  assert.equal(b.sigma, 4);
  assert.equal(b.min, 74);
  assert.equal(b.max, 86);
  assert.equal(b.kisisel, true);
});

// Pencere sınırları: 14 dolu değer eşiği kisisel'i belirler; bir sınır satırının
// eksik ya da fazla sayılması sayıyı 13/14 arasında oynatır.
const T = '2026-11-12';
const gunler = (ofsetler, v = 80) => ofsetler.map((n) => ({ date: gunEkle(T, n), sleep_score: v }));
const aralik = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('bant penceresi tam olarak tarih-28 ... tarih-1 günlerini kapsar', () => {
  const tam = gunler([-28, ...aralik(-14, -3), -1]); // 14 değer, iki sınır dahil
  assert.equal(tam.length, 14);
  assert.equal(bant(tam, uyku, T).kisisel, true);
});

test('tarih-28 günü pencerededir (çıkarılırsa 13 kalır)', () => {
  const s = gunler([-28, ...aralik(-13, -2)]); // 13 değer, son gün -2
  assert.equal(bant(s, uyku, T).kisisel, false);
  assert.equal(bant([...s, ...gunler([-1])], uyku, T).kisisel, true);
});

test('tarih-1 günü pencerededir', () => {
  const s = gunler(aralik(-27, -15).concat([-1])); // 14 değer, son sınır -1
  assert.equal(bant(s, uyku, T).kisisel, true);
  assert.equal(bant(s.slice(0, -1), uyku, T).kisisel, false);
});

test('tarih-29 pencerenin dışındadır', () => {
  const s = gunler([-29, ...aralik(-12, -1)]); // pencerede 12 + dışarıda 1
  assert.equal(bant([...s, ...gunler([-13])], uyku, T).kisisel, false); // 13 pencere içi + tarih-29
  assert.equal(bant(gunler([-29, ...aralik(-27, -15)]), uyku, T).kisisel, false);
});

test('tarihin kendisi ve sonraki günler pencere dışıdır', () => {
  const s = gunler(aralik(-13, -1)); // pencerede 13
  assert.equal(bant([...s, ...gunler([0, 1], 10)], uyku, T).kisisel, false);
  // ek olarak değer de katılmaz: 14 pencere içi değer + aşırı değer tarihte
  const d = [...gunler(aralik(-14, -1)), ...gunler([0], 1000)];
  assert.equal(bant(d, uyku, T).medyan, 80);
});

test('null günler sayılmaz', () => {
  const s = gunler(aralik(-14, -1));
  s[0].sleep_score = null;
  assert.equal(bant(s, uyku, T).kisisel, false);
});

test('durum: lo/ok/hi ve null', () => {
  const b = { min: 74, max: 86 };
  assert.equal(durum(b, 73.9), 'lo');
  assert.equal(durum(b, 74), 'ok');
  assert.equal(durum(b, 86), 'ok');
  assert.equal(durum(b, 86.1), 'hi');
  assert.equal(durum(b, null), null);
  assert.equal(durum(b, undefined), null);
  assert.equal(durum(b, 0), 'lo');
});

test('yuk bir önceki günün yoğun dakikasıdır', () => {
  const s = [
    { date: '2026-11-11', intensity_minutes: 170, sleep_score: 70 },
    { date: '2026-11-12', intensity_minutes: 5, sleep_score: 82 },
  ];
  const d = gunDegerleri(s, '2026-11-12');
  assert.equal(d.yuk, 170);
  assert.equal(d.uyku, 82);
  const bos = gunDegerleri([], '2026-11-12');
  assert.deepEqual(bos, { uyku: null, bb: null, hrv: null, nabiz: null, stres: null, yuk: null });
  // 0 geçerli bir değerdir
  assert.equal(gunDegerleri([{ date: '2026-11-11', intensity_minutes: 0 }], '2026-11-12').yuk, 0);
});

// 28 gün 80 uyku (15 Eki..11 Kas) + verilen günler; bant 74..86
function bazSeri(ekler) {
  return [...seri('2026-10-15', Array(28).fill(80), 'sleep_score'), ...ekler];
}

test('ustUsteSapma iki gün aynı yönde bant dışıysa true, tek günse false', () => {
  // bant 12 Kas için 74..86; 11 Kas'a 60 yazılırsa baz da değişir ama medyan 80 kalır
  const iki = bazSeri([]);
  iki.find((r) => r.date === '2026-11-11').sleep_score = 60;
  iki.push({ date: '2026-11-12', sleep_score: 60 });
  assert.equal(ustUsteSapma(iki, uyku, '2026-11-12'), true);

  const tek = bazSeri([{ date: '2026-11-12', sleep_score: 60 }]);
  assert.equal(ustUsteSapma(tek, uyku, '2026-11-12'), false);

  const ters = bazSeri([{ date: '2026-11-12', sleep_score: 99 }]);
  ters.find((r) => r.date === '2026-11-11').sleep_score = 60;
  assert.equal(ustUsteSapma(ters, uyku, '2026-11-12'), false);
});

test('ustUsteSapma arada null gün varsa false', () => {
  const s = bazSeri([{ date: '2026-11-12', sleep_score: 60 }]);
  s.find((r) => r.date === '2026-11-11').sleep_score = null;
  assert.equal(ustUsteSapma(s, uyku, '2026-11-12'), false);
  const eksikGun = bazSeri([{ date: '2026-11-12', sleep_score: 60 }]).filter((r) => r.date !== '2026-11-11');
  assert.equal(ustUsteSapma(eksikGun, uyku, '2026-11-12'), false);
});
