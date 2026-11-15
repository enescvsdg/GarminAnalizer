import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { pngYaz, simgeCiz } from './simge-uret.mjs';

const ZEMIN = [0x0c, 0x08, 0x12, 255];

// Üretilen PNG'yi çözüp (w, h, RGBA satırları) döndürür.
function pngCoz(buf) {
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const idat = [];
  for (let o = 8; o < buf.length;) {
    const uzun = buf.readUInt32BE(o);
    const tur = buf.toString('ascii', o + 4, o + 8);
    if (tur === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + uzun));
    o += 12 + uzun;
  }
  const ham = inflateSync(Buffer.concat(idat));
  return { w, h, ham };
}
const piksel = ({ w, ham }, x, y) => {
  const o = y * (1 + w * 4) + 1 + x * 4;
  return [ham[o], ham[o + 1], ham[o + 2], ham[o + 3]];
};

test('pngYaz geçerli PNG üretir', () => {
  const png = pngYaz(7, 5, (x, y) => [x * 30, y * 40, 9, 255]);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 7);
  assert.equal(png.readUInt32BE(20), 5);
  assert.equal(png[24], 8, 'bit derinliği');
  assert.equal(png[25], 6, 'RGBA');
  const { ham } = pngCoz(png);
  assert.equal(ham.length, 5 * (1 + 7 * 4));
  assert.deepEqual(piksel({ w: 7, ham }, 3, 2), [90, 80, 9, 255]);
  assert.equal(png.toString('ascii', png.length - 8, png.length - 4), 'IEND');
});

test('pngYaz parça CRC değerleri doğrudur', () => {
  const png = pngYaz(2, 2, () => [1, 2, 3, 255]);
  // IHDR CRC'si bilinen 2x2 RGBA için bağımsız hesapla.
  let c = 0xffffffff;
  const veri = png.subarray(12, 12 + 4 + 13);
  for (const b of veri) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  assert.equal(png.readUInt32BE(12 + 4 + 13), (c ^ 0xffffffff) >>> 0);
});

test('simgeCiz köşe pikseli zemin rengidir, merkez değildir', () => {
  for (const boyut of [180, 192, 512]) {
    const img = pngCoz(simgeCiz(boyut));
    assert.equal(img.w, boyut);
    assert.equal(img.h, boyut);
    assert.deepEqual(piksel(img, 0, 0), ZEMIN);
    assert.deepEqual(piksel(img, boyut - 1, boyut - 1), ZEMIN);
    const m = piksel(img, boyut >> 1, boyut >> 1);
    assert.notDeepEqual(m, ZEMIN);
    assert.equal(m[3], 255, 'simge opaktır');
    assert.ok(m[0] > 200, 'merkez sıcak (şeftali) renkte');
  }
});

test('simge üretimi belirleyicidir (iki çağrı aynı baytlar)', () => {
  assert.ok(simgeCiz(192).equals(simgeCiz(192)));
  assert.ok(simgeCiz(192, { maske: true }).equals(simgeCiz(192, { maske: true })));
});

test('maske simgesinde şekil %80 güvenli alanın dışına taşmaz', () => {
  const boyut = 512;
  const img = pngCoz(simgeCiz(boyut, { maske: true }));
  const c = (boyut - 1) / 2;
  let icerdeSekil = 0;
  for (let y = 0; y < boyut; y++) {
    for (let x = 0; x < boyut; x++) {
      const p = piksel(img, x, y);
      const d = Math.hypot(x - c, y - c);
      if (d > boyut * 0.4) assert.deepEqual(p, ZEMIN, `(${x},${y}) güvenli alan dışında zemin değil`);
      else if (p[0] !== ZEMIN[0] || p[1] !== ZEMIN[1] || p[2] !== ZEMIN[2]) icerdeSekil++;
    }
  }
  assert.ok(icerdeSekil > 1000, 'şekil güvenli alanda görünür');
});
