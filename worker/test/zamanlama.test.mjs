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
  await kur(db, { son_esitleme: SIMDI - 1 * SAAT, gecmis_imlec: BITTI, key_durum: 'gecerli' });
  const c = sahte();
  const s = await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 0);
  assert.deepEqual(s, { calisti: false, neden: 'taze' });
});

test('geçmiş bitmemişse taze olsa da çağrılır', async () => {
  const db = testD1();
  await kur(db, { son_esitleme: SIMDI - 1 * SAAT, gecmis_imlec: BITMEDI });
  const c = sahte();
  const s = await zamanliEsitle({ db, simdiMs: SIMDI, calistir: c });
  assert.equal(c.sayi, 1);
  assert.deepEqual(s, { calisti: true, durum: 'tamam' });
});

test('gecmis_imlec yoksa çağrılır', async () => {
  const db = testD1();
  await kur(db, { son_esitleme: SIMDI - 1 * SAAT });
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

test('3 saatten eski son_esitleme: çağrılır', async () => {
  const db = testD1();
  await kur(db, { son_esitleme: SIMDI - 3 * SAAT - 1, gecmis_imlec: BITTI });
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
