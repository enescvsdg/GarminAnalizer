// Takvim: her gün için enerji, hüküm ve kart ölçümleri. apiYaniti ile aynı kurallar, her günün kendi bandı.
// Satırlar bir kez gün haritasına konur; her gün yalnız kendi 29 günlük penceresini görür (O(gün × pencere)).
import { gunEkle } from '../zaman.js';
import { OLCUMLER, gunDegerleri, bant, durum } from './baseline.js';
import { enerji, hukum } from './ozet.js';

const KARTLAR = OLCUMLER.filter((o) => o.kart);
const PENCERE = 28;

// İlk günün bandı için 28 gün öncesinden başlar.
export function okumaBasi(bugun, gun) {
  return gunEkle(bugun, -(gun - 1) - PENCERE);
}

export function takvimYaniti(satirlar, bugun, gun) {
  const harita = new Map();
  for (const r of satirlar) harita.set(r.date, r);
  const gunler = [];
  for (let i = gun - 1; i >= 0; i -= 1) {
    const tarih = gunEkle(bugun, -i);
    const pencere = [];
    for (let j = PENCERE; j >= 0; j -= 1) {
      const r = harita.get(gunEkle(tarih, -j));
      if (r) pencere.push(r);
    }
    const d = gunDegerleri(pencere, tarih);
    const bantlar = {};
    for (const o of KARTLAR) bantlar[o.id] = bant(pencere, o, tarih);
    const e = enerji(d, bantlar);
    const kartlar = {};
    for (const o of KARTLAR) kartlar[o.id] = { v: d[o.id], durum: durum(bantlar[o.id], d[o.id]) };
    gunler.push({ tarih, e, hukum: hukum(e), kartlar });
  }
  return { gunler };
}
