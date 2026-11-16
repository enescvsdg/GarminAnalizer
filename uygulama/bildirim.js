// Bildirim yardımcıları: saf işlevler (DOM ve ağ yok). uygulama.js dinamik içe aktarır; Node'da test edilir.
// Bu dosya yüklenemezse yalnızca Ayarlar'daki bildirim anahtarı devre dışı kalır, uygulama açılır.

// base64url -> bayt dizisi. Dolgu (=) olsa da olmasa da çalışır. Geçersiz girdi (dizgi değil, geçersiz karakter,
// imkânsız uzunluk) fırlatmaz: boş dizi döner.
export function b64urlCoz(str) {
  if (typeof str !== 'string') return new Uint8Array(0);
  const s = str.trim().replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return new Uint8Array(0);
  const iki = s.replace(/-/g, '+').replace(/_/g, '/');
  const tam = iki + '='.repeat((4 - (iki.length % 4)) % 4);
  try {
    const ikili = atob(tam);
    const bayt = new Uint8Array(ikili.length);
    for (let i = 0; i < ikili.length; i += 1) bayt[i] = ikili.charCodeAt(i);
    return bayt;
  } catch { return new Uint8Array(0); }
}

const doluMetin = (v) => typeof v === 'string' && v.length > 0;

// PushSubscription.toJSON() -> {endpoint, p256dh, auth}; eksik ya da yanlış türde alan varsa null.
export function abonelikAlanlari(json) {
  if (!json || typeof json !== 'object') return null;
  const k = json.keys;
  if (!doluMetin(json.endpoint) || !k || typeof k !== 'object' || !doluMetin(k.p256dh) || !doluMetin(k.auth)) return null;
  return { endpoint: json.endpoint, p256dh: k.p256dh, auth: k.auth };
}

// iPhone/iPad; iPadOS masaüstü gibi görünür (Macintosh) ama dokunmatiktir.
export function iosMu({ userAgent = '', maxTouchPoints = 0 } = {}) {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && Number.isFinite(maxTouchPoints) && maxTouchPoints > 1;
}

// İki bayt dizisi (Uint8Array/ArrayBuffer) aynı mı? Biri yoksa null (karşılaştırılamaz).
export function anahtarAyni(a, b) {
  if (!a || !b) return null;
  const x = a instanceof Uint8Array ? a : new Uint8Array(a);
  const y = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return false;
  return true;
}

// Anahtarın kullanılabilirliği ve değilse kullanıcıya gösterilecek neden. Sıra önemlidir: önce bağlantı,
// sonra ortam (yerel, iPhone ana ekran), sonra tarayıcı desteği, izin, sunucu anahtarı.
// yerel: localhost'ta service worker kayıtlı değildir (kabuk.js); isteğe bağlı, varsayılan false.
export function bildirimDurumu({ destek, izin, standalone, ios, acikAnahtar, canli, yerel = false } = {}) {
  const yok = (neden) => ({ kullanilabilir: false, neden });
  if (!canli) return yok("Worker'a bağlanınca kullanılabilir.");
  if (yerel) return yok('Yerelde bildirim denenemez (service worker kapalı).');
  if (ios && !standalone) return yok("iPhone'da önce uygulamayı ana ekrana ekle.");
  if (!destek) return yok('Bu tarayıcı bildirimi desteklemiyor.');
  if (izin === 'denied') return yok('Bildirim izni kapalı. Telefonun Ayarlar > Bildirimler bölümünden aç.');
  if (!doluMetin(acikAnahtar)) return yok("Worker'da bildirim anahtarı tanımlı değil.");
  return { kullanilabilir: true, neden: null };
}
