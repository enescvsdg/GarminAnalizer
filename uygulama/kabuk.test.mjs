import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = dirname(fileURLToPath(import.meta.url));
const oku = (ad) => readFileSync(join(KOK, ad), 'utf8');
const SAYFALAR = ['index.html', 'sesler.html'];
const TABAN = 'https://ornek.github.io/GarminAnalizer/';
const ONEK = 'garminanalizer-kabuk-';

// KABUK dizisini sw.js kaynağından çıkarır (betiği çalıştırmadan).
function kabukListesi() {
  const m = oku('sw.js').match(/const KABUK = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js içinde KABUK dizisi yok');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
const norm = (yol) => new URL(yol, TABAN).href;

// Yayınlanan (test ve sw.js dışı) bütün dosyalar, uygulama/ köküne göre.
function yayinDosyalari(dizin = KOK) {
  const cikti = [];
  for (const ad of readdirSync(dizin)) {
    const tam = join(dizin, ad);
    if (statSync(tam).isDirectory()) cikti.push(...yayinDosyalari(tam));
    else cikti.push(relative(KOK, tam));
  }
  return cikti.filter((d) => !/\.test\.mjs$/.test(d) && d !== 'sw.js' && !d.split('/').some((p) => p.startsWith('.')));
}

// ---- Service worker'ı sahte ortamda çalıştırma ----------------------------
function swOrtami({ eksik = [], onbellekler = new Map(), taban = TABAN, kapsam = taban, kayitYok = false, pencereler = [] } = {}) {
  const dinleyici = {};
  const bildirimler = [];
  const acilan = [];
  const getir = [];
  const cozum = (u) => new URL(typeof u === 'string' ? u : u.url, taban).href;
  const seçenek = (o) => (o || {});
  const caches = {
    onbellekler,
    async open(ad) {
      if (!onbellekler.has(ad)) onbellekler.set(ad, new Map());
      const depo = onbellekler.get(ad);
      return {
        async put(u, y) { depo.set(cozum(u), y); },
        async match(u, o) { return depo.get(cozum(u)); },
      };
    },
    async keys() { return [...onbellekler.keys()]; },
    async delete(ad) { return onbellekler.delete(ad); },
    async match(u, o = {}) {
      const adlar = o.cacheName ? [o.cacheName] : [...onbellekler.keys()];
      let hedef = cozum(u);
      if (o.ignoreSearch) hedef = hedef.split('?')[0];
      for (const ad of adlar) {
        const depo = onbellekler.get(ad);
        if (!depo) continue;
        for (const [k, v] of depo) {
          if ((o.ignoreSearch ? k.split('?')[0] : k) === hedef) return v;
        }
      }
      return undefined;
    },
  };
  const ctx = {
    URL, Promise, Response: class { constructor(g, i) { this.govde = g; Object.assign(this, i); this.ok = true; } },
    self: {
      location: { href: taban + 'sw.js', origin: new URL(taban).origin },
      ...(kayitYok ? {} : { registration: { scope: kapsam, async showNotification(baslik, secenek) { bildirimler.push({ baslik, secenek }); } } }),
      addEventListener(tur, fn) { dinleyici[tur] = fn; },
      clients: {
        claimCagrildi: 0,
        async claim() { this.claimCagrildi++; },
        async matchAll() { return pencereler; },
        async openWindow(u) { acilan.push(u); return { url: u }; },
      },
      skipWaitingCagrildi: 0,
      skipWaiting() { this.skipWaitingCagrildi++; return Promise.resolve(); },
    },
    caches,
    async fetch(u, o) {
      getir.push([cozum(u), o]);
      const url = cozum(u);
      if (eksik.some((e) => url.endsWith(e))) return { ok: false, status: 404, url };
      return { ok: true, status: 200, url, ag: true };
    },
  };
  ctx.self.fetch = ctx.fetch;
  vm.createContext(ctx);
  vm.runInContext(oku('sw.js'), ctx, { filename: 'sw.js' });
  const olay = (tur, ek = {}) => {
    let bekle;
    const e = { waitUntil(p) { bekle = p; }, ...ek };
    dinleyici[tur](e);
    return { e, bitti: () => bekle };
  };
  const surum = ctx.SURUM ?? vm.runInContext('SURUM', ctx);
  return { ctx, dinleyici, olay, getir, caches, surum, bildirimler, acilan };
}

function istek(url, { method = 'GET', mode = 'cors' } = {}) {
  let yanit; let cagrildi = false;
  return {
    e: { request: { method, mode, url: new URL(url, TABAN).href }, respondWith(p) { cagrildi = true; yanit = p; } },
    cagrildi: () => cagrildi,
    yanit: () => yanit,
  };
}

// ---- Dosya bütünlüğü -------------------------------------------------------
test('sw.js SURUM yer tutucusunu içerir ve klasik betiktir', () => {
  const kaynak = oku('sw.js');
  assert.match(kaynak, /^const SURUM = '__SURUM__';$/m);
  assert.doesNotMatch(kaynak, /^\s*(import|export)\s/m, 'klasik betik: import/export yok');
  assert.doesNotMatch(kaynak, /console\.log/);
});

test('KABUK listesindeki her dosya diskte vardır', () => {
  const kabuk = kabukListesi();
  assert.ok(kabuk.includes('./'));
  for (const yol of kabuk) {
    if (yol === './') { assert.ok(existsSync(join(KOK, 'index.html'))); continue; }
    assert.ok(yol.startsWith('./'), `${yol}: göreli olmalı`);
    assert.ok(existsSync(join(KOK, yol)), `${yol} diskte yok`);
  }
  assert.equal(new Set(kabuk).size, kabuk.length, 'yinelenen giriş');
});

test('KABUK yayınlanan bütün dosyaları kapsar; sw.js ve testler dışarıdadır', () => {
  const kabuk = kabukListesi().map(norm);
  for (const d of yayinDosyalari()) assert.ok(kabuk.includes(norm('./' + d)), `${d} KABUK'ta yok`);
  assert.ok(!kabuk.some((k) => /sw\.js|\.test\.mjs/.test(k)));
  for (const yol of ['./', './index.html', './sesler.html', './uygulama.js', './sesler.js', './veri.js', './ses.js',
    './veri-canli.js', './kabuk.js', './vendor/gsap.min.js', './manifest.webmanifest',
    './simge/simge-180.png', './simge/simge-192.png', './simge/simge-512.png', './simge/simge-maske-512.png']) {
    assert.ok(kabuk.includes(norm(yol)), `${yol} KABUK'ta yok`);
  }
});

test('index.html ve sesler.html içindeki her yerel src/href KABUK listesindedir', () => {
  const kabuk = kabukListesi().map(norm);
  for (const ad of SAYFALAR) {
    for (const m of oku(ad).matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
      const yol = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(yol) || yol.startsWith('#') || yol.startsWith('//')) continue;
      assert.ok(kabuk.includes(norm(yol)), `${ad}: ${yol} KABUK'ta yok`);
    }
  }
});

test('betiklerin import ettiği yerel modüller KABUK listesindedir', () => {
  const kabuk = kabukListesi().map(norm);
  for (const ad of readdirSync(KOK).filter((d) => d.endsWith('.js'))) {
    const kaynak = oku(ad);
    for (const m of kaynak.matchAll(/(?:\bimport\s*\(\s*|\bfrom\s+|\bimport\s+)['"](\.{0,2}\/[^'"]+)['"]/g)) {
      assert.ok(kabuk.includes(norm(m[1])), `${ad}: ${m[1]} KABUK'ta yok`);
    }
  }
  assert.match(oku('uygulama.js'), /import\('\.\/veri-canli\.js'\)/);
  assert.ok(kabuk.includes(norm('./veri-canli.js')));
  assert.match(oku('uygulama.js'), /import\('\.\/bildirim\.js'\)/);
  assert.ok(kabuk.includes(norm('./bildirim.js')));
});

test('index.html manifest, apple-touch-icon ve kabuk.js; sesler.html kabuk.js içerir', () => {
  const idx = oku('index.html');
  assert.match(idx, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(idx, /<link rel="apple-touch-icon" href="simge\/simge-180\.png">/);
  assert.match(idx, /<meta name="apple-mobile-web-app-title" content="Analizer">/);
  assert.match(idx, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(idx, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/);
  assert.match(idx, /<script src="kabuk\.js"><\/script>/);
  assert.match(oku('sesler.html'), /<script src="kabuk\.js"><\/script>/);
  // Ayarlar panelinin en altında sürüm satırı.
  const ayar = idx.slice(idx.indexOf('id="ayar"'));
  const iSurum = ayar.indexOf('id="surum"');
  assert.ok(iSurum > ayar.indexOf('id="aKapat"'), '#surum, Kapat düğmesinden sonra gelmeli');
  assert.match(ayar, /<p id="surum" hidden><\/p>/);
});

test('manifest geçerlidir ve simge dosyaları bildirilen boyuttadır', () => {
  const man = JSON.parse(oku('manifest.webmanifest'));
  assert.equal(man.name, 'GarminAnalizer');
  assert.equal(man.short_name, 'Analizer');
  assert.equal(man.lang, 'tr');
  assert.equal(man.id, './');
  assert.equal(man.start_url, './');
  assert.equal(man.scope, './');
  assert.equal(man.display, 'standalone');
  assert.equal(man.orientation, 'portrait');
  assert.equal(man.background_color, '#0c0812');
  assert.equal(man.theme_color, '#0c0812');
  const kabuk = kabukListesi().map(norm);
  const maske = man.icons.filter((i) => i.purpose === 'maskable');
  assert.equal(maske.length, 1);
  assert.ok(man.icons.some((i) => i.sizes === '192x192' && (i.purpose ?? 'any') === 'any'));
  assert.ok(man.icons.some((i) => i.sizes === '512x512' && (i.purpose ?? 'any') === 'any'));
  for (const i of man.icons) {
    assert.equal(i.type, 'image/png');
    assert.ok(!i.src.startsWith('/'), `${i.src}: göreli olmalı`);
    assert.ok(kabuk.includes(norm(i.src)), `${i.src} KABUK'ta yok`);
    const png = readFileSync(join(KOK, i.src));
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, i.sizes, `${i.src} boyutu`);
  }
  const t = readFileSync(join(KOK, 'simge/simge-180.png'));
  assert.equal(t.readUInt32BE(16), 180);
});

test('yerel yollar göreli: kabuk.js ve sw.js içinde mutlak yerel yol yok', () => {
  const kabuk = oku('kabuk.js');
  assert.match(kabuk, /register\(\s*'\.\/sw\.js'\s*,\s*\{\s*scope:\s*'\.\/'\s*,\s*updateViaCache:\s*'none'\s*\}\s*\)/);
  for (const ad of readdirSync(KOK).filter((d) => d.endsWith('.js'))) {
    const kaynak = oku(ad);
    const desen = /\b(?:register|fetch|import|match|add|addAll|put|open)\s*\(\s*['"`]\/(?!\/)/;
    assert.doesNotMatch(kaynak, desen, `${ad}: kök-mutlak yerel yol`);
  }
  assert.doesNotMatch(oku('sw.js'), /(?:^|[(,\s\[])['"`]\/(?!\/)[\w.-]/m, 'sw.js: kök-mutlak yol');
  assert.doesNotMatch(oku('manifest.webmanifest'), /"(?:start_url|scope|src)":\s*"\//);
});

// ---- Service worker davranışı ---------------------------------------------
test('sw.js köken dışı isteği ve POST/PUT isteğini yanıtlamaz; aynı köken GET yanıtlanır', () => {
  const o = swOrtami();
  for (const url of ['https://garmin.example.workers.dev/api/ozet', 'https://fonts.googleapis.com/css2?family=Onest']) {
    const i = istek(url);
    o.dinleyici.fetch(i.e);
    assert.equal(i.cagrildi(), false, `${url} yanıtlanmamalı`);
  }
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const i = istek('./uygulama.js', { method });
    o.dinleyici.fetch(i.e);
    assert.equal(i.cagrildi(), false, method);
  }
  const g = istek('./uygulama.js');
  o.dinleyici.fetch(g.e);
  assert.equal(g.cagrildi(), true);
  // Kapsam dışı aynı köken yol (aynı GitHub Pages alanındaki başka depo) yanıtlanmaz.
  const baska = istek('https://ornek.github.io/BaskaDepo/x.js');
  o.dinleyici.fetch(baska.e);
  assert.equal(baska.cagrildi(), false);
});

test('install bütün KABUK dosyalarını reload ile önbelleğe alır, skipWaiting çağırır', async () => {
  const o = swOrtami();
  const { bitti } = o.olay('install');
  await bitti();
  const ad = ONEK + o.surum;
  assert.ok(o.caches.onbellekler.has(ad));
  const depo = o.caches.onbellekler.get(ad);
  assert.equal(depo.size, kabukListesi().length);
  assert.ok(o.getir.every(([, opt]) => opt && opt.cache === 'reload'));
  assert.equal(o.ctx.self.skipWaitingCagrildi, 1);
});

test('install bir dosya eksikse reddeder ve yarım önbellek bırakmaz', async () => {
  const o = swOrtami({ eksik: ['/veri.js'] });
  const { bitti } = o.olay('install');
  await assert.rejects(bitti());
  assert.equal(o.caches.onbellekler.size, 0);
});

test('activate eski garminanalizer-kabuk-* önbelleklerini siler, yabancı kabuk-xyz ve başkalarına dokunmaz; clients.claim çağrılır', async () => {
  const onb = new Map();
  const o0 = swOrtami({ onbellekler: onb });
  const guncel = ONEK + o0.surum;
  for (const ad of [ONEK + 'eski1', ONEK + 'eski2', guncel, 'kabuk-xyz', 'baska-onbellek', 'api-yedek']) onb.set(ad, new Map());
  const { bitti } = o0.olay('activate');
  await bitti();
  assert.deepEqual([...onb.keys()].sort(), [guncel, 'api-yedek', 'baska-onbellek', 'kabuk-xyz'].sort());
  assert.equal(o0.ctx.self.clients.claimCagrildi, 1);
});

test('gezinme isteği: kapsamdaki URL önbellekteki index.html; sesler.html kendi sayfasını alır', async () => {
  const o = swOrtami();
  await o.olay('install').bitti();
  const depo = o.caches.onbellekler.get(ONEK + o.surum);
  const index = depo.get(norm('./index.html'));
  const sesler = depo.get(norm('./sesler.html'));
  assert.notEqual(index, sesler);
  for (const url of [TABAN, TABAN + '?x=1', TABAN + 'index.html', TABAN + 'index.html?a=1']) {
    const i = istek(url, { mode: 'navigate' });
    o.dinleyici.fetch(i.e);
    assert.equal(await i.yanit(), index, url);
  }
  const s = istek(TABAN + 'sesler.html', { mode: 'navigate' });
  o.dinleyici.fetch(s.e);
  assert.equal(await s.yanit(), sesler);
  const sq = istek(TABAN + 'sesler.html?a=1', { mode: 'navigate' });
  o.dinleyici.fetch(sq.e);
  assert.equal(await sq.yanit(), sesler);
});

test('gezinme: kapsamdaki bilinmeyen yollar ve alt dizindeki sesler.html yanıtlanmaz (ağa gider)', async () => {
  const o = swOrtami();
  await o.olay('install').bitti();
  for (const url of [TABAN + 'bilinmeyen/yol', TABAN + 'x/sesler.html', TABAN + 'x/index.html', TABAN + 'baska.html']) {
    const i = istek(url, { mode: 'navigate' });
    o.dinleyici.fetch(i.e);
    assert.equal(i.cagrildi(), false, url);
  }
});

test('kapsam self.registration.scope üzerinden gelir; kayıt yoksa betik dizinine düşer', async () => {
  const o = swOrtami({ kapsam: TABAN + 'alt/' });
  await o.olay('install').bitti();
  const disarida = istek(TABAN + 'uygulama.js');
  o.dinleyici.fetch(disarida.e);
  assert.equal(disarida.cagrildi(), false, 'kayıt kapsamı dışı');
  const icinde = istek(TABAN + 'alt/uygulama.js');
  o.dinleyici.fetch(icinde.e);
  assert.equal(icinde.cagrildi(), true);
  const k = swOrtami({ kayitYok: true });
  const g = istek('./uygulama.js');
  k.dinleyici.fetch(g.e);
  assert.equal(g.cagrildi(), true, 'yedek: betik dizini');
});

test('gezinme isteği kapsam dışındaysa yanıtlanmaz', () => {
  const o = swOrtami();
  const i = istek('https://ornek.github.io/BaskaDepo/', { mode: 'navigate' });
  o.dinleyici.fetch(i.e);
  assert.equal(i.cagrildi(), false);
});

test('önbellek ıskalarsa ağa düşer; gezinmede ağ da yoksa önbellekteki index.html döner', async () => {
  const o = swOrtami();
  await o.olay('install').bitti();
  const depo = o.caches.onbellekler.get(ONEK + o.surum);
  // alt kaynak ıskası -> ağ
  const k = istek('./bilinmeyen.png');
  o.dinleyici.fetch(k.e);
  assert.equal((await k.yanit()).ag, true);
  // ignoreSearch
  const q = istek('./uygulama.js?v=3');
  o.dinleyici.fetch(q.e);
  assert.equal(await q.yanit(), depo.get(norm('./uygulama.js')));
  // gezinme + ağ hatası + sesler.html önbellekte yok -> index.html
  depo.delete(norm('./sesler.html'));
  o.ctx.fetch = async () => { throw new TypeError('ağ yok'); };
  o.ctx.self.fetch = o.ctx.fetch;
  const n = istek(TABAN + 'sesler.html', { mode: 'navigate' });
  o.dinleyici.fetch(n.e);
  assert.equal(await n.yanit(), depo.get(norm('./index.html')));
});

test('yalnız güncel sürümün önbelleği kullanılır (eski sürüm yanıtı karışmaz)', async () => {
  const onb = new Map();
  const eskiDepo = new Map([[norm('./index.html'), { eski: true }], [norm('./uygulama.js'), { eski: true }]]);
  onb.set(ONEK + 'eski', eskiDepo);
  const o = swOrtami({ onbellekler: onb });
  // Yeni sürüm kurulmadan (install yok) gezinme: güncel önbellek boş, eski yanıt dönmemeli.
  const i = istek(TABAN, { mode: 'navigate' });
  o.dinleyici.fetch(i.e);
  const y = await i.yanit();
  assert.ok(!y || !y.eski, 'eski önbellek yanıtı sızdı');
});

test('alt kaynak: eski sürüm önbelleği uygulama.js tutsa da güncel önbellekte yoksa ağa gider', async () => {
  const onb = new Map();
  const eski = { eski: true };
  onb.set(ONEK + 'eski', new Map([[norm('./uygulama.js'), eski]]));
  const o = swOrtami({ onbellekler: onb });
  onb.set(ONEK + o.surum, new Map()); // güncel önbellek var ama boş
  const i = istek('./uygulama.js');
  o.dinleyici.fetch(i.e);
  const y = await i.yanit();
  assert.notEqual(y, eski, 'eski önbellek yanıtı sızdı');
  assert.equal(y.ag, true, 'ağa gitmeli');
  assert.equal(o.getir.length, 1);
});

test('surum iletisine SURUM ile yanıt verir', () => {
  const o = swOrtami();
  const alinan = [];
  const port = { postMessage: (m) => alinan.push(m) };
  o.dinleyici.message({ data: { tur: 'surum' }, ports: [port] });
  assert.equal(JSON.stringify(alinan), JSON.stringify([{ surum: '__SURUM__' }]));
  o.dinleyici.message({ data: { tur: 'baska' }, ports: [port] });
  o.dinleyici.message({ data: null, ports: [] });
  assert.equal(alinan.length, 1);
});

// ---- kabuk.js ---------------------------------------------------------------
function kabukOrtami({ controller = null, sw = true, readyState = 'complete', yenilendi = null, depoVar = true, kayitHatasi = false, hostname = 'ornek.github.io', search = '' } = {}) {
  const depo = new Map(yenilendi ? [['gk-yenilendi', yenilendi]] : []);
  const olaylar = {};
  const swDinleyici = {};
  const zamanlayici = [];
  const log = { kayit: [], reload: 0, uyari: 0, kaldirildi: 0 };
  const satir = { hidden: true, textContent: '' };
  const aktif = { postMessage(msg, ports) { aktif.son = msg; aktif.port = ports[0]; } };
  const nav = sw ? {
    serviceWorker: {
      controller,
      addEventListener(t, f) { swDinleyici[t] = f; },
      register(url, opt) { log.kayit.push([url, opt]); return kayitHatasi ? Promise.reject(new Error('x')) : Promise.resolve({ active: aktif }); },
      ready: Promise.resolve({ active: aktif }),
      getRegistration() { return Promise.resolve({ unregister() { log.kaldirildi++; return Promise.resolve(true); } }); },
    },
  } : {};
  const secenekler = {};
  const ctx = {
    navigator: nav,
    document: { readyState, getElementById: (id) => (id === 'surum' ? satir : null) },
    location: { hostname, search, reload() { log.reload++; } },
    addEventListener(t, f, o) { olaylar[t] = f; secenekler[t] = o; },
    setTimeout(f, ms) { zamanlayici.push({ f, ms }); return zamanlayici.length; },
    clearTimeout() {},
    // Gerçek MessagePort süreci açık tutar; eşzamanlı sahte kanal.
    MessageChannel: class {
      constructor() {
        const p1 = { onmessage: null, close() {} };
        this.port1 = p1;
        this.port2 = { postMessage(m) { if (p1.onmessage) p1.onmessage({ data: m }); } };
      }
    },
    console: { warn() { log.uyari++; } },
  };
  if (depoVar) {
    ctx.sessionStorage = {
      getItem: (k) => (depo.has(k) ? depo.get(k) : null),
      setItem: (k, v) => depo.set(k, String(v)),
      removeItem: (k) => depo.delete(k),
    };
  }
  vm.createContext(ctx);
  vm.runInContext(oku('kabuk.js'), ctx, { filename: 'kabuk.js' });
  return { ctx, depo, olaylar, secenekler, swDinleyici, zamanlayici, log, satir, aktif };
}
const bekle = () => new Promise((r) => setImmediate(r));

test('kabuk.js göreli URL ve göreli kapsamla kaydeder', async () => {
  const k = kabukOrtami();
  await bekle();
  assert.equal(JSON.stringify(k.log.kayit), JSON.stringify([['./sw.js', { scope: './', updateViaCache: 'none' }]]));
  assert.ok(!k.log.kayit[0][0].startsWith('/') && !k.log.kayit[0][1].scope.startsWith('/'));
});

test('kabuk.js sayfa yüklenirken kayıt için load olayını bekler', async () => {
  const k = kabukOrtami({ readyState: 'loading' });
  assert.equal(k.log.kayit.length, 0);
  k.olaylar.load();
  assert.equal(k.log.kayit.length, 1);
});

test('service worker yoksa kabuk.js sessizce çıkar ve sürüm satırı gizli kalır', () => {
  const k = kabukOrtami({ sw: false });
  assert.equal(k.satir.hidden, true);
  assert.equal(k.log.kayit.length, 0);
});

test('sabit ekran: gesture olayları passive:false ile engellenir; touchmove dinlenmez; service worker olmasa da kurulur', () => {
  for (const sw of [true, false]) {
    const k = kabukOrtami({ sw });
    for (const tur of ['gesturestart', 'gesturechange', 'gestureend']) {
      assert.equal(typeof k.olaylar[tur], 'function', tur + ' dinleyicisi yok');
      assert.equal(k.secenekler[tur]?.passive, false, tur + ' passive:false olmalı');
      let engel = 0;
      k.olaylar[tur]({ preventDefault() { engel++; } });
      assert.equal(engel, 1);
    }
    assert.equal(k.olaylar.touchmove, undefined, 'iki parmak touchmove engellenmemeli');
  }
});

test('sabit ekran: viewport yakınlaştırmayı kapatır, html/body touch-action: manipulation', () => {
  const idx = oku('index.html');
  assert.match(idx, /<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">/);
  assert.match(idx, /html,body\{[^}]*touch-action:manipulation[^}]*\}/);
});

test('ilk kurulumda (denetleyici yok) controllerchange sayfayı yenilemez', () => {
  const k = kabukOrtami({ controller: null });
  k.swDinleyici.controllerchange();
  assert.equal(k.log.reload, 0);
});

test('ilk kurulum sonrası aynı sayfada ikinci controllerchange tam bir kez yeniler', () => {
  const k = kabukOrtami({ controller: null });
  const s = k.ctx.navigator.serviceWorker;
  s.controller = {}; // ilk worker kontrolü aldı
  k.swDinleyici.controllerchange();
  assert.equal(k.log.reload, 0, 'ilk kurulum yenilemez');
  s.controller = {}; // güncelleme geldi
  k.swDinleyici.controllerchange();
  assert.equal(k.log.reload, 1);
  k.swDinleyici.controllerchange();
  assert.equal(k.log.reload, 1, 'ardışık olay yeniden yenilemez');
});

test('kabuk.js betik başında denetleyiciyi eşzamanlı yakalar (DOM bitmeden)', () => {
  const k = kabukOrtami({ controller: {}, readyState: 'loading' });
  k.swDinleyici.controllerchange();
  assert.equal(k.log.reload, 1);
  assert.equal(k.log.kayit.length, 0, 'kayıt load olayını bekler');
});

test('güncellemede (denetleyici vardı) controllerchange sayfayı bir kez yeniler', () => {
  const k = kabukOrtami({ controller: {} });
  k.swDinleyici.controllerchange();
  k.swDinleyici.controllerchange();
  assert.equal(k.log.reload, 1);
  assert.equal(k.depo.get('gk-yenilendi'), '1');
});

test('döngü koruması: bayrak varsa yenilemez; başarılı yüklemeden sonra bayrak silinir, sonraki güncelleme yenileyebilir', () => {
  const k = kabukOrtami({ controller: {}, yenilendi: '1' });
  k.swDinleyici.controllerchange();
  assert.equal(k.log.reload, 0, 'bayrak varken yenileme yok');
  // sayfa yüklendi (readyState complete) -> bayrak kısa gecikmeyle temizlenir
  assert.ok(k.zamanlayici.length > 0, 'temizleme zamanlayıcısı kurulmalı');
  for (const z of k.zamanlayici) z.f();
  assert.equal(k.depo.has('gk-yenilendi'), false);
  k.swDinleyici.controllerchange();
  assert.equal(k.log.reload, 1, 'sonraki güncelleme yeniler');
});

test('sessionStorage kullanılamazsa kabuk.js hata vermeden çalışır', () => {
  const k = kabukOrtami({ controller: {}, depoVar: false });
  assert.doesNotThrow(() => k.swDinleyici.controllerchange());
});

test('kabuk.js etkin worker sürümünü #surum satırına textContent ile yazar', async () => {
  const k = kabukOrtami({ controller: {} });
  await bekle(); await bekle();
  assert.equal(k.aktif.son.tur, 'surum');
  k.aktif.port.postMessage({ surum: 'abc123' });
  assert.equal(k.satir.textContent, 'Sürüm: abc123');
  assert.equal(k.satir.hidden, false);
});

test('yanıt gelmezse sürüm satırı gizli kalır', async () => {
  const k = kabukOrtami({ controller: {} });
  await bekle(); await bekle();
  for (const z of k.zamanlayici) z.f(); // zaman aşımı
  assert.equal(k.satir.hidden, true);
  assert.equal(k.satir.textContent, '');
});

test('kayıt başarısız olursa tek uyarı yazar, hata fırlatmaz', async () => {
  const k = kabukOrtami({ kayitHatasi: true });
  await bekle();
  assert.equal(k.log.uyari, 1);
});

test('yerelde (localhost) worker kaydedilmez ve eski kayıt kaldırılır; ?sw=1 ile kaydedilir', async () => {
  for (const hostname of ['localhost', '127.0.0.1']) {
    const o = kabukOrtami({ hostname });
    await bekle();
    assert.equal(o.log.kayit.length, 0, hostname);
    assert.equal(o.log.kaldirildi, 1, hostname);
  }
  const acik = kabukOrtami({ hostname: 'localhost', search: '?sw=1' });
  await bekle();
  assert.equal(acik.log.kayit.length, 1);
  assert.equal(acik.log.kaldirildi, 0);
  const yayin = kabukOrtami({ hostname: 'ornek.github.io' });
  await bekle();
  assert.equal(yayin.log.kayit.length, 1);
  assert.equal(yayin.log.kaldirildi, 0);
});

// ---- Bildirimler (push, notificationclick) ---------------------------------
const SIMGE = './simge/simge-192.png';
const pushOlayi = (veri) => ({ data: veri === undefined ? null : veri });
const jsonVeri = (nesne) => ({ json: () => JSON.parse(JSON.stringify(nesne)) });
const metinVeri = (m) => ({ json: () => JSON.parse(m) });

test('push: geçerli yük showNotification çağırır (başlık, gövde, etiket, simge, rozet, url)', async () => {
  const o = swOrtami();
  const { bitti } = o.olay('push', pushOlayi(jsonVeri({ baslik: 'Toparlanmış bir gün', govde: 'Uyku ve HRV iyi.', etiket: 'brifing', url: './' })));
  await bitti();
  assert.equal(o.bildirimler.length, 1);
  const { baslik, secenek } = o.bildirimler[0];
  assert.equal(baslik, 'Toparlanmış bir gün');
  assert.equal(secenek.body, 'Uyku ve HRV iyi.');
  assert.equal(secenek.tag, 'brifing');
  assert.equal(secenek.icon, SIMGE);
  assert.equal(secenek.badge, SIMGE);
  assert.equal(secenek.data.url, './');
});

test('push: boş, bozuk, nesne olmayan ya da eksik alanlı yükte genel metin gösterilir', async () => {
  const durumlar = [
    pushOlayi(undefined), // veri yok
    pushOlayi(metinVeri('bu json degil')),
    pushOlayi(metinVeri('null')),
    pushOlayi(metinVeri('"yalnız dizgi"')),
    pushOlayi(metinVeri('[1,2]')),
    pushOlayi(jsonVeri({})),
    pushOlayi(jsonVeri({ baslik: 5, govde: null, etiket: {}, url: 7 })),
    pushOlayi(jsonVeri({ baslik: '  ', govde: '' })),
    pushOlayi({ json() { throw new Error('okunamadı'); } }),
  ];
  for (const d of durumlar) {
    const o = swOrtami();
    await o.olay('push', d).bitti();
    assert.equal(o.bildirimler.length, 1);
    assert.equal(o.bildirimler[0].baslik, 'GarminAnalizer');
    assert.equal(o.bildirimler[0].secenek.body, 'Yeni bilgi var.');
    assert.equal(o.bildirimler[0].secenek.icon, SIMGE);
    assert.equal(typeof o.bildirimler[0].secenek.tag, 'string');
    assert.equal(o.bildirimler[0].secenek.data.url, './');
  }
});

test('push: bildirim gösterilirken olay waitUntil ile açık tutulur', async () => {
  const o = swOrtami();
  const { bitti } = o.olay('push', pushOlayi(jsonVeri({ baslik: 'a', govde: 'b', etiket: 'c', url: './' })));
  assert.ok(bitti() && typeof bitti().then === 'function');
});

function tikla(o, veri) {
  let kapandi = 0;
  const bildirim = { close() { kapandi += 1; }, data: veri };
  const r = o.olay('notificationclick', { notification: bildirim });
  return { bitti: r.bitti, kapandi: () => kapandi };
}

test('notificationclick: bildirimi kapatır; açık kapsam penceresi varsa odaklar, yeni pencere açmaz', async () => {
  const odak = [];
  const dis = { url: 'https://baska.example/', focus: async () => odak.push('dis') };
  const ic = { url: TABAN + 'index.html', focus: async () => odak.push('ic') };
  const o = swOrtami({ pencereler: [dis, ic] });
  const t = tikla(o, { url: './' });
  await t.bitti();
  assert.equal(t.kapandi(), 1);
  assert.deepEqual(odak, ['ic']);
  assert.equal(o.acilan.length, 0);
});

test('notificationclick: açık pencere yoksa kapsam kökünü açar', async () => {
  const o = swOrtami({ pencereler: [{ url: 'https://baska.example/', focus: async () => assert.fail('odaklanmamalı') }] });
  const t = tikla(o, { url: './' });
  await t.bitti();
  assert.equal(t.kapandi(), 1);
  assert.deepEqual([...o.acilan], [TABAN]);
});

test('notificationclick: mutlak, kapsam dışı, protokollü ya da bozuk url yok sayılır; kapsam kökü açılır', async () => {
  const kotuler = [
    'https://kotu.example/', 'http://kotu.example/x', TABAN + 'index.html', '//kotu.example/', '/baska/yol', '../baska/',
    '../../', 'javascript:alert(1)', 'data:text/html,x', '\\kotu.example', 5, null, undefined, {},
  ];
  for (const url of kotuler) {
    const o = swOrtami();
    await tikla(o, url === undefined ? {} : { url }).bitti();
    assert.deepEqual([...o.acilan], [TABAN], String(url));
  }
  const o = swOrtami();
  await tikla(o, null).bitti(); // bildirimde veri yok
  assert.deepEqual([...o.acilan], [TABAN]);
});

test('notificationclick: kapsam içi göreli url açılır', async () => {
  const o = swOrtami();
  await tikla(o, { url: './sesler.html' }).bitti();
  assert.deepEqual([...o.acilan], [TABAN + 'sesler.html']);
});

test('notificationclick: alt dizin kapsamında da kapsam dışı yol kapsam köküne döner', async () => {
  const taban = 'https://ornek.github.io/GarminAnalizer/';
  const o = swOrtami({ taban, kapsam: taban });
  await tikla(o, { url: '../' }).bitti();
  assert.deepEqual([...o.acilan], [taban]);
});

test('sw.js bildirim kodu mutlak yerel yol ve console.log içermez; push ve notificationclick dinleyicileri vardır', () => {
  const o = swOrtami();
  assert.equal(typeof o.dinleyici.push, 'function');
  assert.equal(typeof o.dinleyici.notificationclick, 'function');
  assert.doesNotMatch(oku('sw.js'), /console\./);
});
