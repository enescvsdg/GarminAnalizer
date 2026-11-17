// Zamanlanmış eşitleme kararı ve ertelemesi. Saf mantık; ağ ve Garmin bilgisi yok.
import { durumOku, durumYaz } from './db.js';
import { yerelTarih } from './zaman.js';

const DK = 60_000;
const SAAT = 60 * DK;
// Zamanlayıcı 15 dakikada bir, birkaç ms oynayarak tetiklenir; tolerans olmazsa saat başı tetiklemesi
// "henüz 1 saat olmadı" diye atlanır ve aralık 1 saat 15 dakikaya kayar.
const TOLERANS_MS = 2 * DK;
export const ESITLEME_ARALIGI_MS = 1 * SAAT; // kullanıcı kararı (2026-11-14): saatte bir; günde ~24×4 Garmin isteği
const BEKLEME_DK = [30, 60, 180]; // 3. ve sonrası 180

function istanbulSaati(ms) {
  const parca = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(ms).find((p) => p.type === 'hour');
  return Number(parca.value);
}

// 05:00 <= İstanbul saati < 11:00 ve bugünün uyku verisi henüz gelmediyse her tikte bakılır.
async function sabahPenceresi(db, simdiMs) {
  const saat = istanbulSaati(simdiMs);
  if (saat < 5 || saat >= 11) return false;
  return (await durumOku(db, 'uyku_gun')) !== yerelTarih(simdiMs);
}

async function kismiIsle(db, simdiMs) {
  const sayac = ((await durumOku(db, 'kismi_sayac')) ?? 0) + 1;
  const bekleme = BEKLEME_DK[Math.min(sayac, BEKLEME_DK.length) - 1] * DK;
  await durumYaz(db, 'kismi_sayac', sayac);
  await durumYaz(db, 'bekle_bitis', simdiMs + bekleme);
}

export async function zamanliEsitle({ db, simdiMs, calistir }) {
  const bekleBitis = (await durumOku(db, 'bekle_bitis')) ?? 0;
  if (bekleBitis > simdiMs) return { calisti: false, neden: 'bekleme' };

  const keyDurum = await durumOku(db, 'key_durum');
  const sonDeneme = await durumOku(db, 'son_deneme');
  if (keyDurum === 'gecersiz') {
    if (typeof sonDeneme === 'number' && simdiMs - sonDeneme < 24 * SAAT) return { calisti: false, neden: 'key' };
  } else {
    const sonEsitleme = await durumOku(db, 'son_esitleme');
    const imlec = await durumOku(db, 'gecmis_imlec');
    const eski = typeof sonEsitleme !== 'number' || simdiMs - sonEsitleme >= ESITLEME_ARALIGI_MS - TOLERANS_MS;
    const gecmisBitmedi = !imlec?.bitti;
    if (!eski && !gecmisBitmedi && !(await sabahPenceresi(db, simdiMs))) return { calisti: false, neden: 'taze' };
  }

  await durumYaz(db, 'son_deneme', simdiMs);
  let sonuc;
  try {
    sonuc = await calistir();
  } catch (hata) {
    try {
      await kismiIsle(db, simdiMs);
    } catch {
      // Durum yazımı da başarısız olsa özgün hata kaybolmasın.
    }
    throw hata;
  }
  const durum = sonuc?.durum;
  if (durum === 'tamam' && sonuc.gecmisHata !== true) {
    await durumYaz(db, 'kismi_sayac', 0);
    await durumYaz(db, 'bekle_bitis', 0);
  } else if (durum === 'kismi' || durum === 'tamam') {
    await kismiIsle(db, simdiMs);
  }
  return { calisti: true, durum };
}
