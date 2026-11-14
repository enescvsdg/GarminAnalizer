// Garmin yanıtlarını veritabanı satırlarına çevirir. Saf modül: ağ ve saat yok.

const TARIH = /^\d{4}-\d{2}-\d{2}$/;

// Nokta yolunu güvenle okur; ara düğüm yoksa undefined.
function oku(nesne, yol) {
  let d = nesne;
  for (const anahtar of yol.split('.')) {
    if (d === null || typeof d !== 'object') return undefined;
    d = d[anahtar];
  }
  return d;
}

// Sonlu ve >= 0 sayı kalır; -1, -2 gibi yer tutucular ve diğer her şey null.
const sayi = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const msSaniye = (v) => {
  const s = sayi(v);
  return s === null ? null : Math.round(s / 1000);
};
const yuvarla = (v) => {
  const s = sayi(v);
  return s === null ? null : Math.round(s);
};
const metin = (v) => (typeof v === 'string' && v !== '' ? v : null);

// [hedef, kaynak yolu, dönüştürücü]
const SLEEP = [
  ['sleep_score', 'sleepScores.overall.value'],
  ['sleep_seconds', 'sleepTimeSeconds'],
  ['sleep_deep_s', 'deepSleepSeconds'],
  ['sleep_light_s', 'lightSleepSeconds'],
  ['sleep_rem_s', 'remSleepSeconds'],
  ['sleep_awake_s', 'awakeSleepSeconds'],
  ['sleep_need_min', 'sleepNeed.actual'],
  ['sleep_stress_avg', 'avgSleepStress'],
  ['nap_seconds', 'napTimeSeconds'],
];
const HRV = [
  ['hrv_avg', 'lastNightAvg'],
  ['hrv_weekly_avg', 'weeklyAvg'],
  ['hrv_status', 'status', metin],
];
const GUNLUK = [
  ['resting_hr', 'heartRate.restingValue'],
  ['hr_max', 'heartRate.maxValue'],
  ['stress_avg', 'stress.avgLevel'],
  ['stress_rest_s', 'stress.restDurationInMillis', msSaniye],
  ['stress_low_s', 'stress.lowStressDurationInMillis', msSaniye],
  ['stress_med_s', 'stress.mediumStressDurationInMillis', msSaniye],
  ['stress_high_s', 'stress.highStressDurationInMillis', msSaniye],
  ['bb_high', 'bodyBattery.maxValue'],
  ['bb_low', 'bodyBattery.minValue'],
  ['bb_charged', 'bodyBattery.chargedValue'],
  ['bb_drained', 'bodyBattery.drainedValue'],
  ['steps', 'movement.steps.value'],
  ['floors', 'movement.floorsAscended.value'],
  ['calories', 'calories.burnedTotal'],
  ['calories_active', 'calories.burnedActive'],
  ['spo2_avg', 'pulseOx.avgValue'],
  ['spo2_min', 'pulseOx.minValue'],
  ['resp_avg', 'respiration.avgValue'],
];

function alanlariDoldur(satir, kaynak, tablo) {
  for (const [hedef, yol, donustur = sayi] of tablo) satir[hedef] = donustur(oku(kaynak, yol));
}

// Dizideki öğeleri gün anahtarına göre eşler; geçersiz tarih atlanır, tekrarda sonraki kazanır.
function gunHaritasi(liste) {
  const harita = new Map();
  if (!Array.isArray(liste)) return harita;
  for (const oge of liste) {
    const gun = oge?.calendarDate;
    if (typeof gun === 'string' && TARIH.test(gun)) harita.set(gun, oge);
  }
  return harita;
}

function yogunlukDakikasi(gun) {
  const orta = sayi(oku(gun, 'intensityMinutes.moderate'));
  const siddetli = sayi(oku(gun, 'intensityMinutes.vigorous'));
  if (orta === null && siddetli === null) return null;
  return (orta ?? 0) + 2 * (siddetli ?? 0);
}

export function gunleriCikar({ dailysummaries, sleep, hrv } = {}) {
  const gunluk = gunHaritasi(dailysummaries?.data);
  const uyku = gunHaritasi(sleep);
  const hrvH = gunHaritasi(hrv?.hrvSummaries);
  const tarihler = [...new Set([...gunluk.keys(), ...uyku.keys(), ...hrvH.keys()])].sort();

  return tarihler.map((date) => {
    const g = gunluk.get(date) ?? null;
    const u = uyku.get(date) ?? null;
    const h = hrvH.get(date) ?? null;
    const satir = { date };
    alanlariDoldur(satir, u, SLEEP);
    alanlariDoldur(satir, h, HRV);
    alanlariDoldur(satir, g, GUNLUK);
    satir.intensity_minutes = yogunlukDakikasi(g);
    satir.raw_json = JSON.stringify({ dailysummaries: g, sleep: u, hrv: h });
    return satir;
  });
}

const AKTIVITE = [
  ['type', 'activityType.typeKey', metin],
  ['start_ts', 'beginTimestamp'],
  ['duration_s', 'duration', yuvarla],
  ['distance_m', 'distance'],
  ['avg_hr', 'averageHR'],
  ['max_hr', 'maxHR'],
  ['training_load', 'activityTrainingLoad'],
  ['aerobic_te', 'aerobicTrainingEffect'],
  ['anaerobic_te', 'anaerobicTrainingEffect'],
  ['calories', 'calories'],
  ['total_sets', 'totalSets'],
  ['total_reps', 'totalReps'],
  ['avg_cadence', 'averageRunningCadenceInStepsPerMinute'],
  ['avg_stride_m', 'avgStrideLength'],
  ['avg_gct_ms', 'avgGroundContactTime'],
  ['avg_power', 'avgPower'],
];

export function aktiviteleriCikar(yanit) {
  if (!Array.isArray(yanit)) return [];
  const cikti = [];
  for (const a of yanit) {
    if (a === null || typeof a !== 'object') continue;
    if (a.activityId === undefined || a.activityId === null) continue;
    const date = typeof a.startTimeLocal === 'string' ? a.startTimeLocal.slice(0, 10) : '';
    if (!TARIH.test(date)) continue;

    const satir = { id: String(a.activityId), date };
    alanlariDoldur(satir, a, AKTIVITE);
    const bolgeler = [1, 2, 3, 4, 5].map((i) => sayi(a[`hrTimeInZone_${i}`]));
    satir.hr_zones_json = bolgeler.every((b) => b === null) ? null : JSON.stringify(bolgeler);
    const setler = a.summarizedExerciseSets;
    satir.sets_json = Array.isArray(setler) && setler.length > 0 ? JSON.stringify(setler) : null;
    satir.raw_json = JSON.stringify(a);
    cikti.push(satir);
  }
  return cikti;
}
