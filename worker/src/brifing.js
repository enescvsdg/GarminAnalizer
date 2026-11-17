// Brifing ve uyarı bildirimleri. Gönderici (pushGonder) enjekte edilebilir; varsayılanı tembel yüklenir.
// Loga ve yanıta sağlık değeri, abonelik anahtarı ya da uç nokta girmez.
import { durumOku, durumYaz, abonelikleriOku, abonelikSil } from './db.js';
import { OLCUMLER, dolu, bant, durum as bandaGore, gunDegerleri } from './stats/baseline.js';
import { gunEkle, yerelTarih } from './zaman.js';

export const BASLIK_ENFAZLA = 60;
export const GOVDE_ENFAZLA = 300;
const KESIM_SAATI = 21; // İstanbul; sonrasında brifing gönderilmez
const DENEME_SINIRI = 3;
const UYARI_DENEME_SINIRI = 3;

export function istanbulSaati(ms) {
  const parcalar = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(ms);
  return Number(parcalar.find((p) => p.type === 'hour').value);
}

// Kelime sınırında kısaltır; sonuç en çok `enFazla` karakterdir.
export function kisalt(metin, enFazla) {
  if (metin.length <= enFazla) return metin;
  let kes = metin.slice(0, enFazla - 1);
  if (!/\s/.test(metin[enFazla - 1])) {
    const son = kes.search(/\s\S*$/);
    if (son > 0) kes = kes.slice(0, son);
  }
  return `${kes.replace(/[\s,;:.\-–]+$/u, '')}…`;
}

// Bugün ve dün aynı yönde bant dışı kalan kart ölçümleri: [{ ad, d: 'lo' | 'hi' }].
// `satirlar` verilirse her gün kendi bandıyla (ustUsteSapma ile aynı kural); verilmezse yanıttaki bugünkü bantla.
function ustUsteSapmalar(yanit, satirlar) {
  const gunler = yanit.gunler ?? [];
  if (gunler.length < 2) return [];
  const bugun = gunler[gunler.length - 1];
  const dun = gunler[gunler.length - 2];
  const bantlar = new Map((yanit.olcumler ?? []).map((o) => [o.id, o]));
  const sonuc = [];
  for (const o of OLCUMLER) {
    if (!o.kart) continue;
    let d1;
    let d0;
    if (Array.isArray(satirlar)) {
      d1 = bandaGore(bant(satirlar, o, bugun.tarih), gunDegerleri(satirlar, bugun.tarih)[o.id]);
      d0 = bandaGore(bant(satirlar, o, gunEkle(bugun.tarih, -1)), gunDegerleri(satirlar, gunEkle(bugun.tarih, -1))[o.id]);
    } else {
      const b = bantlar.get(o.id);
      if (!b) continue;
      d1 = bandaGore(b, bugun.d?.[o.id]);
      d0 = bandaGore(b, dun.d?.[o.id]);
    }
    if ((d1 === 'lo' || d1 === 'hi') && d1 === d0) sonuc.push({ ad: o.ad, d: d1 });
  }
  return sonuc;
}

function sapmaSatiri(sapmalar) {
  if (!sapmalar.length) return null;
  if (sapmalar.length === 1) {
    const { ad, d } = sapmalar[0];
    return `${ad} iki gündür normalin ${d === 'lo' ? 'altında' : 'üstünde'}.`;
  }
  const adlar = sapmalar.map((s) => s.ad);
  return `${adlar.slice(0, -1).join(', ')} ve ${adlar[adlar.length - 1]} iki gündür normal dışında.`;
}

export function brifingMetni(yanit, satirlar = null) {
  const bugun = yanit?.gunler?.[yanit.gunler.length - 1];
  if (!bugun || bugun.e === null || bugun.e === undefined) return null;
  const satir = sapmaSatiri(ustUsteSapmalar(yanit, satirlar));
  const govde = [bugun.gerekce, satir].filter((s) => typeof s === 'string' && s !== '').join('\n');
  return {
    baslik: kisalt(String(bugun.hukum ?? ''), BASLIK_ENFAZLA),
    govde: kisalt(govde, GOVDE_ENFAZLA),
    etiket: `brifing-${bugun.tarih ?? yanit.bugun}`,
  };
}

export async function brifingGerekli({ db, satirlar, bugun, simdiMs }) {
  const satir = satirlar.find((r) => r.date === bugun);
  if (!dolu(satir?.sleep_score)) return false;
  if ((await durumOku(db, 'brifing_gun')) === bugun) return false;
  if (istanbulSaati(simdiMs) >= KESIM_SAATI) return false;
  const deneme = await durumOku(db, 'brifing_deneme');
  if (deneme?.tarih === bugun && deneme.n >= DENEME_SINIRI) return false;
  return true;
}

// Varsayılan gönderici tembel yüklenir: bu modül push çekirdeği olmadan da içe aktarılabilir.
async function varsayilanGonder() {
  return (await import('./push/gonder.js')).pushGonder;
}

export function vapidAyari(env) {
  if (!env?.VAPID_PUBLIC_KEY || !env?.VAPID_PRIVATE_KEY || !env?.VAPID_KONU) return null;
  return { acik: env.VAPID_PUBLIC_KEY, gizli: env.VAPID_PRIVATE_KEY, konu: env.VAPID_KONU };
}

// Tek satırlık gönderim özeti: yalnız sayılar ve HTTP durum kodları (uç nokta, yük, anahtar asla).
export function pushOzetSatiri(o) {
  const kodlar = o.kodlar.length ? o.kodlar.join(',') : '-';
  return `push: tamam=${o.tamam} gitti=${o.gitti} hata=${o.hata} kodlar=${kodlar}`;
}

// Tüm aboneliklere yük gönderir; 'gitti' dönenleri siler. Asla fırlatmaz (tek abonelik hatası diğerlerini etkilemez).
// Dönüş: { gonderilen, basarili, tamam, gitti, hata, kodlar } (kodlar: tekil, sıralı HTTP durum kodları).
export async function herkeseGonder({ db, env, yuk, simdiMs, fetch, gonder, abonelikler }) {
  const liste = abonelikler ?? await abonelikleriOku(db);
  const vapid = vapidAyari(env);
  let sonuclar;
  try {
    const g = gonder ?? await varsayilanGonder();
    sonuclar = await Promise.all(liste.map(async (a) => {
      try {
        return await g({
          abonelik: { endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth },
          yuk,
          vapid,
          fetch,
          simdiSn: Math.floor(simdiMs / 1000),
        });
      } catch {
        return { durum: 'hata', kod: null };
      }
    }));
  } catch {
    sonuclar = liste.map(() => ({ durum: 'hata', kod: null }));
  }
  const ozet = { gonderilen: liste.length, basarili: 0, tamam: 0, gitti: 0, hata: 0, kodlar: [] };
  for (let i = 0; i < sonuclar.length; i += 1) {
    const durum = sonuclar[i]?.durum;
    const kod = sonuclar[i]?.kod;
    if (Number.isInteger(kod) && !ozet.kodlar.includes(kod)) ozet.kodlar.push(kod);
    if (durum === 'tamam') {
      ozet.tamam += 1;
    } else if (durum === 'gitti') {
      ozet.gitti += 1;
      try {
        await abonelikSil(db, liste[i].endpoint);
      } catch {
        // silinemezse sonraki gönderimde yeniden denenir
      }
    } else {
      ozet.hata += 1;
    }
  }
  ozet.kodlar.sort((x, y) => x - y);
  ozet.basarili = ozet.tamam;
  return ozet;
}

// `gunluk(satir)` verilirse gönderim özeti satırı (pushOzetSatiri) ona iletilir.
export async function brifingGonder({ db, env, yanit, satirlar = null, bugun, simdiMs, fetch, gonder, gunluk }) {
  const metin = brifingMetni(yanit, satirlar);
  if (!metin) return { durum: 'yok', basarili: 0 };
  const abonelikler = await abonelikleriOku(db);
  if (!abonelikler.length) {
    await durumYaz(db, 'brifing_gun', bugun); // abonelik yokken her tikte yeniden denenmesin
    return { durum: 'abonelik-yok', basarili: 0 };
  }
  // Yapılandırma eksikse deneme hakkı harcanmaz, işaret yazılmaz: sır sonradan girilirse aynı gün gider.
  if (!vapidAyari(env)) return { durum: 'yapilandirma', basarili: 0 };
  const ozet = await herkeseGonder({
    db, env, simdiMs, fetch, gonder, abonelikler,
    yuk: { baslik: metin.baslik, govde: metin.govde, etiket: metin.etiket, url: './' },
  });
  gunlukYaz(gunluk, ozet);
  const { basarili } = ozet;
  if (basarili > 0) {
    await durumYaz(db, 'brifing_gun', bugun);
    return { durum: 'gonderildi', basarili };
  }
  const onceki = await durumOku(db, 'brifing_deneme');
  const n = onceki?.tarih === bugun ? onceki.n : 0;
  await durumYaz(db, 'brifing_deneme', { tarih: bugun, n: n + 1 });
  return { durum: 'hata', basarili: 0 };
}

function gunlukYaz(gunluk, ozet) {
  if (typeof gunluk !== 'function') return;
  try {
    gunluk(pushOzetSatiri(ozet));
  } catch {
    // günlük hatası gönderimi etkilemez
  }
}

// Key geçersiz duruma her geçişte bir kez; günde en çok 3 başarısız deneme (sync_state['key_uyari_deneme'] = {tarih, n}).
// Durum: 'yok' | 'sifirlandi' | 'abonelik-yok' | 'yapilandirma' | 'sinir' | 'gonderildi' | 'hata'.
export async function keyUyarisi({ db, env, simdiMs, fetch, gonder, gunluk }) {
  const keyDurum = await durumOku(db, 'key_durum');
  const isaret = await durumOku(db, 'key_uyari');
  if (keyDurum !== 'gecersiz') {
    if (isaret === null) return { durum: 'yok', basarili: 0 };
    await durumYaz(db, 'key_uyari', null);
    return { durum: 'sifirlandi', basarili: 0 };
  }
  if (isaret === 'gonderildi') return { durum: 'yok', basarili: 0 };
  const abonelikler = await abonelikleriOku(db);
  if (!abonelikler.length) {
    await durumYaz(db, 'key_uyari', 'gonderildi');
    return { durum: 'abonelik-yok', basarili: 0 };
  }
  if (!vapidAyari(env)) return { durum: 'yapilandirma', basarili: 0 };
  const bugun = yerelTarih(simdiMs);
  const onceki = await durumOku(db, 'key_uyari_deneme');
  const n = onceki?.tarih === bugun ? onceki.n : 0;
  if (n >= UYARI_DENEME_SINIRI) return { durum: 'sinir', basarili: 0 };
  const ozet = await herkeseGonder({
    db, env, simdiMs, fetch, gonder, abonelikler,
    yuk: { baslik: 'Garmin bağlantısı koptu', govde: 'Garmin anahtarı kabul edilmiyor. Yenilemen gerekiyor.', etiket: 'key-uyari', url: './' },
  });
  gunlukYaz(gunluk, ozet);
  const { basarili } = ozet;
  if (basarili > 0) {
    await durumYaz(db, 'key_uyari', 'gonderildi');
    return { durum: 'gonderildi', basarili };
  }
  await durumYaz(db, 'key_uyari_deneme', { tarih: bugun, n: n + 1 });
  return { durum: 'hata', basarili: 0 };
}
