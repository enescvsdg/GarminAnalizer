// Web Push ileti şifreleme: RFC 8291 (aes128gcm içerik kodlaması) + RFC 8188.
// Yalnızca web standardı API'ler (WebCrypto, TextEncoder).

const KAYIT_BOYU = 4096;
const SIFRE_ETIKETI = 16; // AES-GCM doğrulama etiketi

export function b64urlCoz(s) {
  if (typeof s !== 'string') throw new Error('base64url: metin bekleniyor');
  const t = s.replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]*$/.test(t) || t.length % 4 === 1) throw new Error('base64url: geçersiz');
  const ikili = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
  const cikti = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) cikti[i] = ikili.charCodeAt(i);
  return cikti;
}

export function b64urlKodla(bayt) {
  let ikili = '';
  for (let i = 0; i < bayt.length; i++) ikili += String.fromCharCode(bayt[i]);
  return btoa(ikili).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function birlestir(...parcalar) {
  const cikti = new Uint8Array(parcalar.reduce((n, p) => n + p.length, 0));
  let yer = 0;
  for (const p of parcalar) { cikti.set(p, yer); yer += p.length; }
  return cikti;
}

// Sıkıştırılmamış P-256 noktasından (65 bayt) JWK koordinatları.
export function noktaKoordinatlari(acik) {
  if (!(acik instanceof Uint8Array) || acik.length !== 65 || acik[0] !== 0x04) {
    throw new Error('P-256 noktası geçersiz');
  }
  return { x: b64urlKodla(acik.slice(1, 33)), y: b64urlKodla(acik.slice(33, 65)) };
}

async function hkdf(tuz, ikm, bilgi, uzunluk) {
  const anahtar = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bit = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: tuz, info: bilgi }, anahtar, uzunluk * 8,
  );
  return new Uint8Array(bit);
}

const kodlayici = new TextEncoder();

// yerelAnahtar (yalnız test): { gizli: base64url 32 bayt, acik: base64url 65 bayt }
async function yerelAnahtarHazirla(yerelAnahtar) {
  if (!yerelAnahtar) {
    const cift = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const acik = new Uint8Array(await crypto.subtle.exportKey('raw', cift.publicKey));
    return { gizli: cift.privateKey, acik };
  }
  const acik = b64urlCoz(yerelAnahtar.acik);
  const { x, y } = noktaKoordinatlari(acik);
  const gizli = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', d: yerelAnahtar.gizli, x, y, ext: true },
    { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'],
  );
  return { gizli, acik };
}

export async function pushSifrele({ yuk, p256dh, auth, tuz, yerelAnahtar }) {
  if (!(yuk instanceof Uint8Array)) throw new Error('yük Uint8Array olmalı');
  const uaAcik = b64urlCoz(p256dh);
  const kimlik = b64urlCoz(auth);
  noktaKoordinatlari(uaAcik);
  if (kimlik.length !== 16) throw new Error('auth 16 bayt olmalı');
  if (yuk.length + 1 + SIFRE_ETIKETI > KAYIT_BOYU) throw new Error('yük tek kayda sığmıyor');
  const salt = tuz ?? crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new Error('tuz 16 bayt olmalı');

  const yerel = await yerelAnahtarHazirla(yerelAnahtar);
  const uaAnahtar = await crypto.subtle.importKey(
    'raw', uaAcik, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaAnahtar }, yerel.gizli, 256,
  ));

  const anahtarBilgi = birlestir(kodlayici.encode('WebPush: info\0'), uaAcik, yerel.acik);
  const ikm = await hkdf(kimlik, ecdh, anahtarBilgi, 32);
  const cek = await hkdf(salt, ikm, kodlayici.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, kodlayici.encode('Content-Encoding: nonce\0'), 12);

  const duz = birlestir(yuk, Uint8Array.of(0x02));
  const aesAnahtar = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sifreli = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesAnahtar, duz));

  const baslik = new Uint8Array(21);
  baslik.set(salt, 0);
  new DataView(baslik.buffer).setUint32(16, KAYIT_BOYU, false);
  baslik[20] = yerel.acik.length;
  return birlestir(baslik, yerel.acik, sifreli);
}
