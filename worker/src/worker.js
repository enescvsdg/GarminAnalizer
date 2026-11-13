// Cloudflare Workers girişi: ince yapıştırıcı.
import { istekIsle } from './api/router.js';
import { zamanliEsitle } from './zamanlama.js';
import { esitle } from './garmin/sync.js';
import { garminIstemci } from './garmin/client.js';
import { durumOku, durumYaz } from './db.js';

const hataYaz = (h) => console.error(`${h?.name}: ${h?.message}`);

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
    ctx.waitUntil(
      zamanliEsitle({ db: env.DB, simdiMs, calistir })
        .then((s) => console.log(s.calisti ? `esitleme: ${s.durum}${neden ? ` (${neden})` : ''}` : `atlandi: ${s.neden}`))
        .catch(hataYaz),
    );
  },
};
