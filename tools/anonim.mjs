// Gerçek sağlık verisinin yapısını koruyup değerlerini maskeler.
const KIMLIK = /id$|pk$|uuid|guid|email|name/i;
const TARIH = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

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
  if (typeof deger === 'number') return kimlik ? 0 : sayiKaydir(deger);
  if (typeof deger === 'string') {
    if (kimlik) return 'x';
    return TARIH.test(deger) ? deger : 'x'.repeat(deger.length);
  }
  return deger;
}
