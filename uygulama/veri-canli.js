// Gerçek veri katmanı: Worker yanıtını arayüzün VERI biçimine çevirir, bağlantıyı saklar.
// Tarayıcıda ES modülü olarak yüklenir ve window.CANLI olur; Node'da içe aktarılıp test edilir.
// Cihaz anahtarı yalnızca X-Device-Key başlığına gider; URL'ye, loga ve hata iletisine girmez.

const BAGLANTI_ANAHTARI = 'gk-baglanti';
const SON_VERI_ANAHTARI = 'gk-son-veri';
const SON_AKTIVITE_ANAHTARI = 'gk-son-aktivite';
const SON_TAKVIM_ANAHTARI = 'gk-son-takvim';
const SON_VERI_SINIR = 400 * 1024;
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
    uyku: { toplam: say(k('uyku').toplam), derin: say(k('uyku').derin), hafif: say(k('uyku').hafif), rem: say(k('uyku').rem), uyanik: say(k('uyku').uyanik), ihtiyac: say(k('uyku').ihtiyac), sekerleme: say(k('uyku').sekerleme), stres: say(k('uyku').stres) },
    bb: { dolan: say(k('bb').dolan), biten: say(k('bb').biten) },
    stres: { dinlenme: say(k('stres').dinlenme), dusuk: say(k('stres').dusuk), orta: say(k('stres').orta), yuksek: say(k('stres').yuksek) },
    hrv: { durum: metinMi(k('hrv').durum) ? k('hrv').durum : null, haftalik: say(k('hrv').haftalik) },
    spo2: { en_dusuk: say(k('spo2').en_dusuk) },
    kalori: { toplam: say(k('kalori').toplam) },
  };
}

const SAYIM_IDLERI = new Set(['adim', 'kat', 'kalori', 'yogun']);

export function veriCevir(yanit) {
  if (!yanit || typeof yanit !== 'object' || !Array.isArray(yanit.olcumler) || !Array.isArray(yanit.gunler)) {
    throw new TypeError('yanıt biçimi geçersiz');
  }
  if (!yanit.olcumler.length || yanit.gunler.length < EN_AZ_GUN) throw new TypeError('yanıt eksik');
  const OLCUMLER = yanit.olcumler.map((o) => {
    if (!o || !metinMi(o.id) || !metinMi(o.ad) || typeof o.birim !== 'string' || !sonlu(o.iyi) || !sonlu(o.min) || !sonlu(o.max)) {
      throw new TypeError('ölçüm geçersiz');
    }
    // Sayım ölçümlerinin kişisel bandı sıfırın altına düşebilir (ör. kat −2); çizilen bant ve etiketi 0'dan başlar.
    const min = SAYIM_IDLERI.has(o.id) ? Math.max(0, o.min) : o.min;
    return { id: o.id, ad: o.ad, birim: o.birim, min, max: Math.max(min, o.max), iyi: o.iyi, kisisel: o.kisisel === true, kart: o.kart === true };
  });
  // Eski Worker'lar bu alanı vermeyebilir. Yalnızca bu yanıttaki ölçümlerin
  // bilinen dokuz kimliğini ve metin yorumlarını aktar; başka şekiller boş kalır.
  const EGILIM_IDLERI = new Set(['uyku', 'bb', 'hrv', 'nabiz', 'stres', 'yuk', 'derin', 'spo2', 'solunum']);
  const egilim = {};
  if (yanit.egilim && typeof yanit.egilim === 'object' && !Array.isArray(yanit.egilim)) {
    for (const o of OLCUMLER) {
      if (EGILIM_IDLERI.has(o.id) && typeof yanit.egilim[o.id] === 'string') egilim[o.id] = yanit.egilim[o.id];
    }
  }
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
    meta: {
      sonEsitleme: say(yanit.sonEsitleme), keyDurum: metinMi(yanit.keyDurum) ? yanit.keyDurum : null,
      yorumKaynak: yanit.yorumKaynak === 'gemini' ? 'gemini' : 'sablon',
      egilim,
    },
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
  const onceki = baglantiOku(depo);
  try { depo.setItem(BAGLANTI_ANAHTARI, JSON.stringify({ adres: a, anahtar: k })); } catch { return false; }
  // Başka bir Worker başka veridir: adres değiştiyse eski adresin son verisi kalmaz.
  if (!onceki || adresDuzelt(onceki.adres) !== a) tumOnbellekSil(depo);
  return true;
}

// Bağlantıyı kaldırınca cihazda sağlık verisi de kalmaz.
export function baglantiSil(depo = varsayilanDepo()) {
  try { depo?.removeItem(BAGLANTI_ANAHTARI); } catch { /* depo yok ya da erişilemiyor */ }
  tumOnbellekSil(depo);
}

/* ---------- Son veri önbelleği (localStorage['gk-son-veri'] = {zaman, yanit}) ---------- */
// yanit Worker'ın HAM yanıtıdır (veriCevir yükleme anında çalışır); cihaz anahtarı içermez, çünkü yanıtta anahtar yoktur.

export function sonVeriYaz(yanit, simdiMs, depo = varsayilanDepo()) {
  if (!depo || !yanit || typeof yanit !== 'object' || !sonlu(simdiMs)) return false;
  try {
    const dizgi = JSON.stringify({ zaman: simdiMs, yanit });
    const bayt = typeof TextEncoder === 'function' ? new TextEncoder().encode(dizgi).length : dizgi.length;
    if (bayt > SON_VERI_SINIR) return false;
    depo.setItem(SON_VERI_ANAHTARI, dizgi);
    return true;
  } catch { return false; }
}

export function sonVeriOku(depo = varsayilanDepo()) {
  try {
    const s = depo?.getItem(SON_VERI_ANAHTARI);
    if (!s) return null;
    const o = JSON.parse(s);
    if (!o || !sonlu(o.zaman) || !o.yanit || typeof o.yanit !== 'object' || Array.isArray(o.yanit)) return null;
    return { zaman: o.zaman, yanit: o.yanit };
  } catch { return null; }
}

export function sonVeriSil(depo = varsayilanDepo()) {
  try { depo?.removeItem(SON_VERI_ANAHTARI); } catch { /* depo yok ya da erişilemiyor */ }
}

// Gün verisi, aktiviteler ve takvim önbelleklerinin hepsi: bağlantı kalkınca ya da Worker değişince cihazda sağlık verisi kalmaz.
export function tumOnbellekSil(depo = varsayilanDepo()) {
  sonVeriSil(depo);
  for (const k of [SON_AKTIVITE_ANAHTARI, SON_TAKVIM_ANAHTARI]) {
    try { depo?.removeItem(k); } catch { /* depo yok ya da erişilemiyor */ }
  }
}

// Ortak istek. Sonuç {sonuc, neden}: sonuc isle(json) çıktısı ya da null; neden başarısızlığın türü:
// null (başarı ya da bağlantı hiç yok), 'yetki' (HTTP 401), 'sunucu' (başka HTTP durumu, bozuk JSON/biçim), 'ag' (ağ, zaman aşımı, adres).
// Fırlatmaz. Anahtar yalnızca X-Device-Key başlığına gider. isle(json) geçersiz yanıtta fırlatır.
async function istekCoz(yol, { method = 'GET', govde } = {}, isle, fetchFn, depo, zamanAsimiMs) {
  const b = baglantiOku(depo);
  if (!b) return { sonuc: null, neden: null };
  const adres = adresDuzelt(b.adres);
  if (!adres || typeof fetchFn !== 'function') return { sonuc: null, neden: 'ag' };
  const basliklar = { 'X-Device-Key': b.anahtar, Accept: 'application/json' };
  if (govde !== undefined) basliklar['Content-Type'] = 'application/json';
  const kontrol = typeof AbortController === 'function' ? new AbortController() : null;
  let sayac;
  try {
    const istek = (async () => {
      const r = await fetchFn(`${adres}${yol}`, {
        method, headers: basliklar, ...(govde !== undefined ? { body: govde } : {}),
        cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: kontrol?.signal,
      });
      if (!r) return { sonuc: null, neden: 'ag' };
      if (r.status === 401) return { sonuc: null, neden: 'yetki' };
      if (r.status === 429) return { sonuc: null, neden: 'bekle' };
      if (r.ok !== true || (r.status !== undefined && r.status !== 200)) return { sonuc: null, neden: 'sunucu' };
      try { return { sonuc: isle(await r.json()), neden: null }; } catch { return { sonuc: null, neden: 'sunucu' }; }
    })();
    const sure = new Promise((coz) => { sayac = setTimeout(() => { kontrol?.abort(); coz({ sonuc: null, neden: 'ag' }); }, zamanAsimiMs); });
    return await Promise.race([istek, sure]);
  } catch { return { sonuc: null, neden: 'ag' }; } finally { clearTimeout(sayac); }
}

// Eski sözleşme: başarıda isle çıktısı, her başarısızlıkta null.
async function istekYap(yol, secenek, isle, fetchFn, depo, zamanAsimiMs) {
  return (await istekCoz(yol, secenek, isle, fetchFn, depo, zamanAsimiMs)).sonuc;
}

export function veriGetir(fetchFn = globalThis.fetch, depo = varsayilanDepo(), { zamanAsimiMs = ZAMAN_ASIMI_MS } = {}) {
  return istekYap(`/api/gunler?gun=${GUN_SAYISI}`, {}, veriCevir, fetchFn, depo, zamanAsimiMs);
}

// Açılış verisi: canlı denenir; olmazsa son görülen gerçek veri; o da yoksa örnek veri için 'yok'.
// {veri: VERI|null, kaynak: 'canli'|'onbellek'|'yok', zaman: ms|null, neden: 'ag'|'yetki'|'sunucu'|null}. Asla fırlatmaz.
// zaman: canlıda şimdi, önbellekte verinin alındığı an.
export async function veriYukle(fetchFn = globalThis.fetch, depo = varsayilanDepo(), simdiMs = Date.now(), { zamanAsimiMs = ZAMAN_ASIMI_MS } = {}) {
  const yok = (neden) => ({ veri: null, kaynak: 'yok', zaman: null, neden });
  try {
    const { sonuc, neden } = await istekCoz(
      `/api/gunler?gun=${GUN_SAYISI}`, {}, (j) => ({ ham: j, veri: veriCevir(j) }), fetchFn, depo, zamanAsimiMs,
    );
    if (sonuc) {
      sonVeriYaz(sonuc.ham, simdiMs, depo);
      return { veri: sonuc.veri, kaynak: 'canli', zaman: simdiMs, neden: null };
    }
    if (neden === null) return yok(null); // bağlantı hiç yok: örnek veri
    const o = sonVeriOku(depo);
    if (o) {
      try { return { veri: veriCevir(o.yanit), kaynak: 'onbellek', zaman: o.zaman, neden }; } catch { /* bozuk önbellek aşağıda silinir */ }
    }
    sonVeriSil(depo);
    return yok(neden);
  } catch { return yok('ag'); }
}

/* ---------- Aktiviteler ve Takvim (ayrı ekranlar; modüller kendi örnek verisini taşır) ---------- */
// İkisi de yanıt nesnesi ya da null döner, fırlatmaz. Başarılı son yanıt localStorage'a yazılır (gk-son-aktivite / gk-son-takvim);
// ağ, yetki ya da sunucu hatasında oradan dönülür. Bağlantı hiç yoksa null (modül örnek veri gösterir).

function tamGun(gun, varsayilan, en, cok) {
  return Number.isInteger(gun) && gun >= en && gun <= cok ? gun : varsayilan;
}

function aktiviteCevir(j) {
  if (!j || typeof j !== 'object' || !Array.isArray(j.aktiviteler) || !Array.isArray(j.haftalar)) throw new TypeError('aktivite yanıtı geçersiz');
  const b = j.yukBant;
  const yukBant = b && typeof b === 'object' && sonlu(b.min) && sonlu(b.max) ? { min: b.min, max: b.max } : null;
  return { aktiviteler: j.aktiviteler, haftalar: j.haftalar, yukBant };
}

function takvimCevir(j) {
  if (!j || typeof j !== 'object' || !Array.isArray(j.gunler)) throw new TypeError('takvim yanıtı geçersiz');
  return { gunler: j.gunler };
}

function onbellekYaz(anahtar, yanit, simdiMs, depo) {
  if (!depo) return false;
  try {
    const dizgi = JSON.stringify({ zaman: simdiMs, yanit });
    const bayt = typeof TextEncoder === 'function' ? new TextEncoder().encode(dizgi).length : dizgi.length;
    if (bayt > SON_VERI_SINIR) return false;
    depo.setItem(anahtar, dizgi);
    return true;
  } catch { return false; }
}

function onbellekOku(anahtar, cevir, depo) {
  try {
    const s = depo?.getItem(anahtar);
    if (!s) return null;
    const o = JSON.parse(s);
    return o && o.yanit ? cevir(o.yanit) : null;
  } catch { return null; }
}

async function listeGetir(yol, anahtar, cevir, fetchFn, depo, zamanAsimiMs) {
  try {
    const { sonuc, neden } = await istekCoz(yol, {}, cevir, fetchFn, depo, zamanAsimiMs);
    if (sonuc) { onbellekYaz(anahtar, sonuc, Date.now(), depo); return sonuc; }
    if (neden === null) return null; // bağlantı hiç yok
    return onbellekOku(anahtar, cevir, depo);
  } catch { return null; }
}

export function aktiviteGetir(gun = 56, fetchFn = globalThis.fetch, depo = varsayilanDepo(), { zamanAsimiMs = ZAMAN_ASIMI_MS } = {}) {
  return listeGetir(`/api/aktiviteler?gun=${tamGun(gun, 56, 7, 400)}`, SON_AKTIVITE_ANAHTARI, aktiviteCevir, fetchFn, depo, zamanAsimiMs);
}

export function takvimGetir(gun = 400, fetchFn = globalThis.fetch, depo = varsayilanDepo(), { zamanAsimiMs = ZAMAN_ASIMI_MS } = {}) {
  return listeGetir(`/api/takvim?gun=${tamGun(gun, 400, 28, 400)}`, SON_TAKVIM_ANAHTARI, takvimCevir, fetchFn, depo, zamanAsimiMs);
}

function ayarCevir(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.yapayZeka !== 'boolean') throw new TypeError('ayar geçersiz');
  return { yapayZeka: j.yapayZeka };
}

// Eski Worker'lar bildirim alanını hiç vermez: yoksa ya da bozuksa {acikAnahtar: null, abone: 0}.
function bildirimCevir(b) {
  const nesne = b && typeof b === 'object' && !Array.isArray(b);
  return {
    acikAnahtar: nesne && metinMi(b.acikAnahtar) ? b.acikAnahtar : null,
    abone: nesne && Number.isInteger(b.abone) && b.abone >= 0 ? b.abone : 0,
  };
}

// {yapayZeka:boolean, bildirim:{acikAnahtar:string|null, abone:number}} ya da null.
export function ayarGetir(fetchFn = globalThis.fetch, depo = varsayilanDepo(), { zamanAsimiMs = ZAMAN_ASIMI_MS } = {}) {
  return istekYap('/api/ayar', {}, (j) => ({ ...ayarCevir(j), bildirim: bildirimCevir(j.bildirim) }), fetchFn, depo, zamanAsimiMs);
}

export async function ayarYaz(yapayZeka, fetchFn = globalThis.fetch, depo = varsayilanDepo(), { zamanAsimiMs = ZAMAN_ASIMI_MS } = {}) {
  if (typeof yapayZeka !== 'boolean') return null;
  return istekYap('/api/ayar', { method: 'PUT', govde: JSON.stringify({ yapayZeka }) }, ayarCevir, fetchFn, depo, zamanAsimiMs);
}

/* ---------- Bildirim aboneliği ---------- */

const tamamMi = (j) => { if (!j || j.tamam !== true) throw new TypeError('yanıt geçersiz'); return true; };

// Aboneliği Worker'a kaydeder. Başarıda true; her başarısızlıkta (bağlantı yok, 401, 4xx/5xx, ağ, zaman aşımı) false.
export async function abonelikKaydet(abonelik, fetchFn = globalThis.fetch, depo = varsayilanDepo(), { zamanAsimiMs = ZAMAN_ASIMI_MS } = {}) {
  const a = abonelik && typeof abonelik === 'object' ? abonelik : {};
  if (!metinMi(a.endpoint) || !metinMi(a.p256dh) || !metinMi(a.auth)) return false;
  const govde = JSON.stringify({ endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth });
  return (await istekYap('/api/abonelik', { method: 'POST', govde }, tamamMi, fetchFn, depo, zamanAsimiMs)) === true;
}

export async function abonelikSil(endpoint, fetchFn = globalThis.fetch, depo = varsayilanDepo(), { zamanAsimiMs = ZAMAN_ASIMI_MS } = {}) {
  if (!metinMi(endpoint)) return false;
  return (await istekYap('/api/abonelik', { method: 'DELETE', govde: JSON.stringify({ endpoint }) }, tamamMi, fetchFn, depo, zamanAsimiMs)) === true;
}

function denemeCevir(j) {
  if (!j || typeof j !== 'object' || !Number.isInteger(j.gonderilen) || !Number.isInteger(j.basarili) || j.gonderilen < 0 || j.basarili < 0) throw new TypeError('yanıt geçersiz');
  const sonuc = { gonderilen: j.gonderilen, basarili: j.basarili };
  if (['abonelik', 'sifreleme', 'imza', 'ag'].includes(j.asama)) sonuc.asama = j.asama;
  return sonuc;
}

// {gonderilen, basarili}, bekleme süresindeyse (HTTP 429) {bekle: true}, olmazsa null.
// Push servisleri yavaş olabilir: zaman aşımı diğer isteklerden uzundur.
export async function denemeBildirimi(fetchFn = globalThis.fetch, depo = varsayilanDepo(), { zamanAsimiMs = 15000 } = {}) {
  const { sonuc, neden } = await istekCoz('/api/deneme-bildirim', { method: 'POST' }, denemeCevir, fetchFn, depo, zamanAsimiMs);
  return neden === 'bekle' ? { bekle: true } : sonuc;
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

// 2350 → "2.350" (Türkçe binlik ayırıcı; Intl'e bağlı kalmaz).
export function binlik(v) {
  if (!sonlu(v)) return null;
  const n = Math.round(v), m = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return n < 0 ? `−${m}` : m;
}

// Trend'de seçili günün ek ayrıntı satırı. Gösterilecek bir şey yoksa null.
export function ekSatiri(olcumId, ek) {
  if (!ek || typeof ek !== 'object') return null;
  let dilimler = null; let metin = null; let ayrinti = null;
  if (olcumId === 'uyku' && ek.uyku) {
    dilimler = dilimle(ek.uyku, UYKU_DILIMLERI);
    const { toplam, ihtiyac } = ek.uyku;
    const uyudu = Number.isInteger(toplam) && toplam > 0;
    const hedefVar = Number.isInteger(ihtiyac) && ihtiyac > 0;
    if (uyudu) metin = `${sureMetni(toplam)} uyudun`;
    if (hedefVar) {
      const hedef = `Garmin önerisi ${sureMetni(ihtiyac)}`;
      if (uyudu) {
        const fark = toplam - ihtiyac;
        const yorum = fark === 0 ? 'Öneriyle aynı'
          : `${sureMetni(Math.abs(fark))} daha ${fark < 0 ? 'az' : 'fazla'}`;
        ayrinti = `${hedef} · ${yorum}`;
      } else metin = hedef;
    }
  } else if (olcumId === 'stres' && ek.stres) {
    dilimler = dilimle(ek.stres, STRES_DILIMLERI);
  } else if (olcumId === 'bb' && ek.bb) {
    const parcalar = [];
    if (sonlu(ek.bb.dolan)) parcalar.push(`+${Math.abs(ek.bb.dolan)} doldu`);
    if (sonlu(ek.bb.biten)) parcalar.push(`−${Math.abs(ek.bb.biten)} bitti`);
    metin = parcalar.length ? parcalar.join(', ') : null;
  } else if (olcumId === 'hrv' && ek.hrv) {
    if (sonlu(ek.hrv.haftalik)) metin = `Haftalık ortalama ${ek.hrv.haftalik} ms`;
  } else if (olcumId === 'spo2' && ek.spo2) {
    if (sonlu(ek.spo2.en_dusuk)) metin = `En düşük %${Math.round(ek.spo2.en_dusuk)}`;
  } else if (olcumId === 'kalori' && ek.kalori) {
    if (sonlu(ek.kalori.toplam)) metin = `Toplam ${binlik(ek.kalori.toplam)} kcal`;
  }
  if (olcumId === 'uyku' && ek.uyku) {
    // Şekerleme ve uykudaki stres aynı satıra eklenir; null olanlar yazılmaz.
    const ekler = [];
    if (sonlu(ek.uyku.sekerleme) && ek.uyku.sekerleme > 0) ekler.push(`Şekerleme ${sureMetni(ek.uyku.sekerleme)}`);
    if (sonlu(ek.uyku.stres)) ekler.push(`Uykuda stres ${Math.round(ek.uyku.stres)}`);
    if (ekler.length) metin = [metin, ...ekler].filter(Boolean).join(' · ');
  }
  return dilimler || metin ? { dilimler, metin, ayrinti } : null;
}

export const CANLI = {
  veriCevir, durum, veriGetir, veriYukle, aktiviteGetir, takvimGetir, tumOnbellekSil, sonVeriYaz, sonVeriOku, sonVeriSil, ayarGetir, ayarYaz, abonelikKaydet, abonelikSil, denemeBildirimi, baglantiOku, baglantiYaz, baglantiSil, baglantiKarar, adresDuzelt,
  sureMetni, sonEsitlemeMetni, eskilikSaat, ekSatiri, binlik, OK, DURUM_METIN,
};
globalThis.CANLI = CANLI;
