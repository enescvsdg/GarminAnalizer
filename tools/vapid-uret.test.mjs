import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vapidUret } from './vapid-uret.mjs';

const coz = (s) => Buffer.from(s, 'base64url');

test('vapidUret: 65 baytlık açık nokta (0x04), 32 baytlık skaler, dolgusuz base64url', async () => {
  const { acik, gizli } = await vapidUret();
  assert.match(acik, /^[A-Za-z0-9_-]+$/);
  assert.match(gizli, /^[A-Za-z0-9_-]+$/);
  assert.equal(coz(acik).length, 65);
  assert.equal(coz(acik)[0], 0x04);
  assert.equal(coz(gizli).length, 32);
  assert.notEqual((await vapidUret()).gizli, gizli);
});

test('vapidUret: çift geçerli ECDSA P-256 anahtar çiftidir (gizli ile imzala, açıkla doğrula)', async () => {
  const { acik, gizli } = await vapidUret();
  const nokta = coz(acik);
  const ozel = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: gizli, x: nokta.subarray(1, 33).toString('base64url'), y: nokta.subarray(33).toString('base64url'),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const genel = await crypto.subtle.importKey('raw', nokta, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const veri = new TextEncoder().encode('deneme');
  const imza = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ozel, veri);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, genel, imza, veri), true);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, genel, imza, new TextEncoder().encode('baska')), false);
});
