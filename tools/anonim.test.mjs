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
test('tarih-saat dizgesinde tarih kalır, saat sıfırlanır; yalnız tarih değişmez', () => {
  assert.equal(anonimlestir('2026-11-12', 'calendarDate'), '2026-11-12');
  assert.equal(anonimlestir('2026-11-12T06:05:31.0', 'startTimeGMT'), '2026-11-12T00:00:00.0');
  assert.equal(anonimlestir('2026-11-12 23:40:10', 'startTimeLocal'), '2026-11-12 00:00:00');
  assert.equal(anonimlestir('2026-11-12T21:30:00.000Z', 'x'), '2026-11-12T00:00:00.000Z');
  assert.equal(anonimlestir('2026-11-12T21:30:00+03:00', 'x'), '2026-11-12T00:00:00+03:00');
});
test('saat dilimi ve ofset sayıları (konum ipucu) 0 olur', () => {
  const c = anonimlestir({ timezoneOffset: 10800000, napStartTimeOffset: -180, offsetSeconds: 3600, elevation: 100 });
  for (const k of ['timezoneOffset', 'napStartTimeOffset', 'offsetSeconds']) assert.equal(c[k], 0, k);
  assert.notEqual(c.elevation, 0);
});
