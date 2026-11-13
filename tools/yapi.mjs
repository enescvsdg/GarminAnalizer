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
