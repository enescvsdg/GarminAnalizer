// HTTP girişi: kimlik, CORS ve rotalar. Gizli değerler loga ve yanıta girmez.
import { apiYaniti } from '../stats/ozet.js';
import { gunleriOku, durumOku } from '../db.js';
import { yerelTarih, gunEkle } from '../zaman.js';

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
  return yanit(apiYaniti(satirlar, bugun, n, meta), 200, cors);
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
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'X-Device-Key',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    if (request.method !== 'GET') return yanit({ hata: 'yontem' }, 405, cors);
    if (!(await anahtarGecerli(request.headers.get('X-Device-Key'), env.DEVICE_KEY))) {
      return yanit({ hata: 'yetkisiz' }, 401, cors);
    }
    const url = new URL(request.url);
    if (url.pathname === '/api/gunler') return await gunler(url, env, simdiMs, cors);
    if (url.pathname === '/api/durum') return await durum(env, cors);
    return yanit({ hata: 'bulunamadi' }, 404, cors);
  } catch (hata) {
    console.error(`${hata?.name}: ${hata?.message}`);
    return yanit({ hata: 'sunucu' }, 500, cors);
  }
}
