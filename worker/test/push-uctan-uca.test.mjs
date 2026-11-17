// Gerçek brifing.js + gerçek push/gonder.js; yalnız fetch sahte. Alıcı tarafı node:crypto ile bağımsız çözer (RFC 8291).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, hkdfSync, createDecipheriv, createPublicKey, verify } from 'node:crypto';
import { testD1 } from './helpers/d1.mjs';
import { durumOku, abonelikYaz, abonelikleriOku } from '../src/db.js';
import { brifingGonder } from '../src/brifing.js';
import { vapidUret } from '../../tools/vapid-uret.mjs';

const SABAH = Date.UTC(2026, 10, 12, 5, 0);
const BUGUN = '2026-11-12';
const UC = 'https://web.push.apple.com/x';
const b64 = (b) => Buffer.from(b).toString('base64url');

const YANIT = {
  bugun: BUGUN,
  gunler: [{ tarih: BUGUN, e: 0.5, hukum: 'Dengeli bir gün.', gerekce: 'Bütün ölçümlerin normal aralığında.', d: {} }],
  olcumler: [],
};

function coz(govde, ua, auth) {
  const salt = govde.subarray(0, 16);
  const idlen = govde[20];
  const asAcik = Buffer.from(govde.subarray(21, 21 + idlen));
  const sifreli = govde.subarray(21 + idlen);
  const ecdh = ua.computeSecret(asAcik);
  const ikm = Buffer.from(hkdfSync('sha256', ecdh, auth,
    Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asAcik]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(Buffer.from(sifreli.subarray(-16)));
  const duz = Buffer.concat([d.update(Buffer.from(sifreli.subarray(0, -16))), d.final()]);
  assert.equal(duz[duz.length - 1], 0x02);
  return JSON.parse(duz.subarray(0, -1).toString('utf8'));
}

async function kur(durumKodu) {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const vapid = await vapidUret();
  const db = testD1();
  await abonelikYaz(db, { endpoint: UC, p256dh: b64(ua.getPublicKey()), auth: b64(auth) }, 1);
  const cagrilar = [];
  const fetchSahte = async (url, init) => {
    cagrilar.push({ url, init });
    return { status: durumKodu };
  };
  const env = { VAPID_PUBLIC_KEY: vapid.acik, VAPID_PRIVATE_KEY: vapid.gizli, VAPID_KONU: 'https://ornek.test/' };
  const sonuc = await brifingGonder({ db, env, yanit: YANIT, bugun: BUGUN, simdiMs: SABAH, fetch: fetchSahte });
  return { ua, auth, vapid, db, cagrilar, sonuc };
}

test('uçtan uca 201: VAPID JWT doğrulanır, başlıklar doğru, gövde alıcıda çözülür', async () => {
  const { ua, auth, vapid, db, cagrilar, sonuc } = await kur(201);
  assert.deepEqual(sonuc, { durum: 'gonderildi', basarili: 1 });
  assert.equal(cagrilar.length, 1);
  const { url, init } = cagrilar[0];
  assert.equal(url, UC);
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers['Content-Encoding'], 'aes128gcm');
  assert.ok(Number(init.headers.TTL) > 0);

  const yetki = init.headers.Authorization;
  assert.ok(yetki.startsWith('vapid t='));
  assert.ok(yetki.endsWith(`, k=${vapid.acik}`));
  const jwt = yetki.slice('vapid t='.length, yetki.length - `, k=${vapid.acik}`.length);
  const [ustB, yukB, imzaB] = jwt.split('.');
  const x = Buffer.from(vapid.acik, 'base64url');
  const anahtar = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64(x.subarray(1, 33)), y: b64(x.subarray(33, 65)) }, format: 'jwk' });
  assert.equal(verify('sha256', Buffer.from(`${ustB}.${yukB}`), { key: anahtar, dsaEncoding: 'ieee-p1363' }, Buffer.from(imzaB, 'base64url')), true);
  const yuk = JSON.parse(Buffer.from(yukB, 'base64url').toString());
  assert.equal(yuk.aud, 'https://web.push.apple.com');
  const kalan = yuk.exp - Math.floor(SABAH / 1000); // saniye (ms olsa devasa çıkar)
  assert.ok(kalan > 0 && kalan <= 24 * 3600);

  const govde = coz(new Uint8Array(init.body), ua, Buffer.from(auth));
  assert.deepEqual(govde, { baslik: 'Dengeli bir gün.', govde: 'Bütün ölçümlerin normal aralığında.', etiket: `brifing-${BUGUN}`, url: './' });
  assert.equal(await durumOku(db, 'brifing_gun'), BUGUN);
});

test('uçtan uca 410: abonelik silinir, brifing_gun yazılmaz, deneme sayılır', async () => {
  const { db, cagrilar, sonuc } = await kur(410);
  assert.equal(cagrilar.length, 1);
  assert.deepEqual(sonuc, { durum: 'hata', basarili: 0 });
  assert.deepEqual(await abonelikleriOku(db), []);
  assert.equal(await durumOku(db, 'brifing_gun'), null);
});

test('uçtan uca 500: brifing_deneme.n 1, brifing_gun yazılmaz, abonelik kalır', async () => {
  const { db, cagrilar, sonuc } = await kur(500);
  assert.equal(cagrilar.length, 1);
  assert.deepEqual(sonuc, { durum: 'hata', basarili: 0 });
  assert.deepEqual(await durumOku(db, 'brifing_deneme'), { tarih: BUGUN, n: 1 });
  assert.equal(await durumOku(db, 'brifing_gun'), null);
  assert.equal((await abonelikleriOku(db)).length, 1);
});
