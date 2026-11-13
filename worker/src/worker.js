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
    ctx.waitUntil(
      zamanliEsitle({ db: env.DB, simdiMs, calistir: () => esitle({ istemci, db: env.DB, simdiMs }) })
        .then((s) => console.log(s.calisti ? `esitleme: ${s.durum}` : `atlandi: ${s.neden}`))
        .catch(hataYaz),
    );
  },
};
