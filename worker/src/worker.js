// Cloudflare Workers girişi: ince yapıştırıcı.
import { istekIsle, gunlerYaniti } from './api/router.js';
import { zamanliEsitle } from './zamanlama.js';
import { esitle } from './garmin/sync.js';
import { garminIstemci } from './garmin/client.js';
import { durumOku, durumYaz, gunleriOku } from './db.js';
import { yerelTarih, gunEkle } from './zaman.js';
import { geminiYaz } from './yorum/gemini.js';
import { yorumGuncelle, SISTEM, SEMA } from './yorum/yorum.js';
import { brifingGerekli, brifingGonder, keyUyarisi } from './brifing.js';
import { egilimGuncelle, EGILIM_SISTEM, EGILIM_SEMA } from './yorum/egilim.js';

const hataYaz = (h) => console.error(`${h?.name}: ${h?.message}`);

// Gemini bir süs katmanıdır: hata eşitleme sonucunu etkilemez. Log yalnız durum ve aşama/HTTP kodudur.
async function yorumBolumu(env, simdiMs) {
  try {
    const bugun = yerelTarih(simdiMs);
    const satirlar = await gunleriOku(env.DB, gunEkle(bugun, -60), bugun);
    const gunluk = ({ asama, kod }) => console.log(`gemini: ${asama}${kod === undefined ? '' : ` ${kod}`}`);
    const yaz = (girdi) => geminiYaz({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      fetch: (...a) => fetch(...a),
      sistem: SISTEM,
      girdi,
      sema: SEMA,
      gunluk,
    });
    const { durum } = await yorumGuncelle({ db: env.DB, satirlar, bugun, simdiMs, yaz });
    console.log(`yorum: ${durum}`);
  } catch (h) {
    hataYaz(h);
  }
}

// Eğilim yorumu hüküm yorumundan bağımsızdır: biri diğerinin hatasından etkilenmez.
async function egilimBolumu(env, simdiMs) {
  try {
    const bugun = yerelTarih(simdiMs);
    const satirlar = await gunleriOku(env.DB, gunEkle(bugun, -60), bugun);
    const gunluk = ({ asama, kod }) => console.log(`gemini: ${asama}${kod === undefined ? '' : ` ${kod}`}`);
    const yaz = (girdi) => geminiYaz({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      fetch: (...a) => fetch(...a),
      sistem: EGILIM_SISTEM,
      girdi,
      sema: EGILIM_SEMA,
      gunluk,
      zamanAsimiMs: 60_000, // Dokuz ölçümlük ilk canlı istekte 20 saniye yetmedi.
      maksCikti: 2400, // dokuz kısa yorum
    });
    const { durum } = await egilimGuncelle({ db: env.DB, satirlar, bugun, simdiMs, yaz });
    console.log(`egilim: ${durum}`);
  } catch (h) {
    hataYaz(h);
  }
}

// Bugünün uyku puanı dolu görüldüğünde işaretlenir; zamanlama sabah sık bakmayı bırakır.
async function uykuGunBolumu(env, simdiMs) {
  try {
    const bugun = yerelTarih(simdiMs);
    const satirlar = await gunleriOku(env.DB, bugun, bugun);
    const dolu = Number.isFinite(satirlar[0]?.sleep_score);
    if (dolu && (await durumOku(env.DB, 'uyku_gun')) !== bugun) await durumYaz(env.DB, 'uyku_gun', bugun);
  } catch (h) {
    hataYaz(h);
  }
}

async function brifingBolumu(env, simdiMs) {
  try {
    const bugun = yerelTarih(simdiMs);
    const satirlar = await gunleriOku(env.DB, gunEkle(bugun, -60), bugun);
    if (!(await brifingGerekli({ db: env.DB, satirlar, bugun, simdiMs }))) return;
    const yanit = await gunlerYaniti(env, simdiMs, 28);
    const { durum } = await brifingGonder({ db: env.DB, env, yanit, satirlar, bugun, simdiMs, fetch: (...a) => fetch(...a), gunluk: (l) => console.log(l) });
    console.log(`brifing: ${durum}`);
  } catch (h) {
    hataYaz(h);
  }
}

async function uyariBolumu(env, simdiMs) {
  try {
    const { durum } = await keyUyarisi({ db: env.DB, env, simdiMs, fetch: (...a) => fetch(...a), gunluk: (l) => console.log(l) });
    if (durum !== 'yok') console.log(`uyari: ${durum}`);
  } catch (h) {
    hataYaz(h);
  }
}

export default {
  async fetch(request, env) {
    return istekIsle(request, env, Date.now());
  },

  async scheduled(event, env, ctx) {
    const simdiMs = Date.now();
    const istemci = garminIstemci({
      apiKey: env.GARMIN_PERSONAL_API_KEY,
      fetch: (...a) => fetch(...a),
      tokenOku: () => durumOku(env.DB, 'garmin_token'),
      tokenYaz: (t) => durumYaz(env.DB, 'garmin_token', t),
      simdi: () => Math.floor(Date.now() / 1000), // client.js saniye bekler
    });
    let neden = null; // key reddinde Garmin'in HTTP kodu (teşhis için); sağlık verisi ya da gizli değer içermez
    const calistir = async () => {
      const r = await esitle({ istemci, db: env.DB, simdiMs });
      neden = r.neden ?? null;
      return r;
    };
    const tik = async () => {
      await zamanliEsitle({ db: env.DB, simdiMs, calistir })
        .then(async (s) => {
          console.log(s.calisti ? `esitleme: ${s.durum}${neden ? ` (${neden})` : ''}` : `atlandi: ${s.neden}`);
          // 'kismi': bir uç nokta hata verse de diğerlerinden gelen veriyle yorum yazılır (kalıcı tek uç nokta hatası yorumu kilitlemesin)
          if (s.calisti && (s.durum === 'tamam' || s.durum === 'kismi') && env.GEMINI_API_KEY) {
            await yorumBolumu(env, simdiMs);
            await egilimBolumu(env, simdiMs);
          }
        })
        .catch(hataYaz);
      // Eşitleme atlansa ya da başarısız olsa da bu adımlar çalışır (brifing yeniden denemesi, key uyarısı).
      await uykuGunBolumu(env, simdiMs);
      await brifingBolumu(env, simdiMs);
      await uyariBolumu(env, simdiMs);
    };
    ctx.waitUntil(tik());
  },
};
