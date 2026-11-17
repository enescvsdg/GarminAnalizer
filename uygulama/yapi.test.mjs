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
  for (const id of ['sBugun', 'sTrend', 'sAktivite', 'sTakvim']) assert.match(html, new RegExp(`#${id}\\{--ak:#[0-9a-f]{6};--akz:rgba`));
  assert.match(html, /\.sekme button\[aria-current=page\]\{color:var\(--ak\);background:var\(--akz\)/);
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
