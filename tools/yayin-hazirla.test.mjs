import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yayinHazirla } from './yayin-hazirla.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UYGULAMA = path.join(KOK, 'uygulama');
const oku = (...p) => fs.readFileSync(path.join(KOK, ...p), 'utf8');

function gecici(fn) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'yayin-'));
  try { return fn(d); } finally { fs.rmSync(d, { recursive: true, force: true }); }
}
function sahteKaynak(d, sw = "const SURUM = '__SURUM__';\n") {
  const k = path.join(d, 'kaynak');
  fs.mkdirSync(path.join(k, 'alt'), { recursive: true });
  fs.writeFileSync(path.join(k, 'index.html'), '<p>x</p>');
  fs.writeFileSync(path.join(k, 'alt', 'a.js'), '1');
  fs.writeFileSync(path.join(k, 'alt', 'a.test.mjs'), 'test');
  fs.writeFileSync(path.join(k, 'x.test.mjs'), 'test');
  fs.writeFileSync(path.join(k, 'sw.js'), sw);
  return k;
}

test('yayinHazirla test dosyalarını kopyalamaz, diğerlerini kopyalar', () => gecici((d) => {
  const k = sahteKaynak(d);
  const hedef = path.join(d, 'cikti');
  const { dosyalar } = yayinHazirla({ kaynak: k, hedef, surum: 'abc123' });
  assert.deepEqual([...dosyalar].sort(), ['alt/a.js', 'index.html', 'sw.js']);
  assert.ok(fs.existsSync(path.join(hedef, 'alt', 'a.js')));
  assert.ok(!fs.existsSync(path.join(hedef, 'x.test.mjs')));
  assert.ok(!fs.existsSync(path.join(hedef, 'alt', 'a.test.mjs')));
}));

test('yayinHazirla sw.js içindeki sürümü yazar ve yer tutucu kalmaz', () => gecici((d) => {
  const k = sahteKaynak(d);
  const hedef = path.join(d, 'cikti');
  yayinHazirla({ kaynak: k, hedef, surum: 'abc123' });
  const sw = fs.readFileSync(path.join(hedef, 'sw.js'), 'utf8');
  assert.match(sw, /const SURUM = 'abc123';/);
  assert.ok(!sw.includes('__SURUM__'));
  assert.match(fs.readFileSync(path.join(k, 'sw.js'), 'utf8'), /__SURUM__/, 'kaynak değişmez');
}));

test('yer tutucu yoksa ya da sürüm boşsa hata fırlatır', () => gecici((d) => {
  const k = sahteKaynak(d, "const SURUM = 'sabit';\n");
  assert.throws(() => yayinHazirla({ kaynak: k, hedef: path.join(d, 'c1'), surum: 'abc' }), /__SURUM__/);
  const d2 = path.join(d, 'iki');
  fs.mkdirSync(d2);
  const k2 = sahteKaynak(d2);
  for (const s of ['', '   ', undefined, null]) {
    assert.throws(() => yayinHazirla({ kaynak: k2, hedef: path.join(d, 'c2'), surum: s }));
  }
}));

test('yayinHazirla geçersiz sürüm dizesini reddeder (JS kaynağına yazılır)', () => gecici((d) => {
  const k = sahteKaynak(d);
  for (const s of ["a'b", 'a b', 'a;b', 'a\nb', '../x', 'x'.repeat(41), "'; alert(1); '"]) {
    assert.throws(() => yayinHazirla({ kaynak: k, hedef: path.join(d, 'c'), surum: s }), /sürüm/i, s);
  }
  assert.ok(!fs.existsSync(path.join(d, 'c')), 'hedefe hiçbir şey yazılmadı');
  yayinHazirla({ kaynak: k, hedef: path.join(d, 'ok'), surum: 'A-b_c.1' });
}));

test('yayinHazirla uygulama/ içindeki ya da depo köküne eşit hedefi reddeder', () => {
  assert.throws(() => yayinHazirla({ kaynak: UYGULAMA, hedef: path.join(UYGULAMA, '_site'), surum: 'abc' }), /hedef/i);
  assert.throws(() => yayinHazirla({ kaynak: UYGULAMA, hedef: UYGULAMA, surum: 'abc' }), /hedef/i);
  assert.throws(() => yayinHazirla({ kaynak: UYGULAMA, hedef: KOK, surum: 'abc' }), /hedef/i);
});

test('yayın çıktısındaki sw.js KABUK listesi çıktıda eksiksiz bulunur', () => gecici((d) => {
  const hedef = path.join(d, '_site');
  yayinHazirla({ kaynak: UYGULAMA, hedef, surum: 'deneme1234' });
  const sw = fs.readFileSync(path.join(hedef, 'sw.js'), 'utf8');
  const blok = sw.match(/const KABUK = \[([\s\S]*?)\];/);
  assert.ok(blok, 'KABUK bulunamadı');
  const yollar = [...blok[1].matchAll(/'(\.[^']*)'/g)].map((m) => m[1]);
  assert.ok(yollar.length > 5);
  for (const y of yollar) {
    const dosya = y === './' ? 'index.html' : y.slice(2);
    assert.ok(fs.existsSync(path.join(hedef, dosya)), `${y} çıktıda yok`);
  }
  assert.ok(!fs.readdirSync(hedef, { recursive: true }).some((f) => String(f).endsWith('.test.mjs')));
}));

test('yayin.yml npm test çalıştırır ve yalnız _site yükler', () => {
  const yml = oku('.github', 'workflows', 'yayin.yml');
  assert.match(yml, /run: npm test/);
  assert.match(yml, /path: _site/);
  assert.match(yml, /node tools\/yayin-hazirla\.mjs _site "\$\{GITHUB_SHA::12\}"/);
  const yuklenen = [...yml.matchAll(/^\s*path:\s*(\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(yuklenen, ['_site']);
  assert.doesNotMatch(yml, /worker\/|kesif\/|docs\//);
  assert.match(yml, /branches:\s*\[main\]/);
  assert.match(yml, /workflow_dispatch/);
  assert.match(yml, /environment:\s*\n\s*name: github-pages|environment: github-pages/);
  for (const a of ['actions/checkout@v4', 'actions/setup-node@v4', 'actions/configure-pages@v5', 'actions/upload-pages-artifact@v3', 'actions/deploy-pages@v4']) {
    assert.ok(yml.includes(a), a);
  }
  assert.match(yml, /node-version: 24/);
});

test('yayin.yml gizli değer kullanmaz ve bağımlılık kurmaz', () => {
  const yml = oku('.github', 'workflows', 'yayin.yml');
  assert.doesNotMatch(yml, /secrets\./);
  assert.doesNotMatch(yml, /npm (ci|install|i)\b/);
  assert.doesNotMatch(yml, /\bcache:\s*npm/);
});

test('README gizli değer, e-posta ve workers.dev tam adı içermez; uyarı cümlesi vardır', () => {
  const r = oku('README.md');
  assert.doesNotMatch(r, /[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i);
  assert.doesNotMatch(r, /[\w.+-]+@[\w-]+\.[\w.-]+/);
  assert.doesNotMatch(r, /AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(r, /\b[0-9a-f]{64}\b/);
  assert.ok(r.includes("Bu proje Garmin ile bağlantılı değildir ve Garmin tarafından onaylanmamıştır. Garmin, Garmin Ltd.'nin ya da bağlı kuruluşlarının markasıdır."));
  for (const s of ['GARMIN_PERSONAL_API_KEY', 'DEVICE_KEY', 'GEMINI_API_KEY', 'openssl rand -hex 32', 'worker/schema.sql', 'IZINLI_ORIGIN', 'npm test', 'Bağlantıyı kaldır']) {
    assert.ok(r.includes(s), s);
  }
  assert.doesNotMatch(r, /^#+\s*(Lisans|License)/im);
});
