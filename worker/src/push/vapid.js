// VAPID (RFC 8292): ES256 imzalı JWT ile gönderen kimliği.
import { b64urlCoz, b64urlKodla, noktaKoordinatlari } from './sifrele.js';

const SURE_SN = 12 * 60 * 60;
const kodlayici = new TextEncoder();

function jsonB64(nesne) {
  return b64urlKodla(kodlayici.encode(JSON.stringify(nesne)));
}

export async function vapidBaslik({ ucNokta, acikAnahtar, gizliAnahtar, konu, simdiSn }) {
  const aud = new URL(ucNokta).origin;
  const { x, y } = noktaKoordinatlari(b64urlCoz(acikAnahtar));
  if (b64urlCoz(gizliAnahtar).length !== 32) throw new Error('özel anahtar 32 bayt olmalı');
  const anahtar = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', d: gizliAnahtar, x, y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const imzalanacak = `${jsonB64({ typ: 'JWT', alg: 'ES256' })}.${jsonB64({ aud, exp: simdiSn + SURE_SN, sub: konu })}`;
  // WebCrypto ECDSA imzası zaten ham r||s (JWS'in beklediği biçim)
  const imza = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, anahtar, kodlayici.encode(imzalanacak),
  ));
  return `vapid t=${imzalanacak}.${b64urlKodla(imza)}, k=${acikAnahtar}`;
}
