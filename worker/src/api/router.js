// HTTP girişi: kimlik, CORS ve rotalar. Gizli değerler loga ve yanıta girmez.
import { apiYaniti } from '../stats/ozet.js';
import { aktiviteYaniti, okumaBasi as aktiviteOkumaBasi } from '../stats/aktivite.js';
import { takvimYaniti, okumaBasi as takvimOkumaBasi } from '../stats/takvim.js';
import { gunleriOku, aktiviteleriOku, durumOku, durumYaz, abonelikYaz, abonelikSil, abonelikleriOku } from '../db.js';
import { herkeseGonder, vapidAyari, pushOzetSatiri } from '../brifing.js';
import { yerelTarih, gunEkle } from '../zaman.js';
import { yorumOku, yapayZekaAcik, yapayZekaYaz } from '../yorum/yorum.js';
import { egilimOku } from '../yorum/egilim.js';

const enc = new TextEncoder();

async function ozet(metin) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(metin)));
}

// Sabit zamanlı karşılaştırma: SHA-256 özetleri bayt bayt XOR'lanır.
async function anahtarGecerli(gelen, beklenen) {
  if (typeof beklenen !== 'string' || beklenen === '') return false;
  const a = await ozet(typeof gelen === 'string' ? gelen : '');
  const b = await ozet(beklenen);
  let fark = 0;
  for (let i = 0; i < a.length; i += 1) fark |= a[i] ^ b[i];
  return fark === 0;
}

function corsBasliklari(request, env) {
  const b = { Vary: 'Origin', 'Cache-Control': 'no-store' };
  const origin = request.headers.get('Origin');
  const izinli = String(env.IZINLI_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && izinli.includes(origin)) b['Access-Control-Allow-Origin'] = origin;
  return b;
}

function yanit(govde, status, cors) {
  return new Response(JSON.stringify(govde), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function gunSayisi(deger) {
  const n = Number.parseInt(deger ?? '', 10);
  if (!Number.isFinite(n)) return 28;
  return Math.min(90, Math.max(1, n));
}

// /api/gunler gövdesi; brifing de aynı nesneyi kullanır, bildirim metni uygulamadakiyle birebir olur.
export async function gunlerYaniti(env, simdiMs, n) {
  const bugun = yerelTarih(simdiMs);
  const satirlar = await gunleriOku(env.DB, gunEkle(bugun, -(n + 29)), bugun);
  const meta = {
    sonEsitleme: (await durumOku(env.DB, 'son_esitleme')) ?? null,
    keyDurum: (await durumOku(env.DB, 'key_durum')) ?? null,
  };
  const govde = apiYaniti(satirlar, bugun, n, meta);
  let yorum = null;
  try {
    yorum = await yorumOku(env.DB, bugun, satirlar); // Gemini süs katmanıdır; hata API'yi bozmaz
  } catch {
    yorum = null;
  }
  govde.yorumKaynak = 'sablon';
  if (yorum) {
    const son = govde.gunler[govde.gunler.length - 1];
    son.hukum = yorum.hukum;
    son.gerekce = yorum.gerekce;
    govde.yorumKaynak = 'gemini';
  }
  try {
    govde.egilim = await egilimOku(env.DB, bugun, satirlar); // eğilim de süs katmanıdır; hata API'yi bozmaz
  } catch {
    govde.egilim = null;
  }
  return govde;
}

// gun parametresi: tam sayı değilse varsayılan, aksi halde [en az, en çok] aralığına sıkıştırılır.
function sinirliGun(deger, enAz, enCok, varsayilan) {
  const n = Number.parseInt(deger ?? '', 10);
  if (!Number.isFinite(n)) return varsayilan;
  return Math.min(enCok, Math.max(enAz, n));
}

async function aktiviteler(url, env, simdiMs, cors) {
  const gun = sinirliGun(url.searchParams.get('gun'), 7, 400, 56);
  const bugun = yerelTarih(simdiMs);
  const satirlar = await aktiviteleriOku(env.DB, aktiviteOkumaBasi(bugun, gun), bugun);
  return yanit(aktiviteYaniti(satirlar, bugun, gun), 200, cors);
}

async function takvim(url, env, simdiMs, cors) {
  const gun = sinirliGun(url.searchParams.get('gun'), 28, 400, 400);
  const bugun = yerelTarih(simdiMs);
  const satirlar = await gunleriOku(env.DB, takvimOkumaBasi(bugun, gun), bugun);
  return yanit(takvimYaniti(satirlar, bugun, gun), 200, cors);
}

async function gunler(url, env, simdiMs, cors) {
  return yanit(await gunlerYaniti(env, simdiMs, gunSayisi(url.searchParams.get('gun'))), 200, cors);
}

const AYAR_ENFAZLA_BAYT = 1024;
const PUSH_ENFAZLA_BAYT = 2048;

// Gövdeyi akıştan okur; sınırı aşar aşmaz akışı iptal eder. Gövde yoksa ya da sınır aşılırsa null.
async function sinirliOku(request, enFazlaBayt) {
  if (!request.body) return null;
  const okuyucu = request.body.getReader();
  const parcalar = [];
  let toplam = 0;
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    toplam += value.byteLength;
    if (toplam > enFazlaBayt) {
      await okuyucu.cancel();
      return null;
    }
    parcalar.push(value);
  }
  const hepsi = new Uint8Array(toplam);
  let konum = 0;
  for (const p of parcalar) {
    hepsi.set(p, konum);
    konum += p.byteLength;
  }
  return new TextDecoder().decode(hepsi);
}

// Gövdeyi sınırla okuyup JSON nesnesine çevirir; geçersizse null.
async function jsonGovde(request, enFazlaBayt) {
  const bildirilen = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(bildirilen) && bildirilen > enFazlaBayt) return null;
  const metin = await sinirliOku(request, enFazlaBayt);
  if (metin === null) return null;
  let govde;
  try {
    govde = JSON.parse(metin);
  } catch {
    return null;
  }
  return govde && typeof govde === 'object' && !Array.isArray(govde) ? govde : null;
}

async function ayar(request, env, cors) {
  if (request.method === 'GET') {
    const yapayZeka = await yapayZekaAcik(env.DB);
    let abone = 0;
    try {
      abone = (await abonelikleriOku(env.DB)).length;
    } catch {
      abone = 0; // tablo henüz yoksa (Worker tablodan önce yayınlandıysa) ayar yine çalışır
    }
    return yanit({ yapayZeka, bildirim: { acikAnahtar: env.VAPID_PUBLIC_KEY || null, abone } }, 200, cors);
  }
  const govde = await jsonGovde(request, AYAR_ENFAZLA_BAYT);
  if (!govde || typeof govde.yapayZeka !== 'boolean') return yanit({ hata: 'gecersiz' }, 400, cors);
  await yapayZekaYaz(env.DB, govde.yapayZeka);
  return yanit({ yapayZeka: govde.yapayZeka }, 200, cors);
}

const B64URL = /^[A-Za-z0-9_-]+$/;

async function pushModulu(bag) {
  return bag?.push ?? await import('../push/gonder.js');
}

async function abonelik(request, env, simdiMs, cors, bag) {
  const govde = await jsonGovde(request, PUSH_ENFAZLA_BAYT);
  if (!govde) return yanit({ hata: 'gecersiz' }, 400, cors);
  const { endpoint, p256dh, auth } = govde;
  if (request.method === 'DELETE') {
    if (typeof endpoint !== 'string' || endpoint === '' || endpoint.length > 2048) return yanit({ hata: 'gecersiz' }, 400, cors);
    await abonelikSil(env.DB, endpoint);
    return yanit({ tamam: true }, 200, cors);
  }
  const alanlarGecerli = typeof endpoint === 'string'
    && typeof p256dh === 'string' && p256dh.length <= 256 && B64URL.test(p256dh)
    && typeof auth === 'string' && auth.length <= 128 && B64URL.test(auth);
  if (!alanlarGecerli) return yanit({ hata: 'gecersiz' }, 400, cors);
  const { ucNoktaGecerli } = await pushModulu(bag);
  if (!ucNoktaGecerli(endpoint)) return yanit({ hata: 'gecersiz' }, 400, cors);
  await abonelikYaz(env.DB, { endpoint, p256dh, auth }, simdiMs);
  return yanit({ tamam: true }, 200, cors);
}

const DENEME_BEKLEME_MS = 10000;

async function denemeBildirimi(env, simdiMs, cors, bag) {
  const abonelikler = await abonelikleriOku(env.DB);
  if (!abonelikler.length) return yanit({ gonderilen: 0, basarili: 0 }, 200, cors);
  if (!vapidAyari(env)) return yanit({ hata: 'yapilandirma' }, 503, cors);
  const son = await durumOku(env.DB, 'deneme_son');
  if (Number.isFinite(son) && simdiMs - son < DENEME_BEKLEME_MS) return yanit({ hata: 'bekle' }, 429, cors);
  await durumYaz(env.DB, 'deneme_son', simdiMs);
  const { pushGonder } = await pushModulu(bag);
  let asama;
  const sonuc = await herkeseGonder({
    db: env.DB, env, simdiMs, abonelikler,
    fetch: (...a) => fetch(...a),
    gonder: pushGonder,
    asamaBildir: (ad) => { asama = ad; },
    yuk: { baslik: 'Deneme bildirimi', govde: 'Bildirimler çalışıyor.', etiket: 'deneme', url: './' },
  });
  console.log(pushOzetSatiri(sonuc));
  return yanit({ gonderilen: sonuc.gonderilen, basarili: sonuc.basarili, asama: sonuc.basarili ? undefined : asama }, 200, cors);
}

async function durum(env, cors) {
  const imlec = await durumOku(env.DB, 'gecmis_imlec');
  return yanit({
    sonEsitleme: (await durumOku(env.DB, 'son_esitleme')) ?? null,
    keyDurum: (await durumOku(env.DB, 'key_durum')) ?? null,
    gecmisBitti: Boolean(imlec?.bitti),
  }, 200, cors);
}

// `bag.push` testlerde push çekirdeğinin yerine geçer ({ pushGonder, ucNoktaGecerli }).
export async function istekIsle(request, env, simdiMs, bag = null) {
  const cors = corsBasliklari(request, env);
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'X-Device-Key, Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    const url = new URL(request.url);
    const yol = url.pathname;
    const izinli = request.method === 'GET'
      || (request.method === 'PUT' && yol === '/api/ayar')
      || ((request.method === 'POST' || request.method === 'DELETE') && yol === '/api/abonelik')
      || (request.method === 'POST' && yol === '/api/deneme-bildirim');
    if (!izinli) return yanit({ hata: 'yontem' }, 405, cors);
    if (!(await anahtarGecerli(request.headers.get('X-Device-Key'), env.DEVICE_KEY))) {
      return yanit({ hata: 'yetkisiz' }, 401, cors);
    }
    if (url.pathname === '/api/ayar') return await ayar(request, env, cors);
    if (url.pathname === '/api/gunler') return await gunler(url, env, simdiMs, cors);
    if (url.pathname === '/api/aktiviteler') return await aktiviteler(url, env, simdiMs, cors);
    if (url.pathname === '/api/takvim') return await takvim(url, env, simdiMs, cors);
    if (url.pathname === '/api/durum') return await durum(env, cors);
    if (url.pathname === '/api/abonelik') return await abonelik(request, env, simdiMs, cors, bag);
    if (url.pathname === '/api/deneme-bildirim') return await denemeBildirimi(env, simdiMs, cors, bag);
    return yanit({ hata: 'bulunamadi' }, 404, cors);
  } catch (hata) {
    console.error(`${hata?.name}: ${hata?.message}`);
    return yanit({ hata: 'sunucu' }, 500, cors);
  }
}
