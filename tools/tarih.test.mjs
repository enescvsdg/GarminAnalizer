import test from 'node:test'; import assert from 'node:assert/strict';
import { istanbulGunu } from './tarih.mjs';
test('gün Europe/Istanbul saatine göre bulunur', () => {
  assert.equal(istanbulGunu(new Date('2026-11-12T21:30:00Z')), '2026-11-13');
  assert.equal(istanbulGunu(new Date('2026-11-12T20:59:00Z')), '2026-11-12');
});
