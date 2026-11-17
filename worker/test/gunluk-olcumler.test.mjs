import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OLCUMLER, GEMINI_OLCUMLERI, gunDegerleri, bant, durum } from '../src/stats/baseline.js';
import { apiYaniti, enerji, gerekce } from '../src/stats/ozet.js';
import { takvimYaniti } from '../src/stats/takvim.js';
import { ozetGirdisi } from '../src/yorum/yorum.js';
import { egilimOzeti } from '../src/yorum/egilim.js';
import { gunEkle } from '../src/zaman.js';

const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ESKI_DOKUZ = ['uyku', 'bb', 'hrv', 'nabiz', 'stres', 'yuk', 'derin', 'spo2', 'solunum'];
const YENI = ['adim', 'kat', 'kalori', 'yogun', 'maxnabiz'];
const YENI_AD = ['Adım', 'Kat', 'Aktif kalori', 'Yoğun dakika', 'En yüksek nabız'];

// Gerçek biçimli satırlar: önceki (HEAD) uygulamanın çıktısı aşağıdaki ESKI ve karmalarla sabitlendi.
const BUGUN = '2026-11-12';
function gercekSekilli() {
  const satirlar = [];
  for (let i = 70; i >= 0; i -= 1) {
    if (i % 13 === 6) continue;
    const date = gunEkle(BUGUN, -i);
    satirlar.push({
      date,
      sleep_score: 58 + ((i * 7) % 33), sleep_seconds: 22000 + i * 90, sleep_deep_s: 3000 + ((i * 37) % 3000),
      sleep_light_s: 12000 + i, sleep_rem_s: 4800 + i, sleep_awake_s: 900 + i, sleep_need_min: i % 5 === 0 ? null : 480,
      bb_high: 48 + ((i * 5) % 47), bb_charged: 60 + (i % 20), bb_drained: 55 + (i % 15),
      hrv_avg: 38 + ((i * 3) % 27), hrv_status: 'BALANCED', hrv_weekly_avg: 50,
      resting_hr: 47 + ((i * 2) % 13), stress_avg: 19 + ((i * 13) % 32), stress_rest_s: 300, stress_low_s: 200, stress_med_s: 100, stress_high_s: 30,
      training_load: i % 4 === 0 ? null : 20 + ((i * 17) % 200),
      spo2_avg: 93 + (i % 6), spo2_min: 84 + (i % 8), resp_avg: 12 + (i % 6) * 0.9,
      steps: i % 17 === 3 ? 0 : 3000 + ((i * 611) % 12000), floors: i % 7 === 0 ? 0 : (i * 3) % 25,
      calories: 2200 + i * 5, calories_active: i % 8 === 0 ? 0 : 200 + ((i * 41) % 700),
      intensity_minutes: i % 6 === 0 ? 0 : (i * 5) % 90, hr_max: i % 19 === 4 ? 0 : 120 + ((i * 7) % 60), nap_seconds: i % 3 ? 0 : 1200, sleep_stress_avg: 18 + (i % 10),
    });
  }
  return satirlar;
}

const ESKI = [
  "0.439|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.356|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.553|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.489|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.596|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.501|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.485|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "null|Bugün için yeterli veri yok.|Saat verisi gelmemiş.",
  "0.459|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.447|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.389|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.581|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.513|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.622|İyi gidiyorsun.|Bütün ölçümlerin normal aralığında.",
  "0.531|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.474|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.563|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.487|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.475|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.45|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "null|Bugün için yeterli veri yok.|Saat verisi gelmemiş.",
  "0.503|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.57|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.55|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.528|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.592|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.567|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.427|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.401|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.379|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.525|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.636|İyi gidiyorsun.|Bütün ölçümlerin normal aralığında.",
  "0.572|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "null|Bugün için yeterli veri yok.|Saat verisi gelmemiş.",
  "0.446|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.52|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.495|Dengeli bir gün.|Bütün ölçümlerin normal aralığında.",
  "0.433|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.416|Yavaşla.|Bütün ölçümlerin normal aralığında.",
  "0.389|Yavaşla.|Uyku normalinin altında, gerisi yerinde.",
];
const ESKI_D_KARMA = '16f46d61eba424fcea7cf7bbdccacd029c0eb90c8bd7693a4bea7ba77f74c982';
const ESKI_EK_KARMA = '38714ec47831c751c80a9fbc653d907b2e54e276e2d6016a5ad2c5b988a7081f';
const ESKI_YORUM_KARMA = '3b597cf19f7e30c5';
const ESKI_EGILIM_KARMA = '2595840124f0de8d';

const SATIRLAR = gercekSekilli();
const META = { sonEsitleme: null, keyDurum: null };
const eskiEk = (ek) => {
  const k = structuredClone(ek);
  delete k.uyku.sekerleme;
  delete k.uyku.stres;
  delete k.spo2;
  delete k.kalori;
  return k;
};

test('OLCUMLER: beş yeni ölçüm sonda, ağırlık 0, kart false, doğru tanım', () => {
  assert.deepEqual(OLCUMLER.map((o) => o.id), [...ESKI_DOKUZ, ...YENI]);
  const y = OLCUMLER.slice(9);
  assert.deepEqual(y.map((o) => o.ad), YENI_AD);
  assert.ok(y.every((o) => o.agirlik === 0 && o.kart === false));
  assert.deepEqual(y.map((o) => o.kaynak), ['steps', 'floors', 'calories_active', 'intensity_minutes', 'hr_max']);
  assert.deepEqual(y.map((o) => o.birim), ['', '', ' kcal', ' dk', '']);
  assert.deepEqual(y.map((o) => o.iyi), [1, 1, 1, 1, 0]);
  assert.deepEqual(y.map((o) => o.tabanSigma), [1200, 3, 120, 10, 6]);
  assert.deepEqual(y.map((o) => o.varsayilan), [[5000, 11000], [3, 15], [250, 800], [10, 60], [110, 170]]);
});

test('mevcut günler için enerji, hüküm, gerekçe, d ve ek bit bit aynı', () => {
  const y = apiYaniti(SATIRLAR, BUGUN, 40, META);
  assert.deepEqual(y.gunler.map((g) => `${g.e}|${g.hukum}|${g.gerekce}`), ESKI);
  assert.equal(sha(y.gunler.map((g) => Object.fromEntries(ESKI_DOKUZ.map((id) => [id, g.d[id]])))), ESKI_D_KARMA);
  assert.equal(sha(y.gunler.map((g) => eskiEk(g.ek))), ESKI_EK_KARMA);
  // ilk dokuz olcumler[] girdisi de değişmedi
  assert.equal(y.olcumler.length, 14);
  assert.deepEqual(y.olcumler.slice(0, 9).map((o) => o.id), ESKI_DOKUZ);
});

test('olcumler[]: yeni girdiler ad, birim, iyi, bant ve kart:false taşır; iyi 0 korunur', () => {
  const y = apiYaniti(SATIRLAR, BUGUN, 3, META);
  const yeni = y.olcumler.slice(9);
  assert.deepEqual(yeni.map((o) => o.id), YENI);
  for (const o of yeni) {
    assert.deepEqual(Object.keys(o), ['id', 'ad', 'birim', 'iyi', 'min', 'max', 'kisisel', 'kart']);
    assert.equal(o.kart, false);
    assert.ok(Number.isFinite(o.min) && Number.isFinite(o.max) && o.min < o.max);
  }
  assert.equal(yeni.find((o) => o.id === 'maxnabiz').iyi, 0);
  assert.equal(yeni.find((o) => o.id === 'adim').kisisel, true);
});

test('gunler[].d yeni ölçümleri taşır', () => {
  const d = apiYaniti(SATIRLAR, BUGUN, 1, META).gunler[0].d;
  assert.deepEqual(Object.keys(d), [...ESKI_DOKUZ, ...YENI]);
  const r = SATIRLAR.find((x) => x.date === BUGUN);
  assert.equal(d.adim, r.steps);
  assert.equal(d.kat, r.floors);
  assert.equal(d.kalori, r.calories_active);
  assert.equal(d.yogun, r.intensity_minutes);
  assert.equal(d.maxnabiz, r.hr_max);
});

test('sıfır kuralı: steps 0 ve hr_max 0 null; floors, calories_active, intensity_minutes 0 gerçek', () => {
  const s = [{ date: '2026-11-12', steps: 0, hr_max: 0, floors: 0, calories_active: 0, intensity_minutes: 0 }];
  const d = gunDegerleri(s, '2026-11-12');
  assert.equal(d.adim, null);
  assert.equal(d.maxnabiz, null);
  assert.equal(d.kat, 0);
  assert.equal(d.kalori, 0);
  assert.equal(d.yogun, 0);
  // null kalan 0 durum da üretmez
  assert.equal(durum(bant(s, OLCUMLER.find((o) => o.id === 'adim'), '2026-11-12'), d.adim), null);
  assert.equal(durum(bant(s, OLCUMLER.find((o) => o.id === 'kat'), '2026-11-12'), d.kat), 'lo');
});

test('sıfır kuralı bantta: 0 adım ve 0 nabız tabanı bozmaz, 0 kat/kalori/dakika bantta sayılır', () => {
  const gun = (i) => ({ date: gunEkle('2026-11-30', -i) });
  const dizi = (alan, deger, sifirlar) => Array.from({ length: 20 }, (_, k) => ({ ...gun(k + 1), [alan]: k < sifirlar ? 0 : deger }));
  const adim = OLCUMLER.find((o) => o.id === 'adim');
  const maxnabiz = OLCUMLER.find((o) => o.id === 'maxnabiz');
  const kat = OLCUMLER.find((o) => o.id === 'kat');
  assert.equal(bant(dizi('steps', 8000, 6), adim, '2026-11-30').medyan, 8000);
  assert.equal(bant(dizi('hr_max', 150, 6), maxnabiz, '2026-11-30').medyan, 150);
  // yalnız sıfırdan oluşan geçmiş: 0 sayılmadığı için 14 değer yok, varsayılan bant
  assert.equal(bant(dizi('steps', 8000, 20), adim, '2026-11-30').kisisel, false);
  // 0 kat gerçek: 14+ değer ve medyan 0
  const b = bant(dizi('floors', 10, 12), kat, '2026-11-30');
  assert.equal(b.kisisel, true);
  assert.equal(b.medyan, 0);
});

test('iyi 0: durum hesaplanır; enerji ve gerekçe yeni ölçümlerden etkilenmez', () => {
  const o = OLCUMLER.find((x) => x.id === 'maxnabiz');
  const b = { min: 110, max: 170, medyan: 140, sigma: 20, kisisel: false };
  assert.equal(durum(b, 100), 'lo');
  assert.equal(durum(b, 140), 'ok');
  assert.equal(durum(b, 190), 'hi');
  assert.equal(o.iyi, 0);
  const d = { uyku: 80, bb: 70, hrv: 55, nabiz: 52, stres: 30, yuk: 80, derin: 80, spo2: 96, solunum: 14 };
  const bantlar = Object.fromEntries(OLCUMLER.map((x) => [x.id, bant([], x, '2026-11-12')]));
  const temel = enerji(d, bantlar);
  const asiri = { ...d, adim: 99999, kat: 999, kalori: 9999, yogun: 999, maxnabiz: 250 };
  assert.equal(enerji(asiri, bantlar), temel);
  assert.equal(gerekce(asiri, bantlar), gerekce(d, bantlar));
  assert.ok(Number.isFinite(temel));
});

test('ek: uyku.sekerleme, uyku.stres, spo2.en_dusuk, kalori.toplam; eksik null, 0 korunur', () => {
  const r = { date: '2026-11-12', nap_seconds: 1500, sleep_stress_avg: 17, spo2_min: 88, calories: 2400 };
  const ek = apiYaniti([r], '2026-11-12', 1, META).gunler[0].ek;
  assert.equal(ek.uyku.sekerleme, 25);
  assert.equal(ek.uyku.stres, 17);
  assert.deepEqual(ek.spo2, { en_dusuk: 88 });
  assert.deepEqual(ek.kalori, { toplam: 2400 });
  const bos = apiYaniti([], '2026-11-12', 1, META).gunler[0].ek;
  assert.equal(bos.uyku.sekerleme, null);
  assert.equal(bos.uyku.stres, null);
  assert.deepEqual(bos.spo2, { en_dusuk: null });
  assert.deepEqual(bos.kalori, { toplam: null });
  const sifir = apiYaniti([{ date: '2026-11-12', nap_seconds: 0, sleep_stress_avg: 0 }], '2026-11-12', 1, META).gunler[0].ek;
  assert.equal(sifir.uyku.sekerleme, 0);
  assert.equal(sifir.uyku.stres, 0);
});

test('takvim: gunluk beş sayı|null; kartlar ve eski alanlar aynı', () => {
  const t = takvimYaniti(SATIRLAR, BUGUN, 20);
  const eski = takvimYaniti(SATIRLAR.map(({ steps, floors, calories_active, intensity_minutes, hr_max, ...geri }) => geri), BUGUN, 20);
  for (const [i, g] of t.gunler.entries()) {
    assert.deepEqual(Object.keys(g), ['tarih', 'e', 'hukum', 'kartlar', 'gunluk']);
    assert.deepEqual(Object.keys(g.gunluk), YENI);
    assert.equal(g.e, eski.gunler[i].e);
    assert.equal(g.hukum, eski.gunler[i].hukum);
    assert.deepEqual(g.kartlar, eski.gunler[i].kartlar);
    for (const v of Object.values(g.gunluk)) assert.ok(v === null || Number.isFinite(v));
  }
  const son = t.gunler[19].gunluk;
  const r = SATIRLAR.find((x) => x.date === BUGUN);
  assert.deepEqual(son, { adim: r.steps, kat: r.floors, kalori: r.calories_active, yogun: r.intensity_minutes, maxnabiz: r.hr_max });
  // eksik gün ve sıfır kuralı
  const t2 = takvimYaniti([{ date: BUGUN, steps: 0, hr_max: 0, floors: 0, calories_active: 0, intensity_minutes: 0 }], BUGUN, 2);
  assert.deepEqual(t2.gunler[0].gunluk, { adim: null, kat: null, kalori: null, yogun: null, maxnabiz: null });
  assert.deepEqual(t2.gunler[1].gunluk, { adim: null, kat: 0, kalori: 0, yogun: 0, maxnabiz: null });
});

test('Gemini girdileri yalnız önceki dokuz ölçüm; metin bit bit aynı', async () => {
  assert.deepEqual(GEMINI_OLCUMLERI, ESKI_DOKUZ);
  const g = await ozetGirdisi(SATIRLAR, BUGUN);
  const e = await egilimOzeti(SATIRLAR, BUGUN);
  assert.equal(g.karma, ESKI_YORUM_KARMA);
  assert.equal(e.karma, ESKI_EGILIM_KARMA);
  assert.deepEqual(e.olcumler, ESKI_DOKUZ);
  for (const metin of [g.metin, e.metin]) {
    for (const ad of YENI_AD) assert.ok(!metin.includes(ad), ad);
    for (const id of YENI) assert.ok(!metin.includes(`[${id}]`), id);
  }
  assert.equal(g.metin.split('\n').filter((s) => /aralık/.test(s)).length, 9);
});
