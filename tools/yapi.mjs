// Bir değerin yapısını "yol: tip" satırlarına çevirir; değer içermez.
function tip(v) {
  if (v === null) return 'null';
  return Array.isArray(v) ? 'array' : typeof v;
}

function topla(v, yol, harita) {
  const t = tip(v);
  if (yol) {
    if (!harita.has(yol)) harita.set(yol, new Set());
    harita.get(yol).add(t);
  }
  if (t === 'array') {
    for (const e of v) topla(e, `${yol}[]`, harita);
  } else if (t === 'object') {
    for (const [k, e] of Object.entries(v)) topla(e, yol ? `${yol}.${k}` : k, harita);
  }
}

export function yapiOzeti(deger) {
  const harita = new Map();
  if (Array.isArray(deger)) {
    for (const e of deger) topla(e, 'dizi[]', harita);
  } else {
    topla(deger, '', harita);
  }
  return [...harita.entries()]
    .map(([yol, tipler]) => `${yol}: ${[...tipler].sort().join('|')}`)
    .sort();
}

const bosMu = (v) =>
  v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

// Yanıtın boş olup olmadığı, öğe sayısı ve üst düzey anahtar adları (değer yok).
export function ozetle(v) {
  if (Array.isArray(v)) {
    const anahtarlar = [...new Set(v.flatMap((e) => (e && typeof e === 'object' && !Array.isArray(e) ? Object.keys(e) : [])))].sort();
    return { bos: v.length === 0, sayi: v.length, anahtarlar };
  }
  if (v && typeof v === 'object') {
    const degerler = Object.values(v);
    const anahtarlar = Object.keys(v).sort();
    if (degerler.every(bosMu)) return { bos: true, sayi: 0, anahtarlar };
    const diziler = degerler.filter(Array.isArray).map((d) => d.length);
    return { bos: false, sayi: diziler.length && Math.max(...diziler) > 0 ? Math.max(...diziler) : 1, anahtarlar };
  }
  const bos = bosMu(v);
  return { bos, sayi: bos ? 0 : 1, anahtarlar: [] };
}
