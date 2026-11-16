import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { durumOku, durumYaz, gunUpsert, abonelikYaz, abonelikleriOku } from '../src/db.js';
import { gunEkle } from '../src/zaman.js';
import { gunlerYaniti } from '../src/api/router.js';
import { brifingMetni, brifingGerekli, brifingGonder, keyUyarisi, kisalt } from '../src/brifing.js';

const ENV = { VAPID_PUBLIC_KEY: 'acik', VAPID_PRIVATE_KEY: 'gizli', VAPID_KONU: 'https://ornek.test/' };
// 12 Kas 2026 08:00 İstanbul
const SABAH = Date.UTC(2026, 10, 12, 5, 0);
const BUGUN = '2026-11-12';

function sahte(sonuc = 'tamam') {
  const cagrilar = [];
  const g = async (girdi) => {
    cagrilar.push(girdi);
    const s = typeof sonuc === 'function' ? sonuc(girdi, cagrilar.length) : sonuc;
    return { durum: s, kod: null };
  };
  g.cagrilar = cagrilar;
  return g;
}
async function abonele(db, n = 1) {
  for (let i = 0; i < n; i += 1) {
    await abonelikYaz(db, { endpoint: `https://fcm.googleapis.com/${i}`, p256dh: 'p', auth: 'a' }, 1000 + i);
  }
}

const OLC = [
  { id: 'uyku', ad: 'Uyku', min: 70, max: 85, kart: true },
  { id: 'hrv', ad: 'HRV', min: 50, max: 70, kart: true },
  { id: 'stres', ad: 'Stres', min: 25, max: 40, kart: true },
  { id: 'derin', ad: 'Derin uyku', min: 50, max: 110, kart: false },
];
function yanitKur({ e = 0.5, hukum = 'Dengeli bir gün.', gerekce = 'Bütün ölçümlerin normal aralığında.', bugun = {}, dun = {} } = {}) {
  return {
    bugun: BUGUN,
    olcumler: OLC,
    gunler: [
      { tarih: gunEkle(BUGUN, -1), e: 0.5, hukum: 'x', gerekce: 'y', d: { uyku: 78, hrv: 60, stres: 30, derin: 80, ...dun } },
      { tarih: BUGUN, e, hukum, gerekce, d: { uyku: 78, hrv: 60, stres: 30, derin: 80, ...bugun } },
    ],
  };
}

test('brifingMetni: başlık hüküm, gövde gerekçe, sapma yoksa ek satır yok', () => {
  const m = brifingMetni(yanitKur());
  assert.deepEqual(m, { baslik: 'Dengeli bir gün.', govde: 'Bütün ölçümlerin normal aralığında.', etiket: `brifing-${BUGUN}` });
});

test('brifingMetni: bugünün e değeri null ise null', () => {
  assert.equal(brifingMetni(yanitKur({ e: null })), null);
  assert.equal(brifingMetni({ gunler: [] }), null);
});

test('brifingMetni: tek ölçüm iki gündür altında / üstünde', () => {
  const alt = brifingMetni(yanitKur({ bugun: { hrv: 40 }, dun: { hrv: 45 } }));
  assert.equal(alt.govde, 'Bütün ölçümlerin normal aralığında.\nHRV iki gündür normalin altında.');
  const ust = brifingMetni(yanitKur({ bugun: { stres: 55 }, dun: { stres: 50 } }));
  assert.match(ust.govde, /\nStres iki gündür normalin üstünde\.$/);
});

test('brifingMetni: birden çok ölçüm normal dışında der', () => {
  const m = brifingMetni(yanitKur({ bugun: { hrv: 40, stres: 55 }, dun: { hrv: 45, stres: 50 } }));
  assert.match(m.govde, /\nHRV ve Stres iki gündür normal dışında\.$/);
  const u = brifingMetni(yanitKur({ bugun: { uyku: 50, hrv: 40, stres: 55 }, dun: { uyku: 50, hrv: 45, stres: 50 } }));
  assert.match(u.govde, /\nUyku, HRV ve Stres iki gündür normal dışında\.$/);
});

test('brifingMetni: zıt yönler, yalnız bugün ya da yalnız dün sapma bildirilmez', () => {
  assert.equal(brifingMetni(yanitKur({ bugun: { hrv: 40 }, dun: { hrv: 80 } })).govde.includes('\n'), false);
  assert.equal(brifingMetni(yanitKur({ bugun: { hrv: 40 } })).govde.includes('\n'), false);
  assert.equal(brifingMetni(yanitKur({ dun: { hrv: 40 } })).govde.includes('\n'), false);
  assert.equal(brifingMetni(yanitKur({ bugun: { hrv: null }, dun: { hrv: null } })).govde.includes('\n'), false);
});

test('brifingMetni: kart olmayan ölçümler yok sayılır', () => {
  const m = brifingMetni(yanitKur({ bugun: { derin: 10 }, dun: { derin: 10 } }));
  assert.equal(m.govde.includes('\n'), false);
});

test('brifingMetni: satirlar verilince her gün kendi bandıyla (gerçek veri)', async () => {
  const db = testD1();
  for (let i = 40; i >= 2; i -= 1) {
    await gunUpsert(db, { date: gunEkle(BUGUN, -i), sleep_score: 80, hrv_avg: 60, resting_hr: 52, stress_avg: 30, bb_high: 80 });
  }
  for (const i of [1, 0]) await gunUpsert(db, { date: gunEkle(BUGUN, -i), sleep_score: 80, hrv_avg: 40, resting_hr: 52, stress_avg: 30, bb_high: 80 });
  const yanit = await gunlerYaniti({ DB: db }, SABAH, 28);
  const { gunleriOku } = await import('../src/db.js');
  const satirlar = await gunleriOku(db, gunEkle(BUGUN, -60), BUGUN);
  assert.match(brifingMetni(yanit, satirlar).govde, /HRV iki gündür normalin altında\.$/);
  assert.match(brifingMetni(yanit).govde, /HRV iki gündür normalin altında\.$/);
});

test('kısaltma: kelime sınırında, en çok sınır uzunluğunda, … ile biter', () => {
  const s = 'kelime '.repeat(80).trim();
  const k = kisalt(s, 300);
  assert.ok(k.length <= 300);
  assert.ok(k.endsWith('kelime…'));
  assert.equal(kisalt('kısa', 300), 'kısa');
  assert.equal(kisalt('a'.repeat(100), 60).length, 60);
  const m = brifingMetni(yanitKur({ hukum: 'Çok '.repeat(40), gerekce: 'Uzun '.repeat(100) }));
  assert.ok(m.baslik.length <= 60 && m.baslik.endsWith('…'));
  assert.ok(m.govde.length <= 300 && m.govde.endsWith('…'));
});

// ---- brifingGerekli ----
const satir = (date, sleep_score) => ({ date, sleep_score });

test('brifingGerekli: uyku puanı yoksa false, varsa true', async () => {
  const db = testD1();
  assert.equal(await brifingGerekli({ db, satirlar: [satir(BUGUN, null)], bugun: BUGUN, simdiMs: SABAH }), false);
  assert.equal(await brifingGerekli({ db, satirlar: [satir(gunEkle(BUGUN, -1), 80)], bugun: BUGUN, simdiMs: SABAH }), false);
  assert.equal(await brifingGerekli({ db, satirlar: [satir(BUGUN, 80)], bugun: BUGUN, simdiMs: SABAH }), true);
});

test('brifingGerekli: gün dönümü, brifing_gun dünse true, bugünse false', async () => {
  const db = testD1();
  await durumYaz(db, 'brifing_gun', gunEkle(BUGUN, -1));
  assert.equal(await brifingGerekli({ db, satirlar: [satir(BUGUN, 80)], bugun: BUGUN, simdiMs: SABAH }), true);
  await durumYaz(db, 'brifing_gun', BUGUN);
  assert.equal(await brifingGerekli({ db, satirlar: [satir(BUGUN, 80)], bugun: BUGUN, simdiMs: SABAH }), false);
});

test('brifingGerekli: 21:00 İstanbul sınırı (20:59 evet, 21:00 hayır)', async () => {
  const db = testD1();
  const ac = (ms) => brifingGerekli({ db, satirlar: [satir(BUGUN, 80)], bugun: BUGUN, simdiMs: ms });
  assert.equal(await ac(Date.UTC(2026, 10, 12, 17, 59)), true); // 20:59 İstanbul
  assert.equal(await ac(Date.UTC(2026, 10, 12, 18, 0)), false); // 21:00 İstanbul
});

test('brifingGerekli: UTC ile İstanbul tarihi ayrışırken (UTC 22:30 = İstanbul ertesi 01:30)', async () => {
  const db = testD1();
  const ms = Date.UTC(2026, 10, 11, 22, 30); // İstanbul 12 Kas 01:30
  assert.equal(await brifingGerekli({ db, satirlar: [satir('2026-11-12', 80)], bugun: '2026-11-12', simdiMs: ms }), true);
  const gec = Date.UTC(2026, 10, 12, 20, 30); // İstanbul 12 Kas 23:30: kesim geçti
  assert.equal(await brifingGerekli({ db, satirlar: [satir('2026-11-12', 80)], bugun: '2026-11-12', simdiMs: gec }), false);
});

test('brifingGerekli: üç başarısız denemeden sonra false, eski günün sayacı etkilemez', async () => {
  const db = testD1();
  const g = () => brifingGerekli({ db, satirlar: [satir(BUGUN, 80)], bugun: BUGUN, simdiMs: SABAH });
  await durumYaz(db, 'brifing_deneme', { tarih: BUGUN, n: 2 });
  assert.equal(await g(), true);
  await durumYaz(db, 'brifing_deneme', { tarih: BUGUN, n: 3 });
  assert.equal(await g(), false);
  await durumYaz(db, 'brifing_deneme', { tarih: gunEkle(BUGUN, -1), n: 3 });
  assert.equal(await g(), true);
});

// ---- brifingGonder ----
const gonderGirdi = (db, gonder, ek = {}) => ({
  db, env: ENV, yanit: yanitKur(), bugun: BUGUN, simdiMs: SABAH, fetch: () => { throw new Error('ağ yok'); }, gonder, ...ek,
});

test('brifingGonder: metin yoksa yok, gönderici çağrılmaz, işaret yazılmaz', async () => {
  const db = testD1();
  await abonele(db);
  const g = sahte();
  const r = await brifingGonder(gonderGirdi(db, g, { yanit: yanitKur({ e: null }) }));
  assert.deepEqual(r, { durum: 'yok', basarili: 0 });
  assert.equal(g.cagrilar.length, 0);
  assert.equal(await durumOku(db, 'brifing_gun'), null);
});

test('brifingGonder: abonelik yoksa işaret yazılır, gönderici çağrılmaz', async () => {
  const db = testD1();
  const g = sahte();
  const r = await brifingGonder(gonderGirdi(db, g));
  assert.deepEqual(r, { durum: 'abonelik-yok', basarili: 0 });
  assert.equal(g.cagrilar.length, 0);
  assert.equal(await durumOku(db, 'brifing_gun'), BUGUN);
});

test('brifingGonder: iki abonelik, ikisi tamam: gonderildi ve yük biçimi', async () => {
  const db = testD1();
  await abonele(db, 2);
  const g = sahte();
  const r = await brifingGonder(gonderGirdi(db, g));
  assert.deepEqual(r, { durum: 'gonderildi', basarili: 2 });
  assert.equal(g.cagrilar.length, 2);
  assert.deepEqual(g.cagrilar[0].yuk, { baslik: 'Dengeli bir gün.', govde: 'Bütün ölçümlerin normal aralığında.', etiket: `brifing-${BUGUN}`, url: './' });
  assert.deepEqual(g.cagrilar[0].vapid, { acik: 'acik', gizli: 'gizli', konu: 'https://ornek.test/' });
  assert.equal(g.cagrilar[0].simdiSn, Math.floor(SABAH / 1000));
  assert.equal(await durumOku(db, 'brifing_gun'), BUGUN);
});

test('brifingGonder: biri hata biri tamam ise gonderildi sayılır', async () => {
  const db = testD1();
  await abonele(db, 2);
  const g = sahte((girdi) => (girdi.abonelik.endpoint.endsWith('/0') ? 'hata' : 'tamam'));
  const r = await brifingGonder(gonderGirdi(db, g));
  assert.deepEqual(r, { durum: 'gonderildi', basarili: 1 });
  assert.equal(await durumOku(db, 'brifing_gun'), BUGUN);
});

test('brifingGonder: hepsi hata ise işaret yazılmaz, deneme sayılır', async () => {
  const db = testD1();
  await abonele(db, 2);
  const g = sahte('hata');
  const r = await brifingGonder(gonderGirdi(db, g));
  assert.deepEqual(r, { durum: 'hata', basarili: 0 });
  assert.equal(g.cagrilar.length, 2);
  assert.equal(await durumOku(db, 'brifing_gun'), null);
  assert.deepEqual(await durumOku(db, 'brifing_deneme'), { tarih: BUGUN, n: 1 });
  await brifingGonder(gonderGirdi(db, g));
  assert.deepEqual(await durumOku(db, 'brifing_deneme'), { tarih: BUGUN, n: 2 });
  // yeni gün sayacı sıfırdan başlar
  await brifingGonder(gonderGirdi(db, g, { bugun: gunEkle(BUGUN, 1) }));
  assert.deepEqual(await durumOku(db, 'brifing_deneme'), { tarih: gunEkle(BUGUN, 1), n: 1 });
});

test('brifingGonder: gitti dönen abonelik silinir', async () => {
  const db = testD1();
  await abonele(db, 2);
  const g = sahte((girdi) => (girdi.abonelik.endpoint.endsWith('/0') ? 'gitti' : 'tamam'));
  const r = await brifingGonder(gonderGirdi(db, g));
  assert.deepEqual(r, { durum: 'gonderildi', basarili: 1 });
  assert.deepEqual((await abonelikleriOku(db)).map((a) => a.endpoint), ['https://fcm.googleapis.com/1']);
});

test('brifingGonder: hepsi gitti ise hata, abonelikler silinir, sonraki çağrı abonelik-yok', async () => {
  const db = testD1();
  await abonele(db, 1);
  const g = sahte('gitti');
  assert.deepEqual(await brifingGonder(gonderGirdi(db, g)), { durum: 'hata', basarili: 0 });
  assert.equal((await abonelikleriOku(db)).length, 0);
  assert.deepEqual(await brifingGonder(gonderGirdi(db, g)), { durum: 'abonelik-yok', basarili: 0 });
  assert.equal(g.cagrilar.length, 1);
});

test('brifingGonder: VAPID özel anahtarı yoksa gönderici çağrılmaz, hata', async () => {
  const db = testD1();
  await abonele(db);
  const g = sahte();
  const r = await brifingGonder(gonderGirdi(db, g, { env: { ...ENV, VAPID_PRIVATE_KEY: undefined } }));
  assert.deepEqual(r, { durum: 'hata', basarili: 0 });
  assert.equal(g.cagrilar.length, 0);
  assert.equal(await durumOku(db, 'brifing_gun'), null);
});

test('brifingGonder: gönderici fırlatırsa hata sayılır, fırlatmaz', async () => {
  const db = testD1();
  await abonele(db);
  const r = await brifingGonder(gonderGirdi(db, async () => { throw new Error('x'); }));
  assert.deepEqual(r, { durum: 'hata', basarili: 0 });
});

// ---- keyUyarisi ----
const uyariGirdi = (db, gonder, ek = {}) => ({ db, env: ENV, simdiMs: SABAH, fetch: () => {}, gonder, ...ek });

test('keyUyarisi: key geçerliyken yok, gönderici çağrılmaz', async () => {
  const db = testD1();
  await abonele(db);
  const g = sahte();
  await durumYaz(db, 'key_durum', 'gecerli');
  assert.equal((await keyUyarisi(uyariGirdi(db, g))).durum, 'yok');
  assert.equal(g.cagrilar.length, 0);
});

test('keyUyarisi: geçersize geçişte bir kez, tekrar çağrıda yok; geçerli olunca işaret silinir, yeni geçişte yine', async () => {
  const db = testD1();
  await abonele(db);
  const g = sahte();
  await durumYaz(db, 'key_durum', 'gecersiz');
  const r = await keyUyarisi(uyariGirdi(db, g));
  assert.deepEqual(r, { durum: 'gonderildi', basarili: 1 });
  assert.deepEqual(g.cagrilar[0].yuk, { baslik: 'Garmin bağlantısı koptu', govde: 'Garmin anahtarı kabul edilmiyor. Yenilemen gerekiyor.', etiket: 'key-uyari', url: './' });
  assert.equal((await keyUyarisi(uyariGirdi(db, g))).durum, 'yok');
  assert.equal(g.cagrilar.length, 1);
  await durumYaz(db, 'key_durum', 'gecerli');
  assert.equal((await keyUyarisi(uyariGirdi(db, g))).durum, 'sifirlandi');
  assert.equal(await durumOku(db, 'key_uyari'), null);
  assert.equal((await keyUyarisi(uyariGirdi(db, g))).durum, 'yok');
  await durumYaz(db, 'key_durum', 'gecersiz');
  assert.equal((await keyUyarisi(uyariGirdi(db, g))).durum, 'gonderildi');
  assert.equal(g.cagrilar.length, 2);
});

test('keyUyarisi: abonelik yoksa işaretler; hepsi hata ise işaretlemez ve sonra yeniden dener', async () => {
  const db = testD1();
  await durumYaz(db, 'key_durum', 'gecersiz');
  const g = sahte('hata');
  assert.equal((await keyUyarisi(uyariGirdi(db, g))).durum, 'abonelik-yok');
  assert.equal(await durumOku(db, 'key_uyari'), 'gonderildi');
  const db2 = testD1();
  await abonele(db2);
  await durumYaz(db2, 'key_durum', 'gecersiz');
  assert.equal((await keyUyarisi(uyariGirdi(db2, g))).durum, 'hata');
  assert.equal(await durumOku(db2, 'key_uyari'), null);
  assert.equal((await keyUyarisi(uyariGirdi(db2, sahte()))).durum, 'gonderildi');
});
