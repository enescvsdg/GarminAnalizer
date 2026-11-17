// Saf istatistik: 28 günlük medyan/MAD tabanlı kişisel normal bandı.
import { gunEkle } from '../zaman.js';

export const dolu = (v) => v !== null && v !== undefined && Number.isFinite(v);

export function medyan(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const o = s.length >> 1;
  return s.length % 2 ? s[o] : (s[o - 1] + s[o]) / 2;
}

export function mad(a) {
  const m = medyan(a);
  return m === null ? null : medyan(a.map((v) => Math.abs(v - m)));
}

const dakika = (v) => Math.round(v / 60);

export const OLCUMLER = [
  { id: 'uyku', ad: 'Uyku', birim: '', iyi: 1, kaynak: 'sleep_score', tabanSigma: 4, varsayilan: [70, 85], agirlik: 0.25, kart: true },
  { id: 'bb', ad: 'Body Battery', birim: '', iyi: 1, kaynak: 'bb_high', tabanSigma: 6, varsayilan: [60, 85], agirlik: 0.20, kart: true },
  { id: 'hrv', ad: 'HRV', birim: ' ms', iyi: 1, kaynak: 'hrv_avg', tabanSigma: 3, varsayilan: [48, 62], agirlik: 0.25, kart: true },
  { id: 'nabiz', ad: 'Dinlenme nabzı', birim: '', iyi: -1, kaynak: 'resting_hr', tabanSigma: 1.5, varsayilan: [50, 55], agirlik: 0.15, kart: true },
  { id: 'stres', ad: 'Stres', birim: '', iyi: -1, kaynak: 'stress_avg', tabanSigma: 4, varsayilan: [25, 40], agirlik: 0.10, kart: true },
  { id: 'yuk', ad: 'Dünkü yük', birim: '', iyi: -1, kaynak: 'training_load', tabanSigma: 25, varsayilan: [40, 150], agirlik: 0.05, kart: true },
  { id: 'derin', ad: 'Derin uyku', birim: ' dk', iyi: 1, kaynak: 'sleep_deep_s', donustur: dakika, tabanSigma: 10, varsayilan: [50, 110], agirlik: 0, kart: false },
  { id: 'spo2', ad: 'SpO₂', birim: '%', iyi: 1, kaynak: 'spo2_avg', tabanSigma: 1, varsayilan: [94, 99], agirlik: 0, kart: false },
  { id: 'solunum', ad: 'Solunum', birim: '/dk', iyi: -1, kaynak: 'resp_avg', tabanSigma: 0.6, varsayilan: [12, 17], agirlik: 0, kart: false },
  // Günlük ölçümler: enerjiye, hükme ve gerekçeye girmez (ağırlık 0, kart false). `iyi: 0` = yön yok (durum var, iyi/kötü yok).
  // sifirYok: 0 değeri saatin takılı olmadığı günün sahte sıfırıdır, yok sayılır (kat, kalori, yoğun dakika için 0 gerçektir).
  { id: 'adim', ad: 'Adım', birim: '', iyi: 1, kaynak: 'steps', sifirYok: true, tabanSigma: 1200, varsayilan: [5000, 11000], agirlik: 0, kart: false },
  { id: 'kat', ad: 'Kat', birim: '', iyi: 1, kaynak: 'floors', tabanSigma: 3, varsayilan: [3, 15], agirlik: 0, kart: false },
  { id: 'kalori', ad: 'Aktif kalori', birim: ' kcal', iyi: 1, kaynak: 'calories_active', tabanSigma: 120, varsayilan: [250, 800], agirlik: 0, kart: false },
  { id: 'yogun', ad: 'Yoğun dakika', birim: ' dk', iyi: 1, kaynak: 'intensity_minutes', tabanSigma: 10, varsayilan: [10, 60], agirlik: 0, kart: false },
  { id: 'maxnabiz', ad: 'En yüksek nabız', birim: '', iyi: 0, kaynak: 'hr_max', sifirYok: true, tabanSigma: 6, varsayilan: [110, 170], agirlik: 0, kart: false },
];

// Gemini'ye yalnız bu dokuz ölçüm gider (maliyet ve gizlilik); günlük ölçümler eklenince de değişmez.
export const GEMINI_OLCUMLERI = ['uyku', 'bb', 'hrv', 'nabiz', 'stres', 'yuk', 'derin', 'spo2', 'solunum'];
export const geminiOlcumleri = () => OLCUMLER.filter((o) => GEMINI_OLCUMLERI.includes(o.id));

const satirBul = (satirlar, tarih) => satirlar.find((r) => r.date === tarih);
const geceli = (r, o) => !!r && dolu(r[o.kaynak]) && !(o.sifirYok && r[o.kaynak] === 0);
const deger = (r, o) => (geceli(r, o) ? (o.donustur ? o.donustur(r[o.kaynak]) : r[o.kaynak]) : null);

export function gunDegerleri(satirlar, tarih) {
  const bugun = satirBul(satirlar, tarih);
  const dun = satirBul(satirlar, gunEkle(tarih, -1));
  const d = {};
  for (const o of OLCUMLER) d[o.id] = deger(o.id === 'yuk' ? dun : bugun, o);
  return d;
}

const yuvarla1 = (x) => Math.round(x * 10) / 10;

export function bant(satirlar, olcum, tarih) {
  const bas = gunEkle(tarih, -28);
  const son = gunEkle(tarih, -1);
  const degerler = satirlar
    .filter((r) => r.date >= bas && r.date <= son && geceli(r, olcum))
    .map((r) => (olcum.donustur ? olcum.donustur(r[olcum.kaynak]) : r[olcum.kaynak]));
  if (degerler.length >= 14) {
    const med = medyan(degerler);
    const sigma = Math.max(1.4826 * mad(degerler), olcum.tabanSigma);
    return { min: yuvarla1(med - 1.5 * sigma), max: yuvarla1(med + 1.5 * sigma), medyan: med, sigma, kisisel: true };
  }
  const [min, max] = olcum.varsayilan;
  return { min, max, medyan: (min + max) / 2, sigma: (max - min) / 3, kisisel: false };
}

export function durum(b, v) {
  if (!dolu(v)) return null;
  if (v < b.min) return 'lo';
  if (v > b.max) return 'hi';
  return 'ok';
}

// Bu gün ve bir önceki gün aynı yönde bant dışıysa true (her gün kendi bandıyla).
export function ustUsteSapma(satirlar, olcum, tarih) {
  const dun = gunEkle(tarih, -1);
  const d1 = durum(bant(satirlar, olcum, tarih), gunDegerleri(satirlar, tarih)[olcum.id]);
  const d0 = durum(bant(satirlar, olcum, dun), gunDegerleri(satirlar, dun)[olcum.id]);
  return (d1 === 'lo' || d1 === 'hi') && d1 === d0;
}
