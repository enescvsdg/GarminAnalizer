import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enerji, hukum, gerekce, apiYaniti } from '../src/stats/ozet.js';
import { OLCUMLER } from '../src/stats/baseline.js';
import { gunEkle } from '../src/zaman.js';

// Her ölçüm için medyan 50, sigma 10, bant 40..60
const BANTLAR = Object.fromEntries(OLCUMLER.map((o) => [o.id, { min: 40, max: 60, medyan: 50, sigma: 10, kisisel: true }]));
const hepsi = (v) => Object.fromEntries(OLCUMLER.map((o) => [o.id, v]));

test('her ölçüm medyandaysa enerji 0.5', () => {
  assert.equal(enerji(hepsi(50), BANTLAR), 0.5);
});

test('iyi yönde 1.5 sigma sapma o ölçümü 0.75 yapar; nabız için ters yön', () => {
  const bos = { ...hepsi(null), uyku: 50, hrv: 50, nabiz: 50 };
  // uyku 65 → 0.75; ağırlıklar uyku .25, hrv .25, nabız .15 (toplam .65)
  assert.equal(enerji({ ...bos, uyku: 65 }, BANTLAR), 0.596);
  // nabız 35 (düşük = iyi) → 0.75
  assert.equal(enerji({ ...bos, nabiz: 35 }, BANTLAR), 0.558);
  // nabız 65 (yüksek = kötü) → 0.25
  assert.equal(enerji({ ...bos, nabiz: 65 }, BANTLAR), 0.442);
  // aşırı sapma 0..1 aralığına kırpılır
  assert.equal(enerji({ ...bos, uyku: 1000 }, BANTLAR), 0.692);
});

test('3ten az dolu ölçümde enerji null ve hüküm yeterli veri yok', () => {
  const iki = { ...hepsi(null), uyku: 50, hrv: 50 };
  assert.equal(enerji(iki, BANTLAR), null);
  assert.equal(enerji(hepsi(null), BANTLAR), null);
  assert.equal(hukum(null), 'Bugün için yeterli veri yok.');
});

test('0 geçerli bir değerdir, eksik sayılmaz', () => {
  const d = { ...hepsi(null), uyku: 50, hrv: 50, yuk: 0 };
  assert.notEqual(enerji(d, BANTLAR), null);
});

test('hüküm eşikleri', () => {
  assert.equal(hukum(0.29), 'Bugün hafif tut.');
  assert.equal(hukum(0.3), 'Yavaşla.');
  assert.equal(hukum(0.47), 'Yavaşla.');
  assert.equal(hukum(0.48), 'Dengeli bir gün.');
  assert.equal(hukum(0.61), 'Dengeli bir gün.');
  assert.equal(hukum(0.62), 'İyi gidiyorsun.');
  assert.equal(hukum(0.84), 'İyi gidiyorsun.');
  assert.equal(hukum(0.85), 'Tam gaz.');
});

test('gerekçe: sıfır, bir ve çok sapma; hiç veri yok', () => {
  assert.equal(gerekce(hepsi(50), BANTLAR), 'Bütün ölçümlerin normal aralığında.');
  assert.equal(gerekce({ ...hepsi(50), uyku: 30 }, BANTLAR), 'Uyku normalinin altında, gerisi yerinde.');
  assert.equal(gerekce({ ...hepsi(50), stres: 90 }, BANTLAR), 'Stres normalinin üstünde, gerisi yerinde.');
  assert.equal(gerekce({ ...hepsi(50), uyku: 30, hrv: 30 }, BANTLAR), '2 ölçümün normal aralığının dışında: uyku ve hrv.');
  assert.equal(
    gerekce({ ...hepsi(50), uyku: 30, nabiz: 90, stres: 90 }, BANTLAR),
    '3 ölçümün normal aralığının dışında: uyku, dinlenme nabzı ve stres.',
  );
  assert.equal(gerekce(hepsi(null), BANTLAR), 'Saat verisi gelmemiş.');
});

// bitiş dahil n gün, hepsi dolu
function gunler(bitis, n, ek = {}) {
  return Array.from({ length: n }, (_, i) => ({
    date: gunEkle(bitis, -(n - 1 - i)),
    sleep_score: 80, bb_high: 70, hrv_avg: 55, resting_hr: 52, stress_avg: 30, intensity_minutes: 60, ...ek,
  }));
}
const META = { sonEsitleme: '2026-11-13T08:00:00Z', keyDurum: 'ok' };

function tara(x, yol = '$') {
  if (typeof x === 'number') assert.ok(Number.isFinite(x), `${yol} sayı değil`);
  else if (x === undefined) assert.fail(`${yol} undefined`);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) tara(v, `${yol}.${k}`);
}

test('apiYaniti tam gunSayisi öğe döner, veri olmayan gün null değerlerle', () => {
  const y = apiYaniti(gunler('2026-11-13', 10), '2026-11-13', 28, META);
  assert.equal(y.gunler.length, 28);
  assert.equal(y.bugun, '2026-11-13');
  assert.equal(y.sonEsitleme, META.sonEsitleme);
  assert.equal(y.keyDurum, 'ok');
  assert.equal(y.gunler[0].tarih, '2026-10-17');
  assert.equal(y.gunler[27].tarih, '2026-11-13');
  for (const g of y.gunler.slice(0, 18)) {
    assert.equal(g.e, null);
    assert.equal(g.hukum, 'Bugün için yeterli veri yok.');
    assert.equal(g.gerekce, 'Saat verisi gelmemiş.');
    assert.deepEqual(g.d, { uyku: null, bb: null, hrv: null, nabiz: null, stres: null, yuk: null });
  }
  // 18. indeks = 4 Kas: ilk dolu gün (yük için bir önceki gün de yok → null)
  assert.equal(y.gunler[18].d.uyku, 80);
  assert.equal(y.gunler[18].d.yuk, null);
  assert.equal(y.gunler[19].d.yuk, 60);
  assert.notEqual(y.gunler[27].e, null);
  assert.equal(y.olcumler.length, 6);
  assert.deepEqual(Object.keys(y.olcumler[0]), ['id', 'ad', 'birim', 'iyi', 'min', 'max', 'kisisel']);
  assert.equal(y.olcumler[0].kisisel, false); // 10 gün < 14
  tara(y);
});

test('her gün kendi bandıyla değerlendirilir; bugünün olcumler bandı kişisel olur', () => {
  const y = apiYaniti(gunler('2026-11-13', 40), '2026-11-13', 3, META);
  assert.equal(y.gunler.length, 3);
  assert.equal(y.olcumler.find((o) => o.id === 'uyku').kisisel, true);
  assert.equal(y.olcumler.find((o) => o.id === 'uyku').min, 74);
  assert.equal(y.gunler[2].gerekce, 'Bütün ölçümlerin normal aralığında.');
  tara(y);
});

test('apiYanitinda 0 ya da NaN yok', () => {
  const yaniti = JSON.stringify(apiYaniti(gunler('2026-11-13', 10), '2026-11-13', 28, META));
  assert.ok(!yaniti.includes('NaN'));
  assert.ok(!yaniti.includes(':0,'));
  assert.ok(!yaniti.includes('undefined'));
  // boş satır listesi de güvenli
  tara(apiYaniti([], '2026-11-13', 5, META));
});
