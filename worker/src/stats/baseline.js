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

export const OLCUMLER = [
  { id: 'uyku', ad: 'Uyku', birim: '', iyi: 1, kaynak: 'sleep_score', tabanSigma: 4, varsayilan: [70, 85], agirlik: 0.25 },
  { id: 'bb', ad: 'Body Battery', birim: '', iyi: 1, kaynak: 'bb_high', tabanSigma: 6, varsayilan: [60, 85], agirlik: 0.20 },
  { id: 'hrv', ad: 'HRV', birim: ' ms', iyi: 1, kaynak: 'hrv_avg', tabanSigma: 3, varsayilan: [48, 62], agirlik: 0.25 },
  { id: 'nabiz', ad: 'Dinlenme nabzı', birim: '', iyi: -1, kaynak: 'resting_hr', tabanSigma: 1.5, varsayilan: [50, 55], agirlik: 0.15 },
  { id: 'stres', ad: 'Stres', birim: '', iyi: -1, kaynak: 'stress_avg', tabanSigma: 4, varsayilan: [25, 40], agirlik: 0.10 },
  { id: 'yuk', ad: 'Dünkü yük', birim: ' dk', iyi: -1, kaynak: 'intensity_minutes', tabanSigma: 15, varsayilan: [40, 90], agirlik: 0.05 },
];

const satirBul = (satirlar, tarih) => satirlar.find((r) => r.date === tarih);
const deger = (r, alan) => (r && dolu(r[alan]) ? r[alan] : null);

export function gunDegerleri(satirlar, tarih) {
  const bugun = satirBul(satirlar, tarih);
  const dun = satirBul(satirlar, gunEkle(tarih, -1));
  const d = {};
  for (const o of OLCUMLER) d[o.id] = o.id === 'yuk' ? deger(dun, o.kaynak) : deger(bugun, o.kaynak);
  return d;
}

const yuvarla1 = (x) => Math.round(x * 10) / 10;

export function bant(satirlar, olcum, tarih) {
  const bas = gunEkle(tarih, -28);
  const son = gunEkle(tarih, -1);
  const degerler = satirlar
    .filter((r) => r.date >= bas && r.date <= son && dolu(r[olcum.kaynak]))
    .map((r) => r[olcum.kaynak]);
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
