import test from 'node:test'; import assert from 'node:assert/strict';
import { yapiOzeti, ozetle } from './yapi.mjs';
test('kök dizi: öğe alanları birleşir, değer sızmaz', () => {
  const o = yapiOzeti([{ sleepScore: 54, gizli: 'Ali' }, { sleepScore: null, ek: true }]);
  assert.deepEqual(o, ['dizi[].ek: boolean', 'dizi[].gizli: string', 'dizi[].sleepScore: null|number', 'dizi[]: object']);
  assert.equal(o.join('\n').includes('Ali'), false);
});
test('kök nesne: iç içe nesne ve dizi yolları', () => {
  const o = yapiOzeti({ a: { b: [1, 2] }, bos: [] });
  assert.deepEqual(o, ['a.b: array', 'a.b[]: number', 'a: object', 'bos: array']);
});

test('ozetle: boş/dolu ayrımı ve anahtar adları', () => {
  assert.deepEqual(ozetle([]), { bos: true, sayi: 0, anahtarlar: [] });
  assert.deepEqual(ozetle({}), { bos: true, sayi: 0, anahtarlar: [] });
  assert.deepEqual(ozetle({ b: null, a: null }), { bos: true, sayi: 0, anahtarlar: ['a', 'b'] });
  assert.deepEqual(ozetle({ liste: [] }), { bos: true, sayi: 0, anahtarlar: ['liste'] });
  assert.deepEqual(ozetle({ liste: [1, 2, 3], x: null }), { bos: false, sayi: 3, anahtarlar: ['liste', 'x'] });
  assert.deepEqual(ozetle([{ a: 1 }, { b: 2 }]), { bos: false, sayi: 2, anahtarlar: ['a', 'b'] });
  assert.deepEqual(ozetle({ steps: 0 }), { bos: false, sayi: 1, anahtarlar: ['steps'] });
});
