// Enerji skoru, şablon hüküm/gerekçe ve API gövdesi. Saf fonksiyonlar.
import { gunEkle } from '../zaman.js';
import { OLCUMLER, gunDegerleri, bant, durum, dolu } from './baseline.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function enerji(degerler, bantlar) {
  let toplam = 0;
  let agirlik = 0;
  let n = 0;
  for (const o of OLCUMLER) {
    if (!(o.agirlik > 0)) continue;
    const v = degerler[o.id];
    if (!dolu(v)) continue;
    const b = bantlar[o.id];
    const g = clamp(0.5 + 0.25 * o.iyi * (v - b.medyan) / (1.5 * b.sigma), 0, 1);
    toplam += o.agirlik * g;
    agirlik += o.agirlik;
    n += 1;
  }
  if (n < 3) return null;
  return Math.round((toplam / agirlik) * 1000) / 1000;
}

export function hukum(e) {
  if (e === null || e === undefined) return 'Bugün için yeterli veri yok.';
  if (e < 0.3) return 'Bugün hafif tut.';
  if (e < 0.48) return 'Yavaşla.';
  if (e < 0.62) return 'Dengeli bir gün.';
  if (e < 0.85) return 'İyi gidiyorsun.';
  return 'Tam gaz.';
}

export function gerekce(degerler, bantlar) {
  const kartlar = OLCUMLER.filter((o) => o.kart);
  if (!kartlar.some((o) => dolu(degerler[o.id]))) return 'Saat verisi gelmemiş.';
  const disarida = [];
  for (const o of kartlar) {
    const d = durum(bantlar[o.id], dolu(degerler[o.id]) ? degerler[o.id] : null);
    if (d === 'lo' || d === 'hi') disarida.push({ o, d });
  }
  if (!disarida.length) return 'Bütün ölçümlerin normal aralığında.';
  if (disarida.length === 1) {
    const { o, d } = disarida[0];
    return `${o.ad} normalinin ${d === 'lo' ? 'altında' : 'üstünde'}, gerisi yerinde.`;
  }
  const adlar = disarida.map(({ o }) => o.ad.toLocaleLowerCase('tr'));
  const liste = `${adlar.slice(0, -1).join(', ')} ve ${adlar[adlar.length - 1]}`;
  return `${disarida.length} ölçümün normal aralığının dışında: ${liste}.`;
}

const say = (v) => (dolu(v) ? v : null);
const dk = (v) => (dolu(v) ? Math.round(v / 60) : null);

function ekKur(satirlar, tarih) {
  const r = satirlar.find((x) => x.date === tarih) ?? {};
  return {
    uyku: { toplam: dk(r.sleep_seconds), derin: dk(r.sleep_deep_s), hafif: dk(r.sleep_light_s), rem: dk(r.sleep_rem_s), uyanik: dk(r.sleep_awake_s), ihtiyac: say(r.sleep_need_min) },
    bb: { dolan: say(r.bb_charged), biten: say(r.bb_drained) },
    stres: { dinlenme: dk(r.stress_rest_s), dusuk: dk(r.stress_low_s), orta: dk(r.stress_med_s), yuksek: dk(r.stress_high_s) },
    hrv: { durum: typeof r.hrv_status === 'string' && r.hrv_status ? r.hrv_status : null, haftalik: say(r.hrv_weekly_avg) },
  };
}

const bantlariKur = (satirlar, tarih) =>
  Object.fromEntries(OLCUMLER.map((o) => [o.id, bant(satirlar, o, tarih)]));

export function apiYaniti(satirlar, bugun, gunSayisi, meta) {
  const bugunBant = bantlariKur(satirlar, bugun);
  const gunler = [];
  for (let i = gunSayisi - 1; i >= 0; i -= 1) {
    const tarih = gunEkle(bugun, -i);
    const d = gunDegerleri(satirlar, tarih);
    const bantlar = bantlariKur(satirlar, tarih); // o günün kendi bandı
    const e = enerji(d, bantlar);
    // Enerji hesaplanamıyorsa gerekçe de "veri yok" der; dünkü yük gibi tek bir ölçüm çelişkili cümle kurmasın.
    gunler.push({ tarih, e, hukum: hukum(e), gerekce: e === null ? gerekce({}, bantlar) : gerekce(d, bantlar), d, ek: ekKur(satirlar, tarih) });
  }
  return {
    bugun,
    sonEsitleme: meta?.sonEsitleme ?? null,
    keyDurum: meta?.keyDurum ?? null,
    olcumler: OLCUMLER.map((o) => ({
      id: o.id, ad: o.ad, birim: o.birim, iyi: o.iyi,
      min: bugunBant[o.id].min, max: bugunBant[o.id].max, kisisel: bugunBant[o.id].kisisel, kart: o.kart,
    })),
    gunler,
  };
}
