import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiYaniti } from '../worker/src/stats/ozet.js';
import { gunEkle } from '../worker/src/zaman.js';
import {
  veriCevir, durum, veriGetir, baglantiOku, baglantiYaz, baglantiSil,
  sureMetni, sonEsitlemeMetni, eskilikSaat, ekSatiri,
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
  assert.deepEqual(v.meta, { sonEsitleme: 1763000000000, keyDurum: 'gecerli' });
  assert.equal(typeof v.OK.lo, 'string');
  assert.deepEqual(v.DURUM_METIN, { lo: 'altında', hi: 'üstünde', ok: 'normalde' });
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
