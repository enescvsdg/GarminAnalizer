// Garmin -> veritabanı eşitleme ve geçmiş doldurma. Yalnızca web-standart API'ler; konsol çıktısı yok.
import { GarminKeyHatasi } from './client.js';
import { gunleriCikar, aktiviteleriCikar } from './normalize.js';
import { gunUpsert, gunleriOku, aktiviteUpsert, aktiviteleriOku, durumOku, durumYaz } from '../db.js';
import { yerelTarih, gunEkle } from '../zaman.js';

// Uç nokta tablosu: ad, yol, parametreler
const UC_NOKTALAR = [
  { ad: 'dailysummaries', yol: () => '/usersummary-service/v2/dailysummaries', params: (bas, son) => ({ startDate: bas, endDate: son }) },
  { ad: 'sleep', yol: () => '/sleep-service/sleep/dailySleepSummariesByDate', params: (bas, son) => ({ startDate: bas, endDate: son }) },
  { ad: 'hrv', yol: (bas, son) => `/hrv-service/hrv/daily/${bas}/${son}`, params: () => undefined },
  { ad: 'activities', yol: () => '/activitylist-service/activities/search/activities', params: (bas, son) => ({ start: 0, limit: 100, startDate: bas, endDate: son }) },
];

const PARCA_GUN = 28;
const GECMIS_SINIRI_GUN = 365;
const BASLANGIC_IMLEC_GERI = 3;

export async function aralikEsitle({ istemci, db, bas, son, simdiMs }) {
  const yanit = {};
  const hatalar = [];
  for (const u of UC_NOKTALAR) {
    try {
      yanit[u.ad] = await istemci.get(u.yol(bas, son), u.params(bas, son));
    } catch (e) {
      if (e instanceof GarminKeyHatasi) throw e;
      hatalar.push(u.ad);
    }
  }

  const satirlar = gunleriCikar({ dailysummaries: yanit.dailysummaries, sleep: yanit.sleep, hrv: yanit.hrv });
  for (const s of satirlar) await gunUpsert(db, { ...s, synced_at: simdiMs });

  let aktiviteSayisi = 0;
  if ('activities' in yanit) {
    for (const a of aktiviteleriCikar(yanit.activities)) {
      await aktiviteUpsert(db, a);
      aktiviteSayisi += 1;
    }
    // Günlük antrenman yükü: veritabanındaki aktivitelerin toplamı (null = 0)
    const toplam = new Map();
    for (const a of await aktiviteleriOku(db, bas, son)) {
      toplam.set(a.date, (toplam.get(a.date) ?? 0) + (a.training_load ?? 0));
    }
    for (const g of await gunleriOku(db, bas, son)) {
      await gunUpsert(db, { date: g.date, training_load: toplam.get(g.date) ?? 0 });
    }
  }

  return { gun: satirlar.length, aktivite: aktiviteSayisi, hatalar };
}

// Geçmiş doldurmayı bir parça ilerletir.
async function gecmisIlerlet({ istemci, db, bugun, simdiMs }) {
  const imlec = (await durumOku(db, 'gecmis_imlec'))
    ?? { sonraki: gunEkle(bugun, -BASLANGIC_IMLEC_GERI), bitti: false, bosArdisik: 0 };
  if (imlec.bitti) return;

  const sonuc = await aralikEsitle({
    istemci, db, bas: gunEkle(imlec.sonraki, -(PARCA_GUN - 1)), son: imlec.sonraki, simdiMs,
  });
  if (sonuc.hatalar.length > 0) return; // imleç aynı kalır, sonra yeniden denenir

  const bosArdisik = sonuc.gun === 0 ? imlec.bosArdisik + 1 : 0;
  const sonraki = gunEkle(imlec.sonraki, -PARCA_GUN);
  const bitti = bosArdisik >= 2 || sonraki < gunEkle(bugun, -GECMIS_SINIRI_GUN);
  await durumYaz(db, 'gecmis_imlec', { sonraki, bitti, bosArdisik });
}

export async function esitle({ istemci, db, simdiMs }) {
  const bugun = yerelTarih(simdiMs);
  try {
    const son = await aralikEsitle({ istemci, db, bas: gunEkle(bugun, -2), son: bugun, simdiMs });
    await gecmisIlerlet({ istemci, db, bugun, simdiMs });
    await durumYaz(db, 'key_durum', 'gecerli');
    if (son.hatalar.length > 0) return { durum: 'kismi' };
    await durumYaz(db, 'son_esitleme', simdiMs);
    return { durum: 'tamam' };
  } catch (e) {
    if (!(e instanceof GarminKeyHatasi)) throw e;
    await durumYaz(db, 'key_durum', 'gecersiz');
    return { durum: 'key-gecersiz' };
  }
}
