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
  './simgeler.js',
  './aciklama.js',
  './kabuk.js',
  './bildirim.js',
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

/* ---------- Bildirimler ---------- */

const SIMGE = './simge/simge-192.png';
const YEDEK_BASLIK = 'GarminAnalizer';
const YEDEK_GOVDE = 'Yeni bilgi var.';
const doluMetin = (v) => typeof v === 'string' && v.trim().length > 0;

// Yük {baslik, govde, etiket, url}. Boş, JSON olmayan ya da bozuk yükte genel metin gösterilir (iOS her push'ta bildirim ister).
function yukOku(olay) {
  let y = null;
  try { y = olay.data ? olay.data.json() : null; } catch (hata) { y = null; }
  if (!y || typeof y !== 'object' || Array.isArray(y)) y = {};
  return {
    baslik: doluMetin(y.baslik) ? y.baslik.slice(0, 120) : YEDEK_BASLIK,
    govde: doluMetin(y.govde) ? y.govde.slice(0, 400) : YEDEK_GOVDE,
    etiket: doluMetin(y.etiket) ? y.etiket.slice(0, 64) : 'garminanalizer',
    url: typeof y.url === 'string' ? y.url : './',
  };
}

// Yalnız kapsam içi göreli adres açılır; mutlak ya da kapsam dışı adres kapsam köküne döner.
function hedefUrl(veri) {
  const ham = veri && typeof veri.url === 'string' ? veri.url : './';
  if (/^[a-z][a-z0-9+.-]*:/i.test(ham) || ham.startsWith('//') || ham.startsWith('/') || ham.includes('\\')) return KAPSAM;
  try {
    const hedef = new URL(ham, KAPSAM).href;
    return hedef.startsWith(KAPSAM) ? hedef : KAPSAM;
  } catch (hata) { return KAPSAM; }
}

async function pencereAc(hedef) {
  const liste = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const acik = liste.find((c) => typeof c.url === 'string' && c.url.startsWith(KAPSAM));
  if (acik && typeof acik.focus === 'function') return acik.focus();
  return self.clients.openWindow(hedef);
}

self.addEventListener('push', (olay) => {
  const y = yukOku(olay);
  olay.waitUntil(self.registration.showNotification(y.baslik, {
    body: y.govde, tag: y.etiket, icon: SIMGE, badge: SIMGE, data: { url: y.url },
  }));
});

self.addEventListener('notificationclick', (olay) => {
  olay.notification.close();
  olay.waitUntil(pencereAc(hedefUrl(olay.notification.data)));
});
