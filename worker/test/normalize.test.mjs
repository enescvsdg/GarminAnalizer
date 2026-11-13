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
  const kardes = satirlar.find((s) => s.date === y.sleep[1].calendarDate);
  assert.ok(kardes.sleep_score !== null, 'dokunulmamış gün dolu');
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

// Bağımsız beklenti tablosu: hedef -> (kaynak öğe) => beklenen değer. normalize.js'ten içe aktarılmaz.
const gecerli = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const sn = (v) => (gecerli(v) === null ? null : Math.round(v / 1000));
const UYKU_BEKLENTI = {
  sleep_score: (u) => gecerli(u.sleepScores?.overall?.value),
  sleep_seconds: (u) => gecerli(u.sleepTimeSeconds),
  sleep_deep_s: (u) => gecerli(u.deepSleepSeconds),
  sleep_light_s: (u) => gecerli(u.lightSleepSeconds),
  sleep_rem_s: (u) => gecerli(u.remSleepSeconds),
  sleep_awake_s: (u) => gecerli(u.awakeSleepSeconds),
  sleep_need_min: (u) => gecerli(u.sleepNeed?.actual),
  sleep_stress_avg: (u) => gecerli(u.avgSleepStress),
  nap_seconds: (u) => gecerli(u.napTimeSeconds),
};
const HRV_BEKLENTI = {
  hrv_avg: (h) => gecerli(h.lastNightAvg),
  hrv_weekly_avg: (h) => gecerli(h.weeklyAvg),
  hrv_status: (h) => (typeof h.status === 'string' && h.status !== '' ? h.status : null),
};
const GUNLUK_BEKLENTI = {
  resting_hr: (d) => gecerli(d.heartRate?.restingValue),
  hr_max: (d) => gecerli(d.heartRate?.maxValue),
  stress_avg: (d) => gecerli(d.stress?.avgLevel),
  stress_rest_s: (d) => sn(d.stress?.restDurationInMillis),
  stress_low_s: (d) => sn(d.stress?.lowStressDurationInMillis),
  stress_med_s: (d) => sn(d.stress?.mediumStressDurationInMillis),
  stress_high_s: (d) => sn(d.stress?.highStressDurationInMillis),
  bb_high: (d) => gecerli(d.bodyBattery?.maxValue),
  bb_low: (d) => gecerli(d.bodyBattery?.minValue),
  bb_charged: (d) => gecerli(d.bodyBattery?.chargedValue),
  bb_drained: (d) => gecerli(d.bodyBattery?.drainedValue),
  steps: (d) => gecerli(d.movement?.steps?.value),
  floors: (d) => gecerli(d.movement?.floorsAscended?.value),
  intensity_minutes: (d) => {
    const o = gecerli(d.intensityMinutes?.moderate);
    const v = gecerli(d.intensityMinutes?.vigorous);
    return o === null && v === null ? null : (o ?? 0) + 2 * (v ?? 0);
  },
  calories: (d) => gecerli(d.calories?.burnedTotal),
  calories_active: (d) => gecerli(d.calories?.burnedActive),
  spo2_avg: (d) => gecerli(d.pulseOx?.avgValue),
  spo2_min: (d) => gecerli(d.pulseOx?.minValue),
  resp_avg: (d) => gecerli(d.respiration?.avgValue),
};
// Örnek dosyalarda her gün null olan alanlar (varsa) burada açıkça listelenir.
const ORNEKTE_BOS = new Set([]);

test('her alan, her örnek günde kaynak yolundan beklenen değere eşittir', () => {
  const y = taze();
  assert.equal(y.dailysummaries.data.length, y.sleep.length);
  assert.equal(y.hrv.hrvSummaries.length, y.sleep.length);
  const satirlar = new Map(gunleriCikar(y).map((s) => [s.date, s]));
  const kaynaklar = [
    [UYKU_BEKLENTI, y.sleep],
    [HRV_BEKLENTI, y.hrv.hrvSummaries],
    [GUNLUK_BEKLENTI, y.dailysummaries.data],
  ];
  const tum = new Set(Object.keys({ ...UYKU_BEKLENTI, ...HRV_BEKLENTI, ...GUNLUK_BEKLENTI }));
  assert.equal(tum.size, SAYISAL.length + 1, 'tablo tüm alanları kapsar');
  for (const [tablo, liste] of kaynaklar) {
    for (const [alan, bekle] of Object.entries(tablo)) {
      let doluGun = 0;
      for (const oge of liste) {
        const satir = satirlar.get(oge.calendarDate);
        assert.ok(satir, `${oge.calendarDate} satırı var`);
        const beklenen = bekle(oge);
        assert.deepEqual(satir[alan], beklenen, `${oge.calendarDate} ${alan}`);
        if (beklenen !== null) doluGun++;
      }
      if (ORNEKTE_BOS.has(alan)) assert.equal(doluGun, 0, `${alan} örnekte boş olmalı`);
      else assert.ok(doluGun > 0, `${alan} hiçbir örnek günde dolu değil`);
    }
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
  const bekle = {
    type: (x) => (typeof x.activityType?.typeKey === 'string' && x.activityType.typeKey !== '' ? x.activityType.typeKey : null),
    start_ts: (x) => gecerli(x.beginTimestamp),
    duration_s: (x) => (gecerli(x.duration) === null ? null : Math.round(x.duration)),
    distance_m: (x) => gecerli(x.distance),
    avg_hr: (x) => gecerli(x.averageHR),
    max_hr: (x) => gecerli(x.maxHR),
    training_load: (x) => gecerli(x.activityTrainingLoad),
    aerobic_te: (x) => gecerli(x.aerobicTrainingEffect),
    anaerobic_te: (x) => gecerli(x.anaerobicTrainingEffect),
    calories: (x) => gecerli(x.calories),
    total_sets: (x) => gecerli(x.totalSets),
    total_reps: (x) => gecerli(x.totalReps),
    avg_cadence: (x) => gecerli(x.averageRunningCadenceInStepsPerMinute),
    avg_stride_m: (x) => gecerli(x.avgStrideLength),
    avg_gct_ms: (x) => gecerli(x.avgGroundContactTime),
    avg_power: (x) => gecerli(x.avgPower),
    hr_zones_json: (x) => {
      const z = [1, 2, 3, 4, 5].map((n) => gecerli(x[`hrTimeInZone_${n}`]));
      return z.every((v) => v === null) ? null : JSON.stringify(z);
    },
    sets_json: (x) => (Array.isArray(x.summarizedExerciseSets) && x.summarizedExerciseSets.length ? JSON.stringify(x.summarizedExerciseSets) : null),
    raw_json: (x) => JSON.stringify(x),
  };
  // Örnek dosyada her etkinlikte null olan alanlar açıkça burada listelenir.
  const BOS = new Set([]);
  for (const [alan, f] of Object.entries(bekle)) {
    let dolu = 0;
    ham.forEach((x, i) => {
      assert.deepEqual(liste[i][alan], f(x), `etkinlik ${i} ${alan}`);
      if (f(x) !== null) dolu++;
    });
    if (BOS.has(alan)) assert.equal(dolu, 0, alan);
    else assert.ok(dolu > 0, `${alan} hiçbir etkinlikte dolu değil`);
  }
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
