// Aktiviteler ekranı: üstte haftalık yük özeti (son 8 hafta + kişisel normal bant), altında tarihe göre
// gruplu liste, dokununca ayrıntı. Kabuk bunu `aktiviteKur(kap, baglam)` ile yükler.
//
//   const a = aktiviteKur(kap, { getir, ornek, canli, ses, rm, gunAc });  a.goster(); a.gizle(); a.yokEt();
//
// Kurallar: DOM yalnız createElement/textContent ile kurulur (API metni asla innerHTML'e girmez), satır içi
// olay özniteliği yok, dış kaynak yok. Eksik değer null'dır ve hiçbir yerde görünmez; "veri yok" yalnız
// bütün bir bölüm boşsa yazılır. Durum renkle birlikte ok + metinle verilir.

import { GUN_UZUN, AY } from './veri-canli.js';

const NS = 'http://www.w3.org/2000/svg';
const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const SAAT_DILIMI_MS = 3 * 3600 * 1000; // Europe/Istanbul sabit UTC+3

const sonlu = (v) => typeof v === 'number' && Number.isFinite(v);
const metinMi = (v) => typeof v === 'string' && v.length > 0;

/* ================= Saf yardımcılar ================= */

const TUR_AD = {
  running: 'Koşu',
  treadmill_running: 'Koşu bandı',
  trail_running: 'Patika koşusu',
  walking: 'Yürüyüş',
  hiking: 'Doğa yürüyüşü',
  cycling: 'Bisiklet',
  indoor_cycling: 'Salon bisikleti',
  swimming: 'Yüzme',
  lap_swimming: 'Havuz yüzme',
  open_water_swimming: 'Açık su yüzme',
  strength_training: 'Kuvvet',
  yoga: 'Yoga',
  pilates: 'Pilates',
  hiit: 'HIIT',
  cardio: 'Kardiyo',
  elliptical: 'Eliptik',
  rowing: 'Kürek',
  indoor_rowing: 'Salon küreği',
  other: 'Diğer',
};

// Tür anahtarı → simge grubu.
const TUR_GRUP = {
  running: 'kosu', treadmill_running: 'kosu', trail_running: 'kosu',
  walking: 'yuruyus', hiking: 'dag',
  cycling: 'bisiklet', indoor_cycling: 'bisiklet',
  swimming: 'yuzme', lap_swimming: 'yuzme', open_water_swimming: 'yuzme',
  strength_training: 'kuvvet', yoga: 'yoga', pilates: 'pilates', hiit: 'hiit', cardio: 'kardiyo',
  elliptical: 'eliptik', rowing: 'kurek', indoor_rowing: 'kurek', other: 'diger',
};

const anahtar = (tur) => (metinMi(tur) ? tur.trim().toLowerCase() : null);

// Garmin'in ham tür anahtarı → Türkçe ad. Bilinmeyen ya da boş: "Antrenman".
export function turAdi(tur) {
  const k = anahtar(tur);
  return (k && Object.hasOwn(TUR_AD, k)) ? TUR_AD[k] : 'Antrenman';
}

export function turGrubu(tur) {
  const k = anahtar(tur);
  return (k && Object.hasOwn(TUR_GRUP, k)) ? TUR_GRUP[k] : 'genel';
}

// Saniye → "59 sn", "45 dk", "1s 5dk". Geçersiz: null.
export function sureBicim(sn) {
  if (!sonlu(sn) || sn < 0) return null;
  if (sn < 60) return `${Math.round(sn)} sn`;
  const dk = Math.round(sn / 60);
  if (dk < 60) return `${dk} dk`;
  const s = Math.floor(dk / 60); const k = dk % 60;
  return k ? `${s}s ${k}dk` : `${s}s`;
}

const ondalik = (n, h) => {
  const t = (Math.round(n * 10 ** h) / 10 ** h).toFixed(h);
  return t.replace('.', ',');
};

// Metre → "850 m" ya da "5,2 km". Yok ya da 0: null (0 m "veri yok" demektir, uydurulmaz).
export function mesafeBicim(m) {
  if (!sonlu(m) || m <= 0) return null;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${ondalik(m / 1000, 1)} km`;
}

const tarihParca = (t) => {
  const m = typeof t === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(t) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const gunNo = (p) => Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);

// Europe/Istanbul takvim günü (YYYY-MM-DD).
export function bugunTarih(simdi = new Date()) {
  return new Date(simdi.getTime() + SAAT_DILIMI_MS).toISOString().slice(0, 10);
}

// "Bugün", "Dün", "17 Kasım Pazartesi". Geçersiz tarih: null.
export function gunBaslik(tarih, bugun = bugunTarih()) {
  const p = tarihParca(tarih); const b = tarihParca(bugun);
  if (!p) return null;
  if (b) {
    const f = gunNo(b) - gunNo(p);
    if (f === 0) return 'Bugün';
    if (f === 1) return 'Dün';
  }
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return `${p[2]} ${AY[p[1] - 1]} ${GUN_UZUN[dow]}`;
}

// 'YYYY-MM-DD' gününün Pazartesi'si (haftanın başı); geçersizse null.
function haftaBasiTarih(tarih) {
  const p = tarihParca(tarih);
  if (!p) return null;
  const t = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

// Haftanın yükü, kişisel normal banda göre. Bant ya da yük yoksa durum null (renk/ok uydurulmaz).
// Süren (bu) hafta henüz tamamlanmadığı için banda göre yargılanmaz: durum null, suruyor true.
export function haftaDurum(hafta, bant, bugun = bugunTarih()) {
  const yok = { durum: null, metin: null };
  if (!hafta || !sonlu(hafta.yuk)) return yok;
  if (typeof hafta.bas === 'string' && hafta.bas === haftaBasiTarih(bugun)) return { durum: null, metin: 'Hafta sürüyor', suruyor: true };
  if (!bant || !sonlu(bant.min) || !sonlu(bant.max)) return yok;
  if (hafta.yuk < bant.min) return { durum: 'lo', metin: 'normalin altında' };
  if (hafta.yuk > bant.max) return { durum: 'hi', metin: 'normalin üstünde' };
  return { durum: 'ok', metin: 'normal aralıkta' };
}

// "07:12" (Europe/Istanbul); geçersiz: null.
export function saatBicim(ms) {
  if (!sonlu(ms)) return null;
  const d = new Date(ms + SAAT_DILIMI_MS);
  if (Number.isNaN(d.getTime())) return null;
  const iki = (n) => String(n).padStart(2, '0');
  return `${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}`;
}

// "17 Kas" (hafta başı etiketi)
export function kisaTarih(tarih) {
  const p = tarihParca(tarih);
  return p ? `${p[2]} ${AY_KISA[p[1] - 1]}` : null;
}

const tam = (v) => (sonlu(v) ? String(Math.round(v)) : null);
const bir = (v) => (sonlu(v) ? ondalik(v, 1) : null);

const HAREKET_AD = {
  squat: 'Squat', bench_press: 'Bench press', deadlift: 'Deadlift', overhead_press: 'Omuz press', shoulder_press: 'Omuz press',
  barbell_row: 'Barbell row', row: 'Row', lat_pulldown: 'Lat pulldown', pull_up: 'Barfiks', push_up: 'Şınav', plank: 'Plank',
  lunge: 'Hamle', curl: 'Biceps curl', bicep_curl: 'Biceps curl', sit_up: 'Mekik', crunch: 'Mekik', warm_up: 'Isınma', cardio: 'Kardiyo',
};
// Garmin'in BÜYÜK_HARF egzersiz anahtarı → okunur ad (küçük Türkçe harita, yoksa baş harfleri büyük sözcükler).
export function insanAdi(s) {
  if (!metinMi(s)) return null;
  const k = s.trim().toLowerCase();
  if (!k) return null;
  if (Object.hasOwn(HAREKET_AD, k)) return HAREKET_AD[k];
  return k.split(/[_\s]+/).filter(Boolean).map((w) => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1)).join(' ');
}

/* ================= Örnek veri ================= */

// API şeklinin birebir aynısı; gerçek ve örnek veri aynı çizim yolunu kullanır.
const AKTIVITE_ANAHTARLARI = [
  'id', 'tarih', 'tur', 'baslangic', 'sure_s', 'mesafe_m', 'ort_nabiz', 'max_nabiz', 'yuk', 'aerobik', 'anaerobik',
  'kalori', 'bolgeler', 'kadans', 'adim_boyu_m', 'yer_temas_ms', 'guc', 'set', 'tekrar', 'setler',
];
const BOS_AKTIVITE = Object.freeze(Object.fromEntries(AKTIVITE_ANAHTARLARI.map((k) => [k, null])));
export { AKTIVITE_ANAHTARLARI };

const sozde = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const gunEkle = (tarih, n) => {
  const p = tarihParca(tarih);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
};
const pazartesi = (tarih) => {
  const p = tarihParca(tarih);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return gunEkle(tarih, -((dow + 6) % 7));
};
const medyan = (a) => {
  const s = [...a].sort((x, y) => x - y); const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// Haftalık düzen: [Pazartesi'den gün farkı, tür]
const DUZEN = [
  [[1, 'running'], [3, 'strength_training'], [5, 'trail_running'], [6, 'walking']],
  [[0, 'yoga'], [2, 'running'], [4, 'strength_training'], [5, 'cycling']],
  [[1, 'running'], [2, 'strength_training'], [4, 'treadmill_running'], [6, 'hiking']],
  [[1, 'running'], [3, 'strength_training'], [5, 'cycling'], [6, 'walking']],
];

export function ornekUret(simdi = new Date()) {
  const bugun = bugunTarih(simdi);
  const buHafta = pazartesi(bugun);
  const aktiviteler = [];
  let n = 0;
  for (let h = 7; h >= 0; h--) {
    const bas = gunEkle(buHafta, -7 * h);
    const duzen = DUZEN[(7 - h) % DUZEN.length];
    for (const [fark, tur] of duzen) {
      if (h === 3 && fark === 3) continue; // bir hafta hafif geçti
      const tarih = gunEkle(bas, fark);
      if (tarih > bugun) continue;
      n++;
      aktiviteler.push(ornekAktivite(n, tarih, tur));
    }
  }
  // Bir yoga seansı bilerek seyrek: yalnız süre ve kalori (null alanlar hiç görünmemeli).
  const seyrek = aktiviteler.find((a) => a.tur === 'yoga');
  if (seyrek) {
    Object.assign(seyrek, { ort_nabiz: null, max_nabiz: null, yuk: null, aerobik: null, anaerobik: null, bolgeler: null });
  }
  aktiviteler.sort((a, b) => (b.baslangic ?? 0) - (a.baslangic ?? 0));

  const haftalar = [];
  for (let h = 0; h < 8; h++) {
    const bas = gunEkle(buHafta, -7 * h);
    const son = gunEkle(bas, 6);
    const liste = aktiviteler.filter((a) => a.tarih >= bas && a.tarih <= son);
    const yukler = liste.map((a) => a.yuk).filter(sonlu);
    haftalar.push({
      bas,
      yuk: yukler.length ? yukler.reduce((s, v) => s + v, 0) : null,
      sure_s: liste.reduce((s, a) => s + (a.sure_s ?? 0), 0),
      adet: liste.length,
    });
  }
  const tamam = haftalar.slice(1).map((x) => x.yuk).filter(sonlu);
  let yukBant = null;
  if (tamam.length >= 6) {
    const m = medyan(tamam);
    const mad = medyan(tamam.map((v) => Math.abs(v - m)));
    const pay = 1.5 * mad * 1.4826;
    yukBant = { min: Math.max(0, Math.round(m - pay)), max: Math.round(m + pay) };
  }
  return { aktiviteler, haftalar, yukBant };
}

function ornekAktivite(n, tarih, tur) {
  const r = (k) => sozde(n * 7 + k);
  const saat = tur === 'strength_training' ? 18 : tur === 'yoga' ? 8 : 7;
  const dk = Math.floor(r(1) * 50);
  const p = tarihParca(tarih);
  const baslangic = Date.UTC(p[0], p[1] - 1, p[2], saat, dk) - SAAT_DILIMI_MS;
  const a = { ...BOS_AKTIVITE, id: `ornek-${n}`, tarih, tur, baslangic };

  const bol = (sure, oran) => oran.map((o) => Math.round(sure * o));
  if (tur === 'running' || tur === 'trail_running' || tur === 'treadmill_running') {
    const sure = Math.round(1800 + r(2) * 1800);
    const tempo = 315 + r(3) * 60; // sn/km
    Object.assign(a, {
      sure_s: sure, mesafe_m: Math.round((sure / tempo) * 1000), ort_nabiz: Math.round(146 + r(4) * 12), max_nabiz: Math.round(168 + r(5) * 10),
      yuk: Math.round(70 + r(6) * 55), aerobik: Math.round((3 + r(7) * 1.4) * 10) / 10, anaerobik: Math.round((0.2 + r(8) * 1.1) * 10) / 10,
      kalori: Math.round(sure * 0.2), bolgeler: bol(sure, [0.04, 0.2, 0.44, 0.26, 0.06]),
      kadans: Math.round(166 + r(9) * 8), adim_boyu_m: Math.round((1.02 + r(10) * 0.08) * 100) / 100, yer_temas_ms: Math.round(236 + r(11) * 16),
      guc: Math.round(228 + r(12) * 30),
    });
    if (tur === 'treadmill_running') { a.adim_boyu_m = null; a.yer_temas_ms = null; a.guc = null; }
  } else if (tur === 'strength_training') {
    const sure = Math.round(2700 + r(2) * 1200);
    const setler = [];
    const hareketler = ['BENCH_PRESS', 'BARBELL_ROW', 'OVERHEAD_PRESS', 'SQUAT', 'DEADLIFT', 'LAT_PULLDOWN'];
    for (let i = 0; i < 6; i++) {
      setler.push({ tur: hareketler[i], set: 3, tekrar: 8 + Math.floor(r(20 + i) * 5), agirlik_kg: 20 + Math.round(r(30 + i) * 12) * 2.5, sure_s: 35 + Math.floor(r(40 + i) * 20) });
    }
    const tekrar = setler.reduce((s, x) => s + x.tekrar * x.set, 0);
    Object.assign(a, {
      sure_s: sure, ort_nabiz: Math.round(108 + r(4) * 12), max_nabiz: Math.round(138 + r(5) * 14), yuk: Math.round(40 + r(6) * 30),
      aerobik: Math.round((0.9 + r(7) * 0.9) * 10) / 10, anaerobik: Math.round((0.4 + r(8) * 1.2) * 10) / 10, kalori: Math.round(sure * 0.09),
      bolgeler: bol(sure, [0.3, 0.42, 0.22, 0.06, 0]), set: setler.length * 3, tekrar, setler,
    });
  } else if (tur === 'cycling') {
    const sure = Math.round(3600 + r(2) * 2400);
    Object.assign(a, {
      sure_s: sure, mesafe_m: Math.round((sure / 3600) * (24 + r(3) * 6) * 1000), ort_nabiz: Math.round(130 + r(4) * 10), max_nabiz: Math.round(158 + r(5) * 10),
      yuk: Math.round(80 + r(6) * 50), aerobik: Math.round((2.8 + r(7)) * 10) / 10, anaerobik: Math.round(r(8) * 10) / 10,
      kalori: Math.round(sure * 0.16), bolgeler: bol(sure, [0.08, 0.38, 0.38, 0.14, 0.02]), kadans: Math.round(80 + r(9) * 10), guc: Math.round(170 + r(12) * 40),
    });
  } else if (tur === 'walking' || tur === 'hiking') {
    const sure = Math.round(tur === 'hiking' ? 5400 + r(2) * 3600 : 2100 + r(2) * 1500);
    const hiz = tur === 'hiking' ? 3.4 : 4.6;
    Object.assign(a, {
      sure_s: sure, mesafe_m: Math.round((sure / 3600) * hiz * 1000), ort_nabiz: Math.round(100 + r(4) * 14), max_nabiz: Math.round(122 + r(5) * 16),
      yuk: Math.round(tur === 'hiking' ? 70 : 14 + r(6) * 12), aerobik: Math.round((0.6 + r(7) * (tur === 'hiking' ? 2 : 0.8)) * 10) / 10,
      kalori: Math.round(sure * (tur === 'hiking' ? 0.1 : 0.07)), bolgeler: bol(sure, [0.46, 0.38, 0.14, 0.02, 0]),
    });
  } else { // yoga
    const sure = Math.round(1800 + r(2) * 900);
    Object.assign(a, {
      sure_s: sure, ort_nabiz: Math.round(84 + r(4) * 10), max_nabiz: Math.round(104 + r(5) * 12), yuk: Math.round(8 + r(6) * 8), aerobik: Math.round((0.2 + r(7) * 0.6) * 10) / 10,
      kalori: Math.round(sure * 0.045), bolgeler: bol(sure, [0.8, 0.18, 0.02, 0, 0]),
    });
  }
  return a;
}

export const ORNEK = ornekUret();

/* ================= Veri doğrulama ================= */

// Worker yanıtını (ya da örneği) güvenli biçime çevirir; beklenmeyen şekil → null.
export function yanitDuzenle(y) {
  if (!y || typeof y !== 'object') return null;
  const aktiviteler = Array.isArray(y.aktiviteler) ? y.aktiviteler.filter((a) => a && typeof a === 'object' && !Array.isArray(a)) : [];
  const haftalar = Array.isArray(y.haftalar) ? y.haftalar.filter((h) => h && typeof h === 'object' && tarihParca(h.bas)) : [];
  const b = y.yukBant;
  const yukBant = b && sonlu(b.min) && sonlu(b.max) ? { min: Math.max(0, b.min), max: Math.max(0, b.max) } : null;
  return { aktiviteler, haftalar, yukBant };
}

/* ================= Simgeler ================= */

const SIMGE = {
  kosu: [['circle', { cx: 15, cy: 4.8, r: 1.9 }], ['path', { d: 'M10.4 20.8l2.6-5.4-2.9-2.6 2.1-4.1 3.7 1.7 3 .6M10.2 8.8l-3.3 2.3M12.2 8.7l-1.1 3.4' }]],
  yuruyus: [['circle', { cx: 12.5, cy: 4.5, r: 1.9 }], ['path', { d: 'M12.5 8.2l-.4 5.3 2.4 2.4.7 5M12.1 13.5l-2.9 2.6-.9 4.7M8.4 11.2l4.1-3 3.4 3' }]],
  dag: [['path', { d: 'M2.5 19.5l6.2-10.2 3.5 5.6 2.4-3.6 6.9 8.2z' }], ['path', { d: 'M8.7 9.3l1.8 2.9' }], ['circle', { cx: 17.5, cy: 5.5, r: 1.4 }]],
  bisiklet: [['circle', { cx: 6, cy: 16, r: 3.6 }], ['circle', { cx: 18, cy: 16, r: 3.6 }], ['path', { d: 'M6 16l3.8-7.6h5.2l3 7.6M9.8 8.4L14 16M13 6h3' }]],
  yuzme: [['circle', { cx: 16.5, cy: 6.2, r: 1.7 }], ['path', { d: 'M4 12.2l5.2-2.6 4 2 3.4-2.4M2.5 17c1.7 0 1.7-1.4 3.4-1.4s1.7 1.4 3.4 1.4 1.7-1.4 3.4-1.4 1.7 1.4 3.4 1.4 1.7-1.4 3.4-1.4M2.5 21c1.7 0 1.7-1.4 3.4-1.4s1.7 1.4 3.4 1.4 1.7-1.4 3.4-1.4 1.7 1.4 3.4 1.4 1.7-1.4 3.4-1.4' }]],
  kuvvet: [['path', { d: 'M6.8 7.5v9M17.2 7.5v9M3.6 10v4M20.4 10v4M6.8 12h10.4' }]],
  yoga: [['circle', { cx: 12, cy: 4.8, r: 1.9 }], ['path', { d: 'M12 8.3v5.1M6.4 10.6l5.6 2.6 5.6-2.6M5.4 19.6c3.2-.7 5.4-2.8 6.6-6.2 1.2 3.4 3.4 5.5 6.6 6.2' }]],
  pilates: [['circle', { cx: 12, cy: 5.2, r: 1.8 }], ['path', { d: 'M4.8 15.2a7.2 7.2 0 0114.4 0M3 19.2h18M12 8.4v3.6' }]],
  hiit: [['path', { d: 'M13.2 2.8L5.6 13.4h6l-1 7.8 7.8-11h-6.2z' }]],
  kardiyo: [['path', { d: 'M12 20.2s-7.4-4.5-7.4-10.2A4.2 4.2 0 0112 7.6a4.2 4.2 0 017.4 2.4c0 5.7-7.4 10.2-7.4 10.2z' }], ['path', { d: 'M3.8 12.4h4l1.6-2.6 2.4 4.4 1.6-1.8h6.8' }]],
  eliptik: [['path', { d: 'M5 20.5h14M8.5 20.5l-1-7.2 4.5-6.8 4.5 6.8-1 7.2M12 6.5V3.5' }], ['circle', { cx: 12, cy: 3.4, r: 0.9 }]],
  kurek: [['path', { d: 'M2.8 16.6c3.4 2.2 14 2.2 18.4 0M5.2 13.4l8.6-3.8M13.8 9.6l4.4-4.8M18.2 4.8l2.2 2.2' }], ['circle', { cx: 9.4, cy: 7.4, r: 1.6 }]],
  diger: [['circle', { cx: 12, cy: 13.5, r: 7.2 }], ['path', { d: 'M12 13.5V9.6M10 3.2h4M17.6 6.2l1.4-1.4' }]],
  genel: [['circle', { cx: 12, cy: 12, r: 8 }], ['path', { d: 'M12 7.6V12l3 1.8' }]],
};

// Tür grubuna göre vurgu rengi (yalnız süs; tür adı her zaman yazıyla da verilir).
const TUR_RENK = {
  kosu: '#ff9d7a', yuruyus: '#ffc9a6', dag: '#ffc9a6', bisiklet: '#ffd88a', yuzme: '#9ec8ff', kuvvet: '#c8a8ff',
  yoga: '#bfeedd', pilates: '#bfeedd', hiit: '#ff9fb8', kardiyo: '#ff9fb8', eliptik: '#ffd88a', kurek: '#9ec8ff', diger: '#d9cdea', genel: '#d9cdea',
};

const NAB_RENK = ['#a9b8ff', '#8fd9c4', '#ffe08a', '#ffa66e', '#ff6f8e'];
const NAB_AD = ['Çok hafif', 'Hafif', 'Orta', 'Sert', 'Azami'];

/* ================= Stil ================= */

const STIL = `
.akt{--a-m:#fff6ec;--a-i:#ffc9a6;--a-iyi:#bfeedd;--a-mor:#b597ff;--a-mercan:#ff9d7a;--a-sol:rgba(255,246,236,.7);--a-kenar:rgba(255,246,236,.16);
  container-type:inline-size;position:relative;min-height:100%;padding:14px 18px 28px;color:var(--a-m);font-family:'Onest',system-ui,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.akt[hidden],.akt [hidden]{display:none!important}
.akt *{box-sizing:border-box}
.akt button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:inherit}
.akt button:focus-visible{outline:2px solid var(--a-i);outline-offset:2px}
.akt svg{fill:none;stroke-linecap:round;stroke-linejoin:round}
.akt-bas{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;padding-right:100px;min-height:48px}
.akt-bas h1{font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100,'opsz' 144;font-weight:430;font-size:36px;line-height:1.05;letter-spacing:-.025em}
.akt-etiket{padding:3px 9px;border:1px solid rgba(255,246,236,.26);border-radius:999px;background:rgba(12,8,18,.48);font:600 10px/1.3 system-ui,sans-serif;letter-spacing:.02em;color:rgba(255,246,236,.85);white-space:nowrap}

/* haftalık özet */
.akt-ozet{margin-top:14px;padding:16px 16px 12px;border-radius:24px;display:grid;gap:10px;
  background:linear-gradient(158deg,rgba(255,246,236,.15),rgba(255,246,236,.04) 62%);border:1px solid var(--a-kenar);
  box-shadow:0 12px 30px rgba(4,2,8,.4),inset 0 1px 0 rgba(255,255,255,.18)}
.akt-ozetUst .akt-hf{font-size:12.5px;font-weight:500;color:var(--a-sol)}
.akt-buyuk{display:flex;align-items:baseline;gap:8px;margin-top:2px}
.akt-buyuk b{font-size:50px;font-weight:600;letter-spacing:-.03em;line-height:1}
.akt-buyuk span{font-size:13.5px;color:var(--a-sol)}
.akt-durum{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:5px 11px 5px 9px;border-radius:999px;font-size:13px;font-weight:600;line-height:1.2;border:1px solid currentColor;background:rgba(12,8,18,.28)}
.akt-suruyor{margin-top:8px;font-size:13px;font-weight:600;line-height:1.2;color:rgba(255,246,236,.72)}
.akt-durum svg{width:11px;height:11px;stroke:currentColor;stroke-width:1.9;flex:none}
.akt-durum.lo{color:var(--a-mor)}.akt-durum.ok{color:var(--a-iyi)}.akt-durum.hi{color:var(--a-i)}
.akt-alt{margin-top:8px;font-size:13.5px;color:rgba(255,246,236,.88)}
.akt-grafik{width:100%;height:auto;display:block;overflow:visible}
.akt-grafik text{font-family:'Onest',system-ui,sans-serif;font-variant-numeric:tabular-nums}
.akt-gv{fill:rgba(255,246,236,.72);font-size:10.5px;font-weight:500;text-anchor:middle}
.akt-gv.bu{fill:var(--a-m);font-weight:700}
.akt-ge{fill:rgba(255,246,236,.62);font-size:10px;text-anchor:middle}
.akt-ge.bu{fill:var(--a-m);font-weight:600}
.akt-lejant{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;color:var(--a-sol);padding-top:2px}
.akt-lejant span{display:inline-flex;align-items:center;gap:6px}
.akt-lejant i{width:12px;height:8px;border-radius:3px;background:rgba(191,238,221,.22);border:1px dashed rgba(191,238,221,.6)}
.akt-lejant i.bu{background:linear-gradient(180deg,#ffb48e,#e9764f);border:0;width:8px;height:8px;border-radius:50%}

/* liste */
.akt-liste{display:grid;gap:18px;margin-top:22px}
.akt-kartlar{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.akt-gun{margin:0 2px 8px;font-size:13px;font-weight:600;letter-spacing:.01em;color:var(--a-sol)}
.akt-oge{display:block;width:100%;padding:14px 14px 12px;border-radius:22px;min-height:44px;position:relative;
  background:linear-gradient(158deg,rgba(255,246,236,.12),rgba(255,246,236,.035) 62%);border:1px solid rgba(255,246,236,.14);
  box-shadow:0 8px 22px rgba(4,2,8,.3),inset 0 1px 0 rgba(255,255,255,.14);transition:border-color .2s,transform .18s cubic-bezier(.2,.9,.3,1.3)}
.akt-oge:hover{border-color:rgba(255,246,236,.34)}
.akt-oge:active{transform:scale(.985)}
.akt-ogeUst{display:flex;align-items:center;gap:12px}
.akt-sim{width:40px;height:40px;flex:none;border-radius:13px;display:grid;place-items:center;color:var(--t);background:color-mix(in srgb,var(--t) 16%,transparent);border:1px solid color-mix(in srgb,var(--t) 38%,transparent)}
.akt-sim svg{width:22px;height:22px;stroke:currentColor;stroke-width:1.6}
.akt-ad{flex:1;min-width:0}
.akt-ad b{display:block;font-size:16.5px;font-weight:600;line-height:1.2;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.akt-ad span{display:block;font-size:12px;color:var(--a-sol);margin-top:2px}
.akt-ok{width:16px;height:16px;flex:none;stroke:rgba(255,246,236,.5);stroke-width:1.8}
.akt-say{display:grid;grid-template-columns:repeat(auto-fit,minmax(58px,1fr));gap:8px 10px;margin-top:12px;padding-top:11px;border-top:1px solid rgba(255,246,236,.1)}
.akt-s{display:flex;flex-direction:column;gap:1px;min-width:0}
.akt-s b{font-size:15.5px;font-weight:600;letter-spacing:-.01em;line-height:1.2;white-space:nowrap}
.akt-s span{font-size:10.5px;font-weight:500;color:var(--a-sol);letter-spacing:.02em;white-space:nowrap}

/* durumlar */
.akt-mesaj{margin-top:34px;padding:26px 20px;text-align:center;border-radius:24px;border:1px dashed rgba(255,246,236,.24);display:grid;gap:10px;justify-items:center}
.akt-mesaj p{font-size:15px;line-height:1.45;color:rgba(255,246,236,.88);max-width:30ch;text-wrap:balance}
.akt-mesaj .alt{font-size:12.5px;color:var(--a-sol)}
.akt-tekrar{min-height:44px;padding:0 20px;border-radius:999px;background:var(--a-m)!important;color:#1a1022!important;font-weight:600;font-size:14.5px;text-align:center!important}
.akt-iskelet{display:grid;gap:10px;margin-top:14px}
.akt-iskelet i{display:block;border-radius:24px;background:linear-gradient(100deg,rgba(255,246,236,.06) 30%,rgba(255,246,236,.14) 50%,rgba(255,246,236,.06) 70%) 0 0/220% 100%;animation:akt-par 1.4s linear infinite}
.akt-iskelet i:nth-child(1){height:236px}.akt-iskelet i:nth-child(n+2){height:96px}
@keyframes akt-par{to{background-position:-220% 0}}

/* ayrıntı */
.akt-detay{animation:akt-ac .26s cubic-bezier(.2,.8,.3,1) both}
@keyframes akt-ac{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.akt-geri{display:inline-flex;align-items:center;gap:6px;min-height:44px;margin-left:-8px;padding:0 14px 0 8px;border-radius:999px;font-size:14.5px;font-weight:600;color:rgba(255,246,236,.92)}
.akt-geri svg{width:18px;height:18px;stroke:currentColor;stroke-width:1.8}
.akt-geri:hover{background:rgba(255,246,236,.08)}
.akt-dBas{display:flex;align-items:center;gap:14px;margin-top:6px}
.akt-dBas .akt-sim{width:56px;height:56px;border-radius:18px}
.akt-dBas .akt-sim svg{width:30px;height:30px}
.akt-dBas h2{font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100,'opsz' 144;font-weight:430;font-size:30px;line-height:1.08;letter-spacing:-.02em;text-wrap:balance}
.akt-dBas p{font-size:13px;color:var(--a-sol);margin-top:3px}
.akt-dBas>div{min-width:0}
.akt-izgara{display:grid;gap:12px;margin-top:16px}
.akt-bolum{padding:15px 16px 14px;border-radius:22px;background:linear-gradient(158deg,rgba(255,246,236,.11),rgba(255,246,236,.035) 62%);border:1px solid rgba(255,246,236,.13);min-width:0}
.akt-bolum h3{font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--a-sol);margin-bottom:10px}
.akt-ana{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:10px 14px}
.akt-ana .akt-s b{font-size:26px;letter-spacing:-.02em}
.akt-ana .akt-s span{font-size:11.5px}
.akt-sat{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:9px 0;border-top:1px solid rgba(255,246,236,.09);font-size:14.5px}
.akt-sat:first-of-type{border-top:0;padding-top:0}
.akt-sat span{color:rgba(255,246,236,.82)}
.akt-sat b{font-weight:600;text-align:right}
.akt-bolgeBar{display:flex;gap:2px;height:14px;border-radius:7px;overflow:hidden;margin:6px 0 12px;background:rgba(255,246,236,.07)}
.akt-bolgeBar i{display:block;min-width:4px;background:var(--c)}
.akt-bolge{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:10px;padding:5px 0;font-size:13.5px}
.akt-bolge i{width:10px;height:10px;border-radius:50%;background:var(--c)}
.akt-bolge span{color:rgba(255,246,236,.86);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.akt-bolge span em{font-style:normal;color:var(--a-sol)}
.akt-bolge b{font-weight:600;white-space:nowrap}
.akt-bolge b em{font-style:normal;font-weight:500;color:var(--a-sol);margin-left:6px}
.akt-olc{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:7px 0}
.akt-olc span{font-size:14.5px;color:rgba(255,246,236,.86)}
.akt-olc b{font-size:17px;font-weight:600}
.akt-iz{grid-column:1/-1;height:6px;border-radius:3px;background:rgba(255,246,236,.1);overflow:hidden}
.akt-iz i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,var(--a-mor),var(--a-i))}
.akt-set{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 12px;padding:9px 0;border-top:1px solid rgba(255,246,236,.09);font-size:14px}
.akt-set:first-of-type{border-top:0}
.akt-set em{font-style:normal;font-weight:600;color:var(--a-sol);min-width:44px}
.akt-set span{color:rgba(255,246,236,.92)}
.akt-set small{grid-column:2;font-size:12.5px;color:var(--a-sol)}
.akt-bosDetay{margin-top:20px;font-size:14px;color:var(--a-sol);text-align:center}

/* geniş panel (kapsayıcı ≥ 620px): liste iki sütun, özet yan yana */
@container (min-width:620px){
  .akt{padding:18px 28px 36px}
  .akt-ozet{grid-template-columns:minmax(220px,.8fr) minmax(0,1.5fr);column-gap:26px;align-items:center;padding:20px 24px 18px}
  .akt-ozetSag{display:grid;gap:6px}
  .akt-liste{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 14px;align-items:start}
  .akt-izgara{grid-template-columns:repeat(2,minmax(0,1fr))}
  .akt-izgara .akt-genis{grid-column:1/-1}
}
@media (prefers-reduced-motion:reduce){
  .akt-iskelet i,.akt-detay,.akt-gir{animation:none}
  .akt-oge{transition:none}.akt-oge:active{transform:none}
}
.akt-rm .akt-iskelet i,.akt-rm .akt-detay,.akt-rm .akt-gir{animation:none}
.akt-rm .akt-oge{transition:none}.akt-rm .akt-oge:active{transform:none}
.akt-gir{animation:akt-ac .4s cubic-bezier(.2,.8,.3,1) both;animation-delay:calc(var(--n,0)*28ms)}
`;

function stilEkle() {
  if (typeof document === 'undefined') return;
  const var_ = document.querySelector('style[data-modul="aktivite"]');
  if (var_) return;
  const s = document.createElement('style');
  s.setAttribute('data-modul', 'aktivite');
  s.textContent = STIL;
  (document.head || document.documentElement).appendChild(s);
}

/* ================= DOM yardımcıları ================= */

function el(tag, sinif, metin) {
  const e = document.createElement(tag);
  if (sinif) e.className = sinif;
  if (metin != null) e.textContent = metin;
  return e;
}
function sv(tag, at, ebeveyn) {
  const e = document.createElementNS(NS, tag);
  for (const k in at) e.setAttribute(k, String(at[k]));
  if (ebeveyn) ebeveyn.appendChild(e);
  return e;
}
function simgeKur(grup, boyut = 24) {
  const s = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', width: boyut, height: boyut });
  for (const [tag, at] of SIMGE[grup] || SIMGE.genel) sv(tag, at, s);
  return s;
}
function durumOku(d, boyut = 10) {
  const s = sv('svg', { viewBox: '0 0 10 10', 'aria-hidden': 'true', width: boyut, height: boyut });
  const yol = d === 'lo' ? 'M5 1v8M1.5 5.5L5 9l3.5-3.5' : d === 'hi' ? 'M5 9V1M1.5 4.5L5 1l3.5 3.5' : 'M1.3 5.4l2.5 2.5L8.7 2.7';
  sv('path', { d: yol }, s);
  return s;
}
function geriOku() {
  const s = sv('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true' });
  sv('path', { d: 'M12 4l-6 6 6 6' }, s);
  return s;
}
function ileriOku() {
  const s = sv('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true', class: 'akt-ok' });
  sv('path', { d: 'M6 3l5 5-5 5' }, s);
  return s;
}

// [değer, etiket] çiftlerinden yalnız dolu olanlar.
function sayiBlogu(cift, sinif = 'akt-say') {
  const kap = el('div', sinif);
  for (const [deger, etiket] of cift) {
    if (deger == null) continue;
    const s = el('div', 'akt-s');
    s.appendChild(el('b', null, deger));
    s.appendChild(el('span', null, etiket));
    kap.appendChild(s);
  }
  return kap.childNodes && kap.childNodes.length ? kap : null;
}

/* ================= Haftalık grafik ================= */

let grafikSayac = 0;
// Antrenman var ama yük ölçümü yok (adet > 0, yük null ya da 0)
const veriYok = (h) => sonlu(h.adet) && h.adet > 0 && !(sonlu(h.yuk) && h.yuk > 0);

export function haftalikGrafik(haftalar, bant) {
  const liste = haftalar.slice(0, 8).reverse(); // eskiden yeniye, sağ uç = bu hafta
  const n = liste.length;
  const W = 340; const H = 150; const taban = 112; const ust = 22;
  const id = `akt-g${++grafikSayac}`;
  const svg = sv('svg', { class: 'akt-grafik', viewBox: `0 0 ${W} ${H}`, role: 'img' });
  const yukler = liste.map((h) => (sonlu(h.yuk) && h.yuk > 0 ? h.yuk : null));
  const enBuyuk = Math.max(1, ...yukler.filter((v) => v != null), bant ? bant.max : 0) * 1.08;
  const yOf = (v) => taban - (v / enBuyuk) * (taban - ust);

  const defs = sv('defs', {}, svg);
  const g = sv('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  sv('stop', { offset: 0, 'stop-color': '#ffc2a0' }, g);
  sv('stop', { offset: 1, 'stop-color': '#e9764f' }, g);

  if (bant) {
    const y1 = yOf(bant.max); const y2 = yOf(bant.min);
    sv('rect', { x: 0, y: y1, width: W, height: Math.max(1, y2 - y1), rx: 6, fill: 'rgba(191,238,221,.11)' }, svg);
    for (const y of [y1, y2]) sv('line', { x1: 0, x2: W, y1: y, y2: y, stroke: 'rgba(191,238,221,.5)', 'stroke-width': 1, 'stroke-dasharray': '3 4' }, svg);
  }
  sv('line', { x1: 0, x2: W, y1: taban, y2: taban, stroke: 'rgba(255,246,236,.2)', 'stroke-width': 1 }, svg);

  const slot = n ? W / Math.max(n, 8) : W / 8;
  const x0 = W - slot * n; // 8'den az hafta varsa sağa yaslı
  liste.forEach((h, i) => {
    const bu = i === n - 1;
    const cx = x0 + slot * i + slot / 2;
    const bw = Math.min(24, slot * 0.58);
    const v = yukler[i];
    if (v != null) {
      const y = yOf(v);
      sv('rect', { x: cx - bw / 2, y, width: bw, height: Math.max(3, taban - y), rx: 6, fill: bu ? `url(#${id})` : 'rgba(255,246,236,.3)' }, svg);
      const t = sv('text', { x: cx, y: Math.max(11, y - 6), class: bu ? 'akt-gv bu' : 'akt-gv' }, svg);
      t.textContent = tam(v);
    } else {
      sv('rect', { x: cx - bw / 2, y: taban - 2, width: bw, height: 2, rx: 1, fill: 'rgba(255,246,236,.22)' }, svg);
      if (veriYok(h)) { const t = sv('text', { x: cx, y: taban - 8, class: 'akt-gv' }, svg); t.textContent = 'yük yok'; }
    }
    const e = sv('text', { x: cx, y: taban + 17, class: bu ? 'akt-ge bu' : 'akt-ge' }, svg);
    e.textContent = kisaTarih(h.bas);
  });

  const parcalar = liste.map((h, i) => `${kisaTarih(h.bas)} haftası ${yukler[i] != null ? tam(yukler[i]) : (veriYok(h) ? 'yük verisi yok' : 'antrenman yok')}`);
  let aria = `Haftalık antrenman yükü, son ${n} hafta: ${parcalar.join(', ')}.`;
  if (bant) aria += ` Normal aralık ${tam(bant.min)} ile ${tam(bant.max)} arası.`;
  svg.setAttribute('aria-label', aria);
  return { svg, aria };
}

/* ================= Modül ================= */

export function aktiviteKur(kap, baglam = {}) {
  stilEkle();
  const kok = el('div', baglam.rm ? 'akt akt-rm' : 'akt');
  kok.hidden = true;
  const ana = el('div', 'akt-ana-kap');
  const detay = el('div');
  detay.hidden = true;
  kok.appendChild(ana);
  kok.appendChild(detay);
  kap.appendChild(kok);

  let veri = null; // yanitDuzenle çıktısı
  let durumAdi = 'bos-baslangic'; // yukleniyor | hazir | bos | hata
  let yuklemeNo = 0;
  let sonYukleme = 0;
  let yuklendi = false;
  let olu = false;
  let acik = null; // { acan, kaydirma }
  let bugun = bugunTarih();

  const bosalt = (e) => { while (e.firstChild) e.removeChild(e.firstChild); };
  // Ana alanı temizleyip başlığı yeniden koyar; odak başlıktaysa yeni başlığa taşınır (yüklenince body'ye düşmez)
  function anaBaslikla() {
    const eski = ana.firstChild && ana.firstChild.firstChild;
    const odakta = !!eski && typeof document !== 'undefined' && document.activeElement === eski;
    bosalt(ana);
    const b = baslik();
    ana.appendChild(b);
    if (odakta) b.firstChild.focus({ preventScroll: true });
  }

  function baslik() {
    const b = el('div', 'akt-bas');
    const h = el('h1', null, 'Aktiviteler');
    h.setAttribute('tabindex', '-1'); // menüden gelince odak buraya taşınır
    b.appendChild(h);
    if (baglam.ornek) b.appendChild(el('span', 'akt-etiket', 'Örnek veri'));
    return b;
  }

  function cizYukleniyor() {
    anaBaslikla();
    const k = el('div', 'akt-iskelet');
    k.setAttribute('role', 'status');
    k.setAttribute('aria-busy', 'true');
    k.setAttribute('aria-label', 'Aktiviteler yükleniyor');
    for (let i = 0; i < 4; i++) k.appendChild(el('i'));
    ana.appendChild(k);
  }

  function cizMesaj(metin, alt, tekrarDugmesi) {
    anaBaslikla();
    const m = el('div', 'akt-mesaj');
    m.setAttribute('role', 'status');
    m.appendChild(el('p', null, metin));
    if (alt) m.appendChild(el('p', 'alt', alt));
    if (tekrarDugmesi) {
      const d = el('button', 'akt-tekrar', 'Yeniden dene');
      d.type = 'button';
      d.addEventListener('click', () => yukle());
      m.appendChild(d);
    }
    ana.appendChild(m);
  }

  function ozetKart() {
    const { haftalar, yukBant } = veri;
    const bu = haftalar[0] || null;
    const kart = el('section', 'akt-ozet');
    kart.setAttribute('aria-label', 'Haftalık yük özeti');

    const sol = el('div', 'akt-ozetUst');
    sol.appendChild(el('div', 'akt-hf', bu && kisaTarih(bu.bas) ? `Bu hafta · ${kisaTarih(bu.bas)} haftası` : 'Bu hafta'));
    if (bu && sonlu(bu.yuk)) {
      const b = el('div', 'akt-buyuk');
      b.appendChild(el('b', null, tam(bu.yuk)));
      b.appendChild(el('span', null, 'antrenman yükü'));
      sol.appendChild(b);
      const d = haftaDurum(bu, yukBant);
      if (d.suruyor) {
        sol.appendChild(el('div', 'akt-suruyor', d.metin));
      } else if (d.durum) {
        const r = el('div', `akt-durum ${d.durum}`);
        r.appendChild(durumOku(d.durum));
        r.appendChild(el('span', null, d.metin));
        sol.appendChild(r);
      }
    }
    const alt = [];
    if (bu && sonlu(bu.adet) && bu.adet > 0) {
      alt.push(`${bu.adet} antrenman`);
      const s = sureBicim(bu.sure_s);
      if (s) alt.push(s);
    }
    sol.appendChild(el('p', 'akt-alt', alt.length ? alt.join(' · ') : 'Bu hafta henüz antrenman yok'));
    kart.appendChild(sol);

    const sag = el('div', 'akt-ozetSag');
    const g = haftalikGrafik(haftalar, yukBant);
    sag.appendChild(g.svg);
    const lej = el('div', 'akt-lejant');
    const l1 = el('span'); l1.appendChild(el('i', 'bu')); l1.appendChild(el('span', null, 'Bu hafta'));
    lej.appendChild(l1);
    if (yukBant) {
      const l2 = el('span'); l2.appendChild(el('i')); l2.appendChild(el('span', null, `Normal aralık ${tam(yukBant.min)}–${tam(yukBant.max)}`));
      lej.appendChild(l2);
    }
    sag.appendChild(lej);
    kart.appendChild(sag);
    return kart;
  }

  function ogeKart(a, sira) {
    const grup = turGrubu(a.tur);
    const d = el('button', 'akt-oge akt-gir');
    d.type = 'button';
    d.style.setProperty('--t', TUR_RENK[grup]);
    d.style.setProperty('--n', String(Math.min(sira, 12)));
    const ad = turAdi(a.tur);
    const saat = saatBicim(a.baslangic);
    const sure = sureBicim(a.sure_s);
    const mesafe = mesafeBicim(a.mesafe_m);
    const etiket = [ad, saat, sure, mesafe].filter(Boolean).join(', ');
    d.setAttribute('aria-label', `${etiket}. Ayrıntıyı aç`);

    const ust = el('div', 'akt-ogeUst');
    const sim = el('span', 'akt-sim'); sim.appendChild(simgeKur(grup));
    ust.appendChild(sim);
    const adk = el('div', 'akt-ad');
    adk.appendChild(el('b', null, ad));
    if (saat) adk.appendChild(el('span', null, saat));
    ust.appendChild(adk);
    ust.appendChild(ileriOku());
    d.appendChild(ust);

    const sayilar = sayiBlogu([
      [sure, 'Süre'], [mesafe, 'Mesafe'],
      [sonlu(a.ort_nabiz) ? `${tam(a.ort_nabiz)}` : null, 'Nabız'],
      [tam(a.yuk), 'Yük'], [bir(a.aerobik), 'Aerobik'],
    ]);
    if (sayilar) d.appendChild(sayilar);
    d.addEventListener('click', () => detayAc(a, d));
    return d;
  }

  function listeKur() {
    const liste = el('div', 'akt-liste');
    liste.setAttribute('aria-label', 'Aktivite listesi');
    let onceki = null; let sira = 0; let kartlar = null;
    for (const a of veri.aktiviteler) {
      if (!kartlar || a.tarih !== onceki) {
        const grup = el('div', 'akt-grup');
        const b = gunBaslik(a.tarih, bugun);
        if (b) grup.appendChild(el('h2', 'akt-gun', b));
        kartlar = el('div', 'akt-kartlar');
        grup.appendChild(kartlar);
        liste.appendChild(grup);
        onceki = a.tarih;
      }
      kartlar.appendChild(ogeKart(a, sira++));
    }
    return liste;
  }

  function cizHazir() {
    anaBaslikla();
    const haftaVar = veri.haftalar.length > 0;
    if (haftaVar) ana.appendChild(ozetKart());
    if (veri.aktiviteler.length) ana.appendChild(listeKur());
    else {
      const m = el('div', 'akt-mesaj');
      m.appendChild(el('p', null, 'Bu aralıkta kayıtlı aktivite yok.'));
      m.appendChild(el('p', 'alt', 'Veri yok'));
      ana.appendChild(m);
    }
  }

  function ciz() {
    bugun = bugunTarih();
    if (durumAdi === 'yukleniyor') return cizYukleniyor();
    if (durumAdi === 'hata') return cizMesaj('Aktiviteler şu an alınamadı.', 'Bağlantını kontrol edip yeniden dene.', true);
    if (durumAdi === 'bos') return cizMesaj('Henüz aktivite yok.', 'Veri yok', false);
    return cizHazir();
  }

  async function yukle() {
    const no = ++yuklemeNo;
    durumAdi = 'yukleniyor';
    ciz();
    let ham = null;
    try {
      ham = baglam.ornek ? ORNEK : await (baglam.getir ? baglam.getir() : null);
    } catch { ham = null; }
    if (olu || no !== yuklemeNo) return;
    const v = yanitDuzenle(ham);
    sonYukleme = Date.now();
    if (!v) { veri = null; durumAdi = 'hata'; yuklendi = false; }
    else {
      veri = v;
      yuklendi = true;
      durumAdi = v.aktiviteler.length === 0 && v.haftalar.length === 0 ? 'bos' : 'hazir';
    }
    ciz();
  }

  /* ---- ayrıntı ---- */

  function bolgeBolumu(a) {
    if (!Array.isArray(a.bolgeler)) return null;
    const s = a.bolgeler.slice(0, 5).map((v) => (sonlu(v) && v > 0 ? v : 0));
    const toplam = s.reduce((x, y) => x + y, 0);
    if (toplam <= 0) return null;
    const b = el('section', 'akt-bolum akt-genis');
    b.appendChild(el('h3', null, 'Nabız bölgeleri'));
    const cubuk = el('div', 'akt-bolgeBar');
    cubuk.setAttribute('role', 'img');
    cubuk.setAttribute('aria-label', `Nabız bölgeleri: ${s.map((v, i) => `Bölge ${i + 1} ${sureBicim(v)}`).join(', ')}`);
    s.forEach((v, i) => {
      if (v <= 0) return;
      const p = el('i');
      p.style.setProperty('--c', NAB_RENK[i]);
      p.style.flex = `${v} 1 0`;
      cubuk.appendChild(p);
    });
    b.appendChild(cubuk);
    s.forEach((v, i) => {
      const r = el('div', 'akt-bolge');
      const nokta = el('i'); nokta.style.setProperty('--c', NAB_RENK[i]);
      r.appendChild(nokta);
      const ad = el('span', null, `Bölge ${i + 1}`);
      ad.appendChild(el('em', null, ` · ${NAB_AD[i]}`));
      r.appendChild(ad);
      const d = el('b', null, v > 0 ? sureBicim(v) : '—');
      if (v > 0) d.appendChild(el('em', null, `%${Math.round((v / toplam) * 100)}`));
      r.appendChild(d);
      b.appendChild(r);
    });
    return b;
  }

  function satirBolumu(baslikMetni, satirlar, sinif = '') {
    const dolu = satirlar.filter(([, d]) => d != null);
    if (!dolu.length) return null;
    const b = el('section', `akt-bolum ${sinif}`.trim());
    b.appendChild(el('h3', null, baslikMetni));
    for (const [ad, d] of dolu) {
      const r = el('div', 'akt-sat');
      r.appendChild(el('span', null, ad));
      r.appendChild(el('b', null, d));
      b.appendChild(r);
    }
    return b;
  }

  function etkiBolumu(a) {
    const olcekler = [['Aerobik etki', a.aerobik], ['Anaerobik etki', a.anaerobik]].filter(([, v]) => sonlu(v));
    const yuk = tam(a.yuk);
    if (!olcekler.length && yuk == null) return null;
    const b = el('section', 'akt-bolum');
    b.appendChild(el('h3', null, 'Antrenman etkisi'));
    if (yuk != null) {
      const r = el('div', 'akt-sat');
      r.appendChild(el('span', null, 'Antrenman yükü'));
      r.appendChild(el('b', null, yuk));
      b.appendChild(r);
    }
    for (const [ad, v] of olcekler) {
      const r = el('div', 'akt-olc');
      r.appendChild(el('span', null, ad));
      r.appendChild(el('b', null, bir(v)));
      const iz = el('div', 'akt-iz');
      iz.setAttribute('role', 'img');
      iz.setAttribute('aria-label', `${ad} ${bir(v)} / 5`);
      const dolgu = el('i');
      dolgu.style.width = `${Math.max(0, Math.min(1, v / 5)) * 100}%`;
      iz.appendChild(dolgu);
      r.appendChild(iz);
      b.appendChild(r);
    }
    return b;
  }

  function setBolumu(a) {
    const setler = Array.isArray(a.setler) ? a.setler.filter((x) => x && typeof x === 'object').slice(0, 80) : [];
    const doluSet = setler.some((x) => insanAdi(x.tur) || sonlu(x.tekrar) || sonlu(x.set) || sonlu(x.sure_s) || (sonlu(x.agirlik_kg) && x.agirlik_kg > 0));
    const ozet = [['Set', tam(a.set)], ['Toplam tekrar', tam(a.tekrar)]];
    if (!doluSet && ozet.every(([, d]) => d == null)) return null;
    const b = satirBolumu('Kuvvet', ozet, 'akt-genis') || (() => { const x = el('section', 'akt-bolum akt-genis'); x.appendChild(el('h3', null, 'Kuvvet')); return x; })();
    setler.forEach((s, i) => {
      if (!insanAdi(s.tur) && !sonlu(s.tekrar) && !sonlu(s.set) && !sonlu(s.sure_s) && !(sonlu(s.agirlik_kg) && s.agirlik_kg > 0)) return;
      const r = el('div', 'akt-set');
      r.appendChild(el('em', null, `${i + 1}.`));
      const ad = insanAdi(s.tur);
      const parca = [];
      if (sonlu(s.set) && sonlu(s.tekrar)) parca.push(`${tam(s.set)} × ${tam(s.tekrar)}`);
      else if (sonlu(s.tekrar)) parca.push(`${tam(s.tekrar)} tekrar`);
      else if (sonlu(s.set)) parca.push(`${tam(s.set)} set`);
      if (sonlu(s.agirlik_kg) && s.agirlik_kg > 0) parca.push(`${ondalik(s.agirlik_kg, s.agirlik_kg % 1 ? 1 : 0)} kg`);
      if (sonlu(s.sure_s)) parca.push(sureBicim(s.sure_s));
      r.appendChild(el('span', null, ad || parca.join(' · ')));
      if (ad && parca.length) r.appendChild(el('small', null, parca.join(' · ')));
      b.appendChild(r);
    });
    return b;
  }

  function detayKur(a) {
    const grup = turGrubu(a.tur);
    const k = el('div', 'akt-detay');
    k.setAttribute('role', 'region');
    k.setAttribute('aria-label', `${turAdi(a.tur)} ayrıntısı`);
    k.style.setProperty('--t', TUR_RENK[grup]);

    const geri = el('button', 'akt-geri');
    geri.type = 'button';
    geri.setAttribute('aria-label', 'Listeye dön');
    geri.appendChild(geriOku());
    geri.appendChild(el('span', null, 'Aktiviteler'));
    geri.addEventListener('click', () => detayKapat());
    k.appendChild(geri);

    const bas = el('div', 'akt-dBas');
    const sim = el('span', 'akt-sim'); sim.appendChild(simgeKur(grup));
    bas.appendChild(sim);
    const yaz = el('div');
    yaz.appendChild(el('h2', null, turAdi(a.tur)));
    const alt = [gunBaslik(a.tarih, bugun), saatBicim(a.baslangic)].filter(Boolean).join(' · ');
    if (alt) yaz.appendChild(el('p', null, alt));
    bas.appendChild(yaz);
    k.appendChild(bas);

    const izgara = el('div', 'akt-izgara');
    const ozet = sayiBlogu([[sureBicim(a.sure_s), 'Süre'], [mesafeBicim(a.mesafe_m), 'Mesafe'], [tam(a.kalori), 'Kalori (kcal)']], 'akt-ana');
    if (ozet) { const b = el('section', 'akt-bolum akt-genis'); b.appendChild(ozet); izgara.appendChild(b); }

    const nabiz = satirBolumu('Nabız', [['Ortalama', sonlu(a.ort_nabiz) ? `${tam(a.ort_nabiz)} atış/dk` : null], ['En yüksek', sonlu(a.max_nabiz) ? `${tam(a.max_nabiz)} atış/dk` : null]]);
    const bolge = bolgeBolumu(a);
    const etki = etkiBolumu(a);
    const bisiklet = grup === 'bisiklet';
    const hareket = satirBolumu(grup === 'kosu' ? 'Koşu biçimi' : 'Hareket', [
      ['Kadans', sonlu(a.kadans) ? `${tam(a.kadans)} ${bisiklet ? 'dev/dk' : 'adım/dk'}` : null],
      ['Adım boyu', sonlu(a.adim_boyu_m) ? `${ondalik(a.adim_boyu_m, 2)} m` : null],
      ['Yer temas süresi', sonlu(a.yer_temas_ms) ? `${tam(a.yer_temas_ms)} ms` : null],
      ['Güç', sonlu(a.guc) ? `${tam(a.guc)} W` : null],
    ]);
    const setler = setBolumu(a);
    const parcalar = [nabiz, etki, bolge, hareket, setler].filter(Boolean);
    for (const p of parcalar) izgara.appendChild(p);

    if (!parcalar.length && !ozet) k.appendChild(el('p', 'akt-bosDetay', 'Bu antrenman için ayrıntı yok.'));
    else k.appendChild(izgara);
    return k;
  }

  const scroller = () => kap;

  function detayAc(a, acan) {
    if (olu || acik) return;
    acik = { acan, kaydirma: scroller().scrollTop || 0 };
    bosalt(detay);
    const k = detayKur(a);
    detay.appendChild(k);
    ana.hidden = true;
    detay.hidden = false;
    scroller().scrollTop = 0;
    document.addEventListener('keydown', tusDinle);
    const g = k.firstChild;
    if (g && g.focus) g.focus({ preventScroll: true });
  }

  function detayKapat() {
    if (!acik) return;
    const { acan, kaydirma } = acik;
    acik = null;
    document.removeEventListener('keydown', tusDinle);
    detay.hidden = true;
    bosalt(detay);
    ana.hidden = false;
    scroller().scrollTop = kaydirma;
    if (acan && acan.focus && acan.isConnected !== false) acan.focus({ preventScroll: true });
  }

  function tusDinle(e) {
    if (e && e.key === 'Escape' && acik) {
      if (e.preventDefault) e.preventDefault();
      detayKapat();
    }
  }

  /* ---- yaşam döngüsü ---- */

  function goster() {
    if (olu) return;
    kok.hidden = false;
    // İlk açılışta ya da veri bayatladıysa (5 dk) yenile; açık ayrıntı varken liste yeniden kurulmaz.
    if (!acik && (!yuklendi || Date.now() - sonYukleme > 5 * 60 * 1000)) yukle();
  }
  function gizle() {
    if (olu) return;
    detayKapat();
    kok.hidden = true;
  }
  function yokEt() {
    if (olu) return;
    olu = true;
    yuklemeNo++;
    document.removeEventListener('keydown', tusDinle);
    if (kok.parentNode) kok.parentNode.removeChild(kok);
  }

  return { goster, gizle, yokEt };
}
