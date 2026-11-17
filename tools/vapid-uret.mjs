// VAPID anahtar çifti üretir (P-256). Çıktı yalnız stdout'a gider; hiçbir dosyaya yazılmaz.
// Açık anahtarı wrangler.toml'a (VAPID_PUBLIC_KEY), özel skaleri `wrangler secret put VAPID_PRIVATE_KEY` ile gir.
import { pathToFileURL } from 'node:url';

const b64url = (bayt) => Buffer.from(bayt).toString('base64url');

export async function vapidUret() {
  const cift = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', cift.privateKey);
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const nokta = new Uint8Array(65);
  nokta[0] = 0x04;
  nokta.set(x, 1);
  nokta.set(y, 33);
  return { acik: b64url(nokta), gizli: b64url(Buffer.from(jwk.d, 'base64url')) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { acik, gizli } = await vapidUret();
  console.log(`VAPID_PUBLIC_KEY (wrangler.toml): ${acik}`);
  console.log(`VAPID_PRIVATE_KEY (secret): ${gizli}`);
}
