// Bildirim anahtar çiftini üretir ve kurar: `node tools/vapid-kur.mjs`
// - Gizli anahtar yalnız `wrangler secret put VAPID_PRIVATE_KEY` komutuna boru ile verilir;
//   ekrana, dosyaya ya da geçmişe yazılmaz.
// - Açık anahtar (gizli değildir) worker/wrangler.toml içindeki VAPID_PUBLIC_KEY alanına yazılır.
// Yeniden çalıştırmak eski abonelikleri geçersiz kılar (uygulamada bildirimi kapatıp açmak gerekir).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vapidUret } from './vapid-uret.mjs';

const worker = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker');
const toml = join(worker, 'wrangler.toml');
const alan = /^VAPID_PUBLIC_KEY = ".*"$/m;
const metin = readFileSync(toml, 'utf8');
if (!alan.test(metin)) {
  console.error('wrangler.toml içinde VAPID_PUBLIC_KEY alanı bulunamadı.');
  process.exit(1);
}
const { acik, gizli } = await vapidUret();
const sonuc = spawnSync('npx', ['wrangler', 'secret', 'put', 'VAPID_PRIVATE_KEY'], {
  cwd: worker, input: gizli, stdio: ['pipe', 'inherit', 'inherit'],
});
if (sonuc.status !== 0) {
  console.error('Gizli anahtar kaydedilemedi; wrangler.toml değiştirilmedi.');
  process.exit(1);
}
writeFileSync(toml, metin.replace(alan, `VAPID_PUBLIC_KEY = "${acik}"`));
console.log('Tamam. Açık anahtar wrangler.toml dosyasına yazıldı.');
