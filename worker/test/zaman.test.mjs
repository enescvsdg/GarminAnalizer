import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yerelTarih, gunEkle } from '../src/zaman.js';

test('UTC 21:30 İstanbulda ertesi gündür', () => { assert.equal(yerelTarih(Date.UTC(2026, 10, 12, 21, 30)), '2026-11-13'); });
test('UTC 20:59 aynı gündür', () => { assert.equal(yerelTarih(Date.UTC(2026, 10, 12, 20, 59)), '2026-11-12'); });
test('gunEkle ay sonunu geçer', () => {
  assert.equal(gunEkle('2026-10-31', 1), '2026-11-01');
  assert.equal(gunEkle('2026-11-01', -1), '2026-10-31');
});
