import { runInNewContext } from 'node:vm';
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

test('kabuk.js her iki sayfada da ilk betiktir (denetleyici eşzamanlı yakalanmalı)', () => {
  for (const ad of ['index.html', 'sesler.html']) {
    const ilk = /<script\b[^>]*\bsrc=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(oku(ad));
    assert.ok(ilk, `${ad}: betik bulunamadı`);
    assert.equal(ilk[1] ?? ilk[2] ?? ilk[3], 'kabuk.js', ad);
  }
});

test('uygulama.js: yorum satırı kod yutmaz (telefon Trend sürüklemesi çalışır kalır)', () => {
  const satirlar = oku('uygulama.js').split('\n');
  // sürüklemeyi başlatan atama yorumun içinde değil, kendi kod satırında olmalı
  assert.ok(satirlar.some((s) => /^\s*suruk = true;/.test(s)), 'suruk = true; kod satırı bulunamadı');
  // "//" yorumundan sonra noktalı virgülle biten atama zinciri: yutulmuş kod işareti
  const yutulan = satirlar.filter((s) => /\/\/[^'"`]*\b[A-Za-z_$][\w$.]* = [^;]+; [A-Za-z_$][\w$.]* = [^;]+;/.test(s));
  assert.deepEqual(yutulan, []);
});

// Küçük bağlama işlevlerini gerçek kaynaklarından çalıştır: DOM metni ve gün/simge uyumu.
function uiIslev(ad, baglam) {
  const kaynak = oku('uygulama.js');
  const bas = kaynak.indexOf(`function ${ad}(`);
  assert.ok(bas >= 0, `${ad} bulunamadı`);
  const son = kaynak.indexOf('\n}', bas) + 2;
  return runInNewContext(`(${kaynak.slice(bas, son)})`, baglam);
}
test('Trend yorumu seçili ölçüme aittir; eski Worker ve boş yorum özete döner', () => {
  const el = Object.fromEntries(['tGer', 'tYz'].map((id) => [id, {}]));
  const veri = { meta: { egilim: { uyku: '<b>Uzun yorum</b>', bb: ' ' } } };
  const yaz = uiIslev('trendMetin', { $: (id) => el[id], VERI: veri, metinKayar() {} });
  yaz({ o: { id: 'uyku' }, ozet: 'özet' });
  assert.equal(el.tGer.textContent, '<b>Uzun yorum</b>');
  assert.equal(el.tYz.hidden, false);
  yaz({ o: { id: 'bb' }, ozet: 'bb özeti' });
  assert.equal(el.tGer.textContent, 'bb özeti');
  assert.equal(el.tYz.hidden, true);
  delete veri.meta;
  yaz({ o: { id: 'uyku' }, ozet: 'eski Worker' });
  assert.equal(el.tGer.textContent, 'eski Worker');
  assert.equal(el.tYz.hidden, true);
});
test('Trend simgesi seçili günün ham değerini, null gününde boş durumu alır', () => {
  const yazilan = [];
  const yaz = uiIslev('simgeYaz', { simge: { guncelle: (v) => yazilan.push(v) }, simgeOrani: (_, v) => v === null ? null : v / 100 });
  yaz({ id: 'uyku', min: 60, max: 90 }, 76, 'ok');
  yaz({ id: 'uyku', min: 60, max: 90 }, null, null);
  assert.deepEqual(JSON.parse(JSON.stringify(yazilan)), [{ oran: .76, durum: 'ok', ham: 76 }, { oran: null, durum: null, ham: null }]);
});
test('Trend başlığı erişilebilir 50px açıklama düğmesi ve yorum etiketi içerir', () => {
  const html = oku('index.html');
  assert.match(html, /id="tSimge"[^>]*aria-controls="tAciklama"/);
  assert.match(html, /id="tAciklama"[^>]*hidden/);
  assert.match(html, /id="tYz" hidden>Yapay zekâ yorumu/);
  assert.match(html, /#tSimge\{[^}]*width:50px;height:50px/);
});
test('çark başlıkta, açıklamada, yakınlaştırmada ve Ayarlarda yakalanmaz; hızlı adımlar hedefi biriktirir', () => {
  const state = { ayarAcik: false, mesgul: false, carkB: 0, carkT: 0, hedef: 12, N: 28 };
  const adimlar = [];
  Object.assign(state, { performance: { now: () => 100 }, carkBirikim: (_, b) => ({ birikim: b + 1, adim: -1 }), ipucuGizle() {}, carkHedef: (h, a) => h + a, carkGit: (h) => { state.hedef = h; adimlar.push(h); } });
  const olay = uiIslev('carkOlay', state);
  let engel = 0;
  const ev = { ctrlKey: false, target: { closest: () => null }, preventDefault() { engel++; } };
  olay({ ...ev, ctrlKey: true });
  state.ayarAcik = true; olay(ev); state.ayarAcik = false;
  olay({ ...ev, target: { closest: () => ({}) } });
  olay(ev, () => false);
  assert.equal(engel, 0);
  olay(ev); olay(ev); olay(ev);
  assert.deepEqual(adimlar, [11, 10, 9]);
  assert.equal(engel, 3);
});
test('açıklama kapatılınca odak düğmeye döner; masaüstü açıklaması kapanmaz', () => {
  let odak = 0;
  const el = { tAciklama: { hidden: false }, tSimge: { setAttribute(k, v) { this[k] = v; }, focus() { odak++; } } };
  const state = { GENIS: false, aciklamaAcik: true, $: (id) => el[id] };
  const kapat = uiIslev('aciklamaKapat', state);
  kapat();
  assert.equal(el.tAciklama.hidden, true);
  assert.equal(el.tSimge['aria-expanded'], 'false');
  assert.equal(odak, 1);
  state.GENIS = true; state.aciklamaAcik = true; el.tAciklama.hidden = false;
  kapat();
  assert.equal(el.tAciklama.hidden, false);
  assert.equal(odak, 1);
});
test('ölçümün önceki grafik geçişi yenisi başlamadan durdurulur ve simge gün yazımında güncellenir', () => {
  const kaynak = oku('uygulama.js');
  const sec = kaynak.slice(kaynak.indexOf('function olcumSec('), kaynak.indexOf('function gunYaz('));
  assert.ok(sec.indexOf('olcumGecis.kill()') < sec.indexOf('olcumGecis = gsap.to'));
  assert.match(sec, /simge\.yokEt\(\)/);
  const gun = kaynak.slice(kaynak.indexOf('function gunYaz('), kaynak.indexOf('function yerlesimT('));
  assert.match(gun, /simgeYaz\(t\.o, v, du\)/);
});

test('bilinmeyen ölçüm genel açıklamaya döner ve simge sistem hareket tercihini izler', () => {
  const kaynak = oku('uygulama.js');
  assert.match(kaynak, /Object\.hasOwn\(ACIKLAMA, t\.o\.id\)/);
  const sec = kaynak.slice(kaynak.indexOf('function olcumSec('), kaynak.indexOf('function gunYaz('));
  assert.doesNotMatch(sec, /azHareket: RM/);
  assert.match(kaynak, /if \(tl\.alt - tl\.ust < 90\) tl\.ust = tl\.alt - 90/);
});

test('Trend veri kaynağını yalnızca örnek veya önbellek verisinde gösterir', () => {
  const kaynak = oku('uygulama.js');
  const durum = uiIslev('trendKaynak', {});
  assert.equal(durum({ canli: true, kaynak: 'canli' }), '');
  assert.equal(durum({ canli: false, kaynak: 'onbellek' }), 'Çevrimdışı');
  assert.equal(durum({ canli: false, kaynak: 'yok' }), 'Örnek veri');
  const html = oku('index.html');
  assert.match(html, /id="tKaynak"[^>]*role="status"[^>]*hidden/);
  assert.match(html, /id="tTarih"><span id="tGunMetni"><\/span><span id="tKaynak"/);
});

test('#tMetin varsayılan olarak dokunuşu geçirir; yalnız taşınca yakalar (telefonda gün kaydırma)', () => {
  const html = oku('index.html');
  const kural = html.match(/#tMetin\{[^}]*\}/)[0];
  assert.match(kural, /pointer-events:none/);
  assert.doesNotMatch(kural, /pointer-events:auto/);
  assert.match(html, /#tMetin\.kayar\{pointer-events:auto\}/);
  const sinif = { acik: null };
  const el = { tGer: { scrollHeight: 120, clientHeight: 60 }, tMetin: { classList: { toggle: (_, d) => { sinif.acik = d; } } } };
  const f = uiIslev('metinKayar', { $: (id) => el[id] });
  f(); assert.equal(sinif.acik, true);
  el.tGer.scrollHeight = 61; f(); assert.equal(sinif.acik, false);
});
test('Ayarlar gizlilik metni 28 günlük özeti anlatır, eski cümle yok', () => {
  const js = oku('uygulama.js');
  assert.match(js, /son 28 günlük özeti/);
  assert.doesNotMatch(js, /geçmiş günler gönderilmez/);
});

test('alt menü yüzen cam kapsüldür: dört sekme, etiket, kayan hap yok, iki backdrop-filter, Ayarlar sekmesi yok', () => {
  const html = oku('index.html');
  const nav = html.match(/<nav class="sekme" aria-label="Ekranlar">[\s\S]*?<\/nav>/);
  assert.ok(nav, 'nav.sekme aria-label="Ekranlar" bulunmalı');
  for (const id of ['sBugun', 'sTrend', 'sAktivite', 'sTakvim']) assert.match(nav[0], new RegExp(`<button type="button" id="${id}"`));
  assert.equal((nav[0].match(/<button\b/g) || []).length, 4);
  assert.match(nav[0], /<button type="button" id="sBugun" aria-current="page"/);
  assert.doesNotMatch(html, /sAyar/);
  assert.doesNotMatch(html + oku('uygulama.js'), /sekmeHap|class="hap"|\.sekme \.hap/);
  assert.doesNotMatch(nav[0], /class="hap"/);
  const kural = html.match(/\n\.sekme\{([^}]*)\}/);
  assert.ok(kural, '.sekme kuralı bulunmalı');
  assert.doesNotMatch(kural[1], /(^|;)\s*(left:0|right:0)\s*(;|$)/);
  assert.match(kural[1], /max-width:540px/);
  assert.match(kural[1], /height:64px/);
  assert.match(kural[1], /border-radius:32px/);
  assert.match(kural[1], /bottom:calc\(max\(var\(--sb\),10px\) \+ 10px\)/);
  assert.match(kural[1], /(^|[;\s])backdrop-filter:blur/);
  assert.match(kural[1], /-webkit-backdrop-filter:blur/);
  assert.match(html, /\.genis \.sekme\{display:none\}/);
  for (const id of ['sBugun', 'sTrend', 'sAktivite', 'sTakvim']) assert.match(html, new RegExp(`#${id}\\{--ak:#[0-9a-f]{6};--akr:\\d+ \\d+ \\d+\\}`));
  assert.match(html, /\.sekme button\[aria-current=page\]\{color:var\(--ak\);font-weight:700\}/);
});

/* ---------- Menü: hareketli simgeler, cam kapsül, rüzgâr sesi ---------- */
const menuNav = () => oku('index.html').match(/<nav class="sekme" aria-label="Ekranlar">[\s\S]*?<\/nav>/)[0];
const cssKural = (html, secici) => {
  const i = html.indexOf(`\n${secici}{`);
  assert.ok(i >= 0, `${secici} kuralı bulunmalı`);
  return html.slice(i + secici.length + 2, html.indexOf('}', i + secici.length + 2));
};

test('menü: dört sekmenin her birinde kendi hareketli simge parçaları var (24×24 satır içi SVG)', () => {
  const nav = menuNav();
  assert.ok(oku('index.html').startsWith('<!doctype html>'));
  assert.equal((oku('index.html').match(/<nav class="sekme"/g) || []).length, 1);
  const PARCA = { sBugun: ['m-halka', 'm-nefes', 'm-cekirdek'], sTrend: ['m-akis', 'm-binici'], sAktivite: ['m-iz', 'm-kuyruk'], sTakvim: ['m-yaprak', 'm-nokta', 'm-isik'] };
  for (const [id, parcalar] of Object.entries(PARCA)) {
    const b = nav.match(new RegExp(`<button type="button" id="${id}"[\\s\\S]*?</button>`));
    assert.ok(b, id);
    assert.match(b[0], /<svg class="sm" viewBox="0 0 24 24" aria-hidden="true">/);
    for (const p of parcalar) assert.match(b[0], new RegExp(`class="${p}"`), `${id} ${p}`);
  }
  const html = oku('index.html');
  for (const p of Object.values(PARCA).flat()) assert.ok(new RegExp(`\\.sekme\\.oynar [^{]*\\.${p}[^{]*\\{[^}]*animation:`).test(html), `${p} için animasyon kuralı`);
  // döngüler yalnız seçili sekmede ve girişten sonra; en hızlısı bile 2 saniyeden kısa döngü yapmaz
  for (const m of html.matchAll(/\.sekme\.oynar \[aria-current=page\]:not\(\.gir\) [^{]+\{[^}]*animation:\w+ ([\d.]+)s[^}]*infinite/g)) assert.ok(+m[1] >= 2, m[0]);
  // giriş hareketi (gecikmesiyle birlikte) 600 ms'yi geçmez
  const girisler = [...html.matchAll(/\.sekme\.oynar \.gir [^{]+\{[^}]*?animation:\w+ ([\d.]+)s cubic-bezier\([^)]*\)(?: ([\d.]+)s)?/g)];
  assert.ok(girisler.length >= 8, `giriş kuralları: ${girisler.length}`);
  for (const m of girisler) assert.ok(+m[1] + (+m[2] || 0) <= 0.6 + 1e-9, m[0]);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{\.sekme \.sm \*,\.sekme button::before\{animation:none!important\}\}/);
});

test('menü: seçili sekmenin kapsülü cam yüzeydir; kendi backdrop-filter yok (dış çubukta iki önek var), iç kenar ışığı ve tint', () => {
  const html = oku('index.html');
  const cam = cssKural(html, '.sekme button::before');
  assert.doesNotMatch(cam, /backdrop-filter/); // dış çubuk zaten backdrop kökü; iç içe filtre yalnız maliyet
  assert.match(cssKural(html, '.sekme'), /-webkit-backdrop-filter:blur/);
  assert.match(cssKural(html, '.sekme'), /(^|[;\s])backdrop-filter:blur/);
  assert.match(cam, /inset 0 1px 0 rgba\(255,255,255,\.\d+\)/); // üstte ince ışık çizgisi
  assert.match(cam, /inset 0 0 0 1px rgba\(255,255,255/); // 1px parlak iç kenar
  assert.match(cam, /rgb\(var\(--akr\)/); // sekmenin rengi cama hafifçe yansır
  assert.match(html, /\.sekme button\[aria-current=page\]::before\{opacity:1;transform:none\}/);
  assert.match(cssKural(html, '.sekme button::after'), /mask-composite:exclude/);
  assert.match(html, /\.genis \.sekme\{display:none\}/);
});

test('menü: simge döngüsü gizli ekranda, geniş modda ve azaltılmış harekette durur; giriş yalnız gerçek sekme değişiminde', () => {
  const js = oku('uygulama.js');
  assert.match(js, /const menuOynar = \(\) => tel\.querySelector\('\.sekme'\)\.classList\.toggle\('oynar', !RM && !GENIS && !document\.hidden\);/);
  assert.match(js, /document\.addEventListener\('visibilitychange', menuOynar\);/);
  assert.match(js, /if \(ekran === sekmeSon \|\| !SEKME\[ekran\]\) return;/);
  assert.match(js, /if \(RM \|\| GENIS\) return;/);
  assert.match(js, /girZaman = setTimeout\(\(\) => b\.classList\.remove\('gir'\), 600\);/);
});

test('menü: rüzgâr sesi yalnız gerçek sekme değişiminde çalar; Bugün ↔ Trend menüden geçerken eski tık/süpürme çalmaz', () => {
  const js = oku('uygulama.js');
  assert.match(js, /if \(!ekranGit\(e, true\)\) return;\n  SES\.ruzgar\(/);
  assert.equal((js.match(/SES\.ruzgar\(/g) || []).length, 1);
  assert.match(js, /trendeGec\(null, null, false, menuden\)/);
  assert.match(js, /bugunGec\(false, menuden\)/);
  assert.match(js, /if \(!menuden\) SES\.tik\(\);/);
  assert.match(js, /if \(!menuden\) SES\.gecis\(true\);/);
  assert.match(js, /if \(!menuden\) SES\.gecis\(false\);/);
});

// ses.js'i sahte bir AudioContext ile çalıştırır; kurulan ses kaynaklarını sayar.
function sesKur(kayitli) {
  const sayac = { kaynak: 0, baslat: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const dugum = (ek = {}) => ({ connect() {}, gain: param(), frequency: param(), Q: param(), delayTime: param(), pan: param(), ...ek });
  class SahteAC {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = dugum(); }
    createGain() { return dugum(); } createDynamicsCompressor() { return dugum(); } createDelay() { return dugum(); }
    createBiquadFilter() { return dugum(); } createStereoPanner() { return dugum(); }
    createOscillator() { sayac.kaynak++; return dugum({ start() { sayac.baslat++; }, stop() {} }); }
    createBufferSource() { sayac.kaynak++; return dugum({ start() { sayac.baslat++; }, stop() {} }); }
    createBuffer(k, n) { return { getChannelData: () => new Float32Array(n) }; }
    resume() {}
  }
  const depo = { 'gk-ses': JSON.stringify(kayitli) };
  const win = { AudioContext: SahteAC, localStorage: { getItem: (k) => depo[k] ?? null, setItem: (k, v) => { depo[k] = v; } } };
  win.window = win;
  runInNewContext(oku('ses.js'), win);
  win.SES.ac();
  return { SES: win.SES, sayac };
}

test('SES.ruzgar: ses kapalıyken hiçbir ses düğümü kurmaz ve çalmaz; açıkken tek kısa gürültü kaynağı başlatır', () => {
  const kapali = sesKur({ acik: false });
  for (const id of Object.keys(kapali.SES.SECENEK.ruzgar)) { kapali.SES.ayar.ruzgar = id; kapali.SES.ruzgar(1); kapali.SES.ruzgar(-1); }
  assert.deepEqual(kapali.sayac, { kaynak: 0, baslat: 0 });
  const acik = sesKur({ acik: true });
  acik.SES.ruzgar(1);
  assert.deepEqual(acik.sayac, { kaynak: 1, baslat: 1 });
  assert.equal(acik.SES.ayar.ruzgar, 'esinti');
  assert.ok(Object.keys(acik.SES.SECENEK.ruzgar).length >= 2 && Object.keys(acik.SES.SECENEK.ruzgar).length <= 3);
  // eski API bozulmadı
  for (const ad of ['ac', 'kaydet', 'cal', 'hazir', 'kalp', 'tik', 'gecis', 'can', 'nota', 'akor', 'dokunBasla', 'dokunAyar', 'dokunBitir']) assert.equal(typeof acik.SES[ad], 'function', ad);
});

test('sesler.html menü rüzgârı seçeneklerini listeler', () => {
  assert.match(oku('sesler.html'), /<div class="liste" id="ruzgar"><\/div>/);
  assert.match(oku('sesler.js'), /for \(const tur of \['tik', 'gecis', 'can', 'ruzgar'\]\)/);
});

test('Ayarlar çarkı: tek #ayarBtn, aria-label Ayarlar, sesin yanında ve en az 44 px', () => {
  const html = oku('index.html');
  assert.equal((html.match(/id="ayarBtn"/g) || []).length, 1);
  assert.match(html, /<button id="ayarBtn" type="button" aria-label="Ayarlar"[^>]*aria-controls="ayar"/);
  assert.ok(html.indexOf('id="sesBtn"') < html.indexOf('id="ayarBtn"'));
  const k = html.match(/\n#sesBtn,#ayarBtn\{([^}]*)\}/);
  assert.ok(k);
  assert.match(k[1], /width:44px;height:44px/);
  assert.doesNotMatch(oku('uygulama.js'), /createElement\('button'\);[^\n]*ayarBtn|ab\.id = 'ayarBtn'/);
  assert.match(html, /<section id="aktivite" class="ekran"[^>]*hidden><\/section>/);
  assert.match(html, /<section id="takvim" class="ekran"[^>]*hidden><\/section>/);
  assert.match(html, /\.ekran\{[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/);
});

test('Aktiviteler ve Takvim modülleri dinamik import ile, hata yakalanarak yüklenir', () => {
  const js = oku('uygulama.js');
  assert.match(js, /import\('\.\/aktiviteler\.js'\)/);
  assert.match(js, /import\('\.\/takvim\.js'\)/);
  assert.match(js, /modulKur\(k\.ice, k\.kur, k\.kap/);
  assert.match(js, /Bu bölüm yüklenemedi\./);
  assert.doesNotMatch(js, /^import .*['"]\.\/(aktiviteler|takvim)\.js['"]/m);
  assert.match(js, /ayarAcik: ayarAcik \|\| !!kayanAcik/);
  assert.match(js, /if \(!GENIS && kayanMi\(ekran\) && !mesgul\) return;/);
});

test('Ayarlar ölçü satırı #surum altında gizli başlar; iosTam sınıfı sahneyi mutlak konumlar', () => {
  const html = oku('index.html');
  assert.match(html, /<p id="surum" hidden><\/p>\s*<p id="olcu" hidden><\/p>/);
  assert.match(html, /html\.iosTam \.tel\.mob\{position:absolute\}/);
  assert.match(html, /html\.iosTam,html\.iosTam body\{[^}]*overflow:hidden[^}]*overscroll-behavior:none/);
});

test('odak: kayan ekran başlıkları odaklanabilir; menü geçişi başlığa, Trend düğmesi Trend\'e odak verir; gunAc eski günü reddeder', () => {
  assert.match(oku('aktiviteler.js'), /h\.setAttribute\('tabindex', '-1'\)/);
  assert.match(oku('takvim.js'), /baslikEl\.setAttribute\('tabindex', '-1'\)/);
  const u = oku('uygulama.js');
  assert.match(u, /kayanOdak\(\)/);
  assert.match(u, /querySelector\('h1, h2'\)/);
  assert.match(u, /\$\('wTrend'\)\.addEventListener\('click', \(\) => \{ genisKayan\(null\); \$\('tSimge'\)\.focus/);
  assert.match(u, /gunAcKarar\(tarih, GUNLER, G0\)/);
});

test('uygulama.js: sahne geçişi sürerken kayan kapsayıcılar dokunuş almaz, sekme dinleyicisi mesgul iken erken döner', () => {
  const js = oku('uygulama.js'), html = oku('index.html');
  assert.match(js, /function sahneKilit\(/, 'geçiş kilidi yardımcısı');
  assert.match(js, /\.inert = /);
  assert.match(js, /classList\.toggle\('sahneOynar'/);
  assert.match(html, /\.sahneOynar \[data-sahne\]\{transition:none!important\}/);
  assert.match(js, /\$\(id\)\.addEventListener\('click', \(\) => \{\s*if \(mesgul\) return;/, 'ikinci dokunuş odak isteğini silmez');
  assert.match(js, /sahneOgeleri\(kap, 8\)[\s\S]{0,200}sahneKademe\(/, 'yükselen öğe en çok 8, kademe sınırlı');
});

test('uygulama.js: Trend üst katmanı ipucu, çip ve ek satırı da kapsar; eski görünürlüğe döner', () => {
  const js = oku('uygulama.js');
  const m = js.match(/TREND_UST = \[([^\]]*)\]/);
  assert.ok(m);
  for (const s of ['#tBas', '#balon', '#ust', '#ipucu', '#cip', '#ekSatir']) assert.ok(m[1].includes(`'${s}'`), s);
  assert.doesNotMatch(js, /\.to\(TREND_UST, \{ autoAlpha: 1/, 'dönüş sabit 1 değil, saklanan değere');
  assert.doesNotMatch(js, /gsap\.set\(TREND_UST, \{ autoAlpha: 1 \}\)/);
});

test('bekleme yazısı: paragrafta aria-label yok, ekran okuyucu görsel gizli düz metni okur', () => {
  const js = oku('uygulama.js');
  const b = js.slice(js.indexOf('function bekleAc'), js.indexOf('function bekleDevret'));
  assert.doesNotMatch(b, /aria-label/);
  assert.match(b, /className = 'gz'/);
  assert.match(oku('index.html'), /\.gz\{position:absolute[^}]*clip:rect\(0,0,0,0\)/);
});
