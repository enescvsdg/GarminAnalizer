// Ağ kullanmadan kesif/ham/*.json dosyalarından kesif/ornek/*.json anonim örneklerini yeniden üretir.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { anonimlestir } from './anonim.mjs';

const HAM = new URL('../kesif/ham/', import.meta.url);
const ORNEK = new URL('../kesif/ornek/', import.meta.url);
// Yalnız senkronizasyonun kullandığı kaynaklar saklanır.
const DOSYALAR = ['dailysummaries.json', 'sleep.json', 'hrv.json', 'activities.json'];

await mkdir(ORNEK, { recursive: true });
for (const dosya of DOSYALAR) {
  const veri = JSON.parse(await readFile(new URL(dosya, HAM), 'utf8'));
  await writeFile(new URL(dosya, ORNEK), JSON.stringify(anonimlestir(veri), null, 2) + '\n');
  console.log(`${dosya.replace(/\.json$/, '')}: yazıldı`);
}
