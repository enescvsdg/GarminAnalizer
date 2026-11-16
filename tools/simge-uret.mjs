// npm run simge, onaylanan Faz PNG dosyalarını web uygulamasına kopyalar.
import { deflateSync } from 'node:zlib';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ZEMIN = [0x0c, 0x08, 0x12]; // #0c0812
const SEFTALI = [0xff, 0xc9, 0xa6]; // #ffc9a6
const MOR = [0xb5, 0x6b, 0xff]; // #b56bff

const CRC_TABLO = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLO[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function parca(tur, veri) {
  const uzunluk = Buffer.alloc(4);
  uzunluk.writeUInt32BE(veri.length);
  const govde = Buffer.concat([Buffer.from(tur, 'ascii'), veri]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(govde));
  return Buffer.concat([uzunluk, govde, crc]);
}

// pikselFn(x, y) -> [r, g, b, a] (0-255). RGBA, 8 bit, süzgeçsiz PNG.
export function pngYaz(genislik, yukseklik, pikselFn) {
  const satir = 1 + genislik * 4;
  const ham = Buffer.alloc(satir * yukseklik);
  for (let y = 0; y < yukseklik; y++) {
    const taban = y * satir; // ilk bayt süzgeç türü = 0
    for (let x = 0; x < genislik; x++) {
      const p = pikselFn(x, y);
      const o = taban + 1 + x * 4;
      ham[o] = p[0]; ham[o + 1] = p[1]; ham[o + 2] = p[2]; ham[o + 3] = p[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(genislik, 0);
  ihdr.writeUInt32BE(yukseklik, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', ihdr),
    parca('IDAT', deflateSync(ham, { level: 9 })),
    parca('IEND', Buffer.alloc(0)),
  ]);
}

const yumusat = (t) => t * t * (3 - 2 * t);
const karis = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Koyu zemin, ortada şeftaliden mora geçen yumuşak ışıyan leke.
// maske:true => leke merkezli %80'lik güvenli dairenin (yarıçap 0.4) içinde kalır.
export function simgeCiz(boyut, { maske = false } = {}) {
  const c = (boyut - 1) / 2;
  const yaricap = boyut * (maske ? 0.38 : 0.46);
  return pngYaz(boyut, boyut, (x, y) => {
    const t = Math.hypot(x - c, y - c) / yaricap;
    if (t >= 1) return [...ZEMIN, 255];
    const alfa = (1 - t) ** 1.3;
    const renk = karis(SEFTALI, MOR, yumusat(Math.min(1, t / 0.85)));
    return [...ZEMIN.map((z, i) => Math.round(z + (renk[i] - z) * alfa)), 255];
  });
}

export const CIKTILAR = [
  ['simge-180.png', 180, false],
  ['simge-192.png', 192, false],
  ['simge-512.png', 512, false],
  ['simge-maske-512.png', 512, true],
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
  const kaynak = join(kok, 'marka', 'faz', 'Web', 'simge');
  const hedef = join(kok, 'uygulama', 'simge');
  mkdirSync(hedef, { recursive: true });
  for (const [ad] of CIKTILAR) copyFileSync(join(kaynak, ad), join(hedef, ad));
}
