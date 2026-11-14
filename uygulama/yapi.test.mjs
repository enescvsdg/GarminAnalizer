import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = dirname(fileURLToPath(import.meta.url));
const SAYFALAR = ['index.html', 'sesler.html'];
const oku = (ad) => readFileSync(join(KOK, ad), 'utf8');

// <script ...> açılış etiketleri (src olsun olmasın).
function betikEtiketleri(html) {
  return [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
}

test('index.html ve sesler.html satır içi betik içermez', () => {
  for (const ad of SAYFALAR) {
    const html = oku(ad);
    for (const etiket of betikEtiketleri(html)) {
      assert.match(etiket, /\bsrc=/, `${ad}: src'siz betik etiketi: ${etiket}`);
    }
    // src'li betiklerin gövdesi boş olmalı.
    for (const m of html.matchAll(/<script\b[^>]*\bsrc=[^>]*>([\s\S]*?)<\/script>/gi)) {
      assert.equal(m[1].trim(), '', `${ad}: src'li betiğin gövdesi dolu`);
    }
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${ad}: satır içi olay özniteliği var`);
    assert.doesNotMatch(html, /javascript:/i, `${ad}: javascript: bağlantısı var`);
  }
});

test('betik kaynakları yalnız göreli yerel dosyalardır ve diskte vardır', () => {
  for (const ad of SAYFALAR) {
    const html = oku(ad);
    const kaynaklar = [...html.matchAll(/<script\b[^>]*\bsrc=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((m) => m[1] ?? m[2] ?? m[3]);
    assert.ok(kaynaklar.length > 0, `${ad}: hiç betik kaynağı yok`);
    for (const k of kaynaklar) {
      assert.doesNotMatch(k, /^[a-z][a-z0-9+.-]*:/i, `${ad}: dış betik ${k}`);
      assert.doesNotMatch(k, /^\//, `${ad}: mutlak yol ${k}`);
      assert.ok(existsSync(join(KOK, k)), `${ad}: ${k} diskte yok`);
    }
  }
  const sira = [...oku('index.html').matchAll(/<script\b[^>]*\bsrc=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((m) => m[1] ?? m[2] ?? m[3]);
  assert.deepEqual(sira, ['kabuk.js', 'vendor/gsap.min.js', 'veri.js', 'ses.js', 'uygulama.js']);
  assert.match(oku('index.html'), /<script type="module" src="uygulama\.js">/);
});

test('CSP meta etiketi script-src self uygular', () => {
  for (const ad of SAYFALAR) {
    const m = oku(ad).match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i);
    assert.ok(m, `${ad}: CSP meta etiketi yok`);
    const csp = m[1];
    const yonerge = Object.fromEntries(csp.split(';').map((p) => p.trim()).filter(Boolean)
      .map((p) => [p.split(/\s+/)[0], p.split(/\s+/).slice(1).join(' ')]));
    assert.equal(yonerge['script-src'], "'self'", `${ad}: script-src`);
    assert.ok(!/unsafe-inline/.test(yonerge['script-src']));
    assert.equal(yonerge['default-src'], "'self'");
    assert.equal(yonerge['connect-src'], "'self' https://*.workers.dev http://localhost:*");
    assert.equal(yonerge['style-src'], "'self' 'unsafe-inline' https://fonts.googleapis.com");
    assert.equal(yonerge['font-src'], 'https://fonts.gstatic.com');
    assert.equal(yonerge['img-src'], "'self' data:");
    assert.equal(yonerge['base-uri'], "'none'");
    assert.equal(yonerge['form-action'], "'none'");
  }
});

test('bütün yerel href/src yolları görelidir', () => {
  for (const ad of SAYFALAR) {
    const html = oku(ad);
    for (const m of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
      const yol = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(yol) || yol.startsWith('#') || yol.startsWith('//')) continue; // dış adres, çapa
      assert.ok(!yol.startsWith('/'), `${ad}: mutlak yerel yol ${yol}`);
    }
  }
});

test('sayfalar arası bağlantılar index.html ve sesler.html üzerinedir; eski adlar kalmadı', () => {
  assert.match(oku('sesler.html'), /<a href="index\.html">Uygulamaya dön<\/a>/);
  assert.match(oku('index.html'), /<a href="sesler\.html">Sesleri seç<\/a>/);
  assert.ok(!existsSync(join(KOK, 'uygulama.html')));
  for (const ad of [...SAYFALAR, 'uygulama.js', 'sesler.js']) {
    assert.doesNotMatch(oku(ad), /uygulama\.html/, `${ad}: eski uygulama.html adı`);
  }
});

test('uygulama adı GarminAnalizer olur', () => {
  assert.match(oku('index.html'), /<title>GarminAnalizer\b/);
  assert.match(oku('sesler.html'), /<title>[^<]*GarminAnalizer<\/title>/);
  assert.doesNotMatch(oku('index.html') + oku('sesler.html'), /Garmin Koçu/);
});

test('GSAP dosyası 3.12.5 sürümüdür', () => {
  const yol = join(KOK, 'vendor/gsap.min.js');
  assert.equal(statSync(yol).size, 72214, 'gsap.min.js boyutu indirilen dosyayla aynı olmalı');
  const icerik = readFileSync(yol);
  assert.ok(icerik.toString('utf8', 0, 300).includes('3.12.5'));
  assert.equal(createHash('sha256').update(icerik).digest('hex'), '28033e449a31ebcc396e5be8b13b63152bf03094288fb5867034321927bce087');
  assert.ok(!/\beval\(|new Function/.test(icerik.toString('utf8')), 'CSP altında eval kullanılamaz');
});
