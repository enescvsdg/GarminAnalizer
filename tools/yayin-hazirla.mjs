// uygulama/ klasörünü yayın klasörüne kopyalar: *.test.mjs atlanır, sw.js içindeki
// __SURUM__ yer tutucusu sürümle değiştirilir. Kullanım: node tools/yayin-hazirla.mjs <hedef> <surum>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VARSAYILAN_KAYNAK = path.join(KOK, 'uygulama');
const YER_TUTUCU = '__SURUM__';
const SURUM_DESENI = /^[A-Za-z0-9._-]{1,40}$/;

function icinde(ust, yol) {
  const g = path.relative(ust, yol);
  return g === '' || (!g.startsWith('..') && !path.isAbsolute(g));
}

function dosyalariListele(klasor, onek = '') {
  const cikti = [];
  for (const e of fs.readdirSync(klasor, { withFileTypes: true })) {
    const goreli = onek ? `${onek}/${e.name}` : e.name;
    if (e.isDirectory()) cikti.push(...dosyalariListele(path.join(klasor, e.name), goreli));
    else if (e.isFile() && !e.name.endsWith('.test.mjs')) cikti.push(goreli);
  }
  return cikti;
}

export function yayinHazirla({ kaynak = VARSAYILAN_KAYNAK, hedef, surum } = {}) {
  if (typeof surum !== 'string' || !SURUM_DESENI.test(surum)) {
    throw new Error('Geçersiz sürüm: yalnız harf, rakam, nokta, alt çizgi ve tire; en çok 40 karakter.');
  }
  if (!hedef) throw new Error('Hedef klasör gerekli.');
  const kaynakYol = path.resolve(kaynak);
  const hedefYol = path.resolve(hedef);
  if (hedefYol === KOK || icinde(VARSAYILAN_KAYNAK, hedefYol) || icinde(kaynakYol, hedefYol)) {
    throw new Error('Geçersiz hedef: depo kökü ya da uygulama klasörünün içi olamaz.');
  }
  const swKaynak = path.join(kaynakYol, 'sw.js');
  if (!fs.existsSync(swKaynak) || !fs.readFileSync(swKaynak, 'utf8').includes(YER_TUTUCU)) {
    throw new Error(`sw.js içinde ${YER_TUTUCU} yer tutucusu bulunamadı.`);
  }
  const dosyalar = dosyalariListele(kaynakYol);
  for (const g of dosyalar) {
    const hedefDosya = path.join(hedefYol, ...g.split('/'));
    fs.mkdirSync(path.dirname(hedefDosya), { recursive: true });
    if (g === 'sw.js') {
      fs.writeFileSync(hedefDosya, fs.readFileSync(swKaynak, 'utf8').split(YER_TUTUCU).join(surum));
    } else {
      fs.copyFileSync(path.join(kaynakYol, ...g.split('/')), hedefDosya);
    }
  }
  return { dosyalar };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [hedef, surum] = process.argv.slice(2);
  try {
    const { dosyalar } = yayinHazirla({ hedef, surum });
    console.log(`${dosyalar.length} dosya hazırlandı: ${hedef}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
