import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiYaniti } from '../worker/src/stats/ozet.js';
import { gunEkle } from '../worker/src/zaman.js';
import {
  veriCevir, durum, veriGetir, ayarGetir, ayarYaz, baglantiOku, baglantiYaz, baglantiSil,
  sureMetni, sonEsitlemeMetni, eskilikSaat, ekSatiri, baglantiKarar,
  veriYukle, sonVeriYaz, sonVeriOku, sonVeriSil,
} from './veri-canli.js';

const BUGUN = '2026-11-12';
const ANAHTAR = 'cok-gizli-anahtar-123';

// Gerçek apiYaniti için GunSatiri üretir: 40 gün geriye, dolu günler.
function satirlar(adet = 40, ozel = {}) {
  const r = [];
  for (let i = adet - 1; i >= 0; i -= 1) {
    const date = gunEkle(BUGUN, -i);
    r.push({
      date, sleep_score: 80, bb_high: 75, hrv_avg: 55, resting_hr: 52, stress_avg: 30,
      training_load: 60, sleep_deep_s: 4230, sleep_light_s: 14000, sleep_rem_s: 6000, sleep_awake_s: 900,
      sleep_need_min: 490, bb_charged: 62, bb_drained: 64, stress_rest_s: 18000, stress_low_s: 9000,
      stress_med_s: 3000, stress_high_s: 600, hrv_weekly_avg: 53, hrv_status: 'BALANCED',
      spo2_avg: 96, resp_avg: 14, ...(ozel[date] ?? {}),
    });
  }
  return r;
}
const yanit = (rows = satirlar(), meta = { sonEsitleme: 1763000000000, keyDurum: 'gecerli' }) =>
  apiYaniti(rows, BUGUN, 28, meta);

function sahteDepo(baslangic = {}) {
  const m = new Map(Object.entries(baslangic));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
}
const yanitCevir = (govde, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => govde });

test('veriCevir 28 günü VERI biçimine çevirir', () => {
  const v = veriCevir(yanit());
  assert.equal(v.GUNLER.length, 28);
  assert.equal(v.OLCUMLER.length, 9);
  const son = v.GUNLER[27];
  assert.ok(son.tarih instanceof Date);
  assert.equal(son.gunKisa, 'Per');
  assert.equal(son.gunUzun, 'Perşembe');
  assert.equal(son.gun, 12);
  assert.equal(son.ay, 'Kasım');
  assert.equal(typeof son.hukum, 'string');
  assert.equal(typeof son.gerekce, 'string');
  assert.deepEqual(v.meta, { sonEsitleme: 1763000000000, keyDurum: 'gecerli', yorumKaynak: 'sablon', egilim: {} });
  assert.equal(typeof v.OK.lo, 'string');
  assert.deepEqual(v.DURUM_METIN, { lo: 'altında', hi: 'üstünde', ok: 'normalde' });
});

test('meta.egilim yalnız dokuz ölçüm kimliğinin dizgi yorumlarını taşır', () => {
  const api = yanit();
  api.egilim = {
    uyku: 'Uyku yorumudur.', bb: 7, hrv: null, nabiz: 'Nabız yorumu.',
    stres: 'Stres yorumu.', yuk: 'Yük yorumu.', derin: 'Derin uyku yorumu.',
    spo2: 'SpO₂ yorumu.', solunum: 'Solunum yorumu.', garip: 'aktarılmamalı', constructor: 'aktarılmamalı',
  };
  assert.deepEqual(veriCevir(api).meta.egilim, {
    uyku: 'Uyku yorumudur.', nabiz: 'Nabız yorumu.', stres: 'Stres yorumu.', yuk: 'Yük yorumu.',
    derin: 'Derin uyku yorumu.', spo2: 'SpO₂ yorumu.', solunum: 'Solunum yorumu.',
  });
});

test('eski, null, dizi ve bozuk eğilim alanları güvenle boş nesne olur', () => {
  for (const deger of [undefined, null, [], 'bozuk', 12]) {
    const api = yanit();
    if (deger !== undefined) api.egilim = deger;
    assert.deepEqual(veriCevir(api).meta.egilim, {});
  }
});

test('OLCUMLER alanları ve min/max API bandından gelir', () => {
  const api = yanit();
  const v = veriCevir(api);
  const u = v.OLCUMLER.find((o) => o.id === 'uyku');
  const a = api.olcumler.find((o) => o.id === 'uyku');
  assert.deepEqual(Object.keys(u).sort(), ['ad', 'birim', 'id', 'iyi', 'kart', 'kisisel', 'max', 'min']);
  assert.equal(u.min, a.min);
  assert.equal(u.max, a.max);
  assert.equal(u.iyi, 1);
  assert.equal(u.kisisel, true);
});

test('tarih yerel gün: saat 00:00, gün kayması yok', () => {
  const v = veriCevir(yanit());
  v.GUNLER.forEach((g, i) => {
    const beklenen = gunEkle(BUGUN, -(27 - i));
    const [y, m, d] = beklenen.split('-').map(Number);
    assert.equal(g.tarih.getFullYear(), y);
    assert.equal(g.tarih.getMonth(), m - 1);
    assert.equal(g.tarih.getDate(), d);
    assert.equal(g.tarih.getHours(), 0);
    assert.equal(g.tarih.getMinutes(), 0);
  });
});

test('kart bayrağı ve ek alanı aktarılır', () => {
  const v = veriCevir(yanit());
  assert.equal(v.OLCUMLER.filter((o) => o.kart).length, 6);
  assert.deepEqual(v.OLCUMLER.filter((o) => !o.kart).map((o) => o.id), ['derin', 'spo2', 'solunum']);
  const ek = v.GUNLER[27].ek;
  assert.equal(ek.uyku.derin, 71);
  assert.equal(ek.uyku.ihtiyac, 490);
  assert.equal(ek.bb.dolan, 62);
  assert.equal(ek.stres.yuksek, 10);
  assert.equal(ek.hrv.haftalik, 53);
  assert.equal(typeof v.GUNLER[27].d.derin, 'number');
});

test('null değerler null kalır, durum null döner', () => {
  const rows = satirlar(40, { [BUGUN]: { sleep_score: null, spo2_avg: null } });
  const v = veriCevir(yanit(rows));
  const son = v.GUNLER[27];
  assert.equal(son.d.uyku, null);
  assert.equal(son.d.spo2, null);
  const o = v.OLCUMLER.find((x) => x.id === 'uyku');
  assert.equal(v.durum(o, son.d.uyku), null);
  assert.equal(v.durum(o, undefined), null);
  assert.equal(v.durum(o, NaN), null);
});

test('e null ise 0.5 ve veriYok true; dolu günde veriYok false', () => {
  const bos = { sleep_score: null, bb_high: null, hrv_avg: null, resting_hr: null, stress_avg: null, training_load: null };
  const v = veriCevir(yanit(satirlar(40, { [BUGUN]: bos })));
  const son = v.GUNLER[27];
  assert.equal(son.e, 0.5);
  assert.equal(son.veriYok, true);
  assert.equal(son.hukum, 'Bugün için yeterli veri yok.');
  assert.equal(v.GUNLER[26].veriYok, false);
  assert.ok(Number.isFinite(v.GUNLER[26].e));
});

test('saat takılmayan gün: ek alanları null kalır, çökme yok', () => {
  const rows = satirlar(40).filter((r) => r.date !== BUGUN);
  const v = veriCevir(yanit(rows));
  const son = v.GUNLER[27];
  assert.equal(son.veriYok, true);
  assert.equal(son.ek.uyku.derin, null);
  assert.equal(ekSatiri('uyku', son.ek), null);
  assert.equal(ekSatiri('bb', son.ek), null);
  assert.equal(ekSatiri('stres', son.ek), null);
  assert.equal(ekSatiri('hrv', son.ek), null);
});

test('çıktıda NaN, undefined ve boş durumda 0 yok', () => {
  const rows = satirlar(14); // az veri: varsayılan bantlar, eski günler boş
  const v = veriCevir(yanit(rows));
  v.GUNLER.forEach((g) => {
    for (const k in g.d) assert.ok(g.d[k] === null || Number.isFinite(g.d[k]), `${g.gun}/${k}`);
    assert.ok(Number.isFinite(g.e));
  });
  const eski = v.GUNLER[0];
  assert.equal(eski.veriYok, true);
  for (const k in eski.d) assert.equal(eski.d[k], null);
  v.OLCUMLER.forEach((o) => { assert.ok(Number.isFinite(o.min)); assert.ok(Number.isFinite(o.max)); assert.equal(o.kisisel, false); });
});

test('bozuk yanıt veriCevir içinde TypeError fırlatır', () => {
  assert.throws(() => veriCevir(null), TypeError);
  assert.throws(() => veriCevir({}), TypeError);
  assert.throws(() => veriCevir({ olcumler: [], gunler: [] }), TypeError);
  const k = yanit();
  k.gunler[3].tarih = '2026-13-45';
  assert.throws(() => veriCevir(k), TypeError);
  const b = yanit();
  b.olcumler[0].min = null;
  assert.throws(() => veriCevir(b), TypeError);
});

test('durum bant sınırlarını kullanır', () => {
  const o = { min: 70, max: 85 };
  assert.equal(durum(o, 69), 'lo');
  assert.equal(durum(o, 70), 'ok');
  assert.equal(durum(o, 85), 'ok');
  assert.equal(durum(o, 86), 'hi');
  assert.equal(durum(o, 0), 'lo'); // gerçek sıfır veri yok değildir
  assert.equal(durum(o, null), null);
  assert.equal(durum(o, undefined), null);
  assert.equal(durum(o, NaN), null);
});

test('veriGetir bağlantı yoksa null ve fetch çağrılmaz', async () => {
  let cagri = 0;
  const f = async () => { cagri += 1; return yanitCevir(yanit()); };
  assert.equal(await veriGetir(f, sahteDepo()), null);
  assert.equal(await veriGetir(f, undefined), null);
  assert.equal(cagri, 0);
});

test('veriGetir 401de null döner ve fırlatmaz', async () => {
  const depo = sahteDepo();
  baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: ANAHTAR }, depo);
  assert.equal(await veriGetir(async () => yanitCevir({ hata: 'yetkisiz' }, 401), depo), null);
  assert.equal(await veriGetir(async () => yanitCevir(yanit(), 500), depo), null);
});

test('veriGetir X-Device-Key başlığını gönderir, anahtarı URLye koymaz', async () => {
  const depo = sahteDepo();
  baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: ANAHTAR }, depo);
  const cagrilar = [];
  const f = async (url, init) => { cagrilar.push({ url: String(url), init }); return yanitCevir(yanit()); };
  const v = await veriGetir(f, depo);
  assert.equal(v.GUNLER.length, 28);
  assert.equal(cagrilar.length, 1);
  assert.equal(cagrilar[0].url, 'https://w.ornek.dev/api/gunler?gun=28');
  assert.equal(cagrilar[0].init.headers['X-Device-Key'], ANAHTAR);
  assert.equal(cagrilar[0].init.method, 'GET');
  assert.ok(!cagrilar[0].url.includes(ANAHTAR));
});

test('veriGetir bozuk JSON ve bozuk yanıt biçiminde null döner', async () => {
  const depo = sahteDepo();
  baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: ANAHTAR }, depo);
  const bozukJson = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } });
  assert.equal(await veriGetir(bozukJson, depo), null);
  assert.equal(await veriGetir(async () => yanitCevir({ olcumler: 'x' }), depo), null);
  assert.equal(await veriGetir(async () => yanitCevir(null), depo), null);
});

test('veriGetir ağ hatasında (fetch fırlatır) null döner, anahtar hata iletisine sızmaz', async () => {
  const depo = sahteDepo();
  baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: ANAHTAR }, depo);
  const f = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await veriGetir(f, depo), null);
  const eski = console.error; const eskiLog = console.log; const eskiWarn = console.warn;
  const yakalanan = [];
  console.error = console.log = console.warn = (...a) => yakalanan.push(a.join(' '));
  try { await veriGetir(f, depo); } finally { console.error = eski; console.log = eskiLog; console.warn = eskiWarn; }
  assert.equal(yakalanan.join('').includes(ANAHTAR), false);
});

test('veriGetir zaman aşımında null döner (fetch hiç cevap vermezse)', async () => {
  const depo = sahteDepo();
  baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: ANAHTAR }, depo);
  let iptal = false;
  const f = (url, init) => new Promise((_, red) => {
    init.signal?.addEventListener('abort', () => { iptal = true; red(new Error('abort')); });
  });
  const t0 = Date.now();
  assert.equal(await veriGetir(f, depo, { zamanAsimiMs: 30 }), null);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(iptal, true);
});

test('adres sonundaki / kırpılır', async () => {
  const depo = sahteDepo({ 'gk-baglanti': JSON.stringify({ adres: 'https://w.ornek.dev//', anahtar: ANAHTAR }) });
  let url = '';
  await veriGetir(async (u) => { url = String(u); return yanitCevir(yanit()); }, depo);
  assert.equal(url, 'https://w.ornek.dev/api/gunler?gun=28');
});

test('https olmayan adres reddedilir; localhost http kabul', async () => {
  let cagri = 0;
  const f = async () => { cagri += 1; return yanitCevir(yanit()); };
  for (const adres of ['http://ornek.com', 'ftp://ornek.com', 'ornek.com', 'javascript:alert(1)', 'https://kullanici:sifre@ornek.com', 'https://ornek.com/?a=1']) {
    const depo = sahteDepo({ 'gk-baglanti': JSON.stringify({ adres, anahtar: ANAHTAR }) });
    assert.equal(await veriGetir(f, depo), null, adres);
  }
  assert.equal(cagri, 0);
  const yerel = sahteDepo({ 'gk-baglanti': JSON.stringify({ adres: 'http://localhost:8787', anahtar: ANAHTAR }) });
  const v = await veriGetir(async (u) => { cagri += 1; assert.equal(String(u), 'http://localhost:8787/api/gunler?gun=28'); return yanitCevir(yanit()); }, yerel);
  assert.equal(v.GUNLER.length, 28);
  assert.equal(cagri, 1);
});

test('baglantiYaz gidiş-dönüş, baglantiSil sonrası null', () => {
  const depo = sahteDepo();
  assert.equal(baglantiOku(depo), null);
  assert.equal(baglantiYaz({ adres: 'https://w.ornek.dev/', anahtar: ANAHTAR }, depo), true);
  assert.deepEqual(baglantiOku(depo), { adres: 'https://w.ornek.dev', anahtar: ANAHTAR });
  assert.ok(depo._m.has('gk-baglanti'));
  baglantiSil(depo);
  assert.equal(baglantiOku(depo), null);
});

test('baglantiYaz geçersiz adres ya da boş anahtarda yazmaz', () => {
  const depo = sahteDepo();
  assert.equal(baglantiYaz({ adres: 'http://ornek.com', anahtar: ANAHTAR }, depo), false);
  assert.equal(baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: '   ' }, depo), false);
  assert.equal(baglantiYaz({ adres: '', anahtar: ANAHTAR }, depo), false);
  assert.equal(depo._m.size, 0);
});

test('baglantiOku bozuk kayıtta ve depo hatasında null döner', () => {
  assert.equal(baglantiOku(sahteDepo({ 'gk-baglanti': '{bozuk' })), null);
  assert.equal(baglantiOku(sahteDepo({ 'gk-baglanti': '{"adres":1,"anahtar":2}' })), null);
  const patlayan = { getItem() { throw new Error('erişim yok'); }, setItem() { throw new Error('erişim yok'); }, removeItem() { throw new Error('x'); } };
  assert.equal(baglantiOku(patlayan), null);
  assert.equal(baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: ANAHTAR }, patlayan), false);
  assert.doesNotThrow(() => baglantiSil(patlayan));
});

test('Node ortamında localStorage ve fetch yokken içe aktarma ve çağrılar patlamaz', async () => {
  assert.equal(baglantiOku(), null);
  assert.equal(await veriGetir(), null);
  assert.doesNotThrow(() => baglantiSil());
});

test('anahtar hiçbir çağrıda URLde geçmez', async () => {
  const depo = sahteDepo();
  baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: ANAHTAR }, depo);
  const urller = [];
  await veriGetir(async (u) => { urller.push(String(u)); return yanitCevir(yanit()); }, depo);
  await veriGetir(async (u) => { urller.push(String(u)); throw new Error('x'); }, depo);
  assert.ok(urller.length >= 2);
  urller.forEach((u) => assert.equal(u.includes(ANAHTAR), false));
});

test('sureMetni: 60 dk üstü saat ve dakika', () => {
  assert.equal(sureMetni(490), '8s 10dk');
  assert.equal(sureMetni(60), '60 dk');
  assert.equal(sureMetni(61), '1s 1dk');
  assert.equal(sureMetni(120), '2s');
  assert.equal(sureMetni(45), '45 dk');
  assert.equal(sureMetni(0), '0 dk');
  assert.equal(sureMetni(null), null);
  assert.equal(sureMetni(NaN), null);
});

test('sonEsitlemeMetni İstanbul saatiyle "12 Kas 07:15"', () => {
  assert.equal(sonEsitlemeMetni(Date.UTC(2026, 10, 12, 4, 15)), '12 Kas 07:15');
  assert.equal(sonEsitlemeMetni(Date.UTC(2026, 0, 3, 21, 5)), '4 Oca 00:05');
  assert.equal(sonEsitlemeMetni(null), null);
  assert.equal(sonEsitlemeMetni('x'), null);
});

test('eskilikSaat: 12 saatten eskiyse tam saat, değilse null', () => {
  const simdi = Date.UTC(2026, 10, 12, 20, 0);
  assert.equal(eskilikSaat(simdi - 14 * 3600e3 - 5 * 60e3, simdi), 14);
  assert.equal(eskilikSaat(simdi - 12 * 3600e3, simdi), null);
  assert.equal(eskilikSaat(simdi - 12 * 3600e3 - 1000, simdi), 12);
  assert.equal(eskilikSaat(simdi + 5 * 3600e3, simdi), null);
  assert.equal(eskilikSaat(null, simdi), null);
});

test('ekSatiri uyku: dört dilim, dakika, ihtiyaç', () => {
  const ek = { uyku: { derin: 71, hafif: 233, rem: 100, uyanik: 15, ihtiyac: 490 } };
  const s = ekSatiri('uyku', ek);
  assert.deepEqual(s.dilimler.map((d) => d.id), ['derin', 'hafif', 'rem', 'uyanik']);
  assert.deepEqual(s.dilimler.map((d) => d.etiket), ['Derin', 'Hafif', 'REM', 'Uyanık']);
  assert.deepEqual(s.dilimler.map((d) => d.dk), [71, 233, 100, 15]);
  assert.equal(s.dilimler[1].metin, '3s 53dk');
  assert.equal(s.metin, 'İhtiyaç: 8s 10dk');
});

test('ekSatiri: null dilim atlanır, hepsi 0 ise çubuk yok, hepsi null ise satır yok', () => {
  const kismi = ekSatiri('uyku', { uyku: { derin: 70, hafif: null, rem: 90, uyanik: null, ihtiyac: null } });
  assert.deepEqual(kismi.dilimler.map((d) => d.id), ['derin', 'rem']);
  assert.equal(kismi.metin, null);
  const sifir = ekSatiri('uyku', { uyku: { derin: 0, hafif: 0, rem: 0, uyanik: 0, ihtiyac: 480 } });
  assert.equal(sifir.dilimler, null);
  assert.equal(sifir.metin, 'İhtiyaç: 8s');
  assert.equal(ekSatiri('uyku', { uyku: { derin: 0, hafif: 0, rem: 0, uyanik: 0, ihtiyac: null } }), null);
  assert.equal(ekSatiri('uyku', { uyku: { derin: null, hafif: null, rem: null, uyanik: null, ihtiyac: null } }), null);
  assert.equal(ekSatiri('uyku', null), null);
  assert.equal(ekSatiri('uyku', {}), null);
});

test('ekSatiri bb, stres, hrv ve ek satırı olmayan ölçümler', () => {
  const ek = {
    bb: { dolan: 62, biten: 64 },
    stres: { dinlenme: 300, dusuk: 150, orta: 50, yuksek: 10 },
    hrv: { durum: 'BALANCED', haftalik: 53 },
  };
  assert.equal(ekSatiri('bb', ek).metin, '+62 doldu, −64 bitti');
  assert.equal(ekSatiri('bb', { bb: { dolan: 62, biten: null } }).metin, '+62 doldu');
  assert.equal(ekSatiri('bb', { bb: { dolan: null, biten: 64 } }).metin, '−64 bitti');
  assert.equal(ekSatiri('bb', { bb: { dolan: null, biten: null } }), null);
  assert.deepEqual(ekSatiri('stres', ek).dilimler.map((d) => d.etiket), ['Dinlenme', 'Düşük', 'Orta', 'Yüksek']);
  assert.equal(ekSatiri('hrv', ek).metin, 'Haftalık ortalama 53 ms');
  assert.equal(ekSatiri('hrv', { hrv: { durum: 'BALANCED', haftalik: null } }), null);
  for (const id of ['nabiz', 'yuk', 'derin', 'spo2', 'solunum', 'bilinmeyen']) assert.equal(ekSatiri(id, ek), null);
});

test('veriYok günde hüküm ve gerekçe payload ne derse desin sabitlenir', () => {
  const api = yanit();
  api.gunler[api.gunler.length - 1].e = null;
  api.gunler[api.gunler.length - 1].hukum = 'Harika bir gün!';
  api.gunler[api.gunler.length - 1].gerekce = 'Bütün ölçümlerin normal aralığında.';
  const son = veriCevir(api).GUNLER[27];
  assert.equal(son.veriYok, true);
  assert.equal(son.hukum, 'Bugün için yeterli veri yok.');
  assert.equal(son.gerekce, '');
});

test('e [0,1] aralığına kırpılır; sonlu olmayan değer veriYok olur', () => {
  const api = yanit();
  const g = api.gunler;
  g[g.length - 1].e = 1.7;
  g[g.length - 2].e = -0.4;
  g[g.length - 3].e = Infinity;
  g[g.length - 4].e = 'yüksek';
  const v = veriCevir(api).GUNLER;
  assert.equal(v[27].e, 1);
  assert.equal(v[27].veriYok, false);
  assert.equal(v[26].e, 0);
  assert.equal(v[26].veriYok, false);
  assert.equal(v[25].veriYok, true);
  assert.equal(v[25].e, 0.5);
  assert.equal(v[24].veriYok, true);
  assert.equal(v[24].e, 0.5);
});

test('veriGetir fetch\'e redirect: error geçirir', async () => {
  const depo = sahteDepo();
  baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: ANAHTAR }, depo);
  let init;
  await veriGetir(async (u, i) => { init = i; return yanitCevir(yanit()); }, depo);
  assert.equal(init.redirect, 'error');
});

test('baglantiKarar: aynı adres + boş anahtar kayıtlı anahtarı yeniden kullanır', () => {
  const kayitli = { adres: 'https://w.ornek.dev', anahtar: ANAHTAR };
  const k = baglantiKarar({ adres: 'https://w.ornek.dev', anahtar: '  ', kayitli });
  assert.equal(k.tamam, true);
  assert.deepEqual(k.baglanti, { adres: 'https://w.ornek.dev', anahtar: ANAHTAR });
  assert.equal(k.hata, undefined);
});

test('baglantiKarar: farklı adres + boş anahtar hata verir, bağlantı dönmez', () => {
  const kayitli = { adres: 'https://w.ornek.dev', anahtar: ANAHTAR };
  const k = baglantiKarar({ adres: 'https://baska.ornek.dev', anahtar: '', kayitli });
  assert.equal(k.tamam, false);
  assert.equal(k.hata, 'Adres değişti. Cihaz anahtarını yeniden gir.');
  assert.equal(k.baglanti, undefined);
});

test('baglantiKarar: sondaki / ve şema/ana makine büyük harfi aynı adres sayılır', () => {
  const kayitli = { adres: 'https://w.ornek.dev', anahtar: ANAHTAR };
  for (const adres of ['https://w.ornek.dev/', 'HTTPS://W.Ornek.DEV', ' https://w.ornek.dev// ']) {
    const k = baglantiKarar({ adres, anahtar: '', kayitli });
    assert.equal(k.tamam, true, adres);
    assert.equal(k.baglanti.anahtar, ANAHTAR, adres);
    assert.equal(k.baglanti.adres, 'https://w.ornek.dev', adres);
  }
});

test('baglantiKarar: yeni anahtar yazılırsa adres değişse de o kullanılır', () => {
  const kayitli = { adres: 'https://w.ornek.dev', anahtar: ANAHTAR };
  const k = baglantiKarar({ adres: 'https://baska.ornek.dev/', anahtar: ' yeni-anahtar ', kayitli });
  assert.equal(k.tamam, true);
  assert.deepEqual(k.baglanti, { adres: 'https://baska.ornek.dev', anahtar: 'yeni-anahtar' });
});

test('baglantiKarar: geçersiz adres ve kayıt yokken boş anahtar', () => {
  assert.deepEqual(baglantiKarar({ adres: 'http://w.ornek.dev', anahtar: 'x', kayitli: null }), { tamam: false, hata: 'Adres https:// ile başlamalı.' });
  assert.deepEqual(baglantiKarar({ adres: 'https://w.ornek.dev', anahtar: '', kayitli: null }), { tamam: false, hata: 'Cihaz anahtarını gir.' });
});

test('veriCevir yorumKaynak: gemini, sablon ve alan yok', () => {
  assert.equal(veriCevir({ ...yanit(), yorumKaynak: 'gemini' }).meta.yorumKaynak, 'gemini');
  assert.equal(veriCevir({ ...yanit(), yorumKaynak: 'sablon' }).meta.yorumKaynak, 'sablon');
  const yok = { ...yanit() }; delete yok.yorumKaynak;
  assert.equal(veriCevir(yok).meta.yorumKaynak, 'sablon');
  assert.equal(veriCevir({ ...yanit(), yorumKaynak: 'baska' }).meta.yorumKaynak, 'sablon');
});

const bagli = () => { const d = sahteDepo(); baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: ANAHTAR }, d); return d; };

test('ayarGetir GET /api/ayar, anahtar yalnız başlıkta, yapayZeka döner', async () => {
  const cagrilar = [];
  const f = async (url, init) => { cagrilar.push({ url: String(url), init }); return yanitCevir({ yapayZeka: true }); };
  assert.deepEqual(await ayarGetir(f, bagli()), { yapayZeka: true });
  assert.equal(cagrilar.length, 1);
  assert.equal(cagrilar[0].url, 'https://w.ornek.dev/api/ayar');
  assert.equal(cagrilar[0].init.method, 'GET');
  assert.equal(cagrilar[0].init.headers['X-Device-Key'], ANAHTAR);
  assert.equal(cagrilar[0].init.redirect, 'error');
  assert.equal(cagrilar[0].init.credentials, 'omit');
  assert.equal(cagrilar[0].init.body, undefined);
  assert.equal(cagrilar[0].url.includes(ANAHTAR), false);
  assert.deepEqual(await ayarGetir(async () => yanitCevir({ yapayZeka: false }), bagli()), { yapayZeka: false });
});

test('ayarYaz PUT gövde, Content-Type, anahtar yalnız başlıkta', async () => {
  const cagrilar = [];
  const f = async (url, init) => { cagrilar.push({ url: String(url), init }); return yanitCevir({ yapayZeka: false }); };
  assert.deepEqual(await ayarYaz(false, f, bagli()), { yapayZeka: false });
  assert.equal(cagrilar.length, 1);
  assert.equal(cagrilar[0].url, 'https://w.ornek.dev/api/ayar');
  assert.equal(cagrilar[0].init.method, 'PUT');
  assert.equal(cagrilar[0].init.body, '{"yapayZeka":false}');
  assert.equal(cagrilar[0].init.headers['Content-Type'], 'application/json');
  assert.equal(cagrilar[0].init.headers['X-Device-Key'], ANAHTAR);
  assert.equal(cagrilar[0].init.redirect, 'error');
  assert.equal(cagrilar[0].init.credentials, 'omit');
  assert.equal(cagrilar[0].url.includes(ANAHTAR), false);
  assert.equal(String(cagrilar[0].init.body).includes(ANAHTAR), false);
  await ayarYaz(true, f, bagli());
  assert.equal(cagrilar[1].init.body, '{"yapayZeka":true}');
});

test('ayarGetir ve ayarYaz hata durumlarında null (401, 500, ağ, bozuk JSON, yanlış biçim)', async () => {
  const bozukJson = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
  const durumlar = [
    async () => yanitCevir({ hata: 'yetkisiz' }, 401),
    async () => yanitCevir({ yapayZeka: true }, 500),
    async () => { throw new TypeError('Failed to fetch'); },
    bozukJson,
    async () => yanitCevir({ yapayZeka: 'evet' }),
    async () => yanitCevir({ yapayZeka: 1 }),
    async () => yanitCevir({}),
    async () => yanitCevir(null),
    async () => yanitCevir([true]),
  ];
  for (const f of durumlar) {
    assert.equal(await ayarGetir(f, bagli()), null);
    assert.equal(await ayarYaz(true, f, bagli()), null);
  }
});

test('ayarGetir ve ayarYaz zaman aşımında null döner ve isteği iptal eder', async () => {
  let iptal = 0;
  const f = (url, init) => new Promise((_, red) => {
    init.signal?.addEventListener('abort', () => { iptal += 1; red(new Error('abort')); });
  });
  assert.equal(await ayarGetir(f, bagli(), { zamanAsimiMs: 30 }), null);
  assert.equal(await ayarYaz(true, f, bagli(), { zamanAsimiMs: 30 }), null);
  assert.equal(iptal, 2);
});

test('ayarGetir ve ayarYaz bağlantı yokken null, fetch çağrılmaz', async () => {
  let cagri = 0;
  const f = async () => { cagri += 1; return yanitCevir({ yapayZeka: true }); };
  assert.equal(await ayarGetir(f, sahteDepo()), null);
  assert.equal(await ayarYaz(true, f, sahteDepo()), null);
  assert.equal(await ayarGetir(), null);
  assert.equal(cagri, 0);
});

test('ayarYaz boolean olmayan girdiyi istek atmadan reddeder', async () => {
  let cagri = 0;
  const f = async () => { cagri += 1; return yanitCevir({ yapayZeka: true }); };
  for (const girdi of ['evet', 1, 0, null, undefined, {}, []]) assert.equal(await ayarYaz(girdi, f, bagli()), null);
  assert.equal(cagri, 0);
});

/* ---------- Son veri önbelleği ve veriYukle ---------- */

const SON_VERI = 'gk-son-veri';
const T0 = 1763000000000;
const baglantiliDepo = (ek = {}) => {
  const d = sahteDepo(ek);
  baglantiYaz({ adres: 'https://w.ornek.dev', anahtar: ANAHTAR }, d);
  return d;
};

test('veriYukle başarıda canli döner ve son veriyi yazar', async () => {
  const depo = baglantiliDepo();
  const api = yanit();
  const r = await veriYukle(async () => yanitCevir(api), depo, T0);
  assert.equal(r.kaynak, 'canli');
  assert.equal(r.neden, null);
  assert.equal(r.zaman, T0);
  assert.equal(r.veri.GUNLER.length, 28);
  const o = sonVeriOku(depo);
  assert.equal(o.zaman, T0);
  assert.deepEqual(o.yanit, JSON.parse(JSON.stringify(api))); // ham API yanıtı saklanır, VERI değil
});

test('veriYukle ağ hatasında önbellekten döner: kaynak onbellek, neden ag, zaman yazılan an', async () => {
  const depo = baglantiliDepo();
  await veriYukle(async () => yanitCevir(yanit()), depo, T0);
  const r = await veriYukle(async () => { throw new TypeError('Failed to fetch'); }, depo, T0 + 3600e3);
  assert.equal(r.kaynak, 'onbellek');
  assert.equal(r.neden, 'ag');
  assert.equal(r.zaman, T0);
  assert.equal(r.veri.GUNLER.length, 28);
  assert.equal(typeof r.veri.durum, 'function');
});

test('veriYukle 401de neden yetki; önbellek varsa onbellek, yoksa yok', async () => {
  const f401 = async () => yanitCevir({ hata: 'yetkisiz' }, 401);
  const bos = await veriYukle(f401, baglantiliDepo(), T0);
  assert.deepEqual({ ...bos }, { veri: null, kaynak: 'yok', zaman: null, neden: 'yetki' });
  const depo = baglantiliDepo();
  await veriYukle(async () => yanitCevir(yanit()), depo, T0);
  const r = await veriYukle(f401, depo, T0 + 1000);
  assert.equal(r.kaynak, 'onbellek');
  assert.equal(r.neden, 'yetki');
  assert.equal(r.zaman, T0);
});

test('veriYukle 500de neden sunucu; zaman aşımı ve ağ hatası ag', async () => {
  const r = await veriYukle(async () => yanitCevir({}, 500), baglantiliDepo(), T0);
  assert.equal(r.kaynak, 'yok');
  assert.equal(r.neden, 'sunucu');
  const depo = baglantiliDepo();
  await veriYukle(async () => yanitCevir(yanit()), depo, T0);
  assert.equal((await veriYukle(async () => yanitCevir({}, 503), depo, T0 + 1)).neden, 'sunucu');
  const askida = (u, init) => new Promise((_, red) => { init.signal?.addEventListener('abort', () => red(new Error('abort'))); });
  const z = await veriYukle(askida, baglantiliDepo(), T0, { zamanAsimiMs: 20 });
  assert.equal(z.neden, 'ag');
  assert.equal(z.kaynak, 'yok');
});

test('veriYukle bağlantı yokken fetch çağırmaz ve kaynak yok, neden null', async () => {
  let cagri = 0;
  const f = async () => { cagri += 1; return yanitCevir(yanit()); };
  const r = await veriYukle(f, sahteDepo(), T0);
  assert.deepEqual({ ...r }, { veri: null, kaynak: 'yok', zaman: null, neden: null });
  assert.equal(cagri, 0);
});

test('bozuk önbellek silinir ve kaynak yok döner', async () => {
  const fHata = async () => { throw new TypeError('Failed to fetch'); };
  const d1 = baglantiliDepo({ [SON_VERI]: '{' });
  const r1 = await veriYukle(fHata, d1, T0);
  assert.equal(r1.kaynak, 'yok');
  assert.equal(r1.neden, 'ag');
  assert.equal(d1.getItem(SON_VERI), null);
  // Biçimi yanlış nesne ve veriCevir'de patlayan yanıt
  const d2 = baglantiliDepo({ [SON_VERI]: JSON.stringify({ zaman: 'x', yanit: 5 }) });
  assert.equal((await veriYukle(fHata, d2, T0)).kaynak, 'yok');
  assert.equal(d2.getItem(SON_VERI), null);
  const d3 = baglantiliDepo({ [SON_VERI]: JSON.stringify({ zaman: T0, yanit: { olcumler: [], gunler: [] } }) });
  const r3 = await veriYukle(fHata, d3, T0);
  assert.equal(r3.kaynak, 'yok');
  assert.equal(r3.veri, null);
  assert.equal(d3.getItem(SON_VERI), null);
});

test('sonVeriYaz 400 KB üstünü yazmaz, depo dolu hatasında fırlatmaz', () => {
  const depo = sahteDepo();
  assert.equal(sonVeriYaz({ x: 'a'.repeat(401 * 1024) }, T0, depo), false);
  assert.equal(depo.getItem(SON_VERI), null);
  assert.equal(sonVeriYaz(yanit(), T0, depo), true);
  assert.notEqual(depo.getItem(SON_VERI), null);
  const dolu = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  assert.doesNotThrow(() => sonVeriYaz(yanit(), T0, dolu));
  assert.equal(sonVeriYaz(yanit(), T0, dolu), false);
  assert.equal(sonVeriYaz(yanit(), T0, undefined), false);
  assert.equal(sonVeriYaz(null, T0, depo), false);
  assert.equal(sonVeriYaz(yanit(), NaN, depo), false);
});

test('sonVeriOku gidiş-dönüş; sonVeriSil siler', () => {
  const depo = sahteDepo();
  assert.equal(sonVeriOku(depo), null);
  sonVeriYaz({ olcumler: [1], gunler: [2] }, T0, depo);
  assert.deepEqual(sonVeriOku(depo), { zaman: T0, yanit: { olcumler: [1], gunler: [2] } });
  sonVeriSil(depo);
  assert.equal(sonVeriOku(depo), null);
  assert.doesNotThrow(() => sonVeriSil(undefined));
});

test('baglantiSil son veriyi de siler', () => {
  const depo = baglantiliDepo();
  sonVeriYaz(yanit(), T0, depo);
  baglantiSil(depo);
  assert.equal(depo.getItem(SON_VERI), null);
  assert.equal(baglantiOku(depo), null);
});

test('adres değişince son veri silinir, aynı adreste ve yeni anahtarla kalır', () => {
  const depo = baglantiliDepo();
  sonVeriYaz(yanit(), T0, depo);
  assert.equal(baglantiYaz({ adres: 'https://w.ornek.dev/', anahtar: 'baska-anahtar' }, depo), true);
  assert.notEqual(depo.getItem(SON_VERI), null);
  assert.equal(baglantiYaz({ adres: 'https://baska.ornek.dev', anahtar: ANAHTAR }, depo), true);
  assert.equal(depo.getItem(SON_VERI), null);
  // geçersiz adres yazılmaz ve veriyi silmez
  sonVeriYaz(yanit(), T0, depo);
  assert.equal(baglantiYaz({ adres: 'http://x.ornek.dev', anahtar: ANAHTAR }, depo), false);
  assert.notEqual(depo.getItem(SON_VERI), null);
});

test('önbellekteki yanıt cihaz anahtarını içermez', async () => {
  const depo = baglantiliDepo();
  await veriYukle(async () => yanitCevir(yanit()), depo, T0);
  assert.ok(depo.getItem(SON_VERI).length > 1000);
  assert.equal(depo.getItem(SON_VERI).includes(ANAHTAR), false);
});

test('veriYukle başarıda fetch\'e anahtarı yalnız başlıkta verir ve veriGetir ile aynı sonucu üretir', async () => {
  const depo = baglantiliDepo();
  const cagrilar = [];
  const f = async (url, init) => { cagrilar.push({ url: String(url), init }); return yanitCevir(yanit()); };
  const r = await veriYukle(f, depo, T0);
  const g = await veriGetir(f, depo);
  assert.equal(cagrilar[0].url, 'https://w.ornek.dev/api/gunler?gun=28');
  assert.equal(cagrilar[0].init.headers['X-Device-Key'], ANAHTAR);
  assert.ok(!cagrilar[0].url.includes(ANAHTAR));
  assert.equal(JSON.stringify(r.veri.GUNLER), JSON.stringify(g.GUNLER));
});

test('veriYukle bozuk canlı yanıtta (200 ama biçim yanlış) sunucu der ve önbelleğe düşer', async () => {
  const depo = baglantiliDepo();
  await veriYukle(async () => yanitCevir(yanit()), depo, T0);
  const r = await veriYukle(async () => yanitCevir({ olcumler: 'x' }), depo, T0 + 1);
  assert.equal(r.kaynak, 'onbellek');
  assert.equal(r.neden, 'sunucu');
  const bozuk = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
  assert.equal((await veriYukle(bozuk, depo, T0 + 2)).neden, 'sunucu');
});

test('veriYukle fetch yoksa ve bağlantı varsa ag der, fırlatmaz', async () => {
  const r = await veriYukle(null, baglantiliDepo(), T0) /* null: varsayılan gerçek fetch devreye girmesin, test ağa çıkmasın */;
  assert.equal(r.kaynak, 'yok');
  assert.equal(r.neden, 'ag');
});
