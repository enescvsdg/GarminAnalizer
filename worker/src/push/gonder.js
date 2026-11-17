// Web Push gönderimi: uç nokta doğrulama, şifreleme, VAPID, POST.
import { pushSifrele } from './sifrele.js';
import { vapidBaslik } from './vapid.js';

const EN_UZUN_UC_NOKTA = 2048;
const EN_BUYUK_GOVDE = 4096;
const TAMAM = new Set([200, 201, 202]);
const GITTI = new Set([404, 410]);

const IZINLI_HOSTLAR = ['.push.apple.com', '.push.services.mozilla.com', '.notify.windows.com'];
const IZINLI_TAM_HOSTLAR = ['fcm.googleapis.com'];

export function ucNoktaGecerli(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > EN_UZUN_UC_NOKTA) return false;
  if (/[\u0000- \u007f\\]/.test(url)) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '') return false;
  const host = u.hostname;
  return IZINLI_TAM_HOSTLAR.includes(host) || IZINLI_HOSTLAR.some((ek) => host.endsWith(ek));
}

const HATA = (kod = null) => ({ durum: 'hata', kod });

export async function pushGonder({ abonelik, yuk, vapid, fetch: fetchFn, simdiSn, ttl = 43200, aciliyet = 'normal', gunluk }) {
  let asama = 'abonelik';
  const hata = () => {
    gunluk?.(asama);
    return HATA();
  };
  try {
    if (!abonelik || !ucNoktaGecerli(abonelik.endpoint)) return hata();
    asama = 'sifreleme';
    const duz = new TextEncoder().encode(JSON.stringify(yuk));
    const govde = await pushSifrele({ yuk: duz, p256dh: abonelik.p256dh, auth: abonelik.auth });
    if (govde.length > EN_BUYUK_GOVDE) return hata();
    asama = 'imza';
    const yetki = await vapidBaslik({
      ucNokta: abonelik.endpoint, acikAnahtar: vapid.acik, gizliAnahtar: vapid.gizli,
      konu: vapid.konu, simdiSn,
    });
    asama = 'ag';
    const yanit = await fetchFn(abonelik.endpoint, {
      method: 'POST',
      redirect: 'manual', // workerd yanıtı döndürür; aşağıda 3xx hata sayılır.
      headers: {
        Authorization: yetki,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: aciliyet,
      },
      body: govde,
    });
    const kod = yanit.status;
    if (TAMAM.has(kod)) return { durum: 'tamam', kod };
    if (GITTI.has(kod)) return { durum: 'gitti', kod };
    return HATA(kod);
  } catch {
    return hata();
  }
}
