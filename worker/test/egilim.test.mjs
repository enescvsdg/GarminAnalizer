import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { durumOku, durumYaz } from '../src/db.js';
import { gunEkle } from '../src/zaman.js';
import { GUNLUK_SINIR, yapayZekaYaz } from '../src/yorum/yorum.js';
import {
  EGILIM_SISTEM, EGILIM_SEMA, egilimOzeti, egilimGecerli, egilimGuncelle, egilimOku,
} from '../src/yorum/egilim.js';

const BUGUN = '2026-11-12';
const SIMDI = Date.UTC(2026, 10, 12, 9, 0);

// k = bugünden kaç gün önce. ek(k) bir günün alanlarını ezer.
function satirlar({ ek = () => ({}), gun = 40 } = {}) {
  const s = [];
  for (let k = gun; k >= 0; k -= 1) {
    s.push({
      date: gunEkle(BUGUN, -k),
      sleep_score: 75 + (k % 5), bb_high: 70 + (k % 4), hrv_avg: 50 + (k % 3), resting_hr: 52 + (k % 2),
      stress_avg: 30 + (k % 4), training_load: 80 + (k % 6), sleep_deep_s: 5400 + (k % 3) * 60,
      spo2_avg: 96 + (k % 2), resp_avg: 14 + (k % 2) * 0.5,
      raw_json: '{"gizli":1}',
      ...ek(k),
    });
  }
  return s;
}

const satir = (ozet, ad) => ozet.metin.split('\n').find((l) => l.includes(`${ad}:`));
const KIMLIKLER = ['uyku', 'bb', 'hrv', 'nabiz', 'stres', 'yuk', 'derin', 'spo2', 'solunum'];

test('egilimOzeti gizlilik: yıl, ISO tarih, gün/ay adı, gün gün dizi, ham alan yok', async () => {
  const o = await egilimOzeti(satirlar(), BUGUN);
  assert.ok(o);
  assert.ok(!/\b(19|20)\d\d\b/.test(o.metin), 'yıl');
  assert.ok(!/\d{2,4}-\d{2}/.test(o.metin), 'ISO parçası');
  assert.ok(!/\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(o.metin), 'tarih biçimi');
  const adlar = ['pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi', 'pazar',
    'ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
  for (const a of adlar) {
    // "aralık" ölçüm aralığı anlamında geçer ("normal aralık"); ay adı olarak yalnız büyük harfli ya da tarih bağlamında aranır
    if (a === 'aralık') continue;
    assert.ok(!new RegExp(`(^|[^\\p{L}])${a}($|[^\\p{L}])`, 'iu').test(o.metin), `ad: ${a}`);
  }
  assert.ok(!/(^|[^\p{L}])aralık\s+\d{1,2}(\s|$)/iu.test(o.metin.replace(/(normal|genel) aralık/g, '')), 'Aralık ayı');
  for (const satirMetni of o.metin.split('\n')) {
    assert.ok(!/(?:\d+(?:[.,]\d+)?[,\s]+){6,}\d/.test(satirMetni), `sayı dizisi: ${satirMetni}`);
  }
  for (const yasak of ['raw', 'gizli', '@', 'http', '<', '>']) assert.ok(!o.metin.includes(yasak), yasak);
  // 28 günlük satır sayısı kadar değer yok: satır başına en çok 14 sayı
  for (const l of o.metin.split('\n')) assert.ok((l.match(/\d+(?:[.,]\d+)?/g) ?? []).length <= 14, l);
});

test('egilimOzeti: dokuz ölçüm satırı, kimlikler, alanlar', async () => {
  const o = await egilimOzeti(satirlar(), BUGUN);
  assert.deepEqual(o.olcumler, KIMLIKLER);
  assert.match(o.karma, /^[0-9a-f]{16}$/);
  for (const id of KIMLIKLER) assert.equal(o.metin.split('\n').filter((l) => l.startsWith(`[${id}] `)).length, 1, id);
  const uyku = satir(o, 'Uyku');
  assert.match(uyku, /28 günde 28 gün veri/);
  assert.match(uyku, /ortalama \d+(\.\d)?/);
  assert.match(uyku, /normal aralık \d+(\.\d)?–\d+(\.\d)?/);
  assert.match(uyku, /\d+ gün altında, \d+ gün üstünde/);
  assert.match(uyku, /son 7 gün ortalaması \d+(\.\d)?, önceki 21 gün \d+(\.\d)?, (yükseldi|düştü|aynı)/);
  assert.match(uyku, /yüksek değer iyi/);
  assert.match(satir(o, 'Stres'), /düşük değer iyi/);
  assert.ok(!/NaN|undefined|null/.test(o.metin));
});

test('egilimOzeti: yetersiz geçmişte genel aralık', async () => {
  // 12 günlük veri: bant kişisel değil, 10 gün eşiği geçilir
  const o = await egilimOzeti(satirlar({ gun: 12 }), BUGUN);
  assert.match(satir(o, 'Uyku'), /genel aralık 70–85/);
  assert.ok(!o.metin.includes('normal aralık'));
});

test('egilimOzeti: son 7 / önceki 21 yönü ve %10 eşiği', async () => {
  // HRV bandı sabit veriyle: sigma tabanı 3, bant genişliği 9 (medyan ± 4.5); eşik 0.9
  const sabit = (k) => ({ hrv_avg: 50 });
  const yon = async (son) => {
    const o = await egilimOzeti(satirlar({ ek: (k) => ({ hrv_avg: k <= 6 ? son : 50 }) }), BUGUN);
    return satir(o, 'HRV');
  };
  assert.match(await yon(56), /son 7 gün ortalaması 56, önceki 21 gün 50, yükseldi/);
  assert.match(await yon(44), /son 7 gün ortalaması 44, önceki 21 gün 50, düştü/);
  assert.match(await yon(50.5), /aynı/);
  assert.match(await yon(49.2), /aynı/); // 0.8 < 0.9
  assert.match(await yon(51), /yükseldi/); // 1 >= 0.9
  assert.match(await yon(49), /düştü/);
  void sabit;
});

test('egilimOzeti: aralık dışı gün sayıları altında/üstünde ayrı', async () => {
  const o = await egilimOzeti(satirlar({ ek: (k) => ({ hrv_avg: k === 10 || k === 11 ? 20 : k === 3 ? 90 : 50 }) }), BUGUN);
  assert.match(satir(o, 'HRV'), /2 gün altında, 1 gün üstünde/);
});

test('egilimOzeti: "yuk" dünkü yükü gunDegerleri gibi okur', async () => {
  // yalnız bugünün satırında yük 500; bugünün "yuk" değeri DÜNKÜ satırdan gelir, ortalama bunu görmemeli bugünde
  const a = await egilimOzeti(satirlar({ ek: (k) => (k === 0 ? { training_load: 500 } : {}) }), BUGUN);
  const b = await egilimOzeti(satirlar(), BUGUN);
  // bugünün yükü yalnız yarının "dünkü yük" değeri olur; bugün için görünmez
  assert.equal(satir(a, 'Dünkü yük'), satir(b, 'Dünkü yük'));
  // dünün (k=1) yükü değişince bugünün "yuk" değeri değişir
  const c = await egilimOzeti(satirlar({ ek: (k) => (k === 1 ? { training_load: 500 } : {}) }), BUGUN);
  assert.notEqual(satir(c, 'Dünkü yük'), satir(b, 'Dünkü yük'));
});

test('egilimOzeti: 10 günden az verili ölçüm girmez; hepsi azsa null', async () => {
  const az = await egilimOzeti(satirlar({ ek: (k) => (k >= 9 ? { spo2_avg: null } : {}) }), BUGUN);
  assert.ok(!az.olcumler.includes('spo2'));
  assert.ok(!az.metin.includes('SpO₂'));
  assert.equal(az.olcumler.length, 8);
  const tam = await egilimOzeti(satirlar({ ek: (k) => (k >= 10 ? { spo2_avg: null } : {}) }), BUGUN);
  assert.ok(tam.olcumler.includes('spo2')); // tam 10 gün girer
  assert.equal(await egilimOzeti(satirlar({ gun: 8 }), BUGUN), null);
  assert.equal(await egilimOzeti([], BUGUN), null);
});

test('egilimOzeti: pencerelerden biri 3 değerden azsa yön cümlesi yok, satırın gerisi var', async () => {
  // son 7 günde HRV yalnız 2 gün dolu
  const o = await egilimOzeti(satirlar({ ek: (k) => (k <= 4 ? { hrv_avg: null } : {}) }), BUGUN);
  const hrv = satir(o, 'HRV');
  assert.ok(hrv);
  assert.ok(!/son 7 gün|önceki 21|yükseldi|düştü|aynı/.test(hrv));
  assert.match(hrv, /ortalama/);
  assert.match(hrv, /normal aralık/);
  assert.match(hrv, /yüksek değer iyi/);
  // tam 3 değer varsa yön gelir
  const uc = await egilimOzeti(satirlar({ ek: (k) => (k <= 3 ? { hrv_avg: null } : {}) }), BUGUN);
  assert.match(satir(uc, 'HRV'), /son 7 gün ortalaması/);
  // önceki 21 günde 2 değer
  const on = await egilimOzeti(satirlar({ ek: (k) => (k >= 7 && k <= 27 && k < 26 ? { hrv_avg: null } : {}) }), BUGUN);
  assert.ok(!/önceki 21/.test(satir(on, 'HRV')));
});

test('egilimOzeti: aynı veri aynı karma; bir değer değişince farklı; ham alan etkilemez', async () => {
  const a = await egilimOzeti(satirlar(), BUGUN);
  const b = await egilimOzeti(satirlar(), BUGUN);
  assert.equal(a.karma, b.karma);
  assert.equal(a.metin, b.metin);
  const c = await egilimOzeti(satirlar({ ek: (k) => (k === 2 ? { hrv_avg: 60 } : {}) }), BUGUN);
  assert.notEqual(a.karma, c.karma);
  const d = await egilimOzeti(satirlar({ ek: () => ({ raw_json: 'x', steps: 5 }) }), BUGUN);
  assert.equal(a.karma, d.karma);
});

test('EGILIM_SISTEM ve EGILIM_SEMA', () => {
  assert.match(EGILIM_SISTEM, /sen/);
  assert.match(EGILIM_SISTEM, /200 karakter/);
  assert.deepEqual(EGILIM_SEMA, {
    type: 'object',
    properties: { yorumlar: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, metin: { type: 'string' } }, required: ['id', 'metin'] } } },
    required: ['yorumlar'],
  });
});

async function ozetKur() {
  return egilimOzeti(satirlar(), BUGUN);
}
const hamKur = (...c) => ({ yorumlar: c.map(([id, metin]) => ({ id, metin })) });

test('egilimGecerli: geçerli kalır; bilinmeyen id, tekrar, uzun, boş, yasak karakter atılır', async () => {
  const o = await ozetKur();
  const g = egilimGecerli(hamKur(
    ['uyku', 'Uykun bu hafta normal aralıkta seyretti.'],
    ['yok', 'Bilinmeyen kimlik.'],
    ['uyku', 'İkinci uyku yorumu.'],
    ['hrv', 'a'.repeat(241)],
    ['bb', '   '],
    ['stres', 'Stres <b>yüksek</b>.'],
    ['nabiz', 'Bak http://x.'],
    ['yuk', 'Yük  dengeli   görünüyor.'],
  ), o);
  assert.deepEqual(g, { uyku: 'Uykun bu hafta normal aralıkta seyretti.', yuk: 'Yük dengeli görünüyor.' });
  assert.ok(egilimGecerli(hamKur(['hrv', 'a'.repeat(240)]), o).hrv);
});

test('egilimGecerli: girdide olmayan sayı atılır, girdideki sayı kalır', async () => {
  const o = await ozetKur();
  const uykuOrt = /ortalama (\d+(?:\.\d)?)/.exec(satir(o, 'Uyku'))[1];
  const g = egilimGecerli(hamKur(
    ['uyku', `Ortalaman ${uykuOrt}, son 7 günde biraz değişti.`],
    ['hrv', 'HRV 973 oldu.'],
  ), o);
  assert.deepEqual(Object.keys(g), ['uyku']);
});

test('egilimGecerli: yasak kelimeler (Türkçe büyük/küçük harf) atılır; "tanım" atılmaz', async () => {
  const o = await ozetKur();
  const reddedilen = ['Bu bir teşhis gibi.', 'TEŞHİS koy.', 'İlaç kullan.', 'İLAÇ al.', 'Hastalık belirtisi.', 'HASTALIK var.', 'Tedavi gerek.',
    'Doktora danış.', 'DOKTOR gör.', 'Hekime git.', 'Kanser riski.', 'Enfeksiyon olabilir.', 'Bu bir tanı değil.', 'TANI koyma.', 'Tanı, sonuç.', 'Bir tanı.'];
  for (const m of reddedilen) assert.deepEqual(egilimGecerli(hamKur(['uyku', m]), o), {}, m);
  const kabul = egilimGecerli(hamKur(['uyku', 'Tanım gereği normal; tanıdık bir düzen.']), o);
  assert.deepEqual(Object.keys(kabul), ['uyku']);
});

test('egilimGecerli: bozuk biçimler {} döndürür', async () => {
  const o = await ozetKur();
  for (const ham of [null, undefined, 'x', 5, [], {}, { yorumlar: 'x' }, { yorumlar: [null, 1, 'a', { id: 5, metin: 'x' }, { id: 'uyku' }, { id: 'uyku', metin: 7 }] }]) {
    assert.deepEqual(egilimGecerli(ham, o), {});
  }
});

function kur(satir = satirlar()) {
  const db = testD1();
  const cagrilar = [];
  const yaz = async (girdi) => { cagrilar.push(girdi); return hamKur(['uyku', 'Uykun dengeli seyrediyor.'], ['hrv', 'HRV sabit.']); };
  return { db, cagrilar, yaz, satir };
}
const calistir = (k, ek = {}) => egilimGuncelle({ db: k.db, satirlar: k.satir, bugun: BUGUN, simdiMs: SIMDI, yaz: k.yaz, ...ek });
const degisik = (n) => satirlar({ ek: (k) => (k === 0 ? { hrv_avg: 40 + n } : {}) });

test('egilimGuncelle: yazildi, kayıt biçimi, tek çağrı, girdi metni verilir', async () => {
  const k = kur();
  assert.deepEqual(await calistir(k), { durum: 'yazildi' });
  assert.equal(k.cagrilar.length, 1);
  const o = await egilimOzeti(k.satir, BUGUN);
  assert.equal(k.cagrilar[0], o.metin);
  const kayit = await durumOku(k.db, 'egilim');
  assert.equal(kayit.tarih, BUGUN);
  assert.equal(kayit.karma, o.karma);
  assert.deepEqual(kayit.yorumlar, { uyku: 'Uykun dengeli seyrediyor.', hrv: 'HRV sabit.' });
  assert.equal(kayit.uretildi, SIMDI);
  assert.deepEqual(await durumOku(k.db, 'yorum_sayac'), { tarih: BUGUN, n: 1 });
  assert.deepEqual(await durumOku(k.db, 'egilim_gun'), { tarih: BUGUN, n: 1 });
});

test('egilimGuncelle: aynı tarih ve karma ise ayni, 0 çağrı', async () => {
  const k = kur();
  await calistir(k);
  assert.deepEqual(await calistir(k), { durum: 'ayni' });
  assert.equal(k.cagrilar.length, 1);
  assert.deepEqual(await durumOku(k.db, 'yorum_sayac'), { tarih: BUGUN, n: 1 });
});

test('egilimGuncelle: kapali (0 çağrı), açılınca yazılır', async () => {
  const k = kur();
  await yapayZekaYaz(k.db, false);
  assert.deepEqual(await calistir(k), { durum: 'kapali' });
  assert.equal(k.cagrilar.length, 0);
  assert.equal(await durumOku(k.db, 'yorum_sayac'), null);
  await yapayZekaYaz(k.db, true);
  assert.deepEqual(await calistir(k), { durum: 'yazildi' });
  assert.equal(k.cagrilar.length, 1);
});

test('egilimGuncelle: veri-yok, 0 çağrı', async () => {
  const k = kur([{ date: BUGUN, sleep_score: 80 }]);
  assert.deepEqual(await calistir(k), { durum: 'veri-yok' });
  assert.equal(k.cagrilar.length, 0);
  assert.equal(await durumOku(k.db, 'egilim'), null);
});

test('egilimGuncelle: hata (null, fırlatma, hepsi geçersiz) sayılır; 2 hatadan sonra istek yok; veri değişince yeniden', async () => {
  for (const kotu of [async () => null, async () => { throw new Error('x'); }, async () => hamKur(['uyku', 'İlaç kullan.'])]) {
    const k = kur();
    let n = 0;
    const yaz = async (g) => { n += 1; return kotu(g); };
    assert.deepEqual(await calistir(k, { yaz }), { durum: 'hata' });
    assert.deepEqual(await calistir(k, { yaz }), { durum: 'hata' });
    assert.equal(n, 2);
    assert.deepEqual(await calistir(k, { yaz }), { durum: 'hata' });
    assert.equal(n, 2);
    assert.equal(await durumOku(k.db, 'egilim'), null);
    assert.equal((await durumOku(k.db, 'egilim_hata')).n, 2);
    assert.deepEqual(await calistir(k, { yaz: k.yaz, satirlar: degisik(7) }), { durum: 'yazildi' });
  }
});

test('egilimGuncelle günlük sayaç yorumGuncelle ile ortaktır', async () => {
  const k = kur();
  await durumYaz(k.db, 'yorum_sayac', { tarih: BUGUN, n: GUNLUK_SINIR });
  assert.deepEqual(await calistir(k), { durum: 'sinir' });
  assert.equal(k.cagrilar.length, 0);
  // bir eksik: izin verilir ve sayaç 24'e çıkar (istekten önce)
  await durumYaz(k.db, 'yorum_sayac', { tarih: BUGUN, n: GUNLUK_SINIR - 1 });
  assert.deepEqual(await calistir(k), { durum: 'yazildi' });
  assert.deepEqual(await durumOku(k.db, 'yorum_sayac'), { tarih: BUGUN, n: GUNLUK_SINIR });
  // dünün sayacı bugünü etkilemez
  const k2 = kur();
  await durumYaz(k2.db, 'yorum_sayac', { tarih: gunEkle(BUGUN, -1), n: GUNLUK_SINIR });
  assert.deepEqual(await calistir(k2), { durum: 'yazildi' });
  assert.deepEqual(await durumOku(k2.db, 'yorum_sayac'), { tarih: BUGUN, n: 1 });
});

test('egilimGuncelle: istek hatalı olsa da sayaç istekten ÖNCE artmıştır', async () => {
  const k = kur();
  await calistir(k, { yaz: async () => null });
  assert.deepEqual(await durumOku(k.db, 'yorum_sayac'), { tarih: BUGUN, n: 1 });
  assert.equal(await durumOku(k.db, 'egilim_gun'), null); // başarısız yazım sayılmaz
});

test('egilimGuncelle günde en çok 2 başarılı yazım; ertesi gün yeniden', async () => {
  const k = kur();
  assert.deepEqual(await calistir(k, { satirlar: degisik(1) }), { durum: 'yazildi' });
  assert.deepEqual(await calistir(k, { satirlar: degisik(2) }), { durum: 'yazildi' });
  assert.deepEqual(await calistir(k, { satirlar: degisik(3) }), { durum: 'sinir' });
  assert.equal(k.cagrilar.length, 2);
  assert.deepEqual(await durumOku(k.db, 'egilim_gun'), { tarih: BUGUN, n: 2 });
  assert.deepEqual(await durumOku(k.db, 'yorum_sayac'), { tarih: BUGUN, n: 2 });
  // ertesi gün
  const yarin = gunEkle(BUGUN, 1);
  const s = satirlar().map((r) => ({ ...r, date: gunEkle(r.date, 1) }));
  assert.deepEqual(await egilimGuncelle({ db: k.db, satirlar: s, bugun: yarin, simdiMs: SIMDI + 864e5, yaz: k.yaz }), { durum: 'yazildi' });
  assert.equal(k.cagrilar.length, 3);
});

test('egilimGuncelle: istek sürerken ayar kapatılırsa kapali ve yazılmaz', async () => {
  const k = kur();
  const yaz = async () => { await yapayZekaYaz(k.db, false); return hamKur(['uyku', 'Uykun dengeli.']); };
  assert.deepEqual(await calistir(k, { yaz }), { durum: 'kapali' });
  assert.equal(await durumOku(k.db, 'egilim'), null);
  assert.equal(await durumOku(k.db, 'egilim_gun'), null);
});

test('egilimOku: kayıt yok null; bugünkü kayıt döner (karma değişse de); dünkü null; kapalıyken null', async () => {
  const k = kur();
  assert.equal(await egilimOku(k.db, BUGUN, k.satir), null);
  await calistir(k);
  const beklenen = { uyku: 'Uykun dengeli seyrediyor.', hrv: 'HRV sabit.' };
  assert.deepEqual(await egilimOku(k.db, BUGUN, k.satir), beklenen);
  // karma gün içinde kaydı: bugünün yorumu yine gösterilir
  const kayma = degisik(5);
  assert.notEqual((await egilimOzeti(kayma, BUGUN)).karma, (await durumOku(k.db, 'egilim')).karma);
  assert.deepEqual(await egilimOku(k.db, BUGUN, kayma), beklenen);
  // ertesi gün: dünkü kayıt gösterilmez
  const yarin = gunEkle(BUGUN, 1);
  const s = satirlar().map((r) => ({ ...r, date: gunEkle(r.date, 1) }));
  assert.equal(await egilimOku(k.db, yarin, s), null);
  // veri tamamen yoksa null
  assert.equal(await egilimOku(k.db, BUGUN, []), null);
  // kapalı
  await yapayZekaYaz(k.db, false);
  assert.equal(await egilimOku(k.db, BUGUN, k.satir), null);
  await yapayZekaYaz(k.db, true);
  assert.deepEqual(await egilimOku(k.db, BUGUN, k.satir), beklenen);
});

test('egilimOku: kayıt yeniden doğrulanır (bozuk ya da yasak metin elenir)', async () => {
  const k = kur();
  await calistir(k);
  const kayit = await durumOku(k.db, 'egilim');
  await durumYaz(k.db, 'egilim', { ...kayit, yorumlar: { uyku: 'Doktora danış.', hrv: 'HRV sabit.', yok: 'x', bb: 5 } });
  assert.deepEqual(await egilimOku(k.db, BUGUN, k.satir), { hrv: 'HRV sabit.' });
  await durumYaz(k.db, 'egilim', { ...kayit, yorumlar: { uyku: 'Doktora danış.' } });
  assert.equal(await egilimOku(k.db, BUGUN, k.satir), null);
  await durumYaz(k.db, 'egilim', 'bozuk');
  assert.equal(await egilimOku(k.db, BUGUN, k.satir), null);
});

test('egilimOku: karma kayarken saklanan girdi değiştirilmişse sayı doğrulaması atlanamaz', async () => {
  const k = kur();
  await calistir(k);
  const kayit = await durumOku(k.db, 'egilim');
  await durumYaz(k.db, 'egilim', { ...kayit, metin: `${kayit.metin} 973`, yorumlar: { uyku: 'Uykun 973 oldu.' } });
  assert.equal(await egilimOku(k.db, BUGUN, degisik(5)), null);
});

test('eşzamanlı eğilim istekleri ortak günlük sınırı aşamaz', async () => {
  const k = kur();
  await durumYaz(k.db, 'yorum_sayac', { tarih: BUGUN, n: GUNLUK_SINIR - 1 });
  let okuma = 0;
  let devam;
  const bekle = new Promise((resolve) => { devam = resolve; });
  const db = { ...k.db, prepare(sql) {
    const stmt = k.db.prepare(sql);
    if (!sql.startsWith('SELECT value FROM sync_state')) return stmt;
    return { ...stmt, bind(key) {
      const bound = stmt.bind(key);
      if (key !== 'egilim') return bound;
      return { ...bound, async first() {
        const value = await bound.first();
        if (++okuma === 2) devam();
        await bekle;
        return value;
      } };
    } };
  } };
  const sonuc = await Promise.all([calistir(k, { db }), calistir(k, { db })]);
  assert.deepEqual(sonuc.map((x) => x.durum).sort(), ['sinir', 'yazildi']);
  assert.equal(k.cagrilar.length, 1);
});

test('eşzamanlı başarılı eğilimler günlük iki yazım sınırını aşamaz', async () => {
  const k = kur();
  await durumYaz(k.db, 'egilim_gun', { tarih: BUGUN, n: 1 });
  let cagri = 0;
  let devam;
  const bekle = new Promise((resolve) => { devam = resolve; });
  const yaz = async () => {
    if (++cagri === 2) devam();
    await bekle;
    return hamKur(['uyku', 'Uykun dengeli.']);
  };
  const sonuc = await Promise.all([calistir(k, { yaz }), calistir(k, { yaz })]);
  assert.deepEqual(sonuc.map((x) => x.durum).sort(), ['sinir', 'yazildi']);
  assert.deepEqual(await durumOku(k.db, 'egilim_gun'), { tarih: BUGUN, n: 2 });
});

test('egilimGecerli: başka ölçümün sayısı bu ölçümün yorumu için izinli değildir', async () => {
  const o = await ozetKur();
  const uyku = satir(o, 'Uyku');
  const hrv = satir(o, 'HRV');
  const sayilar = (s) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const diger = sayilar(hrv).find((s) => !sayilar(uyku).includes(s));
  assert.ok(diger);
  assert.deepEqual(egilimGecerli(hamKur(['uyku', `Uykun ${diger} oldu.`]), o), {});
});

test('gecikmiş eski gün isteği yeni günün ortak sayacını geriye almaz', async () => {
  const k = kur();
  const yarin = gunEkle(BUGUN, 1);
  await durumYaz(k.db, 'yorum_sayac', { tarih: yarin, n: 4 });
  assert.deepEqual(await calistir(k), { durum: 'sinir' });
  assert.deepEqual(await durumOku(k.db, 'yorum_sayac'), { tarih: yarin, n: 4 });
  assert.equal(k.cagrilar.length, 0);
});

test('eski günün geç biten üretimi yeni günün eğilim kaydını ve sayacını ezmez', async () => {
  const k = kur();
  let baslat;
  let birak;
  const basladi = new Promise((resolve) => { baslat = resolve; });
  const bekle = new Promise((resolve) => { birak = resolve; });
  const gec = calistir(k, { yaz: async () => { baslat(); await bekle; return hamKur(['uyku', 'Eski yorum.']); } });
  await basladi;
  const yarin = gunEkle(BUGUN, 1);
  const yeni = { tarih: yarin, karma: 'yeni', yorumlar: { uyku: 'Yeni yorum.' } };
  await durumYaz(k.db, 'egilim_gun', { tarih: yarin, n: 1 });
  await durumYaz(k.db, 'egilim', yeni);
  birak();
  assert.deepEqual(await gec, { durum: 'sinir' });
  assert.deepEqual(await durumOku(k.db, 'egilim_gun'), { tarih: yarin, n: 1 });
  assert.deepEqual(await durumOku(k.db, 'egilim'), yeni);
});
