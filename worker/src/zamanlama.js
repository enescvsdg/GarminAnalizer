// Zamanlanmış eşitleme kararı ve ertelemesi. Saf mantık; ağ ve Garmin bilgisi yok.
import { durumOku, durumYaz } from './db.js';

const DK = 60_000;
const SAAT = 60 * DK;
const BEKLEME_DK = [30, 60, 180]; // 3. ve sonrası 180

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
    const eski = typeof sonEsitleme !== 'number' || simdiMs - sonEsitleme > 3 * SAAT;
    const gecmisBitmedi = !imlec?.bitti;
    if (!eski && !gecmisBitmedi) return { calisti: false, neden: 'taze' };
  }

  await durumYaz(db, 'son_deneme', simdiMs);
  let sonuc;
  try {
    sonuc = await calistir();
  } catch (hata) {
    await kismiIsle(db, simdiMs);
    throw hata;
  }
  const durum = sonuc?.durum;
  if (durum === 'tamam') {
    await durumYaz(db, 'kismi_sayac', 0);
    await durumYaz(db, 'bekle_bitis', 0);
  } else if (durum === 'kismi') {
    await kismiIsle(db, simdiMs);
  }
  return { calisti: true, durum };
}
