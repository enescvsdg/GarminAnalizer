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
  './duzen.js',
  './kabuk.js',
  './vendor/gsap.min.js',
  './manifest.webmanifest',
  './simge/simge-180.png',
  './simge/simge-192.png',
  './simge/simge-512.png',
  './simge/simge-maske-512.png',
];
// Ön ek, paylaşılan <kullanıcı>.github.io kökenindeki başka sitelerin önbelleklerinden ayırır.
const ONEK = 'garminanalizer-kabuk-';
const ONBELLEK = ONEK + SURUM;
// Kapsam kayıttan gelir; kayıt yoksa (test ortamı) betiğin dizinine düşer.
const KAPSAM = (self.registration && self.registration.scope) || new URL('./', self.location.href).href;
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
    .filter((ad) => ad.startsWith(ONEK) && ad !== ONBELLEK)
    .map((ad) => caches.delete(ad)));
  await self.clients.claim();
}

// Kabuk belgesi yalnız kapsam kökü, index.html ve sesler.html için sunulur (sorgu dizesi yok sayılır).
function kabukBelgesi(url) {
  const yol = url.origin + url.pathname;
  if (yol === KAPSAM || yol === KAPSAM + 'index.html') return './index.html';
  if (yol === KAPSAM + 'sesler.html') return './sesler.html';
  return null;
}

async function gezin(istek, hedef) {
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
  if (istek.mode === 'navigate') {
    const hedef = kabukBelgesi(url);
    if (hedef) olay.respondWith(gezin(istek, hedef)); // bilinmeyen yollar ağa gider, 404 normal görünür
    return;
  }
  olay.respondWith(kaynak(istek));
});

self.addEventListener('message', (olay) => {
  if (olay.data && olay.data.tur === 'surum' && olay.ports && olay.ports[0]) {
    olay.ports[0].postMessage({ surum: SURUM });
  }
});
