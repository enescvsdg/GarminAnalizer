import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { durumOku, durumYaz } from '../src/db.js';
import { zamanliEsitle } from '../src/zamanlama.js';

const SAAT = 3600_000;
const DK = 60_000;
const SIMDI = Date.UTC(2026, 10, 12, 9, 0);

function sahte(durum = 'tamam') {
  const f = async () => { f.sayi += 1; return { durum }; };
  f.sayi = 0;
  return f;
}
async function kur(db, d = {}) {
  for (const [k, v] of Object.entries(d)) await durumYaz(db, k, v);
}
const BITTI = { sonraki: '2026-01-01', bitti: true, bosArdisik: 0 };
const BITMEDI = { sonraki: '2026-05-01', bitti: false, bosArdisik: 0 };

test('bekle_bitis gelecekte: calistir çağrılmaz', async () => {
  const db = testD1();
  await kur(db, { bekle_bitis: SIMDI + 1, son_esitleme: SIMDI - 10 * SAAT, gecmis_imlec: BITTI });
  const c = sahte();
  const s = await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 0);
  assert.deepEqual(s, { calisti: false, neden: 'bekleme' });
});

test('taze ve geçmiş bitti: çağrılmaz', async () => {
  const db = testD1();
  await kur(db, { son_esitleme: SIMDI - 0.5 * SAAT, gecmis_imlec: BITTI, key_durum: 'gecerli' });
  const c = sahte();
  const s = await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 0);
  assert.deepEqual(s, { calisti: false, neden: 'taze' });
});

test('geçmiş bitmemişse taze olsa da çağrılır', async () => {
  const db = testD1();
  await kur(db, { son_esitleme: SIMDI - 0.5 * SAAT, gecmis_imlec: BITMEDI });
  const c = sahte();
  const s = await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 1);
  assert.deepEqual(s, { calisti: true, durum: 'tamam' });
});

test('gecmis_imlec yoksa çağrılır', async () => {
  const db = testD1();
  await kur(db, { son_esitleme: SIMDI - 0.5 * SAAT });
  const c = sahte();
  await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 1);
});

test('son_esitleme yoksa çağrılır', async () => {
  const db = testD1();
  await kur(db, { gecmis_imlec: BITTI });
  const c = sahte();
  await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 1);
});

test('1 saatten eski son_esitleme: çağrılır', async () => {
  const db = testD1();
  await kur(db, { son_esitleme: SIMDI - 1 * SAAT - 1, gecmis_imlec: BITTI });
  const c = sahte();
  await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 1);
});

test('çalışınca son_deneme simdiMs olur', async () => {
  const db = testD1();
  const c = sahte();
  await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(await durumOku(db, 'son_deneme'), SIMDI);
});

test('kismi üst üste: bekleme 30/60/180/180 dk', async () => {
  const db = testD1();
  const beklenen = [30, 60, 180, 180];
  let t = SIMDI;
  for (let i = 0; i < beklenen.length; i += 1) {
    const c = sahte('kismi');
    const s = await zamanliEsitle({ db, simdiMs: t, calistir: c });
    assert.equal(c.sayi, 1);
    assert.deepEqual(s, { calisti: true, durum: 'kismi' });
    assert.equal(await durumOku(db, 'kismi_sayac'), i + 1);
    assert.equal(await durumOku(db, 'bekle_bitis'), t + beklenen[i] * DK);
    t = await durumOku(db, 'bekle_bitis'); // beklemenin bittiği an
  }
});

test('tamam sayaçları sıfırlar', async () => {
  const db = testD1();
  await kur(db, { kismi_sayac: 3, bekle_bitis: SIMDI - 1 });
  const c = sahte('tamam');
  await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 1);
  assert.equal(await durumOku(db, 'kismi_sayac'), 0);
  assert.equal(await durumOku(db, 'bekle_bitis'), 0);
});

test('key geçersiz + son deneme 23 saat önce: çağrılmaz; 25 saat önce: çağrılır', async () => {
  const db = testD1();
  await kur(db, { key_durum: 'gecersiz', son_deneme: SIMDI - 23 * SAAT });
  const c = sahte('key-gecersiz');
  const s = await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 0);
  assert.deepEqual(s, { calisti: false, neden: 'key' });

  await durumYaz(db, 'son_deneme', SIMDI - 25 * SAAT);
  const s2 = await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 1);
  assert.deepEqual(s2, { calisti: true, durum: 'key-gecersiz' });
});

test('key-gecersiz sayaçlara dokunmaz', async () => {
  const db = testD1();
  await kur(db, { kismi_sayac: 2, bekle_bitis: 0 });
  await zamanliEsitle({ db, simdiMs: SIMDI, calistir: sahte('key-gecersiz') });
  assert.equal(await durumOku(db, 'kismi_sayac'), 2);
  assert.equal(await durumOku(db, 'bekle_bitis'), 0);
});

test('calistir fırlatırsa bekleme yazılır ve hata yeniden fırlatılır', async () => {
  const db = testD1();
  const c = async () => { throw new Error('patladi'); };
  await assert.rejects(() => zamanliEsitle({ db, simdiMs: SIMDI, calistir: c }), /patladi/);
  assert.equal(await durumOku(db, 'kismi_sayac'), 1);
  assert.equal(await durumOku(db, 'bekle_bitis'), SIMDI + 30 * DK);
  assert.equal(await durumOku(db, 'son_deneme'), SIMDI);
});

function sahteSonuc(sonuc) {
  const f = async () => { f.sayi += 1; return sonuc; };
  f.sayi = 0;
  return f;
}

test('tamam + gecmisHata üst üste: bekleme 30/60/180 dk, beklerken çağrılmaz, gerçek durum döner', async () => {
  const db = testD1();
  await kur(db, { gecmis_imlec: BITMEDI });
  const beklenen = [30, 60, 180];
  let t = SIMDI;
  for (let i = 0; i < beklenen.length; i += 1) {
    const c = sahteSonuc({ durum: 'tamam', gecmisHata: true });
    const s = await zamanliEsitle({ db, simdiMs: t, calistir: c });
    assert.equal(c.sayi, 1);
    assert.deepEqual(s, { calisti: true, durum: 'tamam' });
    assert.equal(await durumOku(db, 'kismi_sayac'), i + 1);
    assert.equal(await durumOku(db, 'bekle_bitis'), t + beklenen[i] * DK);
    const bekleyen = sahteSonuc({ durum: 'tamam', gecmisHata: true });
    const w = await zamanliEsitle({ db, simdiMs: t + beklenen[i] * DK - 1, calistir: bekleyen });
    assert.equal(bekleyen.sayi, 0);
    assert.deepEqual(w, { calisti: false, neden: 'bekleme' });
    t += beklenen[i] * DK;
  }
});

test('tamam + gecmisHata sonrası temiz tamam iki sayacı sıfırlar', async () => {
  const db = testD1();
  await kur(db, { gecmis_imlec: BITMEDI });
  await zamanliEsitle({ db, simdiMs: SIMDI, calistir: sahteSonuc({ durum: 'tamam', gecmisHata: true }) });
  assert.equal(await durumOku(db, 'kismi_sayac'), 1);
  const t = SIMDI + 30 * DK;
  const c = sahteSonuc({ durum: 'tamam', gecmisHata: false });
  const s = await zamanliEsitle({ db, simdiMs: t, calistir: c });
  assert.equal(c.sayi, 1);
  assert.deepEqual(s, { calisti: true, durum: 'tamam' });
  assert.equal(await durumOku(db, 'kismi_sayac'), 0);
  assert.equal(await durumOku(db, 'bekle_bitis'), 0);
});

test('bekleme yazımı da patlarsa özgün calistir hatası fırlatılır', async () => {
  const gercek = testD1();
  let yazmaBozuk = false;
  const db = {
    prepare(sql) {
      const h = gercek.prepare(sql);
      if (!yazmaBozuk || !/INSERT|UPDATE|REPLACE/i.test(sql)) return h;
      const hatali = { bind: () => hatali, run: async () => { throw new Error('yazma-hatasi'); } };
      return hatali;
    },
  };
  const c = async () => { yazmaBozuk = true; throw new Error('ozgun-hata'); };
  await assert.rejects(() => zamanliEsitle({ db, simdiMs: SIMDI, calistir: c }), /^Error: ozgun-hata$/);
});

test('sınır: bekle_bitis tam simdiMs ise çalışır', async () => {
  const db = testD1();
  await kur(db, { bekle_bitis: SIMDI, gecmis_imlec: BITMEDI });
  const c = sahte();
  const s = await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 1);
  assert.deepEqual(s, { calisti: true, durum: 'tamam' });
});

test('sınır: geçersiz key ve son_deneme tam 24 saat önce ise çalışır', async () => {
  const db = testD1();
  await kur(db, { key_durum: 'gecersiz', son_deneme: SIMDI - 24 * SAAT });
  const c = sahte();
  await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 1);
});

test('sınır: tetikleme birkaç ms erken gelse de saatlik eşitleme çalışır (2 dk tolerans)', async () => {
  for (const [fark, calisir] of [[1 * SAAT, true], [1 * SAAT - 5, true], [58 * 60_000, true], [58 * 60_000 - 1, false], [45 * 60_000, false]]) {
    const db = testD1();
    await kur(db, { son_esitleme: SIMDI - fark, gecmis_imlec: BITTI });
    const c = sahte();
    const s = await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
    assert.equal(c.sayi, calisir ? 1 : 0, `fark ${fark}`);
    assert.equal(s.calisti, calisir, `fark ${fark}`);
  }
});

// ---- sabah penceresi (İstanbul 05:00 <= saat < 11:00) ----
const ist = (s, d = 0) => Date.UTC(2026, 10, 12, s - 3, d); // İstanbul yerel saat (UTC+3) -> ms
const BUGUN_IST = '2026-11-12';

async function sabahKur(db, ek = {}) {
  await kur(db, { gecmis_imlec: BITTI, key_durum: 'gecerli', ...ek });
}

test('sabah penceresi sınırları: 04:59 taze, 05:00 çalışır, 10:59 çalışır, 11:00 taze', async () => {
  const sonuclar = [];
  for (const [saat, dk] of [[4, 59], [5, 0], [10, 59], [11, 0]]) {
    const db = testD1();
    const simdi = ist(saat, dk);
    await sabahKur(db, { son_esitleme: simdi - 15 * DK });
    const c = sahte();
    await zamanliEsitle({ db, simdiMs: simdi, calistir: c });
    sonuclar.push(c.sayi);
  }
  assert.deepEqual(sonuclar, [0, 1, 1, 0]);
});

test('sabah penceresi: uyku_gun bugünse taze kalır, dünse çalışır', async () => {
  const simdi = ist(8);
  const db = testD1();
  await sabahKur(db, { son_esitleme: simdi - 15 * DK, uyku_gun: BUGUN_IST });
  const c = sahte();
  assert.deepEqual(await zamanliEsitle({ db, simdiMs: simdi, calistir: c }), { calisti: false, neden: 'taze' });
  const db2 = testD1();
  await sabahKur(db2, { son_esitleme: simdi - 15 * DK, uyku_gun: '2026-11-11' });
  const c2 = sahte();
  assert.equal((await zamanliEsitle({ db: db2, simdiMs: simdi, calistir: c2 })).calisti, true);
});

test('sabah penceresi: bekle_bitis ve geçersiz key önce gelir', async () => {
  const simdi = ist(8);
  const db = testD1();
  await sabahKur(db, { son_esitleme: simdi - 15 * DK, bekle_bitis: simdi + 1 });
  const c = sahte();
  assert.deepEqual(await zamanliEsitle({ db, simdiMs: simdi, calistir: c }), { calisti: false, neden: 'bekleme' });
  const db2 = testD1();
  await sabahKur(db2, { son_esitleme: simdi - 15 * DK, key_durum: 'gecersiz', son_deneme: simdi - 2 * SAAT });
  const c2 = sahte();
  assert.deepEqual(await zamanliEsitle({ db: db2, simdiMs: simdi, calistir: c2 }), { calisti: false, neden: 'key' });
  assert.equal(c.sayi + c2.sayi, 0);
});

test('sabah penceresi: UTC tarihi dünken İstanbul tarihi bugünse uyku_gun İstanbul tarihiyle karşılaştırılır', async () => {
  const simdi = Date.UTC(2026, 10, 11, 22, 0) + 0; // İstanbul 12 Kas 01:00: pencere dışı
  const db = testD1();
  await sabahKur(db, { son_esitleme: simdi - 15 * DK });
  const c = sahte();
  assert.equal((await zamanliEsitle({ db, simdiMs: simdi, calistir: c })).calisti, false);
});
