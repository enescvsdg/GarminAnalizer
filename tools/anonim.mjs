// Gerçek sağlık verisinin yapısını koruyup değerlerini maskeler.
const KIMLIK = /id$|pk$|uuid|guid|email|name/i;
// Konum kişisel veridir: anahtar sözcüklerinden biri lat/lon/lng/latitude/longitude ise sayı 0 olur.
// Sözcük bazlı eşleşir; calendarDate, elevation, relative gibi anahtarlara takılmaz.
const KOORD = new Set(['lat', 'lon', 'lng', 'latitude', 'longitude']);
const koordMu = (anahtar) =>
  anahtar.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).some((w) => KOORD.has(w.toLowerCase()));
// Saat dilimi / ofset gerçek değerde bile yaklaşık konumu ele verir; sayı 0 olur.
const DILIM = /timezone|offset/i;
const TARIH = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

// Günün saati kişisel veridir: tarih ve biçim kalır, saat rakamları 0 olur (ayraç, kesir uzunluğu, Z/ofset korunur).
function saatiSifirla(s) {
  return s.replace(/^(\d{4}-\d{2}-\d{2}[T ])(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/, (_, tarih, saat) => tarih + saat.replace(/\d/g, '0'));
}

function sayiKaydir(n) {
  if (n === 0 || !Number.isFinite(n)) return n;
  const carpan = 1 + (Math.random() * 0.3 - 0.15);       // ±%15
  const yeni = n * carpan;
  if (!Number.isInteger(n)) return yeni;
  const r = Math.round(yeni);
  return r === 0 ? Math.sign(n) : r;                      // işaret korunur
}

export function anonimlestir(deger, anahtar = '') {
  if (deger === null || typeof deger === 'boolean') return deger;
  if (Array.isArray(deger)) return deger.map((d) => anonimlestir(d, anahtar));
  if (typeof deger === 'object') {
    return Object.fromEntries(Object.entries(deger).map(([k, v]) => [k, anonimlestir(v, k)]));
  }
  const kimlik = KIMLIK.test(anahtar);
  if (typeof deger === 'number') return kimlik || koordMu(anahtar) || DILIM.test(anahtar) ? 0 : sayiKaydir(deger);
  if (typeof deger === 'string') {
    if (kimlik) return 'x';
    return TARIH.test(deger) ? saatiSifirla(deger) : 'x'.repeat(deger.length);
  }
  return deger;
}
