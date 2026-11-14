// GarminAnalizer service worker. SURUM yayın sırasında commit kimliğiyle değiştirilir.
const SURUM = '__SURUM__';
const KABUK = [
  './',
  './index.html',
  './sesler.html',
  './uygulama.js',
  './sesler.js',
  './veri.js',
  './ses.js',
  './veri-canli.js',
  './kabuk.js',
  './vendor/gsap.min.js',
  './manifest.webmanifest',
  './simge/simge-180.png',
  './simge/simge-192.png',
  './simge/simge-512.png',
  './simge/simge-maske-512.png',
];
const ONBELLEK = 'kabuk-' + SURUM;
const KAPSAM = new URL('./', self.location.href).href;
const SECENEK = { cacheName: ONBELLEK };

// Hepsi indirilip doğrulanmadan önbellek açılmaz: yarım önbellek olmaz.
async function kur() {
  const yanitlar = await Promise.all(KABUK.map(async (yol) => {
    const yanit = await fetch(yol, { cache: 'reload' });
    if (!yanit.ok) throw new Error(yol + ' alınamadı: ' + yanit.status);
    return [yol, yanit];
  }));
  try {
    const onbellek = await caches.open(ONBELLEK);
    await Promise.all(yanitlar.map(([yol, yanit]) => onbellek.put(yol, yanit)));
  } catch (hata) {
    await caches.delete(ONBELLEK);
    throw hata;
  }
}

async function temizle() {
  const adlar = await caches.keys();
  await Promise.all(adlar
    .filter((ad) => ad.startsWith('kabuk-') && ad !== ONBELLEK)
    .map((ad) => caches.delete(ad)));
  await self.clients.claim();
}

async function gezin(istek, url) {
  const hedef = url.pathname.endsWith('sesler.html') ? './sesler.html' : './index.html';
  const kayitli = await caches.match(hedef, SECENEK);
  if (kayitli) return kayitli;
  try {
    return await fetch(istek);
  } catch (hata) {
    return caches.match('./index.html', SECENEK);
  }
}

async function kaynak(istek) {
  const kayitli = await caches.match(istek, { cacheName: ONBELLEK, ignoreSearch: true });
  return kayitli || fetch(istek);
}

self.addEventListener('install', (olay) => {
  olay.waitUntil(kur().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (olay) => {
  olay.waitUntil(temizle());
});

self.addEventListener('fetch', (olay) => {
  const istek = olay.request;
  if (istek.method !== 'GET') return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return; // Worker API, Google Fonts: tarayıcı kendisi halleder
  if (!url.href.startsWith(KAPSAM)) return;
  olay.respondWith(istek.mode === 'navigate' ? gezin(istek, url) : kaynak(istek));
});

self.addEventListener('message', (olay) => {
  if (olay.data && olay.data.tur === 'surum' && olay.ports && olay.ports[0]) {
    olay.ports[0].postMessage({ surum: SURUM });
  }
});
