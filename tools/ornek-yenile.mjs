// Ağ kullanmadan kesif/ham/*.json dosyalarından kesif/ornek/*.json anonim örneklerini yeniden üretir.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { anonimlestir } from './anonim.mjs';

const HAM = new URL('../kesif/ham/', import.meta.url);
const ORNEK = new URL('../kesif/ornek/', import.meta.url);

await mkdir(ORNEK, { recursive: true });
for (const dosya of (await readdir(HAM)).filter((d) => d.endsWith('.json')).sort()) {
  const veri = JSON.parse(await readFile(new URL(dosya, HAM), 'utf8'));
  await writeFile(new URL(dosya, ORNEK), JSON.stringify(anonimlestir(veri), null, 2) + '\n');
  console.log(`${dosya.replace(/\.json$/, '')}: yazıldı`);
}
