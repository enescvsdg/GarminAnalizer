import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunleriCikar, aktiviteleriCikar } from '../src/garmin/normalize.js';

const yukle = (ad) => JSON.parse(readFileSync(new URL(`../../kesif/ornek/${ad}.json`, import.meta.url), 'utf8'));
const taze = () => ({ dailysummaries: yukle('dailysummaries'), sleep: yukle('sleep'), hrv: yukle('hrv') });
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const SAYISAL = [
  'sleep_score', 'sleep_seconds', 'sleep_deep_s', 'sleep_light_s', 'sleep_rem_s', 'sleep_awake_s', 'sleep_need_min',
  'sleep_stress_avg', 'nap_seconds', 'hrv_avg', 'hrv_weekly_avg', 'resting_hr', 'hr_max', 'stress_avg',
  'stress_rest_s', 'stress_low_s', 'stress_med_s', 'stress_high_s', 'bb_high', 'bb_low', 'bb_charged', 'bb_drained',
  'steps', 'floors', 'intensity_minutes', 'calories', 'calories_active', 'spo2_avg', 'spo2_min', 'resp_avg',
];
const sayiyaDaNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));

test('örnek yanıtlardan her gün için tek satır çıkar', () => {
  const satirlar = gunleriCikar(taze());
  assert.ok(satirlar.length > 0);
  const tarihler = satirlar.map((s) => s.date);
  assert.equal(new Set(tarihler).size, tarihler.length);
  assert.deepEqual(tarihler, [...tarihler].sort());
  for (const t of tarihler) assert.match(t, TARIH);
});

test('sayısal alanlar sayı ya da null; training_load anahtarı yok', () => {
  for (const s of gunleriCikar(taze())) {
    for (const alan of SAYISAL) assert.ok(sayiyaDaNull(s[alan]), `${s.date} ${alan}: ${s[alan]}`);
    assert.ok(typeof s.hrv_status === 'string' || s.hrv_status === null);
    assert.ok(!('training_load' in s));
    assert.ok(!('synced_at' in s));
  }
});

test('değerler makul aralıkta', () => {
  const aralik = { sleep_score: [0, 115], resting_hr: [20, 140], stress_avg: [0, 115], bb_high: [0, 115], hrv_avg: [1, 300] };
  for (const s of gunleriCikar(taze())) {
    for (const [alan, [alt, ust]] of Object.entries(aralik)) {
      if (s[alan] !== null) assert.ok(s[alan] >= alt && s[alan] <= ust, `${s.date} ${alan}=${s[alan]}`);
    }
  }
});

test('bir kaynak eksikse o alanlar null, diğerleri dolu', () => {
  const { sleep, dailysummaries } = taze();
  const satirlar = gunleriCikar({ sleep, dailysummaries });
  assert.ok(satirlar.length > 0);
  for (const s of satirlar) {
    assert.equal(s.hrv_avg, null);
    assert.equal(s.hrv_weekly_avg, null);
    assert.equal(s.hrv_status, null);
  }
  assert.ok(satirlar.some((s) => s.sleep_score !== null));
});

test('boş girdi boş dizi', () => {
  assert.deepEqual(gunleriCikar({}), []);
  assert.deepEqual(gunleriCikar(), []);
});

test('negatif yer tutucu null olur, 0 korunur', () => {
  const y = taze();
  const gun = y.sleep[0].calendarDate;
  y.sleep[0].sleepScores.overall.value = -1;
  const ds = y.dailysummaries.data.find((d) => d.calendarDate === gun) ?? y.dailysummaries.data[0];
  ds.movement.steps.value = 0;
  const satirlar = gunleriCikar(y);
  assert.equal(satirlar.find((s) => s.date === gun).sleep_score, null);
  assert.equal(satirlar.find((s) => s.date === ds.calendarDate).steps, 0);
});

test('intensity_minutes = moderate + 2 × vigorous', () => {
  const y = taze();
  const d = y.dailysummaries.data[0];
  const beklenen = d.intensityMinutes.moderate + 2 * d.intensityMinutes.vigorous;
  assert.equal(gunleriCikar(y).find((s) => s.date === d.calendarDate).intensity_minutes, beklenen);
});

test('intensity_minutes: biri eksikse 0 sayılır, ikisi de yoksa null', () => {
  const y = { dailysummaries: { data: [
    { calendarDate: '2026-01-01', intensityMinutes: { moderate: 10 } },
    { calendarDate: '2026-01-02', intensityMinutes: { vigorous: 5 } },
    { calendarDate: '2026-01-03', intensityMinutes: {} },
  ] } };
  const [a, b, c] = gunleriCikar(y);
  assert.equal(a.intensity_minutes, 10);
  assert.equal(b.intensity_minutes, 10);
  assert.equal(c.intensity_minutes, null);
});

test('stres süreleri milisaniyeden saniyeye yuvarlanır', () => {
  const y = taze();
  const d = y.dailysummaries.data[0];
  const s = gunleriCikar(y).find((x) => x.date === d.calendarDate);
  assert.equal(s.stress_rest_s, Math.round(d.stress.restDurationInMillis / 1000));
  assert.equal(s.stress_low_s, Math.round(d.stress.lowStressDurationInMillis / 1000));
  assert.equal(s.stress_med_s, Math.round(d.stress.mediumStressDurationInMillis / 1000));
  assert.equal(s.stress_high_s, Math.round(d.stress.highStressDurationInMillis / 1000));
});

test('alanlar kaynak yollarından okunur', () => {
  const y = taze();
  const d = y.dailysummaries.data[0];
  const sl = y.sleep.find((x) => x.calendarDate === d.calendarDate);
  const h = y.hrv.hrvSummaries.find((x) => x.calendarDate === d.calendarDate);
  const s = gunleriCikar(y).find((x) => x.date === d.calendarDate);
  assert.equal(s.resting_hr, d.heartRate.restingValue);
  assert.equal(s.hr_max, d.heartRate.maxValue);
  assert.equal(s.bb_charged, d.bodyBattery.chargedValue);
  assert.equal(s.floors, d.movement.floorsAscended.value);
  assert.equal(s.calories_active, d.calories.burnedActive);
  assert.equal(s.spo2_min, d.pulseOx.minValue);
  assert.equal(s.resp_avg, d.respiration.avgValue);
  if (sl) {
    assert.equal(s.sleep_need_min, sl.sleepNeed.actual);
    assert.equal(s.sleep_deep_s, sl.deepSleepSeconds);
  }
  if (h) {
    assert.equal(s.hrv_weekly_avg, h.weeklyAvg);
    assert.equal(s.hrv_status, h.status);
  }
});

test('raw_json üç anahtarı içerir', () => {
  for (const s of gunleriCikar(taze())) {
    const ham = JSON.parse(s.raw_json);
    assert.deepEqual(Object.keys(ham).sort(), ['dailysummaries', 'hrv', 'sleep']);
  }
  const yalniz = gunleriCikar({ hrv: yukle('hrv') })[0];
  const ham = JSON.parse(yalniz.raw_json);
  assert.equal(ham.dailysummaries, null);
  assert.equal(ham.sleep, null);
  assert.ok(ham.hrv);
});

test('bozuk calendarDate atlanır, tekrar eden günde sonraki kazanır', () => {
  const y = { dailysummaries: { data: [
    { calendarDate: 'bozuk', steps: 1 },
    { calendarDate: 5, steps: 1 },
    {},
    { calendarDate: '2026-02-01', movement: { steps: { value: 100 } } },
    { calendarDate: '2026-02-01', movement: { steps: { value: 200 } } },
  ] } };
  const satirlar = gunleriCikar(y);
  assert.equal(satirlar.length, 1);
  assert.equal(satirlar[0].steps, 200);
});

test('aktiviteleriCikar: her etkinlik için bir nesne', () => {
  const ham = yukle('activities');
  const liste = aktiviteleriCikar(ham);
  assert.equal(liste.length, ham.length);
  for (const a of liste) {
    assert.equal(typeof a.id, 'string');
    assert.match(a.date, TARIH);
    assert.ok(a.hr_zones_json === null || Array.isArray(JSON.parse(a.hr_zones_json)));
    assert.equal(JSON.stringify(JSON.parse(a.raw_json)), a.raw_json);
  }
  const i = 0;
  assert.equal(liste[i].type, ham[i].activityType.typeKey);
  assert.equal(liste[i].duration_s, Math.round(ham[i].duration));
  assert.equal(liste[i].training_load, ham[i].activityTrainingLoad);
  assert.equal(liste[i].avg_stride_m, ham[i].avgStrideLength);
  const j = ham.findIndex((x) => Array.isArray(x.summarizedExerciseSets) && x.summarizedExerciseSets.length);
  if (j >= 0) assert.deepEqual(JSON.parse(liste[j].sets_json), ham[j].summarizedExerciseSets);
});

test('aktiviteleriCikar: geçersiz girdi boş dizi, kimliksiz ve tarihsiz etkinlik atlanır', () => {
  assert.deepEqual(aktiviteleriCikar(null), []);
  assert.deepEqual(aktiviteleriCikar({}), []);
  assert.deepEqual(aktiviteleriCikar([{ startTimeLocal: '2026-01-01 10:00:00' }, { activityId: 1, startTimeLocal: 'x' }]), []);
  const [a] = aktiviteleriCikar([{ activityId: 7, startTimeLocal: '2026-01-01 10:00:00', duration: -1, distance: 0 }]);
  assert.equal(a.id, '7');
  assert.equal(a.duration_s, null);
  assert.equal(a.distance_m, 0);
  assert.equal(a.hr_zones_json, null);
  assert.equal(a.sets_json, null);
});
