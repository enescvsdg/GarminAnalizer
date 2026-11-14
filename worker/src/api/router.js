// HTTP girişi: kimlik, CORS ve rotalar. Gizli değerler loga ve yanıta girmez.
import { apiYaniti } from '../stats/ozet.js';
import { gunleriOku, durumOku } from '../db.js';
import { yerelTarih, gunEkle } from '../zaman.js';
import { yorumOku, yapayZekaAcik, yapayZekaYaz } from '../yorum/yorum.js';

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

async function gunler(url, env, simdiMs, cors) {
  const n = gunSayisi(url.searchParams.get('gun'));
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
  return yanit(govde, 200, cors);
}

const AYAR_ENFAZLA_BAYT = 1024;

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

async function ayar(request, env, cors) {
  if (request.method === 'GET') return yanit({ yapayZeka: await yapayZekaAcik(env.DB) }, 200, cors);
  const bildirilen = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(bildirilen) && bildirilen > AYAR_ENFAZLA_BAYT) return yanit({ hata: 'gecersiz' }, 400, cors);
  const metin = await sinirliOku(request, AYAR_ENFAZLA_BAYT);
  if (metin === null) return yanit({ hata: 'gecersiz' }, 400, cors);
  let govde;
  try {
    govde = JSON.parse(metin);
  } catch {
    return yanit({ hata: 'gecersiz' }, 400, cors);
  }
  if (!govde || typeof govde !== 'object' || Array.isArray(govde) || typeof govde.yapayZeka !== 'boolean') {
    return yanit({ hata: 'gecersiz' }, 400, cors);
  }
  await yapayZekaYaz(env.DB, govde.yapayZeka);
  return yanit({ yapayZeka: govde.yapayZeka }, 200, cors);
}

async function durum(env, cors) {
  const imlec = await durumOku(env.DB, 'gecmis_imlec');
  return yanit({
    sonEsitleme: (await durumOku(env.DB, 'son_esitleme')) ?? null,
    keyDurum: (await durumOku(env.DB, 'key_durum')) ?? null,
    gecmisBitti: Boolean(imlec?.bitti),
  }, 200, cors);
}

export async function istekIsle(request, env, simdiMs) {
  const cors = corsBasliklari(request, env);
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'X-Device-Key, Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    const url = new URL(request.url);
    const izinli = request.method === 'GET' || (request.method === 'PUT' && url.pathname === '/api/ayar');
    if (!izinli) return yanit({ hata: 'yontem' }, 405, cors);
    if (!(await anahtarGecerli(request.headers.get('X-Device-Key'), env.DEVICE_KEY))) {
      return yanit({ hata: 'yetkisiz' }, 401, cors);
    }
    if (url.pathname === '/api/ayar') return await ayar(request, env, cors);
    if (url.pathname === '/api/gunler') return await gunler(url, env, simdiMs, cors);
    if (url.pathname === '/api/durum') return await durum(env, cors);
    return yanit({ hata: 'bulunamadi' }, 404, cors);
  } catch (hata) {
    console.error(`${hata?.name}: ${hata?.message}`);
    return yanit({ hata: 'sunucu' }, 500, cors);
  }
}
