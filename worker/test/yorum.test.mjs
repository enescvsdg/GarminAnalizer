import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { durumOku, durumYaz } from '../src/db.js';
import { gunEkle } from '../src/zaman.js';
import {
  SISTEM, SEMA, ozetGirdisi, yorumGecerli, yorumGuncelle, yorumOku, yapayZekaAcik, yapayZekaYaz, GUNLUK_SINIR,
  yonUyumlu, sayilarGirdiden,
} from '../src/yorum/yorum.js';

const BUGUN = '2026-11-12';
const SIMDI = Date.UTC(2026, 10, 12, 9, 0);

function satirlar(bugunDeger = {}, { gun = 30 } = {}) {
  const s = [];
  for (let k = gun; k >= 1; k -= 1) {
    s.push({
      date: gunEkle(BUGUN, -k),
      sleep_score: 75 + (k % 5), bb_high: 70 + (k % 4), hrv_avg: 50 + (k % 3), resting_hr: 52 + (k % 2),
      stress_avg: 30 + (k % 4), training_load: 80 + (k % 6), sleep_deep_s: 5400 + (k % 3) * 60,
      spo2_avg: 96 + (k % 2), resp_avg: 14 + (k % 2) * 0.5,
      raw_json: '{"gizli":1}',
    });
  }
  s.push({
    date: BUGUN, sleep_score: 82, bb_high: 78, hrv_avg: 55, resting_hr: 52, stress_avg: 28,
    training_load: 90, sleep_deep_s: 5700, spo2_avg: 97, resp_avg: 14.5, raw_json: '{"gizli":2}', ...bugunDeger,
  });
  return s;
}

const GECERLI = { hukum: 'İyi gidiyorsun', gerekce: 'Uykun ve HRV değerin normal aralığında, bugün rahat bir tempo uygun.' };

test('ozetGirdisi: gizlilik; tarih, gün adı, ham alan, ad yok', async () => {
  const g = await ozetGirdisi(satirlar(), BUGUN);
  assert.ok(g);
  for (const yasak of ['2026', '-11-', '-12', 'raw', 'gizli', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar', '@', 'http']) {
    assert.ok(!g.metin.includes(yasak), `metinde yasak: ${yasak}`);
  }
  assert.ok(!/\d{4}-\d{2}/.test(g.metin));
});

test('ozetGirdisi: dokuz ölçüm, değer/birim, aralık, durum, yön, enerji, kademe', async () => {
  const g = await ozetGirdisi(satirlar(), BUGUN);
  const satir = g.metin.split('\n');
  for (const ad of ['Uyku', 'Body Battery', 'HRV', 'Dinlenme nabzı', 'Stres', 'Dünkü yük', 'Derin uyku', 'SpO₂', 'Solunum']) {
    assert.equal(satir.filter((s) => s.startsWith(`${ad}:`)).length, 1, ad);
  }
  assert.equal(satir.filter((s) => /normal aralık|genel aralık/.test(s)).length, 9);
  assert.match(satir.find((s) => s.startsWith('HRV:')), /55 ms/);
  assert.match(satir.find((s) => s.startsWith('Derin uyku:')), /95 dk/);
  assert.match(satir.find((s) => s.startsWith('Uyku:')), /yüksek değer iyi/);
  assert.match(satir.find((s) => s.startsWith('Stres:')), /düşük değer iyi/);
  assert.match(g.metin, /Enerji: \d\.\d\d \(0\.00–1\.00 ölçeği\)/);
  assert.equal(typeof g.enerji, 'number');
  assert.equal(typeof g.kademe, 'string');
  assert.ok(g.metin.includes(g.kademe));
  assert.match(g.karma, /^[0-9a-f]{16}$/);
  assert.ok(/altında|normalde|üstünde/.test(g.metin));
});

test('ozetGirdisi: kişisel bant "normal aralık", yetersiz geçmişte "genel aralık", eksik değer "veri yok"', async () => {
  const kisisel = await ozetGirdisi(satirlar(), BUGUN);
  assert.ok(!kisisel.metin.includes('genel aralık'));
  const genel = await ozetGirdisi(satirlar({}, { gun: 5 }), BUGUN);
  assert.equal(genel.metin.split('\n').filter((s) => s.includes('genel aralık')).length, 9);
  assert.ok(!genel.metin.includes('normal aralık'));
  const eksik = await ozetGirdisi(satirlar({ spo2_avg: null, resp_avg: null }), BUGUN);
  const spo2 = eksik.metin.split('\n').find((s) => s.startsWith('SpO₂:'));
  assert.match(spo2, /veri yok/);
  assert.ok(!/altında|normalde|üstünde/.test(spo2));
});

test('ozetGirdisi: aynı veri aynı karma, değer değişince farklı karma', async () => {
  const a = await ozetGirdisi(satirlar(), BUGUN);
  const b = await ozetGirdisi(satirlar(), BUGUN);
  assert.equal(a.karma, b.karma);
  assert.equal(a.metin, b.metin);
  const c = await ozetGirdisi(satirlar({ hrv_avg: 56 }), BUGUN);
  assert.notEqual(a.karma, c.karma);
  // yalnız gizli/ilgisiz alan değişince karma aynı kalır
  const d = await ozetGirdisi(satirlar({ raw_json: 'baska', steps: 99 }), BUGUN);
  assert.equal(a.karma, d.karma);
});

test('ozetGirdisi: enerji null (yetersiz veri) ise null', async () => {
  const bos = [{ date: BUGUN, sleep_score: 80, bb_high: 70 }];
  assert.equal(await ozetGirdisi(bos, BUGUN), null);
  assert.equal(await ozetGirdisi([], BUGUN), null);
});

test('SISTEM ve SEMA', () => {
  assert.equal(typeof SISTEM, 'string');
  assert.match(SISTEM, /sen/);
  assert.match(SISTEM, /4 kelime/);
  assert.match(SISTEM, /220/);
  assert.deepEqual(SEMA, {
    type: 'object',
    properties: { hukum: { type: 'string' }, gerekce: { type: 'string' } },
    required: ['hukum', 'gerekce'],
  });
});

test('yorumGecerli: geçerli, kırpma ve boşluk tekilleştirme', () => {
  assert.deepEqual(yorumGecerli(GECERLI), GECERLI);
  assert.deepEqual(yorumGecerli({ hukum: '  İyi   gidiyorsun ', gerekce: ' Uykun   iyi. ' }), { hukum: 'İyi gidiyorsun', gerekce: 'Uykun iyi.' });
});

test('yorumGecerli: sınırlar', () => {
  const g = (hukum, gerekce = 'Uykun iyi.') => yorumGecerli({ hukum, gerekce });
  assert.ok(g('bir iki üç dört beş'));
  assert.equal(g('bir iki üç dört beş altı'), null);
  assert.ok(g('a'.repeat(40)));
  assert.equal(g('a'.repeat(41)), null);
  assert.ok(g('İyi', 'a'.repeat(260)));
  assert.equal(g('İyi', 'a'.repeat(261)), null);
  assert.equal(g(''), null);
  assert.equal(g('   '), null);
  assert.equal(g('İyi', ''), null);
  assert.equal(g('İyi', '   '), null);
  assert.equal(g(5), null);
  assert.equal(g('İyi', null), null);
  assert.equal(yorumGecerli(null), null);
  assert.equal(yorumGecerli('metin'), null);
  assert.equal(yorumGecerli({ hukum: 'İyi' }), null);
});

test('yorumGecerli: yasak karakterler', () => {
  const g = (gerekce) => yorumGecerli({ hukum: 'İyi', gerekce });
  for (const k of ['a<b', 'a>b', 'a{b', 'a}b', 'bak http://x', 'bak HTTPS://x', 'a\nb', 'a\rb', 'a\tb', 'a\u0000b', 'a\u0085b', 'a b']) {
    assert.equal(g(k), null, JSON.stringify(k));
  }
  assert.equal(yorumGecerli({ hukum: 'İyi\n', gerekce: 'x' }), null);
  assert.equal(yorumGecerli({ hukum: '<b>', gerekce: 'x' }), null);
});

function kur(satir = satirlar()) {
  const db = testD1();
  const cagrilar = [];
  const yaz = async (girdi) => { cagrilar.push(girdi); return { ...GECERLI }; };
  return { db, cagrilar, yaz, satir };
}
const calistir = (k, ek = {}) => yorumGuncelle({ db: k.db, satirlar: k.satir, bugun: BUGUN, simdiMs: SIMDI, yaz: k.yaz, ...ek });

test('yorumGuncelle: yazildi, kayıt biçimi, tek çağrı, girdi metni verilir', async () => {
  const k = kur();
  assert.deepEqual(await calistir(k), { durum: 'yazildi' });
  assert.equal(k.cagrilar.length, 1);
  const g = await ozetGirdisi(k.satir, BUGUN);
  assert.equal(k.cagrilar[0], g.metin);
  assert.deepEqual(await durumOku(k.db, 'yorum'), {
    tarih: BUGUN, karma: g.karma, hukum: GECERLI.hukum, gerekce: GECERLI.gerekce, uretildi: SIMDI,
  });
  assert.deepEqual(await durumOku(k.db, 'yorum_sayac'), { tarih: BUGUN, n: 1 });
});

test('yorumGuncelle: aynı tarih ve karma ise ayni, 0 çağrı', async () => {
  const k = kur();
  await calistir(k);
  assert.deepEqual(await calistir(k), { durum: 'ayni' });
  assert.equal(k.cagrilar.length, 1);
  assert.deepEqual(await durumOku(k.db, 'yorum_sayac'), { tarih: BUGUN, n: 1 });
});

test('yorumGuncelle: veri değişince yeniden istek', async () => {
  const k = kur();
  await calistir(k);
  assert.deepEqual(await calistir(k, { satirlar: satirlar({ hrv_avg: 58 }) }), { durum: 'yazildi' });
  assert.equal(k.cagrilar.length, 2);
});

test('yorumGuncelle: kapali (ayar 0 çağrı), anahtar yoksa açık sayılır', async () => {
  const k = kur();
  assert.equal(await yapayZekaAcik(k.db), true);
  await yapayZekaYaz(k.db, false);
  assert.equal(await yapayZekaAcik(k.db), false);
  assert.deepEqual(await calistir(k), { durum: 'kapali' });
  assert.equal(k.cagrilar.length, 0);
  await yapayZekaYaz(k.db, true);
  assert.equal(await yapayZekaAcik(k.db), true);
  assert.deepEqual(await calistir(k), { durum: 'yazildi' });
  assert.equal(k.cagrilar.length, 1);
});

test('yorumGuncelle: veri-yok (enerji null), 0 çağrı', async () => {
  const k = kur([{ date: BUGUN, sleep_score: 80 }]);
  assert.deepEqual(await calistir(k), { durum: 'veri-yok' });
  assert.equal(k.cagrilar.length, 0);
  assert.equal(await durumOku(k.db, 'yorum'), null);
});

test('yorumGuncelle: günde en çok GUNLUK_SINIR (24) istek, sonra sinir ve 0 çağrı', async () => {
  assert.equal(GUNLUK_SINIR, 24);
  const k = kur();
  for (let i = 0; i < GUNLUK_SINIR; i += 1) {
    const r = await calistir(k, { satirlar: satirlar({ hrv_avg: 40 + i }) });
    assert.equal(r.durum, 'yazildi', `istek ${i + 1}`);
  }
  assert.equal(k.cagrilar.length, GUNLUK_SINIR);
  assert.deepEqual(await calistir(k, { satirlar: satirlar({ hrv_avg: 99 }) }), { durum: 'sinir' });
  assert.equal(k.cagrilar.length, GUNLUK_SINIR);
  // ertesi gün sayaç sıfırlanır
  const yarin = gunEkle(BUGUN, 1);
  const sat = satirlar().map((s) => s);
  sat.push({ ...sat.at(-1), date: yarin });
  const r = await yorumGuncelle({ db: k.db, satirlar: sat, bugun: yarin, simdiMs: SIMDI + 86400000, yaz: k.yaz });
  assert.equal(r.durum, 'yazildi');
  assert.equal(k.cagrilar.length, GUNLUK_SINIR + 1);
  assert.deepEqual(await durumOku(k.db, 'yorum_sayac'), { tarih: yarin, n: 1 });
});

test('yorumGuncelle: sayaç istekten ÖNCE artırılır', async () => {
  const k = kur();
  let sayacIstekte = null;
  const yaz = async () => { sayacIstekte = await durumOku(k.db, 'yorum_sayac'); return null; };
  await calistir(k, { yaz });
  assert.deepEqual(sayacIstekte, { tarih: BUGUN, n: 1 });
});

test('yorumGuncelle: yaz null / geçersiz yorum -> hata, eski kayıt silinmez', async () => {
  const k = kur();
  await calistir(k);
  const eski = await durumOku(k.db, 'yorum');
  const yeni = satirlar({ hrv_avg: 61 });
  assert.deepEqual(await calistir(k, { satirlar: yeni, yaz: async () => null }), { durum: 'hata' });
  assert.deepEqual(await durumOku(k.db, 'yorum'), eski);
  assert.deepEqual(await calistir(k, { satirlar: yeni, yaz: async () => ({ hukum: 'bir iki üç dört beş altı', gerekce: 'x' }) }), { durum: 'hata' });
  assert.deepEqual(await durumOku(k.db, 'yorum'), eski);
});

test('yorumGuncelle: yaz fırlatırsa hata', async () => {
  const k = kur();
  assert.deepEqual(await calistir(k, { yaz: async () => { throw new Error('x'); } }), { durum: 'hata' });
});

test('yorumGuncelle: aynı karma iki kez başarısız olursa üçüncüde istek yok', async () => {
  const k = kur();
  let n = 0;
  const yaz = async () => { n += 1; return null; };
  assert.deepEqual(await calistir(k, { yaz }), { durum: 'hata' });
  assert.deepEqual(await durumOku(k.db, 'yorum_hata'), { tarih: BUGUN, karma: (await ozetGirdisi(k.satir, BUGUN)).karma, n: 1 });
  assert.deepEqual(await calistir(k, { yaz }), { durum: 'hata' });
  assert.equal(n, 2);
  assert.equal((await durumOku(k.db, 'yorum_hata')).n, 2);
  assert.deepEqual(await calistir(k, { yaz }), { durum: 'hata' });
  assert.equal(n, 2);
  // farklı karma için yeniden denenir
  assert.deepEqual(await calistir(k, { satirlar: satirlar({ hrv_avg: 62 }), yaz }), { durum: 'hata' });
  assert.equal(n, 3);
  assert.equal((await durumOku(k.db, 'yorum_hata')).n, 1);
});

test('yorumOku: eşleşen kayıt döner; karma uyuşmazlığı, başka gün, kapalı -> null', async () => {
  const k = kur();
  assert.equal(await yorumOku(k.db, BUGUN, k.satir), null);
  await calistir(k);
  assert.deepEqual(await yorumOku(k.db, BUGUN, k.satir), GECERLI);
  assert.equal(await yorumOku(k.db, BUGUN, satirlar({ hrv_avg: 58 })), null);
  const yarin = gunEkle(BUGUN, 1);
  const sat = [...k.satir, { ...k.satir.at(-1), date: yarin }];
  assert.equal(await yorumOku(k.db, yarin, sat), null);
  await yapayZekaYaz(k.db, false);
  assert.equal(await yorumOku(k.db, BUGUN, k.satir), null);
});

test('kapatınca yorum gösterilmez ama silinmez; açınca istek atmadan geri gelir, veri değiştiyse gelmez', async () => {
  const k = kur();
  await calistir(k);
  assert.equal(k.cagrilar.length, 1);
  await yapayZekaYaz(k.db, false);
  assert.equal(await yorumOku(k.db, BUGUN, k.satir), null);
  assert.deepEqual(await calistir(k), { durum: 'kapali' });
  await yapayZekaYaz(k.db, true);
  assert.deepEqual(await yorumOku(k.db, BUGUN, k.satir), GECERLI);
  assert.equal(await yorumOku(k.db, BUGUN, satirlar({ hrv_avg: 58 })), null);
  assert.deepEqual(await calistir(k), { durum: 'ayni' });
  assert.equal(k.cagrilar.length, 1);
});

// ---- Fix round 1: yön ve sayı denetimi, görünmez karakter, ayar yarışı, sayaç hatası ----

const DUSUK = { sleep_score: 40, bb_high: 30, hrv_avg: 35, resting_hr: 60, stress_avg: 50 }; // enerji 0.026
const HAFIF = { hukum: 'Bugün hafif tut', gerekce: 'Uykun ve toparlanman düşük, rahat bir gün geçir.' };

test('yonUyumlu: düşük enerji (< 0.48) hızlı/yüklenen metni reddeder, sınır 0.47/0.48', () => {
  const tamGaz = { hukum: 'Tam gaz', gerekce: 'Rahat bir gün.' };
  assert.equal(yonUyumlu(tamGaz, 0.47), false);
  assert.equal(yonUyumlu(tamGaz, 0.48), true);
  for (const k of ['tam gaz', 'hızlan', 'bastır', 'zorla', 'yüklen', 'sert antrenman', 'sınırlarını zorla', 'patlat', 'yoğun antrenman', 'rekor']) {
    assert.equal(yonUyumlu({ hukum: 'Bugün', gerekce: `Biraz ${k} bugün.` }, 0.1), false, k);
    assert.equal(yonUyumlu({ hukum: k, gerekce: 'Rahat.' }, 0.1), false, `hukum ${k}`);
  }
  assert.equal(yonUyumlu({ hukum: 'Hafif tut', gerekce: 'Dinlenmen iyi olur.' }, 0.1), true);
});

test('yonUyumlu: Türkçe büyük/küçük harf ve gerekçe de taranır', () => {
  assert.equal(yonUyumlu({ hukum: 'HIZLAN', gerekce: 'x' }, 0.3), false);
  assert.equal(yonUyumlu({ hukum: 'x', gerekce: 'SINIRLARINI ZORLA' }, 0.3), false);
  assert.equal(yonUyumlu({ hukum: 'x', gerekce: 'YÜKLEN bugün' }, 0.3), false);
});

test('yonUyumlu: olumsuzlama özel işlenmez, "zorlama" yine reddedilir (kasıtlı, muhafazakâr)', () => {
  assert.equal(yonUyumlu({ hukum: 'Rahat', gerekce: 'Bugün zorlama.' }, 0.2), false);
});

test('yonUyumlu: yüksek enerji (>= 0.62) yalnız hükümde dinlenme ifadesini reddeder, sınır 0.61/0.62', () => {
  const dinlen = { hukum: 'Dinlen', gerekce: 'Değerlerin iyi.' };
  assert.equal(yonUyumlu(dinlen, 0.62), false);
  assert.equal(yonUyumlu(dinlen, 0.61), true);
  for (const k of ['dinlen', 'hafif tut', 'yavaşla', 'ara ver', 'mola', 'bırak']) {
    assert.equal(yonUyumlu({ hukum: `Bugün ${k}`, gerekce: 'Değerlerin iyi.' }, 0.9), false, k);
  }
  // gerekçedeki dinlenme sözü yüksek enerjide hükmü bozmaz
  assert.equal(yonUyumlu({ hukum: 'İyi gidiyorsun', gerekce: 'Dün dinlendin, bugün mola vermeye gerek yok.' }, 0.9), true);
  assert.equal(yonUyumlu({ hukum: 'DİNLEN', gerekce: 'x' }, 0.9), false);
});

test('yonUyumlu: orta enerji (0.48-0.62) serbest', () => {
  assert.equal(yonUyumlu({ hukum: 'Tam gaz', gerekce: 'Dinlen' }, 0.55), true);
  assert.equal(yonUyumlu({ hukum: 'Dinlen', gerekce: 'Tam gaz' }, 0.55), true);
});

test('sayilarGirdiden: virgül/nokta, girdide olmayan sayı reddedilir, sayısız metin kabul', () => {
  const girdi = 'HRV: 55 ms; normal aralık 48–60. Solunum: 14.5 /dk. Enerji: 0.67 (0.00–1.00 ölçeği)';
  assert.equal(sayilarGirdiden('HRV değerin 55 ms, normal aralığın içinde.', girdi), true);
  assert.equal(sayilarGirdiden('Solunum 14,5, aralık 48-60.', girdi), true);
  assert.equal(sayilarGirdiden('Solunum 14.5 ve enerji 0,67.', girdi), true);
  assert.equal(sayilarGirdiden('HRV 56 ms.', girdi), false);
  assert.equal(sayilarGirdiden('Solunum 14,6.', girdi), false);
  assert.equal(sayilarGirdiden('Değerler dengeli, rahat bir gün.', girdi), true);
  assert.equal(sayilarGirdiden('HRV 55 ve uyku 80.', girdi), false);
  assert.equal(sayilarGirdiden('', girdi), true);
});

test('yorumGuncelle: yöne ters metin hata, kayıt yok; uyumlu metin yazılır', async () => {
  const k = kur(satirlar(DUSUK));
  assert.deepEqual(await calistir(k, { yaz: async () => ({ hukum: 'Tam gaz', gerekce: 'Rahat bir gün.' }) }), { durum: 'hata' });
  assert.equal(await durumOku(k.db, 'yorum'), null);
  assert.equal((await durumOku(k.db, 'yorum_hata')).n, 1);
  assert.deepEqual(await calistir(k, { yaz: async () => ({ ...HAFIF }) }), { durum: 'yazildi' });
  assert.deepEqual(await yorumOku(k.db, BUGUN, k.satir), HAFIF);
  // yüksek enerji, dinlenme hükmü
  const y = kur();
  assert.deepEqual(await calistir(y, { yaz: async () => ({ hukum: 'Dinlen', gerekce: 'Rahat bir gün.' }) }), { durum: 'hata' });
  assert.equal(await durumOku(y.db, 'yorum'), null);
});

test('yorumGuncelle: girdide olmayan sayı hata, kayıt yok', async () => {
  const k = kur();
  assert.deepEqual(await calistir(k, { yaz: async () => ({ hukum: 'İyi gidiyorsun', gerekce: 'HRV değerin 99 ms.' }) }), { durum: 'hata' });
  assert.equal(await durumOku(k.db, 'yorum'), null);
  assert.deepEqual(await calistir(k, { yaz: async () => ({ hukum: 'İyi gidiyorsun', gerekce: 'HRV değerin 55 ms.' }) }), { durum: 'yazildi' });
});

test('yorumOku: kayıtlı yön veya sayı uyumsuz kayıt döndürülmez', async () => {
  const k = kur();
  await calistir(k);
  const kayit = await durumOku(k.db, 'yorum');
  assert.deepEqual(await yorumOku(k.db, BUGUN, k.satir), GECERLI);
  await durumYaz(k.db, 'yorum', { ...kayit, hukum: 'Dinlen' });
  assert.equal(await yorumOku(k.db, BUGUN, k.satir), null);
  await durumYaz(k.db, 'yorum', { ...kayit, gerekce: 'HRV değerin 99 ms.' });
  assert.equal(await yorumOku(k.db, BUGUN, k.satir), null);
  await durumYaz(k.db, 'yorum', { ...kayit, gerekce: 'HRV değerin 55 ms.' });
  assert.deepEqual(await yorumOku(k.db, BUGUN, k.satir), { hukum: GECERLI.hukum, gerekce: 'HRV değerin 55 ms.' });
});

test('yorumGecerli: sıfır genişlikli/çift yönlü kontrol karakterleri ve emoji reddedilir', () => {
  const g = (gerekce) => yorumGecerli({ hukum: 'İyi', gerekce });
  for (const k of ['a\u200Bb', 'a\u200Fb', 'a\u202Ab', 'a\u202Eb', 'a\u2060b', 'a\u2069b', 'a\uFEFFb', 'a\u00ADb']) {
    assert.equal(g(k), null, JSON.stringify(k));
  }
  assert.equal(yorumGecerli({ hukum: 'İyi\u200B', gerekce: 'x' }), null);
  for (const k of ['iyi \u{1F600}', 'koş \u{1F3C3}', 'ok \u2705', 'güneş \u2600']) {
    assert.equal(g(k), null, JSON.stringify(k));
  }
  assert.equal(yorumGecerli({ hukum: '\u{1F525} İyi', gerekce: 'x' }), null);
  assert.deepEqual(g('Uykun iyi, HRV 55 (normal).'), { hukum: 'İyi', gerekce: 'Uykun iyi, HRV 55 (normal).' });
});

test('yorumGuncelle: istek sürerken ayar kapatılırsa hiçbir şey yazılmaz, kapali döner', async () => {
  const k = kur();
  const yaz = async (girdi) => { k.cagrilar.push(girdi); await yapayZekaYaz(k.db, false); return { ...GECERLI }; };
  assert.deepEqual(await calistir(k, { yaz }), { durum: 'kapali' });
  assert.equal(k.cagrilar.length, 1);
  assert.equal(await durumOku(k.db, 'yorum'), null);
  assert.equal(await yapayZekaAcik(k.db), false);
});

test('yorumGuncelle: sayaç yazımı başarısızsa yaz hiç çağrılmaz ve hata yayılır', async () => {
  const k = kur();
  const gercek = k.db.prepare.bind(k.db);
  const db = {
    ...k.db,
    prepare: (sql) => {
      const s = gercek(sql);
      return {
        bind: (...a) => {
          const b = s.bind(...a);
          return a[0] === 'yorum_sayac' && /INSERT/.test(sql) ? { ...b, run: async () => { throw new Error('d1 yazma hatası'); } } : b;
        },
      };
    },
  };
  await assert.rejects(() => calistir(k, { db }), /d1 yazma hatası/);
  assert.equal(k.cagrilar.length, 0);
  assert.equal(await durumOku(k.db, 'yorum'), null);
});
