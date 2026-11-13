import test from 'node:test'; import assert from 'node:assert/strict';
import { yapiOzeti } from './yapi.mjs';
test('kök dizi: öğe alanları birleşir, değer sızmaz', () => {
  const o = yapiOzeti([{ sleepScore: 54, gizli: 'Ali' }, { sleepScore: null, ek: true }]);
  assert.deepEqual(o, ['dizi[].ek: boolean', 'dizi[].gizli: string', 'dizi[].sleepScore: null|number', 'dizi[]: object']);
  assert.equal(o.join('\n').includes('Ali'), false);
});
test('kök nesne: iç içe nesne ve dizi yolları', () => {
  const o = yapiOzeti({ a: { b: [1, 2] }, bos: [] });
  assert.deepEqual(o, ['a.b: array', 'a.b[]: number', 'a: object', 'bos: array']);
});
