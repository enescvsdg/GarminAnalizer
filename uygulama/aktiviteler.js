// Aktiviteler ekranı: üstte haftalık yük özeti (son 8 hafta + kişisel normal bant), altında tarihe göre
// gruplu liste, dokununca ayrıntı. Kabuk bunu `aktiviteKur(kap, baglam)` ile yükler.
//
//   const a = aktiviteKur(kap, { getir, ornek, canli, ses, rm, gunAc });  a.goster(); a.gizle(); a.yokEt();
//
// Üstte en son antrenman kahraman kartta (canlı tür simgesi, bölge halkası, etki kadranları), sonra haftalık yük,
// sonra önceki antrenmanlar. Simgeler tek bir rAF döngüsüyle yaşar: görünmeyen (IntersectionObserver) simge, gizli
// ekran ve azaltılmış hareket altında durur; yokEt gözlemciyi, döngüyü ve dinleyicileri temizler.
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
  running: 'Koşu', treadmill_running: 'Koşu bandı', trail_running: 'Patika koşusu', track_running: 'Pist koşusu',
  indoor_running: 'Salon koşusu', virtual_run: 'Sanal koşu', ultra_run: 'Ultra koşu', street_running: 'Cadde koşusu',
  obstacle_run: 'Engelli parkur koşusu',
  walking: 'Yürüyüş', casual_walking: 'Gezinti yürüyüşü', speed_walking: 'Tempolu yürüyüş', indoor_walking: 'Salon yürüyüşü',
  hiking: 'Doğa yürüyüşü',
  cycling: 'Bisiklet', indoor_cycling: 'Salon bisikleti', road_biking: 'Yol bisikleti', mountain_biking: 'Dağ bisikleti',
  gravel_cycling: 'Arazi yolu bisikleti', cyclocross: 'Cyclocross', track_cycling: 'Pist bisikleti', virtual_ride: 'Sanal bisiklet',
  bmx: 'BMX', recumbent_cycling: 'Yatık bisiklet', e_bike_fitness: 'Elektrikli bisiklet', e_bike_mountain: 'Elektrikli dağ bisikleti',
  swimming: 'Yüzme', lap_swimming: 'Havuz yüzme', open_water_swimming: 'Açık su yüzme',
  strength_training: 'Kuvvet', yoga: 'Yoga', pilates: 'Pilates', mobility: 'Mobilite', stretching: 'Esneme',
  breathwork: 'Nefes çalışması', meditation: 'Meditasyon',
  hiit: 'HIIT', boxing: 'Boks', mixed_martial_arts: 'Karma dövüş sanatları',
  cardio: 'Kardiyo', indoor_cardio: 'Salon kardiyosu', elliptical: 'Eliptik', stair_climbing: 'Merdiven çıkma',
  floor_climbing: 'Kat çıkma', jump_rope: 'İp atlama',
  rowing: 'Kürek', indoor_rowing: 'Salon küreği', kayaking: 'Kano', canoeing: 'Kanadyen kano',
  stand_up_paddleboarding: 'Ayakta kürek (SUP)', whitewater_rafting: 'Rafting',
  surfing: 'Sörf', kiteboarding: 'Uçurtma sörfü', windsurfing: 'Rüzgâr sörfü', wakeboarding: 'Wakeboard', sailing: 'Yelken',
  single_gas_diving: 'Tüplü dalış', multi_gas_diving: 'Çok gazlı dalış', ccr_diving: 'Kapalı devre dalış',
  apnea_diving: 'Serbest dalış', gauge_diving: 'Gösterge modunda dalış', snorkeling: 'Şnorkel',
  resort_skiing: 'Pist kayağı', resort_skiing_snowboarding: 'Kayak ve snowboard', backcountry_skiing: 'Pist dışı kayak',
  cross_country_skiing: 'Kayaklı koşu', cross_country_skiing_ws: 'Kayaklı koşu', skate_skiing: 'Kayaklı koşu (paten)',
  snowboarding: 'Snowboard', backcountry_snowboarding: 'Pist dışı snowboard', snowshoeing: 'Kar raketiyle yürüyüş',
  tennis: 'Tenis', padel: 'Padel', pickleball: 'Pickleball', table_tennis: 'Masa tenisi', badminton: 'Badminton',
  squash: 'Squash', racquetball: 'Raketbol', platform_tennis: 'Platform tenisi',
  rock_climbing: 'Kaya tırmanışı', bouldering: 'Bouldering', indoor_climbing: 'Salon tırmanışı', mountaineering: 'Dağcılık',
  atv: 'ATV', motocross: 'Motokros', motorcycling: 'Motosiklet', overland: 'Arazi yolculuğu', snowmobiling: 'Kar motoru',
  golf: 'Golf', disc_golf: 'Disk golf',
  soccer: 'Futbol', basketball: 'Basketbol', volleyball: 'Voleybol', american_football: 'Amerikan futbolu', rugby: 'Ragbi',
  hockey: 'Hokey', ice_hockey: 'Buz hokeyi', field_hockey: 'Çim hokeyi', cricket: 'Kriket', baseball: 'Beyzbol',
  softball: 'Softbol', lacrosse: 'Lakros', ultimate_disc: 'Ultimate frizbi',
  triathlon: 'Triatlon', duathlon: 'Duatlon', multi_sport: 'Çoklu spor',
  other: 'Diğer',
};

// Tür anahtarı → simge grubu. Her grubun SIMGE_TUR ve TUR_RENK'te karşılığı vardır (test denetler).
const grupla = (grup, anahtarlar) => anahtarlar.split(' ').map((k) => [k, grup]);
const TUR_GRUP = Object.fromEntries([
  ...grupla('kosu', 'running treadmill_running trail_running track_running indoor_running virtual_run ultra_run street_running obstacle_run'),
  ...grupla('yuruyus', 'walking casual_walking speed_walking indoor_walking'),
  ...grupla('dag', 'hiking'),
  ...grupla('bisiklet', 'cycling indoor_cycling road_biking mountain_biking gravel_cycling cyclocross track_cycling virtual_ride bmx recumbent_cycling e_bike_fitness e_bike_mountain'),
  ...grupla('yuzme', 'swimming lap_swimming open_water_swimming'),
  ...grupla('kuvvet', 'strength_training'),
  ...grupla('yoga', 'yoga'), ...grupla('pilates', 'pilates'),
  ...grupla('esneme', 'mobility stretching breathwork meditation'),
  ...grupla('hiit', 'hiit boxing mixed_martial_arts'),
  ...grupla('kardiyo', 'cardio indoor_cardio stair_climbing floor_climbing jump_rope'),
  ...grupla('eliptik', 'elliptical'),
  ...grupla('kurek', 'rowing indoor_rowing kayaking canoeing stand_up_paddleboarding whitewater_rafting'),
  ...grupla('dalga', 'surfing kiteboarding windsurfing wakeboarding sailing'),
  ...grupla('dalis', 'single_gas_diving multi_gas_diving ccr_diving apnea_diving gauge_diving snorkeling'),
  ...grupla('kar', 'resort_skiing resort_skiing_snowboarding backcountry_skiing cross_country_skiing cross_country_skiing_ws skate_skiing snowboarding backcountry_snowboarding snowshoeing'),
  ...grupla('raket', 'tennis padel pickleball table_tennis badminton squash racquetball platform_tennis'),
  ...grupla('tirmanis', 'rock_climbing bouldering indoor_climbing mountaineering'),
  ...grupla('motor', 'atv motocross motorcycling overland snowmobiling'),
  ...grupla('golf', 'golf disc_golf'),
  ...grupla('takim', 'soccer basketball volleyball american_football rugby hockey ice_hockey field_hockey cricket baseball softball lacrosse ultimate_disc'),
  ...grupla('coklu', 'triathlon duathlon multi_sport'),
  ...grupla('diger', 'other'),
]);

// Tam eşleşme yoksa adın içindeki kelimeden grup; sıra önemli (paddle_tennis kürek değil raket, snowshoe_run kar).
const ANAHTAR_KELIME = [
  [/tennis|padel|squash/, 'raket'], [/swim/, 'yuzme'], [/div/, 'dalis'], [/ski|snow/, 'kar'], [/climb/, 'tirmanis'],
  [/paddl|kayak|canoe|row/, 'kurek'], [/cycl|bik|ride/, 'bisiklet'], [/run/, 'kosu'], [/walk/, 'yuruyus'],
];

// Küçük harf, boşluk/tire → alt çizgi, Garmin sürüm eki (_v2, _v3) atılır.
const anahtar = (tur) => {
  if (!metinMi(tur)) return null;
  const k = tur.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/_v\d+$/, '');
  return k || null;
};

// Garmin'in ham tür anahtarı → Türkçe ad. Bilinmeyen anahtar okunur yazılır ("paddle_tennis" → "Paddle tennis");
// boş ya da harf içermeyen: "Antrenman".
export function turAdi(tur) {
  const k = anahtar(tur);
  if (!k) return 'Antrenman';
  if (Object.hasOwn(TUR_AD, k)) return TUR_AD[k];
  if (!/^[\p{L}\p{N}_]+$/u.test(k) || !/\p{L}/u.test(k)) return 'Antrenman';
  const s = k.replace(/_+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function turGrubu(tur) {
  const k = anahtar(tur);
  if (!k) return 'genel';
  if (Object.hasOwn(TUR_GRUP, k)) return TUR_GRUP[k];
  for (const [d, g] of ANAHTAR_KELIME) if (d.test(k)) return g;
  return 'genel';
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

/* ================= Nabız bölgeleri ve etki (saf) ================= */

const NAB_RENK = ['#a9b8ff', '#8fd9c4', '#ffe08a', '#ffa66e', '#ff6f8e'];
const NAB_AD = ['Çok hafif', 'Hafif', 'Orta', 'Sert', 'Azami'];

// Bölge saniyeleri → { s: 5 sayı (geçersiz → 0), toplam, baskin: en uzun bölgenin indeksi }. Hiç süre yoksa null.
export function bolgeOzet(bolgeler) {
  if (!Array.isArray(bolgeler)) return null;
  const s = [0, 1, 2, 3, 4].map((i) => (sonlu(bolgeler[i]) && bolgeler[i] > 0 ? bolgeler[i] : 0));
  const toplam = s.reduce((x, y) => x + y, 0);
  if (toplam <= 0) return null;
  let baskin = 0;
  s.forEach((v, i) => { if (v > s[baskin]) baskin = i; });
  return { s, toplam, baskin };
}

// Bölge süresi dakikayla: "18 dk", bir dakikadan azsa "<1 dk", yoksa "–" (sıfır uydurulmaz).
export function bolgeDakika(sn) {
  if (!sonlu(sn) || sn <= 0) return '–';
  const dk = Math.round(sn / 60);
  return dk < 1 ? '<1 dk' : `${dk} dk`;
}

// Antrenman etkisi (0–5) için Garmin'in ölçeğine denk sözcük. Geçersiz: null.
export function etkiEtiketi(v) {
  if (!sonlu(v) || v < 0) return null;
  const r = Math.round(v * 10) / 10;
  if (r < 1) return 'Etkisiz';
  if (r < 2) return 'Hafif';
  if (r < 3) return 'Koruyor';
  if (r < 4) return 'Geliştiriyor';
  if (r < 5) return 'Çok geliştiriyor';
  return 'Aşırı yüklenme';
}

/* ================= Hareketli simgeler ================= */
// Her tür kendi küçük sahnesini çizer: kur(g) → { ciz(t), statik }. t saniyedir; `statik` azaltılmış hareket
// karesidir (değeri en iyi anlatan duruş). Çizgi rengi currentColor; ışıma kabın CSS'inden gelir (kimlik yok).

const f2 = (x) => Math.round(x * 100) / 100;
const TAU = Math.PI * 2;
const ata = (e, k, v) => {
  const s = typeof v === 'number' ? String(f2(v)) : v;
  const m = e.__v || (e.__v = {});
  if (m[k] !== s) { m[k] = s; e.setAttribute(k, s); }
};
const yol = (...p) => `M${p.map((q) => `${f2(q[0])} ${f2(q[1])}`).join('L')}`;
const uzat = (o, boy, aci) => [o[0] + boy * Math.sin(aci), o[1] + boy * Math.cos(aci)];
const yumusak = (x) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };

const CANLI = {
  // Koşu: kollar ve bacaklar karşılıklı salınır, beden hafifçe yaylanır, yerde hız çizgileri akar.
  kosu(g) {
    const zemin = [0, 1].map(() => sv('path', { 'stroke-width': 1.1, opacity: 0.4 }, g));
    const kollar = [0, 1].map(() => sv('path', {}, g));
    const bacaklar = [0, 1].map(() => sv('path', {}, g));
    const govde = sv('path', {}, g);
    const kafa = sv('circle', { r: 1.9 }, g);
    return {
      statik: 0.55,
      ciz(t) {
        const f = t * TAU * 1.15;
        const bob = 0.45 * Math.cos(2 * f);
        const H = [10.6, 12.5 + bob]; const S = [13.7, 8.1 + bob];
        ata(govde, 'd', yol(S, H));
        ata(kafa, 'cx', 15.6); ata(kafa, 'cy', 5.1 + bob);
        [0, Math.PI].forEach((ek, i) => {
          const p = f + ek;
          const a1 = 0.12 + 0.85 * Math.sin(p);
          const K = uzat(H, 4.3, a1);
          const F = uzat(K, 4.2, a1 - (0.15 + 1.35 * Math.max(0, Math.cos(p))));
          ata(bacaklar[i], 'd', yol(H, K, F));
          const b1 = -0.8 * Math.sin(p);
          const E = uzat(S, 3.1, b1);
          ata(kollar[i], 'd', yol(S, E, uzat(E, 2.7, b1 + 1.65)));
          ata(kollar[i], 'opacity', i ? 0.45 : 1);
          ata(bacaklar[i], 'opacity', i ? 0.45 : 1);
        });
        zemin.forEach((z, i) => {
          const x = 24 - ((t * 15 + i * 12) % 26);
          ata(z, 'd', `M${f2(x)} ${i ? 19.6 : 22.2}h${i ? 2.2 : 3.4}`);
        });
      },
    };
  },
  // Yürüyüş: ayak izleri sırayla belirip söner, yukarı doğru ilerler.
  ayak(g) {
    const IZ = [[9.4, 19.4, -12], [14.4, 15, 12], [9.6, 10.6, -12], [14.6, 6.2, 12]];
    const izler = IZ.map(([x, y, r]) => {
      const k = sv('g', { transform: `translate(${x} ${y}) rotate(${r})`, fill: 'currentColor', stroke: 'none' }, g);
      sv('ellipse', { cx: 0, cy: 0.7, rx: 1.65, ry: 2.5 }, k);
      sv('circle', { cx: 0.1, cy: -2.6, r: 1.05 }, k);
      return k;
    });
    return {
      statik: 1.9,
      ciz(t) {
        const u = (t / 2.6) % 1;
        izler.forEach((k, i) => {
          const yas = u * 5 - i;
          ata(k, 'opacity', yas < 0 ? 0.22 : Math.max(0.22, 1 - yas * 0.3));
        });
      },
    };
  },
  // Doğa yürüyüşü: dağın yamacında kesik iz yukarı akar, güneş yavaşça nefes alır.
  dag(g) {
    sv('path', { d: 'M2.4 20.2l6.6-10.8 3.5 5.6 2.6-3.9 6.5 9.1z' }, g);
    const iz = sv('path', { d: 'M4.6 20.2c1.6-1.6 2.7-3.6 3.6-5.6s1.3-3.4 2.4-4.8', 'stroke-dasharray': '.1 2', 'stroke-width': 1.7 }, g);
    const isin = sv('circle', { cx: 18, cy: 5.4, r: 3, 'stroke-width': 0.8, opacity: 0.4 }, g);
    sv('circle', { cx: 18, cy: 5.4, r: 1.6 }, g);
    return {
      statik: 0,
      ciz(t) {
        ata(iz, 'stroke-dashoffset', (t * 2.4) % 2.1);
        const n = 0.5 + 0.5 * Math.sin(t * 1.6);
        ata(isin, 'r', 2.6 + n * 0.9); ata(isin, 'opacity', 0.55 - n * 0.35);
      },
    };
  },
  // Bisiklet: teker telleri ve pedal kolu döner.
  bisiklet(g) {
    const T = [[5.4, 16.2], [18.6, 16.2]];
    const teller = T.map(([x, y]) => {
      sv('circle', { cx: x, cy: y, r: 3.9 }, g);
      const k = sv('g', { 'stroke-width': 0.8, opacity: 0.7 }, g);
      for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; sv('path', { d: `M${f2(x - 3.4 * Math.cos(a))} ${f2(y - 3.4 * Math.sin(a))}L${f2(x + 3.4 * Math.cos(a))} ${f2(y + 3.4 * Math.sin(a))}` }, k); }
      return [k, x, y];
    });
    sv('path', { d: 'M5.4 16.2l4.2-7h5.8l3.2 7M9.6 9.2l3.4 7h-7.6M8.4 7.1h2.6M15.4 9.2l-.7-2.4h2.1' }, g);
    const krank = sv('path', { 'stroke-width': 1.4 }, g);
    return {
      statik: 0.1,
      ciz(t) {
        const a = t * 260;
        for (const [k, x, y] of teller) ata(k, 'transform', `rotate(${f2(a % 360)} ${x} ${y})`);
        const r = (t * 4.5) % TAU;
        ata(krank, 'd', `M${f2(13 - 1.8 * Math.cos(r))} ${f2(16.2 - 1.8 * Math.sin(r))}L${f2(13 + 1.8 * Math.cos(r))} ${f2(16.2 + 1.8 * Math.sin(r))}`);
      },
    };
  },
  // Yüzme: dalgalar akar, kol kulaç atar, baş suyun üstünde salınır.
  yuzme(g) {
    let d = 'M-6 0';
    for (let i = 0; i < 12; i++) d += i ? 't3 0' : 'q1.5 -1.3 3 0';
    const dalga = [[17.6, 1, 4.2], [21.2, 0.5, 2.8]].map(([y, op, h]) => [sv('path', { d, opacity: op }, g), y, h]);
    const govde = sv('path', {}, g);
    const kol = sv('path', {}, g);
    const kafa = sv('circle', { r: 1.8 }, g);
    return {
      statik: 0.3,
      ciz(t) {
        dalga.forEach(([p, y, h]) => ata(p, 'transform', `translate(${f2(-((t * h) % 6))} ${y})`));
        const bob = 0.5 * Math.sin(t * 3.3);
        ata(kafa, 'cx', 16.4); ata(kafa, 'cy', 11.2 + bob);
        const O = [13.4, 13.3 + bob * 0.5];
        ata(govde, 'd', yol(O, [6.2, 14.6]));
        const a = -t * 3.3;
        const E = [O[0] + 4.6 * Math.cos(a), O[1] + 4.6 * Math.sin(a) * 0.9];
        ata(kol, 'd', `M${f2(O[0])} ${f2(O[1])}Q${f2((O[0] + E[0]) / 2 + Math.sin(a) * 1.6)} ${f2((O[1] + E[1]) / 2 - Math.cos(a) * 1.6)} ${f2(E[0])} ${f2(E[1])}`);
        ata(kol, 'opacity', Math.sin(a) > 0.35 ? 0.35 : 1);
      },
    };
  },
  // Kuvvet: halter omuzdan baş üstüne kalkar, tepede kısa durur, iner.
  kuvvet(g) {
    sv('circle', { cx: 12, cy: 8.4, r: 1.8 }, g);
    sv('path', { d: 'M12 10.6v6.2M12 16.8l-2.6 4.6M12 16.8l2.6 4.6' }, g);
    const kollar = [0, 1].map(() => sv('path', {}, g));
    const bar = sv('g', {}, g);
    sv('path', { d: 'M3.6 0h16.8', 'stroke-width': 1.4 }, bar);
    sv('path', { d: 'M5.4 -2.6v5.2M18.6 -2.6v5.2', 'stroke-width': 2 }, bar);
    sv('path', { d: 'M3.6 -1.6v3.2M20.4 -1.6v3.2', 'stroke-width': 1.3 }, bar);
    return {
      statik: 1.1,
      ciz(t) {
        const u = (t / 2.4) % 1;
        const k = u < 0.4 ? yumusak(u / 0.4) : u < 0.55 ? 1 : u < 0.9 ? 1 - yumusak((u - 0.55) / 0.35) : 0;
        const y = 11.4 - 7.4 * k;
        ata(bar, 'transform', `translate(0 ${f2(y)})`);
        [[-1, 9.9], [1, 14.1]].forEach(([yon, x], i) => {
          const S = [x, 11.8]; const W = [12 + yon * 3.8, y];
          const E = [12 + yon * (5 + 0.6 * (1 - k)), (S[1] + W[1]) / 2 + 1.2 * (1 - k)];
          ata(kollar[i], 'd', yol(S, E, W));
        });
      },
    };
  },
  // Yoga ve pilates: oturan beden nefesle kollarını yükseltir; çevresindeki hale genişleyip daralır.
  nefes(g) {
    const hale = sv('circle', { cx: 12, cy: 12.4, r: 9, 'stroke-width': 0.8 }, g);
    sv('circle', { cx: 12, cy: 6.2, r: 1.8 }, g);
    const govde = sv('path', {}, g);
    sv('path', { d: 'M5.4 18.6c2-1.9 4.2-2.6 6.6-2.6s4.6.7 6.6 2.6M7.4 19.8h9.2' }, g);
    const kollar = [0, 1].map(() => sv('path', {}, g));
    return {
      statik: 1.6,
      ciz(t) {
        const n = 0.5 - 0.5 * Math.cos((t * TAU) / 5.2);
        ata(hale, 'r', 8.2 + 1.6 * n); ata(hale, 'opacity', 0.14 + 0.3 * n);
        const S = [12, 9.6 - 0.3 * n];
        ata(govde, 'd', yol([12, 8.2 - 0.3 * n], [12, 15.2]));
        [-1, 1].forEach((yon, i) => {
          const a = -0.5 + 2.1 * n;
          const E = [S[0] + yon * 3.4 * Math.cos(a * 0.6), S[1] + 1.6 - 3.2 * Math.sin(a * 0.6)];
          const W = [E[0] + yon * 2.6 * Math.cos(a) * 0.7, E[1] + 1.2 - 3.6 * Math.sin(a)];
          ata(kollar[i], 'd', yol(S, E, W));
        });
      },
    };
  },
  // HIIT: şimşek kısa aralıklarla çakar; yanında kıvılcımlar.
  simsek(g) {
    const k = sv('g', {}, g);
    sv('path', { d: 'M13.2 2.8L5.6 13.4h6l-1 7.8 7.8-11h-6.2z' }, k);
    const kiv = [[19, 4.6, 20.8, 3.2], [20.2, 14.4, 22, 15.4], [3.4, 6.4, 1.8, 5.2]].map(([a, b, c, d]) => sv('path', { d: `M${a} ${b}L${c} ${d}`, 'stroke-width': 1.2 }, g));
    return {
      statik: 0.05,
      ciz(t) {
        const u = (t / 1.3) % 1;
        const c = Math.exp(-u * 7);
        ata(k, 'transform', `translate(12 12) scale(${f2(1 + 0.08 * c)}) translate(-12 -12)`);
        kiv.forEach((p, i) => ata(p, 'opacity', Math.max(0, c * 1.2 - i * 0.15)));
      },
    };
  },
  // Kardiyo ve diğerleri: kalp atışı çizgisi; parlak bir parça çizgi boyunca koşar.
  nabiz(g) {
    const d = 'M2 13.2h4.2l1.7-3.6 2.6 7.6 2.5-10.2 2.1 6.2h6.9';
    sv('path', { d, opacity: 0.3 }, g);
    const parlak = sv('path', { d, pathLength: 100, 'stroke-dasharray': '26 100', 'stroke-width': 1.9 }, g);
    return {
      statik: 0.55,
      ciz(t) { ata(parlak, 'stroke-dashoffset', 100 - ((t * 62) % 130)); },
    };
  },
  // Kürek: gövde öne arkaya kayar, kürek suya girip çekilir.
  kurek(g) {
    sv('path', { d: 'M3.2 16.6c3.6 1.9 14 1.9 17.6 0', 'stroke-width': 1.5 }, g);
    const su = sv('path', { d: 'M-4 0c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1', opacity: 0.5 }, g);
    const kafa = sv('circle', { r: 1.6 }, g);
    const govde = sv('path', {}, g);
    const kurek = sv('path', { 'stroke-width': 1.4 }, g);
    const kol = sv('path', {}, g);
    return {
      statik: 0.7,
      ciz(t) {
        const n = 0.5 - 0.5 * Math.cos((t * TAU) / 2.6);
        ata(su, 'transform', `translate(${f2(-((t * 2.2) % 6))} 21)`);
        // gövde öne-arkaya eğilir; kürek sapı ellerde, ıskarmozdan (P) geçip pala suya iner
        const kx = 7.4 + 2.6 * n;
        ata(kafa, 'cx', kx); ata(kafa, 'cy', 7.9 - 0.4 * n);
        ata(govde, 'd', yol([kx + 0.3, 9.6], [9.6, 15.4]));
        const El = [kx + 2.4 + 1.6 * n, 12.6]; const P = [14.2, 15.4];
        ata(kurek, 'd', yol(El, [P[0] + (P[0] - El[0]) * 1.35, P[1] + (P[1] - El[1]) * 1.6]));
        ata(kol, 'd', yol([kx + 0.6, 10.4], El));
      },
    };
  },
  // Dalış: tüplü dalgıç yatay süzülür, paletler sırayla çırpar, kabarcıklar salınarak yükselip söner.
  dalis(g) {
    const tup = sv('path', { 'stroke-width': 2.4, opacity: 0.8 }, g);
    const govde = sv('path', {}, g);
    const kafa = sv('circle', { r: 1.8 }, g);
    const bacaklar = [0, 1].map(() => sv('path', {}, g));
    const kabarcik = [0, 1, 2].map(() => sv('circle', { 'stroke-width': 0.9 }, g));
    return {
      statik: 0.9,
      ciz(t) {
        const bob = 0.5 * Math.sin(t * 1.7);
        const H = [8.4, 13.6 + bob * 0.6]; const S = [15.2, 12.2 + bob];
        ata(govde, 'd', yol(H, S));
        ata(tup, 'd', yol([9.8, 11.5 + bob * 0.7], [13.8, 10.7 + bob * 0.9]));
        ata(kafa, 'cx', 17.6); ata(kafa, 'cy', 11.2 + bob);
        [0, Math.PI].forEach((ek, i) => {
          const p = t * TAU * 0.9 + ek;
          const a1 = -1.42 + 0.26 * Math.sin(p);
          const K = uzat(H, 3.4, a1);
          const a2 = a1 - 0.22 * Math.sin(p - 0.9);
          const F = uzat(K, 3.2, a2);
          ata(bacaklar[i], 'd', yol(H, K, F, uzat(F, 1.9, a2 + 0.95)));
          ata(bacaklar[i], 'opacity', i ? 0.45 : 1);
        });
        kabarcik.forEach((c, i) => {
          const u = (t / 2.4 + i / 3) % 1;
          ata(c, 'cx', 19.4 + 0.6 * Math.sin(u * TAU * 1.5 + i));
          ata(c, 'cy', 9.2 - u * 7.2);
          ata(c, 'r', 0.5 + 0.7 * u);
          ata(c, 'opacity', u < 0.15 ? u / 0.15 : Math.max(0, 1 - (u - 0.15) * 1.1));
        });
      },
    };
  },
  // Kar: kayakçı yamaçtan iner; dizler yaylanır, iz akar, kuyruktan kar tozu savrulur.
  kar(g) {
    const iz = sv('path', { d: 'M2 12.1L22 20.5', 'stroke-width': 1, opacity: 0.4, 'stroke-dasharray': '1.6 2.2' }, g);
    const kisi = sv('g', {}, g);
    sv('path', { d: 'M7.4 12.9L16.6 16.8q1.3.5 1.7-.6' }, kisi);
    const bacak = sv('path', {}, kisi);
    const govde = sv('path', {}, kisi);
    const kafa = sv('circle', { r: 1.7 }, kisi);
    const kol = sv('path', {}, kisi);
    const baston = sv('path', { 'stroke-width': 1, opacity: 0.7 }, kisi);
    const toz = [0, 1, 2].map(() => sv('circle', { r: 0.5, fill: 'currentColor', stroke: 'none' }, g));
    return {
      statik: 0.4,
      ciz(t) {
        const c = 0.5 * Math.sin((t * TAU) / 1.6);
        const dx = 0.6 * Math.sin((t * TAU) / 3.2);
        ata(kisi, 'transform', `translate(${f2(dx)} ${f2(dx * 0.42)})`);
        const F = [12, 14.8]; const K = [13.5, 12.4 + c * 0.4]; const H = [11.2, 10.2 + c];
        const S = [13.4, 6.8 + c]; const W = [15.6, 9.4 + c];
        ata(bacak, 'd', yol(F, K, H));
        ata(govde, 'd', yol(H, S));
        ata(kafa, 'cx', 14.6); ata(kafa, 'cy', 4.5 + c);
        ata(kol, 'd', yol(S, [15, 8 + c], W));
        ata(baston, 'd', yol(W, [10.6, 15.2]));
        ata(iz, 'stroke-dashoffset', (t * 6) % 3.8);
        toz.forEach((p, i) => {
          const u = (t / 1.1 + i / 3) % 1;
          ata(p, 'cx', 7.2 + dx - u * 5);
          ata(p, 'cy', 12.6 + dx * 0.42 - u * 2.6 + u * u * 3);
          ata(p, 'opacity', Math.max(0, 1 - u));
        });
      },
    };
  },
  // Raket: top yere sekip rakete döner; vuruş anında raket kısa bir savuruş yapar.
  raket(g) {
    sv('path', { d: 'M14.6 21.4h7', 'stroke-width': 1, opacity: 0.4 }, g);
    const raket = sv('g', {}, g);
    sv('ellipse', { cx: 8.4, cy: 8.4, rx: 3.6, ry: 4.6, transform: 'rotate(-35 8.4 8.4)' }, raket);
    sv('path', { d: 'M7.43 4.93L11.33 10.49M5.47 6.31L9.37 11.87M6.27 9.89L10.53 6.91M7.68 10.86L10.96 8.56', 'stroke-width': 0.7, opacity: 0.5 }, raket);
    sv('path', { d: 'M11 12.2L14.4 16.9', 'stroke-width': 2 }, raket);
    const top = sv('circle', { r: 1.5 }, g);
    return {
      statik: 0.3,
      ciz(t) {
        const u = (t / 1.4) % 1;
        let x; let y;
        if (u < 0.5) { const s = u / 0.5; x = 13 + 5.6 * s; y = 8 + 11.8 * s * s; }
        else { const s = (u - 0.5) / 0.5; x = 18.6 - 5.6 * s; y = 19.8 - 11.8 * (1 - (1 - s) * (1 - s)); }
        ata(top, 'cx', x); ata(top, 'cy', y);
        const k = Math.exp(-u * 8) + 0.6 * Math.exp(-(1 - u) * 14);
        ata(raket, 'transform', `rotate(${f2(-12 * k)} 14.4 16.9)`);
      },
    };
  },
  // Tırmanış: duvardaki tutamaklar aşağı akar; figür çapraz kol-bacakla uzanıp çekilir.
  tirmanis(g) {
    const TUT = [[5, 2], [18.6, 6], [6.2, 10], [17.8, 14], [5.4, 18], [19, 22]];
    const tut = TUT.map(() => sv('circle', { r: 0.95, fill: 'currentColor', stroke: 'none' }, g));
    sv('circle', { cx: 12, cy: 5.6, r: 1.8 }, g);
    const govde = sv('path', {}, g);
    const kollar = [0, 1].map(() => sv('path', {}, g));
    const bacaklar = [0, 1].map(() => sv('path', {}, g));
    return {
      statik: 0.45,
      ciz(t) {
        TUT.forEach(([x, y0], i) => {
          const y = ((y0 + t * 1.6) % 24) - 1;
          ata(tut[i], 'cx', x); ata(tut[i], 'cy', y);
          ata(tut[i], 'opacity', 0.15 + 0.5 * Math.max(0, Math.sin((Math.PI * (y + 1)) / 24)));
        });
        const f = (t * TAU) / 1.8;
        const sal = 0.5 * Math.sin(f);
        const S = [12 + sal * 0.4, 8.2]; const H = [12 - sal * 0.4, 13.6];
        ata(govde, 'd', yol([12, 7.4], S, H));
        [-1, 1].forEach((yon, i) => {
          const l = 0.5 + 0.5 * Math.sin(f) * yon; const m = 1 - l;
          ata(kollar[i], 'd', yol(S, [12 + yon * 3.4, 9.2 - 1.6 * l], [12 + yon * 3.6, 6.4 - 3 * l]));
          ata(bacaklar[i], 'd', yol(H, [12 + yon * 3.2, 15 - 1.8 * m], [12 + yon * 3, 19.6 - 2.6 * m]));
        });
      },
    };
  },
  // Motor: tırtıllı tekerler döner, gövde ve sürücü engebede yaylanır, yer çizgileri akar.
  motor(g) {
    const zemin = [0, 1].map(() => sv('path', { 'stroke-width': 1.1, opacity: 0.4 }, g));
    const T = [[5.6, 17], [18.4, 17]];
    const disler = T.map(([x, y]) => {
      sv('circle', { cx: x, cy: y, r: 3.1 }, g);
      sv('circle', { cx: x, cy: y, r: 0.8 }, g);
      return [sv('circle', { cx: x, cy: y, r: 3.6, 'stroke-width': 1.3, 'stroke-dasharray': '1 1.25' }, g), x, y];
    });
    const ust = sv('g', {}, g);
    sv('path', { d: 'M5.6 17l3.4-5.4h6.4l3 5.4M9.8 10.6h4.4M15.4 11.6l1.4-2.8h2.2' }, ust);
    sv('circle', { cx: 12.8, cy: 4.4, r: 1.6 }, ust);
    sv('path', { d: 'M12.4 6.2l-1.4 4.2M12.2 7.2l4.4 1.6' }, ust);
    return {
      statik: 0.2,
      ciz(t) {
        const a = (t * 300) % 360;
        for (const [k, x, y] of disler) ata(k, 'transform', `rotate(${f2(a)} ${x} ${y})`);
        ata(ust, 'transform', `translate(0 ${f2(-0.7 * Math.abs(Math.sin(t * 4.6)))})`);
        zemin.forEach((z, i) => {
          const x = 24 - ((t * 14 + i * 13) % 27);
          ata(z, 'd', `M${f2(x)} ${i ? 22.4 : 21.4}h${i ? 2 : 3.2}`);
        });
      },
    };
  },
  // Takım sporları: top dönerek seker, yere değince hafif basılır; gölgesi yükseklikle küçülür.
  takim(g) {
    const golge = sv('ellipse', { cx: 12, cy: 21.6, ry: 0.7, 'stroke-width': 1, opacity: 0.4 }, g);
    const top = sv('g', {}, g);
    sv('circle', { cx: 0, cy: 0, r: 4.2 }, top);
    const P = [0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + (i * TAU) / 5; return [Math.cos(a), Math.sin(a)]; });
    sv('path', { d: `${yol(...P.map(([x, y]) => [x * 1.5, y * 1.5]))}Z`, fill: 'currentColor', 'stroke-width': 0.8 }, top);
    sv('path', { d: P.map(([x, y]) => yol([x * 1.5, y * 1.5], [x * 4.2, y * 4.2])).join(''), 'stroke-width': 0.8, opacity: 0.7 }, top);
    return {
      statik: 0.5,
      ciz(t) {
        const u = (t / 1.2) % 1;
        const h = 4 * u * (1 - u);
        const ez = Math.max(0, 1 - h / 0.12);
        ata(top, 'transform', `translate(12 ${f2(17 - 9 * h + 0.4 * ez)}) scale(${f2(1 + 0.1 * ez)} ${f2(1 - 0.12 * ez)}) rotate(${f2((t * 140) % 360)})`);
        ata(golge, 'rx', 4 * (1 - 0.45 * h));
        ata(golge, 'opacity', 0.45 - 0.3 * h);
      },
    };
  },
  // Sörf: dalga kıvrılır, sörfçü dalga yüzünde süzülür, kuyruktan köpük savrulur.
  dalga(g) {
    const su = sv('path', { d: 'M1.5 21.2h21', 'stroke-width': 1, opacity: 0.4, 'stroke-dasharray': '2.4 1.8' }, g);
    const dalga = sv('path', { d: 'M10.4 20.6c2.8 0 4.8-1.8 6.2-4.8 1.2-2.6 2.4-5 4.2-5 1.2 0 1.8.9 1.6 1.9-.2.9-1 1.3-1.8.8' }, g);
    const kisi = sv('g', {}, g);
    sv('path', { d: 'M5.8 19.8L12.2 17.3', 'stroke-width': 1.7 }, kisi);
    sv('path', { d: 'M7.8 19.1L8 16.2l1.4-.9M10.6 18L11.2 16.2l-1.8-.9M9.4 15.3L10 12.2M10 12.7L6.8 12.9M10 12.7l3.6-1.3' }, kisi);
    sv('circle', { cx: 10.6, cy: 10.2, r: 1.6 }, kisi);
    const kopuk = [0, 1, 2].map(() => sv('circle', { r: 0.5, fill: 'currentColor', stroke: 'none' }, g));
    return {
      statik: 0.6,
      ciz(t) {
        const o = Math.sin((t * TAU) / 2.2);
        const dx = o * 1.1 - 1.6; const dy = -o * 0.5;
        ata(kisi, 'transform', `translate(${f2(dx)} ${f2(dy)}) rotate(${f2(o * 4)} 9 18)`);
        ata(dalga, 'transform', `translate(${f2(0.4 * Math.sin(t * 1.3))} 0)`);
        ata(su, 'stroke-dashoffset', (t * 4) % 4.2);
        kopuk.forEach((p, i) => {
          const u = (t / 1 + i / 3) % 1;
          ata(p, 'cx', 5.6 + dx - u * 3.6);
          ata(p, 'cy', 19.4 + dy - u * 2.4 + u * u * 2.6);
          ata(p, 'opacity', Math.max(0, 1 - u));
        });
      },
    };
  },
  // Çoklu spor: üç parçalı halka döner, parlaklık parçadan parçaya geçer; merkezde nefes alan nokta.
  coklu(g) {
    const ic = sv('circle', { cx: 12, cy: 12, r: 4.4, 'stroke-width': 0.8, 'stroke-dasharray': '1.2 1.6', opacity: 0.45 }, g);
    const merkez = sv('circle', { cx: 12, cy: 12, r: 1.6, fill: 'currentColor', stroke: 'none' }, g);
    const halka = sv('g', {}, g);
    const yay = (a0, a1) => {
      const r = 8; const p = (a) => [12 + r * Math.cos(a), 12 + r * Math.sin(a)];
      const [x0, y0] = p(a0); const [x1, y1] = p(a1);
      return `M${f2(x0)} ${f2(y0)}A${r} ${r} 0 0 1 ${f2(x1)} ${f2(y1)}`;
    };
    const parca = [0, 1, 2].map((i) => {
      const a = -Math.PI / 2 + (i * TAU) / 3;
      return sv('path', { d: yay(a + 0.2, a + TAU / 3 - 0.2), 'stroke-width': 1.8 }, halka);
    });
    return {
      statik: 0.4,
      ciz(t) {
        ata(halka, 'transform', `rotate(${f2((t * 60) % 360)} 12 12)`);
        ata(ic, 'transform', `rotate(${f2(-(t * 40) % 360)} 12 12)`);
        const s = (t / 0.9) % 3;
        parca.forEach((p, i) => {
          const d = Math.min(Math.abs(s - i), 3 - Math.abs(s - i));
          ata(p, 'opacity', 0.35 + 0.65 * Math.max(0, 1 - d));
        });
        const n = 0.5 - 0.5 * Math.cos((t * TAU) / 2.7);
        ata(merkez, 'r', 1.2 + 0.7 * n);
      },
    };
  },
  // Golf: top kavis çizip deliğe düşer; bayrak rüzgârda dalgalanır.
  golf(g) {
    sv('path', { d: 'M2 20c4-1 16-1 20 0', 'stroke-width': 1, opacity: 0.4 }, g);
    sv('ellipse', { cx: 17, cy: 19.3, rx: 1.6, ry: 0.5, 'stroke-width': 1 }, g);
    sv('path', { d: 'M17 19.2V4.4' }, g);
    const bayrak = sv('path', { fill: 'currentColor', 'stroke-width': 1, opacity: 0.85 }, g);
    const top = sv('circle', { r: 1.3 }, g);
    return {
      statik: 1.2,
      ciz(t) {
        const d = Math.sin(t * 3.4);
        ata(bayrak, 'd', `M17 4.4Q${f2(19 + d * 0.6)} ${f2(4.6 - d * 0.6)} ${f2(21.4 + d * 0.3)} 6.3Q${f2(19 - d * 0.6)} ${f2(6.9 + d * 0.6)} 17 8.2Z`);
        const u = (t / 2.6) % 1;
        let x = 4; let y = 18.6; let op = 1;
        if (u < 0.6) { const s = u / 0.6; x = 4 + 13 * s; y = 18.6 - 38 * s * (1 - s); }
        else if (u < 0.75) { const s = (u - 0.6) / 0.15; x = 17; y = 18.6 + 1.2 * s; op = 1 - s; }
        else { op = (u - 0.75) / 0.25; }
        ata(top, 'cx', x); ata(top, 'cy', y); ata(top, 'opacity', op);
      },
    };
  },
};

const SIMGE_TUR = {
  kosu: 'kosu', yuruyus: 'ayak', dag: 'dag', bisiklet: 'bisiklet', yuzme: 'yuzme', kuvvet: 'kuvvet',
  yoga: 'nefes', pilates: 'nefes', esneme: 'nefes', hiit: 'simsek', kardiyo: 'nabiz', eliptik: 'nabiz', kurek: 'kurek',
  dalga: 'dalga', dalis: 'dalis', kar: 'kar', raket: 'raket', tirmanis: 'tirmanis', motor: 'motor', golf: 'golf',
  takim: 'takim', coklu: 'coklu', diger: 'nabiz', genel: 'nabiz',
};
export const simgeTuru = (grup) => (Object.hasOwn(SIMGE_TUR, grup) ? SIMGE_TUR[grup] : 'nabiz');

// Tür grubuna göre vurgu rengi (yalnız süs; tür adı her zaman yazıyla da verilir).
const TUR_RENK = {
  kosu: '#ff9d7a', yuruyus: '#ffc9a6', dag: '#ffc9a6', bisiklet: '#ffd88a', yuzme: '#9ec8ff', kuvvet: '#c8a8ff',
  yoga: '#bfeedd', pilates: '#bfeedd', esneme: '#bfeedd', hiit: '#ff9fb8', kardiyo: '#ff9fb8', eliptik: '#ffd88a', kurek: '#9ec8ff',
  dalga: '#8fdcec', dalis: '#7fd6d0', kar: '#d6ebff', raket: '#dcef8a', tirmanis: '#ffb48a', motor: '#ffcf7a', golf: '#c9eeaa',
  takim: '#a8e6b4', coklu: '#d8b8ff', diger: '#d9cdea', genel: '#d9cdea',
};
// Test ve denetim için: bilinen her grup, simgesinin kurulumu.
export const TUR_GRUPLARI = Object.freeze(Object.keys(TUR_RENK));
export const turRengi = (grup) => (Object.hasOwn(TUR_RENK, grup) ? TUR_RENK[grup] : TUR_RENK.genel);
export function simgeKur(grup, g) { return CANLI[simgeTuru(grup)](g); }

/* ================= Stil ================= */

const STIL = `
.akt{--a-m:#fff6ec;--a-i:#ffc9a6;--a-iyi:#bfeedd;--a-mor:#b597ff;--a-mercan:#ff9d7a;--a-sol:rgba(255,246,236,.68);--a-kenar:rgba(255,246,236,.14);
  container-type:inline-size;position:relative;min-height:100%;padding:14px 2px 28px;color:var(--a-m);font-family:'Onest',system-ui,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.akt[hidden],.akt [hidden]{display:none!important}
.akt *{box-sizing:border-box}
.akt button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:inherit}
.akt button:focus-visible{outline:2px solid var(--a-i);outline-offset:2px}
.akt svg{fill:none;stroke-linecap:round;stroke-linejoin:round}
.akt-bas{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;padding-right:100px;min-height:48px}
.akt-bas h1{font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100,'opsz' 144;font-weight:430;font-size:36px;line-height:1.05;letter-spacing:-.025em}
.akt-bas h1:focus{outline:none}
.akt-etiket{padding:3px 9px;border:1px solid rgba(255,246,236,.26);border-radius:999px;background:rgba(12,8,18,.48);font:600 10px/1.3 system-ui,sans-serif;letter-spacing:.02em;color:rgba(255,246,236,.85);white-space:nowrap}

/* canlı simge kabı: tür renginde yumuşak ışıma, çizgi kremle tür renginin karışımı */
.akt-kure{position:relative;flex:none;display:grid;place-items:center;border-radius:50%;
  color:color-mix(in srgb,var(--t) 58%,#fff6ec);
  background:radial-gradient(circle at 50% 42%,color-mix(in srgb,var(--t) 30%,transparent),color-mix(in srgb,var(--t) 7%,transparent) 68%,transparent 72%);
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--t) 34%,transparent),0 0 24px color-mix(in srgb,var(--t) 16%,transparent)}
.akt-kure svg{stroke:currentColor;stroke-width:1.5;overflow:hidden}

/* kahraman: son antrenman */
.akt-kahraman{position:relative;margin-top:12px;padding:18px 18px 16px;border-radius:30px;display:grid;gap:16px;isolation:isolate;
  background:radial-gradient(120% 80% at 0% 0%,color-mix(in srgb,var(--t) 22%,transparent),transparent 58%),
    radial-gradient(90% 60% at 100% 100%,rgba(181,151,255,.10),transparent 70%),
    linear-gradient(160deg,rgba(255,246,236,.12),rgba(255,246,236,.03) 64%);
  border:1px solid color-mix(in srgb,var(--t) 26%,rgba(255,246,236,.12));
  box-shadow:0 22px 48px rgba(4,2,8,.55),inset 0 1px 0 rgba(255,255,255,.18)}
.akt-kahraman:has(.akt-kAc:focus-visible){outline:2px solid var(--a-i);outline-offset:3px}
.akt-kAc{display:flex;align-items:center;gap:14px;width:100%;min-height:64px}
.akt-kAc::after{content:"";position:absolute;inset:0;border-radius:inherit;z-index:1}
.akt-kAc:focus-visible{outline:none!important}
.akt-kAc .akt-kure{width:66px;height:66px}
.akt-kAc .akt-kure svg{width:42px;height:42px}
.akt-kAd{flex:1;min-width:0}
.akt-kAd small{display:block;font-size:12.5px;font-weight:500;color:var(--a-sol)}
.akt-kAd b{display:block;font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100,'opsz' 144;font-weight:430;font-size:31px;line-height:1.04;letter-spacing:-.02em;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.akt-kAd span{display:block;font-size:13px;color:rgba(255,246,236,.8);margin-top:3px}
.akt-kahraman .akt-ok{width:20px;height:20px;align-self:center}
.akt-kSay{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:10px 12px;padding-top:14px;border-top:1px solid rgba(255,246,236,.1)}
.akt-kSay .akt-s b{font-size:24px;font-weight:600;letter-spacing:-.025em;line-height:1.1}
.akt-kSay .akt-s b small{font-size:13px;font-weight:500;color:var(--a-sol);margin-left:2px;letter-spacing:0}
.akt-kSay .akt-s span{font-size:11.5px;margin-top:2px}
.akt-kGrafik{display:grid;gap:16px}

/* bölge halkası */
.akt-halkaAlan{display:grid;grid-template-columns:118px minmax(0,1fr);gap:16px;align-items:center}
.akt-halka{width:118px;height:118px;display:block;overflow:visible}
.akt-halka circle{fill:none;stroke-linecap:butt}
.akt-halka text{font-family:'Onest',system-ui,sans-serif;font-variant-numeric:tabular-nums;text-anchor:middle;stroke:none}
.akt-hY{fill:var(--a-m);font-size:22px;font-weight:600;letter-spacing:-.5px}
.akt-hA{fill:rgba(255,246,236,.7);font-size:10.5px;font-weight:500}
.akt-lj{display:grid;gap:5px;min-width:0}
.akt-ljS{display:grid;grid-template-columns:9px minmax(0,1fr) auto;gap:9px;align-items:center;font-size:13px;line-height:1.25}
.akt-ljS i{width:9px;height:9px;border-radius:50%;background:var(--c);box-shadow:0 0 8px color-mix(in srgb,var(--c) 60%,transparent)}
.akt-ljS span{color:rgba(255,246,236,.86);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.akt-ljS span em{font-style:normal;color:rgba(255,246,236,.5);margin-right:6px}
.akt-ljS b{font-weight:600;white-space:nowrap;text-align:right}
.akt-ljS b em{font-style:normal;font-weight:500;color:var(--a-sol);margin-left:6px;display:inline-block;min-width:3.2ch}
.akt-ljS.bas span,.akt-ljS.bas b{color:var(--a-m)}
.akt-ljS.sifir{opacity:.5}

/* etki kadranları */
.akt-kadranlar{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px}
.akt-kadran{display:grid;grid-template-columns:62px minmax(0,1fr);gap:10px;align-items:center;padding:10px 12px 10px 8px;border-radius:20px;background:rgba(12,8,18,.32);border:1px solid rgba(255,246,236,.08)}
.akt-kadran svg{width:62px;height:52px;display:block;overflow:visible}
.akt-kadran text{fill:var(--a-m);font-family:'Onest',system-ui,sans-serif;font-variant-numeric:tabular-nums;font-size:17px;font-weight:600;text-anchor:middle;stroke:none;letter-spacing:-.4px}
.akt-kadran div{min-width:0}
.akt-kadran b{display:block;font-size:13.5px;font-weight:600;line-height:1.2}
.akt-kadran span{display:block;font-size:12px;color:var(--a-sol);margin-top:2px;line-height:1.25}

/* haftalık özet (sıkı) */
.akt-ozet{margin-top:12px;padding:14px 16px 10px;border-radius:24px;display:grid;gap:4px;
  background:linear-gradient(158deg,rgba(255,246,236,.1),rgba(255,246,236,.03) 62%);border:1px solid var(--a-kenar);
  box-shadow:0 10px 26px rgba(4,2,8,.38),inset 0 1px 0 rgba(255,255,255,.14)}
.akt-ozetUst{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px}
.akt-ozetUst .akt-hf{flex:1 0 100%;font-size:12.5px;font-weight:500;color:var(--a-sol)}
.akt-buyuk{display:flex;align-items:baseline;gap:7px}
.akt-buyuk b{font-size:38px;font-weight:600;letter-spacing:-.03em;line-height:1}
.akt-buyuk span{font-size:13px;color:var(--a-sol)}
.akt-durum{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 8px;border-radius:999px;font-size:12.5px;font-weight:600;line-height:1.2;border:1px solid currentColor;background:rgba(12,8,18,.28)}
.akt-suruyor{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;line-height:1.2;color:rgba(255,246,236,.72)}
.akt-suruyor::before{content:"";width:9px;height:9px;border-radius:50%;border:1.5px solid currentColor;background:linear-gradient(90deg,currentColor 50%,transparent 50%)}
.akt-durum svg{width:11px;height:11px;stroke:currentColor;stroke-width:1.9;flex:none}
.akt-durum.lo{color:var(--a-mor)}.akt-durum.ok{color:var(--a-iyi)}.akt-durum.hi{color:var(--a-i)}
.akt-alt{flex:1 0 100%;font-size:12.5px;color:rgba(255,246,236,.8)}
.akt-grafik{width:100%;height:auto;display:block;overflow:visible}
.akt-grafik text{font-family:'Onest',system-ui,sans-serif;font-variant-numeric:tabular-nums}
.akt-gv{fill:rgba(255,246,236,.72);font-size:10.5px;font-weight:500;text-anchor:middle}
.akt-gv.bu{fill:var(--a-m);font-weight:700}
.akt-ge{fill:rgba(255,246,236,.6);font-size:10px;text-anchor:middle}
.akt-ge.bu{fill:var(--a-m);font-weight:600}
.akt-lejant{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;color:var(--a-sol)}
.akt-lejant span{display:inline-flex;align-items:center;gap:6px}
.akt-lejant i{width:12px;height:8px;border-radius:3px;background:rgba(191,238,221,.22);border:1px dashed rgba(191,238,221,.6)}
.akt-lejant i.bu{background:linear-gradient(180deg,#ffb48e,#e9764f);border:0;width:8px;height:8px;border-radius:50%}

/* liste */
.akt-onceki{margin:26px 2px 0;font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100,'opsz' 144;font-weight:430;font-size:22px;letter-spacing:-.015em}
.akt-liste{display:grid;gap:16px;margin-top:10px}
.akt-kartlar{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.akt-gun{margin:0 4px 7px;font-size:12.5px;font-weight:600;letter-spacing:.01em;color:var(--a-sol)}
.akt-oge{display:block;width:100%;padding:12px 14px 11px 12px;border-radius:22px;min-height:44px;position:relative;
  background:linear-gradient(158deg,rgba(255,246,236,.09),rgba(255,246,236,.025) 62%);border:1px solid rgba(255,246,236,.11);
  box-shadow:0 8px 20px rgba(4,2,8,.28),inset 0 1px 0 rgba(255,255,255,.11);transition:border-color .2s,transform .18s cubic-bezier(.2,.9,.3,1.3)}
.akt-oge:hover{border-color:color-mix(in srgb,var(--t) 45%,rgba(255,246,236,.2))}
.akt-oge:active{transform:scale(.985)}
.akt-ogeUst{display:flex;align-items:center;gap:12px}
.akt-ogeUst .akt-kure{width:42px;height:42px}
.akt-ogeUst .akt-kure svg{width:26px;height:26px;stroke-width:1.6}
.akt-ad{flex:1;min-width:0}
.akt-ad b{display:block;font-size:16px;font-weight:600;line-height:1.2;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.akt-ad span{display:block;font-size:12px;color:var(--a-sol);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.akt-sag{flex:none;text-align:right}
.akt-sag b{display:block;font-size:19px;font-weight:600;letter-spacing:-.02em;line-height:1.1}
.akt-sag span{display:block;font-size:10.5px;color:var(--a-sol);margin-top:1px}
.akt-ok{width:16px;height:16px;flex:none;stroke:rgba(255,246,236,.45);stroke-width:1.8}
.akt-say{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:9px;padding:8px 0 0 54px;border-top:1px solid rgba(255,246,236,.07)}
.akt-s{display:flex;flex-direction:column;gap:1px;min-width:0}
.akt-say .akt-s{flex-direction:row;align-items:baseline;gap:5px}
.akt-s b{font-size:15.5px;font-weight:600;letter-spacing:-.01em;line-height:1.2;white-space:nowrap}
.akt-say .akt-s b{font-size:14px;order:2}
.akt-s span{font-size:10.5px;font-weight:500;color:var(--a-sol);letter-spacing:.02em;white-space:nowrap}
.akt-say .akt-s span{font-size:11.5px;letter-spacing:0;order:1}

/* durumlar */
.akt-mesaj{margin-top:34px;padding:26px 20px;text-align:center;border-radius:24px;border:1px dashed rgba(255,246,236,.24);display:grid;gap:10px;justify-items:center}
.akt-mesaj p{font-size:15px;line-height:1.45;color:rgba(255,246,236,.88);max-width:30ch;text-wrap:balance}
.akt-mesaj .alt{font-size:12.5px;color:var(--a-sol)}
.akt-tekrar{min-height:44px;padding:0 20px;border-radius:999px;background:var(--a-m)!important;color:#1a1022!important;font-weight:600;font-size:14.5px;text-align:center!important}
.akt-iskelet{display:grid;gap:10px;margin-top:12px}
.akt-iskelet i{display:block;border-radius:24px;background:linear-gradient(100deg,rgba(255,246,236,.06) 30%,rgba(255,246,236,.14) 50%,rgba(255,246,236,.06) 70%) 0 0/220% 100%;animation:akt-par 1.4s linear infinite}
.akt-iskelet i:nth-child(1){height:300px;border-radius:30px}.akt-iskelet i:nth-child(2){height:170px}.akt-iskelet i:nth-child(n+3){height:84px}
@keyframes akt-par{to{background-position:-220% 0}}

/* ayrıntı */
.akt-detay{animation:akt-ac .26s cubic-bezier(.2,.8,.3,1) both}
@keyframes akt-ac{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.akt-geri{display:inline-flex;align-items:center;gap:6px;min-height:44px;margin-left:-8px;padding:0 14px 0 8px;border-radius:999px;font-size:14.5px;font-weight:600;color:rgba(255,246,236,.92)}
.akt-geri svg{width:18px;height:18px;stroke:currentColor;stroke-width:1.8}
.akt-geri:hover{background:rgba(255,246,236,.08)}
.akt-dBas{display:flex;align-items:center;gap:14px;margin-top:6px}
.akt-dBas .akt-kure{width:62px;height:62px}
.akt-dBas .akt-kure svg{width:40px;height:40px}
.akt-dBas h2{font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100,'opsz' 144;font-weight:430;font-size:30px;line-height:1.08;letter-spacing:-.02em;text-wrap:balance}
.akt-dBas p{font-size:13px;color:var(--a-sol);margin-top:3px}
.akt-dBas>div{min-width:0}
.akt-izgara{display:grid;gap:12px;margin-top:16px}
.akt-bolum{padding:15px 16px 14px;border-radius:22px;background:linear-gradient(158deg,rgba(255,246,236,.1),rgba(255,246,236,.03) 62%);border:1px solid rgba(255,246,236,.12);min-width:0}
.akt-bolum h3{font-size:13px;font-weight:600;color:var(--a-sol);margin-bottom:12px}
.akt-ana{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:10px 14px}
.akt-ana .akt-s b{font-size:26px;letter-spacing:-.02em}
.akt-ana .akt-s span{font-size:11.5px}
.akt-sat{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:9px 0;border-top:1px solid rgba(255,246,236,.09);font-size:14.5px}
.akt-sat:first-of-type{border-top:0;padding-top:0}
.akt-sat span{color:rgba(255,246,236,.82)}
.akt-sat b{font-weight:600;text-align:right}
.akt-bolum .akt-kadranlar{margin-top:12px}
.akt-set{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 12px;padding:9px 0;border-top:1px solid rgba(255,246,236,.09);font-size:14px}
.akt-set:first-of-type{border-top:0}
.akt-set em{font-style:normal;font-weight:600;color:var(--a-sol);min-width:44px}
.akt-set span{color:rgba(255,246,236,.92)}
.akt-set small{grid-column:2;font-size:12.5px;color:var(--a-sol)}
.akt-bosDetay{margin-top:20px;font-size:14px;color:var(--a-sol);text-align:center}

@container (max-width:340px){
  .akt-halkaAlan{grid-template-columns:100px minmax(0,1fr);gap:12px}
  .akt-halka{width:100px;height:100px}
  .akt-kAd b{font-size:27px}
}
/* geniş panel (kapsayıcı ≥ 620px): kahraman iki sütun, özet yan yana, liste iki sütun */
@container (min-width:620px){
  .akt{padding:18px 8px 36px}
  .akt-kahraman{grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);column-gap:30px;padding:22px 24px 20px;align-items:start}
  .akt-kahraman>.akt-kAc{grid-column:1}
  .akt-kahraman>.akt-kSay{grid-column:1;border-top:0;padding-top:4px}
  .akt-kahraman>.akt-kGrafik{grid-column:2;grid-row:1/span 3}
  .akt-kAd b{font-size:38px}
  .akt-kSay{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px 16px}
  .akt-kSay .akt-s b{font-size:26px}
  .akt-ozet{grid-template-columns:minmax(200px,.7fr) minmax(0,1.5fr);column-gap:26px;align-items:center;padding:18px 24px 14px}
  .akt-ozetSag{display:grid;gap:6px}
  .akt-liste{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 14px;align-items:start}
  .akt-izgara{grid-template-columns:repeat(2,minmax(0,1fr))}
  .akt-izgara .akt-genis{grid-column:1/-1}
}
@media (prefers-reduced-motion:reduce){
  .akt-iskelet i,.akt-detay{animation:none}
  .akt-oge{transition:none}.akt-oge:active{transform:none}
}
.akt-rm .akt-iskelet i,.akt-rm .akt-detay{animation:none}
.akt-rm .akt-oge{transition:none}.akt-rm .akt-oge:active{transform:none}
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
function durumOku(d, boyut = 10) {
  const s = sv('svg', { viewBox: '0 0 10 10', 'aria-hidden': 'true', width: boyut, height: boyut });
  const yol_ = d === 'lo' ? 'M5 1v8M1.5 5.5L5 9l3.5-3.5' : d === 'hi' ? 'M5 9V1M1.5 4.5L5 1l3.5 3.5' : 'M1.3 5.4l2.5 2.5L8.7 2.7';
  sv('path', { d: yol_ }, s);
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

// [değer, etiket] çiftlerinden yalnız dolu olanlar. Değer [sayı, birim] olabilir (birim küçük yazılır).
function sayiBlogu(cift, sinif = 'akt-say') {
  const kap = el('div', sinif);
  for (const [deger, etiket] of cift) {
    if (deger == null) continue;
    const s = el('div', 'akt-s');
    if (Array.isArray(deger)) {
      const b = el('b', null, deger[0]);
      b.appendChild(el('small', null, deger[1]));
      s.appendChild(b);
    } else s.appendChild(el('b', null, deger));
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
  const W = 340; const H = 128; const taban = 102; const ust = 18;
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
    sv('rect', { x: 0, y: y1, width: W, height: Math.max(1, y2 - y1), rx: 6, fill: 'rgba(191,238,221,.1)' }, svg);
    for (const y of [y1, y2]) sv('line', { x1: 0, x2: W, y1: y, y2: y, stroke: 'rgba(191,238,221,.45)', 'stroke-width': 1, 'stroke-dasharray': '3 4' }, svg);
  }
  sv('line', { x1: 0, x2: W, y1: taban, y2: taban, stroke: 'rgba(255,246,236,.18)', 'stroke-width': 1 }, svg);

  const slot = n ? W / Math.max(n, 8) : W / 8;
  const x0 = W - slot * n; // 8'den az hafta varsa sağa yaslı
  liste.forEach((h, i) => {
    const bu = i === n - 1;
    const cx = x0 + slot * i + slot / 2;
    const bw = Math.min(22, slot * 0.54);
    const v = yukler[i];
    if (v != null) {
      const y = yOf(v);
      sv('rect', { x: cx - bw / 2, y, width: bw, height: Math.max(3, taban - y), rx: 6, fill: bu ? `url(#${id})` : 'rgba(255,246,236,.26)' }, svg);
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

/* ================= Halka ve kadranlar ================= */

// Beş dilimli nabız bölgesi halkası + lejant. `canlan(f)` dilimlerin süpürülerek gelmesi için ilerleme (0→1) verir.
function halkaKur(bolgeler, canlan, yuzdeli) {
  const oz = bolgeOzet(bolgeler);
  if (!oz) return null;
  const { s, toplam, baskin } = oz;
  const alan = el('div', 'akt-halkaAlan');
  const R = 39; const C = TAU * R; const BOS = 1.6;
  const svg = sv('svg', { class: 'akt-halka', viewBox: '0 0 100 100', role: 'img' }, alan);
  svg.setAttribute('aria-label', `Nabız bölgeleri: ${s.map((v, i) => `${NAB_AD[i]} ${bolgeDakika(v)}`).join(', ')}. En çok ${NAB_AD[baskin]}, yüzde ${Math.round((s[baskin] / toplam) * 100)}.`);
  sv('circle', { cx: 50, cy: 50, r: R, stroke: 'rgba(255,246,236,.07)', 'stroke-width': 12 }, svg);
  const dilimler = [];
  let bas = 0;
  s.forEach((v, i) => {
    const pay = (v / toplam) * C;
    if (pay > 0) {
      const c = sv('circle', { cx: 50, cy: 50, r: R, stroke: NAB_RENK[i], 'stroke-width': i === baskin ? 13 : 10, transform: 'rotate(-90 50 50)' }, svg);
      dilimler.push([c, bas, Math.max(0.6, pay - BOS)]);
    }
    bas += pay;
  });
  const metinY = sv('text', { x: 50, y: 52, class: 'akt-hY' }, svg);
  metinY.textContent = `%${Math.round((s[baskin] / toplam) * 100)}`;
  const metinA = sv('text', { x: 50, y: 66, class: 'akt-hA' }, svg);
  metinA.textContent = NAB_AD[baskin];
  const ciz = (p) => {
    for (const [c, b, u] of dilimler) {
      ata(c, 'stroke-dasharray', `${f2(u * p)} ${f2(C)}`);
      ata(c, 'stroke-dashoffset', f2(-b * p));
    }
  };
  canlan(ciz, 1100);

  const lj = el('div', 'akt-lj');
  lj.setAttribute('aria-hidden', 'true');
  s.forEach((v, i) => {
    const r = el('div', `akt-ljS${i === baskin ? ' bas' : ''}${v > 0 ? '' : ' sifir'}`);
    const nokta = el('i'); nokta.style.setProperty('--c', NAB_RENK[i]);
    r.appendChild(nokta);
    const ad = el('span');
    ad.appendChild(el('em', null, String(i + 1)));
    ad.appendChild(el('span', null, NAB_AD[i]));
    r.appendChild(ad);
    const d = el('b', null, bolgeDakika(v));
    if (yuzdeli && v > 0) d.appendChild(el('em', null, `%${Math.round((v / toplam) * 100)}`));
    r.appendChild(d);
    lj.appendChild(r);
  });
  alan.appendChild(lj);
  return alan;
}

const KADRAN_RENK = { aerobik: '#bfeedd', anaerobik: '#c8a8ff' };
// Aerobik ve anaerobik etki: 240° yay, değer kadar dolar. Değeri olmayan kadran çizilmez.
function kadranlarKur(a, canlan) {
  const olcek = [['aerobik', 'Aerobik', a.aerobik], ['anaerobik', 'Anaerobik', a.anaerobik]].filter(([, , v]) => sonlu(v));
  if (!olcek.length) return null;
  const kap = el('div', 'akt-kadranlar');
  const R = 25; const cx = 31; const cy = 30; const SUP = (240 / 360) * TAU; const L = R * SUP;
  const nokta = (aci) => [cx + R * Math.cos(aci), cy + R * Math.sin(aci)];
  const A0 = (150 / 180) * Math.PI;
  const [x0, y0] = nokta(A0); const [x1, y1] = nokta(A0 + SUP);
  const d = `M${f2(x0)} ${f2(y0)}A${R} ${R} 0 1 1 ${f2(x1)} ${f2(y1)}`;
  for (const [k, ad, v] of olcek) {
    const oran = Math.max(0, Math.min(1, v / 5));
    const kutu = el('div', 'akt-kadran');
    kutu.setAttribute('role', 'img');
    kutu.setAttribute('aria-label', `${ad} etki ${bir(v)} / 5, ${etkiEtiketi(v)}`);
    const svg = sv('svg', { viewBox: '0 0 62 52', 'aria-hidden': 'true' }, kutu);
    sv('path', { d, stroke: 'rgba(255,246,236,.1)', 'stroke-width': 6 }, svg);
    for (let i = 1; i < 5; i++) {
      const [px, py] = nokta(A0 + (SUP * i) / 5);
      sv('circle', { cx: f2(px), cy: f2(py), r: 0.9, fill: 'rgba(255,246,236,.32)', stroke: 'none' }, svg);
    }
    const isik = sv('path', { d, stroke: KADRAN_RENK[k], 'stroke-width': 11, opacity: 0.16 }, svg);
    const dolgu = sv('path', { d, stroke: KADRAN_RENK[k], 'stroke-width': 6 }, svg);
    const uc = sv('circle', { r: 2.1, fill: '#fff6ec', stroke: 'none' }, svg);
    const t = sv('text', { x: cx, y: cy + 6 }, svg);
    t.textContent = bir(v);
    const yaz = el('div');
    yaz.appendChild(el('b', null, ad));
    yaz.appendChild(el('span', null, etkiEtiketi(v)));
    kutu.appendChild(yaz);
    kap.appendChild(kutu);
    canlan((p) => {
      const o = oran * p;
      const dash = `${f2(L * o)} ${f2(L + 4)}`;
      ata(dolgu, 'stroke-dasharray', dash); ata(isik, 'stroke-dasharray', dash);
      ata(dolgu, 'opacity', o > 0.004 ? 1 : 0); ata(isik, 'opacity', o > 0.004 ? 0.16 : 0);
      const [ux, uy] = nokta(A0 + SUP * o);
      ata(uc, 'cx', ux); ata(uc, 'cy', uy); ata(uc, 'opacity', o > 0.004 ? 1 : 0);
    }, 1300);
  }
  return kap;
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

  /* ---- hareket motoru: tek rAF döngüsü; görünmeyen simge ve gizli ekran durur ---- */
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const hareketsiz = () => !!baglam.rm || !!(mq && mq.matches);
  const rafVar = () => typeof requestAnimationFrame === 'function';
  const simgeler = new Map(); // kap elemanı → { ciz, statik, faz, alan, gorunur }
  const tweenler = new Set(); // { f, sure, bas }
  let raf = 0; let sonKare = 0; let saat0 = null;
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => {
      for (const e of es) { const s = simgeler.get(e.target); if (s) s.gorunur = e.isIntersecting; }
      uyandir();
    }) : null;

  const ekranAcik = () => !olu && !kok.hidden && !(typeof document !== 'undefined' && document.hidden);
  const oynayanVar = () => { for (const s of simgeler.values()) if (s.gorunur) return true; return false; };
  const calismali = () => ekranAcik() && rafVar() && (tweenler.size > 0 || (!hareketsiz() && oynayanVar()));

  function kare(simdi) {
    raf = 0;
    if (!calismali()) { tweenleriBitir(); return; }
    if (saat0 == null) saat0 = simdi;
    for (const tw of tweenler) {
      if (tw.bas == null) tw.bas = simdi;
      const p = Math.min(1, (simdi - tw.bas) / tw.sure);
      tw.f(1 - (1 - p) ** 3);
      if (p >= 1) tweenler.delete(tw);
    }
    // simgeler ~30 kare/sn: sakin hareket, pil dostu
    if (!hareketsiz() && simdi - sonKare > 30) {
      sonKare = simdi;
      const t = (simdi - saat0) / 1000;
      for (const s of simgeler.values()) if (s.gorunur) s.ciz(t + s.faz);
    }
    raf = requestAnimationFrame(kare);
  }
  function uyandir() {
    if (raf || !calismali()) return;
    raf = requestAnimationFrame(kare);
  }
  function durdur() {
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
    tweenleriBitir();
  }
  function tweenleriBitir() { for (const tw of tweenler) tw.f(1); tweenler.clear(); }
  // İlerleme fonksiyonunu 0→1 yürütür; hareket kapalıysa ya da çizilemiyorsa doğrudan son kare.
  function canlan(f, sure) {
    if (hareketsiz() || !rafVar() || !ekranAcik()) { f(1); return; }
    f(0);
    tweenler.add({ f, sure, bas: null });
    uyandir();
  }
  function statikle() { for (const s of simgeler.values()) s.ciz(s.statik); }
  const mqDegisti = () => { if (hareketsiz()) statikle(); uyandir(); };
  if (mq && mq.addEventListener) mq.addEventListener('change', mqDegisti);
  const gorunurlukDegisti = () => { if (typeof document !== 'undefined' && document.hidden) durdur(); else uyandir(); };
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', gorunurlukDegisti);

  let simgeNo = 0;
  // Türün canlı simgesini bir ışıklı kürenin içine koyar; ilk kare hemen çizilir (hareket kapalıyken de görünür).
  function canliSimge(grup, alan) {
    const kure = el('span', 'akt-kure');
    kure.setAttribute('aria-hidden', 'true');
    const svg = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, kure);
    const g = sv('g', {}, svg);
    const tanim = CANLI[simgeTuru(grup)](g);
    const kayit = { ciz: tanim.ciz, statik: tanim.statik, faz: (simgeNo++ * 0.61) % 7, alan, gorunur: !io };
    tanim.ciz(tanim.statik);
    simgeler.set(kure, kayit);
    if (io) io.observe(kure);
    return kure;
  }
  function simgeleriBirak(alan) {
    for (const [k, s] of simgeler) {
      if (s.alan !== alan) continue;
      if (io) io.unobserve(k);
      simgeler.delete(k);
    }
  }

  const bosalt = (e) => { while (e.firstChild) e.removeChild(e.firstChild); };
  // Ana alanı temizleyip başlığı yeniden koyar; odak başlıktaysa yeni başlığa taşınır (yüklenince body'ye düşmez)
  function anaBaslikla() {
    const eski = ana.firstChild && ana.firstChild.firstChild;
    const odakta = !!eski && typeof document !== 'undefined' && document.activeElement === eski;
    simgeleriBirak('ana');
    tweenleriBitir();
    bosalt(ana);
    const b = baslik();
    ana.appendChild(b);
    if (odakta) b.firstChild.focus({ preventScroll: true });
  }

  function baslik() {
    const b = el('div', 'akt-bas');
    b.setAttribute('data-sahne', '0'); // sahne geçişi sırası (uygulama.js okur)
    const h = el('h1', null, 'Aktiviteler');
    h.setAttribute('tabindex', '-1'); // menüden gelince odak buraya taşınır
    b.appendChild(h);
    if (baglam.ornek) b.appendChild(el('span', 'akt-etiket', 'Örnek veri'));
    return b;
  }

  function cizYukleniyor() {
    anaBaslikla();
    const k = el('div', 'akt-iskelet');
    k.setAttribute('data-sahne', '1');
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
    m.setAttribute('data-sahne', '1');
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

  // En son antrenman: canlı simge, ana sayılar, bölge halkası ve etki kadranları. Bütün kart dokunulabilir.
  function kahramanKart(a) {
    const grup = turGrubu(a.tur);
    const k = el('section', 'akt-kahraman');
    k.setAttribute('data-sahne', '1');
    k.setAttribute('aria-label', 'Son antrenman');
    k.style.setProperty('--t', TUR_RENK[grup]);
    const ad = turAdi(a.tur);
    const zaman = [gunBaslik(a.tarih, bugun), saatBicim(a.baslangic)].filter(Boolean).join(', ');

    const ac = el('button', 'akt-kAc');
    ac.type = 'button';
    ac.setAttribute('aria-label', `Son antrenman: ${[ad, zaman].filter(Boolean).join(', ')}. Ayrıntıyı aç`);
    ac.appendChild(canliSimge(grup, 'ana'));
    const yaz = el('div', 'akt-kAd');
    yaz.appendChild(el('small', null, 'Son antrenman'));
    yaz.appendChild(el('b', null, ad));
    if (zaman) yaz.appendChild(el('span', null, zaman));
    ac.appendChild(yaz);
    ac.appendChild(ileriOku());
    ac.addEventListener('click', () => detayAc(a, ac));
    k.appendChild(ac);

    const sayilar = sayiBlogu([
      [sureBicim(a.sure_s), 'Süre'], [mesafeBicim(a.mesafe_m), 'Mesafe'],
      [tam(a.yuk), 'Yük'], [tam(a.ort_nabiz), 'Ort. nabız'],
    ], 'akt-kSay');
    if (sayilar) k.appendChild(sayilar);

    const halka = halkaKur(a.bolgeler, canlan, false);
    const kadran = kadranlarKur(a, canlan);
    if (halka || kadran) {
      const gr = el('div', 'akt-kGrafik');
      if (halka) gr.appendChild(halka);
      if (kadran) gr.appendChild(kadran);
      k.appendChild(gr);
    }
    return k;
  }

  function ozetKart() {
    const { haftalar, yukBant } = veri;
    const bu = haftalar[0] || null;
    const kart = el('section', 'akt-ozet');
    kart.setAttribute('data-sahne', '2');
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

  function ogeKart(a) {
    const grup = turGrubu(a.tur);
    const d = el('button', 'akt-oge');
    d.type = 'button';
    d.style.setProperty('--t', TUR_RENK[grup]);
    const ad = turAdi(a.tur);
    const saat = saatBicim(a.baslangic);
    const sure = sureBicim(a.sure_s);
    const mesafe = mesafeBicim(a.mesafe_m);
    const etiket = [ad, saat, sure, mesafe].filter(Boolean).join(', ');
    d.setAttribute('aria-label', `${etiket}. Ayrıntıyı aç`);

    const ust = el('div', 'akt-ogeUst');
    ust.appendChild(canliSimge(grup, 'ana'));
    const adk = el('div', 'akt-ad');
    adk.appendChild(el('b', null, ad));
    const alt = [saat, mesafe].filter(Boolean).join(' · ');
    if (alt) adk.appendChild(el('span', null, alt));
    ust.appendChild(adk);
    if (sure) {
      const sag = el('div', 'akt-sag');
      sag.appendChild(el('b', null, sure));
      sag.appendChild(el('span', null, 'süre'));
      ust.appendChild(sag);
    }
    ust.appendChild(ileriOku());
    d.appendChild(ust);

    const sayilar = sayiBlogu([
      [tam(a.ort_nabiz), 'Nabız'], [tam(a.yuk), 'Yük'], [bir(a.aerobik), 'Aerobik'],
    ]);
    if (sayilar) d.appendChild(sayilar);
    d.addEventListener('click', () => detayAc(a, d));
    return d;
  }

  function listeKur(aktiviteler) {
    const liste = el('div', 'akt-liste');
    liste.setAttribute('aria-label', 'Önceki antrenmanlar');
    let onceki = null; let kartlar = null;
    // Sahne geçişi: listenin ilk birkaç satırı (gün başlığı ve kartlar) 4'ten başlayıp sırayla yükselir
    let sira = 4;
    const sahnele = (e) => { if (sira < 10) e.setAttribute('data-sahne', String(sira++)); return e; };
    for (const a of aktiviteler) {
      if (!kartlar || a.tarih !== onceki) {
        const grup = el('div', 'akt-grup');
        const b = gunBaslik(a.tarih, bugun);
        if (b) grup.appendChild(sahnele(el('h3', 'akt-gun', b)));
        kartlar = el('div', 'akt-kartlar');
        grup.appendChild(kartlar);
        liste.appendChild(grup);
        onceki = a.tarih;
      }
      kartlar.appendChild(sahnele(ogeKart(a)));
    }
    return liste;
  }

  function cizHazir() {
    anaBaslikla();
    const [son, ...kalan] = veri.aktiviteler;
    if (son) ana.appendChild(kahramanKart(son));
    if (veri.haftalar.length > 0) ana.appendChild(ozetKart());
    if (kalan.length) {
      const h = el('h2', 'akt-onceki', 'Önceki antrenmanlar');
      h.setAttribute('data-sahne', '3');
      ana.appendChild(h);
      ana.appendChild(listeKur(kalan));
    }
    if (!son) {
      const m = el('div', 'akt-mesaj');
      m.setAttribute('data-sahne', '1');
      m.appendChild(el('p', null, 'Bu aralıkta kayıtlı aktivite yok.'));
      m.appendChild(el('p', 'alt', 'Veri yok'));
      ana.appendChild(m);
    }
    uyandir();
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
    const halka = halkaKur(a.bolgeler, canlan, true);
    if (!halka) return null;
    const b = el('section', 'akt-bolum');
    b.appendChild(el('h3', null, 'Nabız bölgeleri'));
    b.appendChild(halka);
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
    const kadran = kadranlarKur(a, canlan);
    const yuk = tam(a.yuk);
    if (!kadran && yuk == null) return null;
    const b = el('section', 'akt-bolum');
    b.appendChild(el('h3', null, 'Antrenman etkisi'));
    if (yuk != null) {
      const r = el('div', 'akt-sat');
      r.appendChild(el('span', null, 'Antrenman yükü'));
      r.appendChild(el('b', null, yuk));
      b.appendChild(r);
    }
    if (kadran) b.appendChild(kadran);
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
    bas.appendChild(canliSimge(grup, 'detay'));
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
    const parcalar = [bolge, etki, nabiz, hareket, setler].filter(Boolean);
    for (const p of parcalar) izgara.appendChild(p);

    if (!parcalar.length && !ozet) k.appendChild(el('p', 'akt-bosDetay', 'Bu antrenman için ayrıntı yok.'));
    else k.appendChild(izgara);
    return k;
  }

  const scroller = () => kap;

  function detayAc(a, acan) {
    if (olu || acik) return;
    acik = { acan, kaydirma: scroller().scrollTop || 0 };
    simgeleriBirak('detay');
    bosalt(detay);
    ana.hidden = true;
    detay.hidden = false;
    const k = detayKur(a);
    detay.appendChild(k);
    scroller().scrollTop = 0;
    document.addEventListener('keydown', tusDinle);
    const g = k.firstChild;
    if (g && g.focus) g.focus({ preventScroll: true });
    uyandir();
  }

  function detayKapat() {
    if (!acik) return;
    const { acan, kaydirma } = acik;
    acik = null;
    document.removeEventListener('keydown', tusDinle);
    simgeleriBirak('detay');
    tweenleriBitir();
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
    else uyandir();
  }
  function gizle() {
    if (olu) return;
    detayKapat();
    kok.hidden = true;
    durdur();
  }
  function yokEt() {
    if (olu) return;
    olu = true;
    yuklemeNo++;
    durdur();
    simgeleriBirak('ana'); simgeleriBirak('detay');
    if (io) io.disconnect();
    if (mq && mq.removeEventListener) mq.removeEventListener('change', mqDegisti);
    if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', gorunurlukDegisti);
    document.removeEventListener('keydown', tusDinle);
    if (kok.parentNode) kok.parentNode.removeChild(kok);
  }

  return { goster, gizle, yokEt };
}
