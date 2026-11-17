// Aktivite listesi, haftalık yük özeti ve kişisel yük bandı. Saf fonksiyonlar; raw_json buraya hiç girmez.
import { gunEkle } from '../zaman.js';
import { dolu, medyan, mad } from './baseline.js';

const say = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function jsonCoz(metin) {
  if (typeof metin !== 'string' || metin === '') return null;
  try {
    return JSON.parse(metin);
  } catch {
    return null;
  }
}

// [s1..s5] saniye; beş sayı değilse null.
export function bolgeleriCevir(metin) {
  const b = jsonCoz(metin);
  if (!Array.isArray(b) || b.length !== 5) return null;
  return b.every((v) => say(v) !== null) ? b : null;
}

// Garmin `summarizedExerciseSets`: kategori başına { category, reps, sets, duration (ms), maxWeight (gram) }.
// Sade biçim { tur, tekrar, agirlik_kg, sure_s } da kabul edilir. Tanınmayan girdi atlanır; hiçbiri yoksa null.
export function setleriCevir(metin) {
  const dizi = jsonCoz(metin);
  if (!Array.isArray(dizi)) return null;
  const cikti = [];
  for (const e of dizi) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) continue;
    const o = {};
    const tur = typeof e.tur === 'string' && e.tur ? e.tur : (typeof e.category === 'string' && e.category ? e.category : null);
    if (tur !== null) o.tur = tur;
    const tekrar = say(e.tekrar) ?? say(e.reps);
    if (tekrar !== null) o.tekrar = tekrar;
    const kg = say(e.agirlik_kg) ?? (say(e.maxWeight) !== null && e.maxWeight > 0 ? e.maxWeight / 1000 : null);
    if (kg !== null) o.agirlik_kg = kg;
    const sure = say(e.sure_s) ?? (say(e.duration) !== null ? Math.round(e.duration / 1000) : null);
    if (sure !== null) o.sure_s = sure;
    const set = say(e.set) ?? say(e.sets);
    if (set !== null) o.set = set;
    if (Object.keys(o).length) cikti.push(o);
  }
  return cikti.length ? cikti : null;
}

export function aktiviteBicimle(r) {
  return {
    id: String(r.id),
    tarih: r.date,
    tur: typeof r.type === 'string' && r.type !== '' ? r.type : null,
    baslangic: say(r.start_ts),
    sure_s: say(r.duration_s),
    mesafe_m: say(r.distance_m),
    ort_nabiz: say(r.avg_hr),
    max_nabiz: say(r.max_hr),
    yuk: say(r.training_load),
    aerobik: say(r.aerobic_te),
    anaerobik: say(r.anaerobic_te),
    kalori: say(r.calories),
    bolgeler: bolgeleriCevir(r.hr_zones_json),
    kadans: say(r.avg_cadence),
    adim_boyu_m: say(r.avg_stride_m),
    yer_temas_ms: say(r.avg_gct_ms),
    guc: say(r.avg_power),
    set: say(r.total_sets),
    tekrar: say(r.total_reps),
    setler: setleriCevir(r.sets_json),
  };
}

// Pazartesi başlangıçlı hafta; tarih zaten yerel (Europe/Istanbul) gün olduğundan yalnız takvim aritmetiği.
export function haftaBasi(tarih) {
  const [y, m, g] = tarih.split('-').map(Number);
  const gun = new Date(Date.UTC(y, m - 1, g)).getUTCDay(); // 0 = Pazar
  return gunEkle(tarih, -((gun + 6) % 7));
}

const BANT_HAFTA = 12;
const BANT_EN_AZ = 6;

// Veritabanından okunacak en eski gün: aralığın ilk haftasının Pazartesi'si ya da bandın 12 haftası, hangisi eskiyse.
export function okumaBasi(bugun, gun) {
  const aralik = haftaBasi(gunEkle(bugun, -(gun - 1)));
  const bant = gunEkle(haftaBasi(bugun), -7 * BANT_HAFTA);
  return aralik < bant ? aralik : bant;
}

const yuvarla1 = (x) => Math.round(x * 10) / 10;

export function aktiviteYaniti(satirlar, bugun, gun) {
  const bas = gunEkle(bugun, -(gun - 1));
  const hepsi = satirlar.filter((r) => typeof r.date === 'string' && r.date <= bugun).map(aktiviteBicimle);

  const haftaToplam = new Map();
  for (const a of hepsi) {
    const k = haftaBasi(a.tarih);
    const h = haftaToplam.get(k) ?? { bas: k, yuk: null, sure_s: 0, adet: 0 };
    if (a.yuk !== null) h.yuk = (h.yuk ?? 0) + a.yuk;
    if (a.sure_s !== null) h.sure_s += a.sure_s;
    h.adet += 1;
    haftaToplam.set(k, h);
  }

  const buHafta = haftaBasi(bugun);
  const haftalar = [];
  for (let k = buHafta; k >= haftaBasi(bas); k = gunEkle(k, -7)) {
    haftalar.push(haftaToplam.get(k) ?? { bas: k, yuk: null, sure_s: 0, adet: 0 });
  }

  const yukler = [];
  for (let i = 1; i <= BANT_HAFTA; i += 1) {
    const h = haftaToplam.get(gunEkle(buHafta, -7 * i));
    if (h && dolu(h.yuk)) yukler.push(h.yuk);
  }
  let yukBant = null;
  if (yukler.length >= BANT_EN_AZ) {
    const yari = 1.5 * mad(yukler) * 1.4826;
    const med = medyan(yukler);
    yukBant = { min: Math.max(0, yuvarla1(med - yari)), max: yuvarla1(med + yari) };
  }

  const aktiviteler = hepsi
    .filter((a) => a.tarih >= bas)
    .sort((x, y) => (x.tarih === y.tarih
      ? ((y.baslangic ?? -Infinity) - (x.baslangic ?? -Infinity) || (x.id < y.id ? 1 : x.id > y.id ? -1 : 0))
      : (x.tarih < y.tarih ? 1 : -1)));
  return { aktiviteler, haftalar, yukBant };
}
