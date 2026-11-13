// Gerçek veri katmanı: Worker yanıtını arayüzün VERI biçimine çevirir, bağlantıyı saklar.
// Tarayıcıda ES modülü olarak yüklenir ve window.CANLI olur; Node'da içe aktarılıp test edilir.
// Cihaz anahtarı yalnızca X-Device-Key başlığına gider; URL'ye, loga ve hata iletisine girmez.

const BAGLANTI_ANAHTARI = 'gk-baglanti';
const GUN_SAYISI = 28;
const EN_AZ_GUN = 7;
const ZAMAN_ASIMI_MS = 6000;
const ESKI_SAAT = 12;

export const GUN_KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export const GUN_UZUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export const OK = {
  lo: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1v8M1.5 5.5L5 9l3.5-3.5"/></svg>',
  hi: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 9V1M1.5 4.5L5 1l3.5 3.5"/></svg>',
};
export const DURUM_METIN = { lo: 'altında', hi: 'üstünde', ok: 'normalde' };

const sonlu = (v) => typeof v === 'number' && Number.isFinite(v);
const say = (v) => (sonlu(v) ? v : null);
const metinMi = (v) => typeof v === 'string' && v.length > 0;

// v null/undefined/NaN ise null (gerçek 0 veri yok değildir); aksi halde bant sınırlarına göre.
export function durum(o, v) {
  if (!sonlu(v)) return null;
  return v < o.min ? 'lo' : v > o.max ? 'hi' : 'ok';
}

// 'YYYY-MM-DD' -> yerel gün 00:00. new Date('YYYY-MM-DD') UTC kayması yapar, kullanılmaz.
function yerelGun(tarih) {
  const m = typeof tarih === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(tarih);
  if (!m) throw new TypeError('tarih biçimi geçersiz');
  const y = Number(m[1]); const a = Number(m[2]); const g = Number(m[3]);
  const t = new Date(y, a - 1, g);
  if (t.getFullYear() !== y || t.getMonth() !== a - 1 || t.getDate() !== g) throw new TypeError('tarih geçersiz');
  return t;
}

function ekKur(ek) {
  const e = ek && typeof ek === 'object' ? ek : {};
  const k = (n) => (e[n] && typeof e[n] === 'object' ? e[n] : {});
  return {
    uyku: { derin: say(k('uyku').derin), hafif: say(k('uyku').hafif), rem: say(k('uyku').rem), uyanik: say(k('uyku').uyanik), ihtiyac: say(k('uyku').ihtiyac) },
    bb: { dolan: say(k('bb').dolan), biten: say(k('bb').biten) },
    stres: { dinlenme: say(k('stres').dinlenme), dusuk: say(k('stres').dusuk), orta: say(k('stres').orta), yuksek: say(k('stres').yuksek) },
    hrv: { durum: metinMi(k('hrv').durum) ? k('hrv').durum : null, haftalik: say(k('hrv').haftalik) },
  };
}

export function veriCevir(yanit) {
  if (!yanit || typeof yanit !== 'object' || !Array.isArray(yanit.olcumler) || !Array.isArray(yanit.gunler)) {
    throw new TypeError('yanıt biçimi geçersiz');
  }
  if (!yanit.olcumler.length || yanit.gunler.length < EN_AZ_GUN) throw new TypeError('yanıt eksik');
  const OLCUMLER = yanit.olcumler.map((o) => {
    if (!o || !metinMi(o.id) || !metinMi(o.ad) || typeof o.birim !== 'string' || !sonlu(o.iyi) || !sonlu(o.min) || !sonlu(o.max)) {
      throw new TypeError('ölçüm geçersiz');
    }
    return { id: o.id, ad: o.ad, birim: o.birim, min: o.min, max: o.max, iyi: o.iyi, kisisel: o.kisisel === true, kart: o.kart === true };
  });
  const GUNLER = yanit.gunler.map((g) => {
    if (!g || typeof g !== 'object') throw new TypeError('gün geçersiz');
    const tarih = yerelGun(g.tarih);
    const d = {};
    for (const o of OLCUMLER) d[o.id] = say(g.d?.[o.id]);
    const veriYok = !sonlu(g.e);
    const e = veriYok ? 0.5 : Math.min(1, Math.max(0, g.e));
    return {
      tarih, gunKisa: GUN_KISA[tarih.getDay()], gunUzun: GUN_UZUN[tarih.getDay()],
      gun: tarih.getDate(), ay: AY[tarih.getMonth()],
      e, d,
      hukum: !veriYok && metinMi(g.hukum) ? g.hukum : 'Bugün için yeterli veri yok.',
      gerekce: !veriYok && typeof g.gerekce === 'string' ? g.gerekce : '',
      ek: ekKur(g.ek), veriYok,
    };
  });
  return {
    OLCUMLER, GUNLER, durum, OK, DURUM_METIN,
    meta: { sonEsitleme: say(yanit.sonEsitleme), keyDurum: metinMi(yanit.keyDurum) ? yanit.keyDurum : null },
  };
}

/* ---------- Bağlantı (localStorage['gk-baglanti'] = {adres, anahtar}) ---------- */

// https zorunlu; yalnızca http://localhost (yerel geliştirme) istisna. Kimlik bilgisi, sorgu ve parça reddedilir.
export function adresDuzelt(adres) {
  if (typeof adres !== 'string') return null;
  let u;
  try { u = new URL(adres.trim()); } catch { return null; }
  const yerel = u.protocol === 'http:' && u.hostname === 'localhost';
  if (u.protocol !== 'https:' && !yerel) return null;
  if (u.username || u.password || u.search || u.hash || !u.hostname) return null;
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

const varsayilanDepo = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

export function baglantiOku(depo = varsayilanDepo()) {
  try {
    const s = depo?.getItem(BAGLANTI_ANAHTARI);
    if (!s) return null;
    const o = JSON.parse(s);
    if (!o || typeof o.adres !== 'string' || typeof o.anahtar !== 'string' || !o.adres || !o.anahtar) return null;
    return { adres: o.adres, anahtar: o.anahtar };
  } catch { return null; }
}

// Ayarlar'da "Bağlan" kararı: adres değiştiyse kayıtlı anahtar yeniden kullanılmaz.
export function baglantiKarar({ adres, anahtar, kayitli } = {}) {
  const a = adresDuzelt(adres);
  if (!a) return { tamam: false, hata: 'Adres https:// ile başlamalı.' };
  const k = typeof anahtar === 'string' ? anahtar.trim() : '';
  if (k) return { tamam: true, baglanti: { adres: a, anahtar: k } };
  if (!kayitli || typeof kayitli.anahtar !== 'string' || !kayitli.anahtar) return { tamam: false, hata: 'Cihaz anahtarını gir.' };
  if (adresDuzelt(kayitli.adres) !== a) return { tamam: false, hata: 'Adres değişti. Cihaz anahtarını yeniden gir.' };
  return { tamam: true, baglanti: { adres: a, anahtar: kayitli.anahtar } };
}

export function baglantiYaz({ adres, anahtar } = {}, depo = varsayilanDepo()) {
  const a = adresDuzelt(adres);
  const k = typeof anahtar === 'string' ? anahtar.trim() : '';
  if (!a || !k || !depo) return false;
  try { depo.setItem(BAGLANTI_ANAHTARI, JSON.stringify({ adres: a, anahtar: k })); return true; } catch { return false; }
}

export function baglantiSil(depo = varsayilanDepo()) {
  try { depo?.removeItem(BAGLANTI_ANAHTARI); } catch { /* depo yok ya da erişilemiyor */ }
}

// Bağlantı yoksa, adres geçersizse, ağ/HTTP/JSON hatasında ya da zaman aşımında null. Hiçbir durumda fırlatmaz.
export async function veriGetir(fetchFn = globalThis.fetch, depo = varsayilanDepo(), { zamanAsimiMs = ZAMAN_ASIMI_MS } = {}) {
  const b = baglantiOku(depo);
  const adres = b && adresDuzelt(b.adres);
  if (!b || !adres || typeof fetchFn !== 'function') return null;
  const kontrol = typeof AbortController === 'function' ? new AbortController() : null;
  let sayac;
  try {
    const istek = (async () => {
      const r = await fetchFn(`${adres}/api/gunler?gun=${GUN_SAYISI}`, {
        method: 'GET', headers: { 'X-Device-Key': b.anahtar, Accept: 'application/json' },
        cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: kontrol?.signal,
      });
      if (!r || r.ok !== true || (r.status !== undefined && r.status !== 200)) return null;
      return veriCevir(await r.json());
    })();
    const sure = new Promise((coz) => { sayac = setTimeout(() => { kontrol?.abort(); coz(null); }, zamanAsimiMs); });
    return await Promise.race([istek, sure]);
  } catch { return null; } finally { clearTimeout(sayac); }
}

/* ---------- Biçimleme ---------- */

// 60 dk'ya kadar "45 dk", üstü "8s 10dk"; null/geçersiz null.
export function sureMetni(dk) {
  if (!sonlu(dk)) return null;
  const t = Math.round(dk);
  if (t <= 60) return `${t} dk`;
  const s = Math.floor(t / 60); const k = t % 60;
  return k ? `${s}s ${k}dk` : `${s}s`;
}

// "12 Kas 07:15" (Europe/Istanbul)
export function sonEsitlemeMetni(ms) {
  if (!sonlu(ms)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(ms).map((x) => [x.type, x.value]));
  return `${Number(p.day)} ${AY_KISA[Number(p.month) - 1]} ${p.hour}:${p.minute}`;
}

// Son eşitleme 12 saatten eskiyse geçen tam saat, değilse null.
export function eskilikSaat(sonEsitleme, simdi = Date.now()) {
  if (!sonlu(sonEsitleme) || !sonlu(simdi)) return null;
  const fark = simdi - sonEsitleme;
  return fark > ESKI_SAAT * 3600e3 ? Math.floor(fark / 3600e3) : null;
}

const UYKU_DILIMLERI = [['derin', 'Derin'], ['hafif', 'Hafif'], ['rem', 'REM'], ['uyanik', 'Uyanık']];
const STRES_DILIMLERI = [['dinlenme', 'Dinlenme'], ['dusuk', 'Düşük'], ['orta', 'Orta'], ['yuksek', 'Yüksek']];

function dilimle(kaynak, tanim) {
  const dilimler = tanim
    .filter(([id]) => sonlu(kaynak[id]))
    .map(([id, etiket]) => ({ id, etiket, dk: kaynak[id], metin: sureMetni(kaynak[id]) }));
  return dilimler.some((d) => d.dk > 0) ? dilimler : null;
}

// Trend'de seçili günün ek ayrıntı satırı. Gösterilecek bir şey yoksa null (satır DOM'a girmez).
// { dilimler: [{id, etiket, dk, metin}]|null, metin: string|null }
export function ekSatiri(olcumId, ek) {
  if (!ek || typeof ek !== 'object') return null;
  let dilimler = null; let metin = null;
  if (olcumId === 'uyku' && ek.uyku) {
    dilimler = dilimle(ek.uyku, UYKU_DILIMLERI);
    if (sonlu(ek.uyku.ihtiyac)) metin = `İhtiyaç: ${sureMetni(ek.uyku.ihtiyac)}`;
  } else if (olcumId === 'stres' && ek.stres) {
    dilimler = dilimle(ek.stres, STRES_DILIMLERI);
  } else if (olcumId === 'bb' && ek.bb) {
    const parcalar = [];
    if (sonlu(ek.bb.dolan)) parcalar.push(`+${Math.abs(ek.bb.dolan)} doldu`);
    if (sonlu(ek.bb.biten)) parcalar.push(`−${Math.abs(ek.bb.biten)} bitti`);
    metin = parcalar.length ? parcalar.join(', ') : null;
  } else if (olcumId === 'hrv' && ek.hrv) {
    if (sonlu(ek.hrv.haftalik)) metin = `Haftalık ortalama ${ek.hrv.haftalik} ms`;
  }
  return dilimler || metin ? { dilimler, metin } : null;
}

export const CANLI = {
  veriCevir, durum, veriGetir, baglantiOku, baglantiYaz, baglantiSil, baglantiKarar, adresDuzelt,
  sureMetni, sonEsitlemeMetni, eskilikSaat, ekSatiri, OK, DURUM_METIN,
};
globalThis.CANLI = CANLI;
