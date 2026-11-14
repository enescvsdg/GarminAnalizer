import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { durumOku, durumYaz } from '../src/db.js';
import { gunEkle } from '../src/zaman.js';
import {
  SISTEM, SEMA, ozetGirdisi, yorumGecerli, yorumGuncelle, yorumOku, yapayZekaAcik, yapayZekaYaz,
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

test('yorumGuncelle: günde en çok 8 istek, sonra sinir ve 0 çağrı', async () => {
  const k = kur();
  for (let i = 0; i < 8; i += 1) {
    const r = await calistir(k, { satirlar: satirlar({ hrv_avg: 40 + i }) });
    assert.equal(r.durum, 'yazildi', `istek ${i + 1}`);
  }
  assert.equal(k.cagrilar.length, 8);
  assert.deepEqual(await calistir(k, { satirlar: satirlar({ hrv_avg: 99 }) }), { durum: 'sinir' });
  assert.equal(k.cagrilar.length, 8);
  // ertesi gün sayaç sıfırlanır
  const yarin = gunEkle(BUGUN, 1);
  const sat = satirlar().map((s) => s);
  sat.push({ ...sat.at(-1), date: yarin });
  const r = await yorumGuncelle({ db: k.db, satirlar: sat, bugun: yarin, simdiMs: SIMDI + 86400000, yaz: k.yaz });
  assert.equal(r.durum, 'yazildi');
  assert.equal(k.cagrilar.length, 9);
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

test('yapayZekaYaz(false) kayıtlı yorumu siler', async () => {
  const k = kur();
  await calistir(k);
  await yapayZekaYaz(k.db, false);
  assert.equal(await durumOku(k.db, 'yorum'), null);
  await yapayZekaYaz(k.db, true);
  assert.equal(await yorumOku(k.db, BUGUN, k.satir), null);
});
