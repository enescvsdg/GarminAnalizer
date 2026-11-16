// Düzen kararı ve geniş ekran geometrisi: saf fonksiyonlar (DOM yok), testleri duzen.test.mjs.
// Bugün bölgesi telefonun 390 birimlik koordinat sistemini korur; Trend bölgesi aynı ölçekle kalan genişliği alır.

export const BUGUN_W = 390;
export const GENIS_MIN_W = 1000;
export const GENIS_MIN_H = 620;
export const TELEFON_MAX_W = 520;
const TABAN_H = 660; // 720 iken 620 px yükseklikte en küçük yazı ~9,3 px'e düşüyordu; 660 ile ~10 px // Bugün bölgesinin hedef yüksekliği (birim): ölçek = pencere yüksekliği / bu
const OLCEK_MIN = 0.5, OLCEK_MAX = 1.5;
const BUGUN_ORAN = 0.46; // Bugün bölgesi pencerenin bundan genişini almaz
const TREND_MAX_U = 1100; // Trend içeriğinin en geniş hali (birim); fazlası iki bölgeyi ortalar
const SOL_PAY = 64, SAG_PAY = 56; // grafiğin ilk/son günü ile bölge kenarı arası (birim)

const sonlu = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function simgeOrani(id, deger, bant) {
  if (!sonlu(deger)) return null;
  if (id === 'spo2') return clamp((deger - 88) / 12, 0, 1);
  if (['uyku', 'bb', 'stres'].includes(id)) return clamp(deger / 100, 0, 1);
  if (!['hrv', 'nabiz', 'yuk', 'derin', 'solunum'].includes(id)) return null;
  const { min, max } = bant ?? {};
  if (!sonlu(min) || !sonlu(max) || min >= max) return null;
  // Normal aralık simgenin orta yarısında kalsın, iki uçta da sapmaya yer olsun.
  return clamp(.25 + (deger - min) / (2 * (max - min)), 0, 1);
}

// 'genis' | 'cerceve' | 'telefon'. Boyut yoksa (gizli açılış) telefon: sonradan gelen gerçek boyut yeniden yükler.
export function duzenModu(iw, ih) {
  if (!sonlu(iw) || !sonlu(ih) || iw <= 0 || ih <= 0) return 'telefon';
  if (iw >= GENIS_MIN_W && ih >= GENIS_MIN_H) return 'genis';
  if (iw <= TELEFON_MAX_W) return 'telefon';
  return 'cerceve';
}

// Geniş ekran yerleşimi. Piksel değerleri pencereye göre, "u" ile bitenler bölge birimindedir (px = u * s).
// Geçersiz/sıfır boyutta en küçük geniş pencere varsayılır: hiçbir alan NaN olmaz.
export function genisDuzen(iw, ih, n = 28) {
  const w = sonlu(iw) && iw > 0 ? iw : GENIS_MIN_W, h = sonlu(ih) && ih > 0 ? ih : GENIS_MIN_H;
  const gun = sonlu(n) && n >= 2 ? Math.floor(n) : 28;
  const s = clamp(Math.min(h / TABAN_H, (w * BUGUN_ORAN) / BUGUN_W), OLCEK_MIN, OLCEK_MAX);
  const hb = h / s, bw = BUGUN_W * s;
  const twu = Math.max(1, Math.min((w - bw) / s, TREND_MAX_U)), tw = twu * s;
  const ox = Math.max(0, (w - bw - tw) / 2); // boş yer kalırsa çift ortalanır
  const oran = Math.min(1, twu / 600); // dar Trend'de paylar da küçülür
  const solPay = SOL_PAY * oran, sagPay = SAG_PAY * oran;
  const dw = Math.max(1, (twu - solPay - sagPay) / (gun - 1));
  return {
    s, hb, ox,
    bx: ox, bw, // Bugün bölgesi (px)
    tx: ox + bw, tw, twu, // Trend bölgesi (px; genişlik birim olarak da)
    solPay, sagPay, dw, // 28 günlük grafik (birim)
    ust: Math.round(hb * 0.36), alt: Math.round(hb - 170), // ölçülemezse kullanılacak grafik üstü/altı (birim)
  };
}

// Bölge içindeki x (birim) -> en yakın gün. Grafiğin dışı uçtaki güne yapışır.
export function gunIndeksi(xu, solPay, dw, n) {
  const son = Math.max(0, Math.floor(n) - 1);
  if (!sonlu(xu) || !sonlu(solPay) || !sonlu(dw) || dw <= 0) return son;
  return clamp(Math.round((xu - solPay) / dw), 0, son);
}

// Hangi günlerin altına tarih yazılacağı: bugün (son gün) hep yazılır, sonra öncelikli günler (ay başı),
// sonra sondan geriye; iki etiket arası en az minAralik birim. Artan sırada indeksler.
export function etiketGunleri(n, dw, minAralik = 44, oncelikli = []) {
  const son = Math.floor(n) - 1;
  if (son < 0) return [];
  const adim = sonlu(dw) && dw > 0 ? Math.max(1, Math.ceil(minAralik / dw)) : son + 1;
  const secili = [son];
  const uygun = (i) => secili.every((j) => Math.abs(i - j) >= adim);
  for (const i of oncelikli) if (Number.isInteger(i) && i >= 0 && i < son && uygun(i)) secili.push(i);
  for (let i = son - adim; i >= 0; i--) if (uygun(i)) secili.push(i);
  return secili.sort((a, b) => a - b);
}

// Değer balonunun x'i: imlecin sağında, sığmazsa solunda; bölgenin dışına taşmaz.
export function balonX(imlecX, balonW, bolgeW, bosluk = 16, kenar = 12) {
  const w = sonlu(balonW) && balonW > 0 ? balonW : 0, x = sonlu(imlecX) ? imlecX : 0, bw = sonlu(bolgeW) ? bolgeW : 0;
  const sag = x + bosluk;
  if (sag + w <= bw - kenar) return sag;
  return Math.max(kenar, x - bosluk - w);
}

// Geniş ekran klavyesi: ←/→ gün, Home/End ilk/son gün, ↑/↓ ve 1–9 ölçüm. İlgisiz tuşta null.
// kosul: değiştirici tuş basılıysa (tarayıcı kısayolları: Cmd+1, Cmd+←), odak bir giriş alanındaysa
// ya da Ayarlar açıksa hiçbir eylem üretilmez.
export function klavyeEylem(tus, { gun, olcum, gunSayisi, olcumSayisi }, kosul = {}) {
  if (kosul.alt || kosul.ctrl || kosul.meta || kosul.inputOdak || kosul.ayarAcik) return null;
  const g = clamp(gun | 0, 0, gunSayisi - 1), o = clamp(olcum | 0, 0, olcumSayisi - 1);
  if (tus === 'ArrowLeft') return { tur: 'gun', deger: Math.max(0, g - 1) };
  if (tus === 'ArrowRight') return { tur: 'gun', deger: Math.min(gunSayisi - 1, g + 1) };
  if (tus === 'Home') return { tur: 'gun', deger: 0 };
  if (tus === 'End') return { tur: 'gun', deger: gunSayisi - 1 };
  if (tus === 'ArrowUp') return { tur: 'olcum', deger: Math.max(0, o - 1) };
  if (tus === 'ArrowDown') return { tur: 'olcum', deger: Math.min(olcumSayisi - 1, o + 1) };
  if (typeof tus === 'string' && /^[1-9]$/.test(tus) && +tus <= olcumSayisi) return { tur: 'olcum', deger: +tus - 1 };
  return null;
}

// Çark: tekerlek/dokunmatik yüzey olaylarını gün adımına çevirir. Çentik (satır) ve dokunmatik yüzeyin
// küçük piksel olayları aynı yolda birikir: 50 piksel ya da 1 satır = 1 gün, 1 sayfa = 3 gün.
// Pozitif adım ileri (sonraki gün). Tek olayda en çok ±3; fazlası atılır (28 günü birden atlamaz).
const CARK_PIKSEL = 50, CARK_ENCOK = 3;
export function carkBirikim(olay, birikim) {
  const o = olay || {}, dx = o.deltaX === undefined ? 0 : o.deltaX, dy = o.deltaY === undefined ? 0 : o.deltaY;
  if (!sonlu(dx) || !sonlu(dy) || (o.deltaX === undefined && o.deltaY === undefined)) return { adim: 0, birikim: 0 };
  const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
  const k = o.deltaMode === 1 ? CARK_PIKSEL : o.deltaMode === 2 ? CARK_PIKSEL * 3 : 1;
  const toplam = (sonlu(birikim) ? birikim : 0) + d * k;
  const ham = Math.trunc(toplam / CARK_PIKSEL);
  if (Math.abs(ham) > CARK_ENCOK) return { adim: Math.sign(ham) * CARK_ENCOK, birikim: 0 };
  return { adim: ham === 0 ? 0 : ham, birikim: toplam - ham * CARK_PIKSEL };
}

// Hedef güne kayma süresi (sn): 1 gün 0.32, her ek gün +0.09, en çok 0.9.
export function carkSure(uzaklik) {
  if (!sonlu(uzaklik)) return 0;
  const u = Math.abs(uzaklik);
  return u <= 0 ? 0 : Math.min(0.9, 0.32 + (u - 1) * 0.09);
}

// Çark hedefi: günü adım kadar kaydırır, 0..gunSayisi-1 arasında tutar.
export function carkHedef(gun, adim, gunSayisi) {
  const son = Math.max(0, Math.floor(gunSayisi) - 1);
  return clamp(Math.round((sonlu(gun) ? gun : 0) + (sonlu(adim) ? adim : 0)), 0, son);
}

export const DUZEN = { duzenModu, genisDuzen, gunIndeksi, etiketGunleri, balonX, klavyeEylem, carkBirikim, carkSure, carkHedef, BUGUN_W, GENIS_MIN_W, GENIS_MIN_H, TELEFON_MAX_W };
globalThis.DUZEN = DUZEN;
