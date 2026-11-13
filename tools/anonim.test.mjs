import test from 'node:test'; import assert from 'node:assert/strict';
import { anonimlestir } from './anonim.mjs';
test('yapıyı korur, değerleri değiştirir', () => {
  const g = { calendarDate: '2026-11-12', sleepScore: 54, name: 'Ali', nested: [{ v: 3.5, ok: true, n: null }] };
  const c = anonimlestir(g);
  assert.deepEqual(Object.keys(c), Object.keys(g));
  assert.match(c.calendarDate, /^\d{4}-\d{2}-\d{2}$/);      // tarih biçimi korunur
  assert.equal(typeof c.sleepScore, 'number');
  assert.notEqual(c.name, 'Ali');                            // serbest metin maskelenir
  assert.equal(c.nested[0].ok, true); assert.equal(c.nested[0].n, null);
  assert.equal(Number.isInteger(c.sleepScore), true);        // tam sayı tam sayı kalır
});
test('kimlik benzeri anahtarlar sabit değerle değişir', () => {
  const c = anonimlestir({ userProfilePK: 123456, displayName: 'x', activityId: 987 });
  assert.equal(c.userProfilePK, 0); assert.equal(c.activityId, 0);
});
test('koordinatlar 0 olur, benzer anahtarlara dokunulmaz', () => {
  const g = { startLatitude: 41.01, startLongitude: 28.97, lat: 1.5, lon_deg: 2.5, end_longitude: 3.5,
    elevation: 100, calendarDate: '2026-11-12', relativeHumidity: 80, durationInSeconds: 3600 };
  const c = anonimlestir(g);
  for (const k of ['startLatitude', 'startLongitude', 'lat', 'lon_deg', 'end_longitude']) assert.equal(c[k], 0, k);
  for (const k of ['elevation', 'relativeHumidity', 'durationInSeconds']) assert.notEqual(c[k], 0, k);
  assert.match(c.calendarDate, /^\d{4}-\d{2}-\d{2}$/);
});
