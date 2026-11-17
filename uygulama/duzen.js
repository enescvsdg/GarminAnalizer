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

// Telefon modunda sahnenin kullanacağı görünüm yüksekliği (px). iOS ana ekran uygulamasında innerHeight ilk
// çizimde gerçek ekrandan kısa (üst güvenli alanı saymadan) gelebilir ve ardından resize olayı gelmeyebilir.
// Adaylar: ic (innerHeight), dvh (position:fixed ölçü elemanı), gorsel (visualViewport.height), kok (documentElement.clientHeight).
// Sonlu ve pozitif adayların en büyüğü seçilir; ekran yüksekliği (ekran) biliniyorsa onu aşmaz.
// Ana ekran uygulaması değilse (Safari sekmesi, araç çubukları oynar) yalnızca innerHeight'a güvenilir; o yoksa diğerlerinin en büyüğü.
// Hiç aday yoksa 844 (tasarım yüksekliği).
// iosTam: iOS ana ekran uygulaması, dikey ve pencere ekran genişliğinde (tam ekran). Bu durumda sayfa
// ekranın tamamını kaplar (viewport-fit=cover + black-translucent); tarayıcının bildirdiği yükseklikler
// açılışta kısa kalabildiği için ekran yüksekliğinin kendisi kullanılır.
export function gorunumYuksekligi({ ic, dvh, gorsel, kok, ekran, standalone, iosTam } = {}) {
  const gecerli = (v) => sonlu(v) && v > 0;
  if (iosTam === true && gecerli(ekran)) return ekran;
  const hepsi = [ic, dvh, gorsel, kok].filter(gecerli);
  let y = standalone === false && gecerli(ic) ? ic : hepsi.length ? Math.max(...hepsi) : 844;
  if (gecerli(ekran) && y > ekran) y = ekran;
  return y;
}

// iOS ana ekran uygulaması, dikey ve pencere ekran genişliğinde mi (tam ekran)? vazgec: doğrulama başarısız olduysa kapalı.
export function iosTamMi({ iosAnaEkran, ekranW, ekranH, iw, vazgec } = {}) {
  if (vazgec === true || iosAnaEkran !== true) return false;
  if (!sonlu(ekranW) || !sonlu(ekranH) || ekranW <= 0 || ekranH <= 0 || !sonlu(iw)) return false;
  return iw === Math.min(ekranW, ekranH);
}

// iosTam yerleşimi oturdu mu? Sahnenin altı ekran yüksekliğine yakın, belge ve görsel görünüm kaymamış olmalı.
// Değilse çağıran eski (position:fixed) yola döner: en kötü ihtimal eski bant, kırpılmış kontrol asla.
export function iosTamGecerli({ sahneAlt, ekran, kaydirma, gorselUst } = {}) {
  if (!sonlu(sahneAlt) || !sonlu(ekran) || ekran <= 0) return false;
  if (Math.abs(sahneAlt - ekran) > 2) return false;
  if (sonlu(kaydirma) && Math.abs(kaydirma) > 0.5) return false;
  if (sonlu(gorselUst) && Math.abs(gorselUst) > 0.5) return false;
  return true;
}

// Ayarlar'daki tanı satırı. Sonlu olmayan değer "?" olur; NaN/undefined yazısı çıkmaz.
export function olcuSatiri(o = {}) {
  const n = (v) => (sonlu(v) ? String(Math.round(v)) : '?');
  return `Ölçü: ic ${n(o.ic)} · ekran ${n(o.ekran)} · gorsel ${n(o.gorsel)} · kok ${n(o.kok)} · sabit ${n(o.sabit)} · dvh ${n(o.dvh)} · üst ${n(o.ust)} · alt ${n(o.alt)} · sahne ${n(o.sahne)} · tam ${o.tam === true ? 'evet' : 'hayır'}`;
}

/* ---------- Ekran yönlendirme (Bugün, Trend, Aktiviteler, Takvim) ---------- */
export const EKRANLAR = ['bugun', 'trend', 'aktivite', 'takvim'];
export const kayanMi = (e) => e === 'aktivite' || e === 'takvim';

// Bir ekrandan ötekine geçişin türü. alt: kaydırılabilir ekranın altında kalan ana ekran (bugun | trend).
// ana: Bugün ↔ Trend (bugünkü uçan sayı geçişi) · ac: ana → kaydırılabilir · degis: kaydırılabilir → kaydırılabilir
// kapat: kaydırılabilir → altındaki ana ekran · kapatGec: kaydırılabilir → öbür ana ekran (kısa, anlık ana geçiş + solma)
export function ekranGecisi(ekran, hedef, alt = 'bugun') {
  if (!EKRANLAR.includes(ekran) || !EKRANLAR.includes(hedef) || ekran === hedef) return null;
  const altE = alt === 'trend' ? 'trend' : 'bugun';
  if (!kayanMi(ekran) && !kayanMi(hedef)) return { tur: 'ana', alt: ekran };
  if (!kayanMi(ekran)) return { tur: 'ac', alt: ekran };
  if (kayanMi(hedef)) return { tur: 'degis', alt: altE };
  return { tur: hedef === altE ? 'kapat' : 'kapatGec', alt: altE };
}

// Kaydırılabilir ekranda menü: aşağı kaydırınca daralır, yukarı kaydırınca ya da en üstte açılır; küçük oynamalar durumu korur.
export function menuToplan(onceki, simdi, toplu, esik = 8) {
  if (!sonlu(onceki) || !sonlu(simdi)) return !!toplu;
  if (simdi <= esik) return false;
  const fark = simdi - onceki;
  if (fark > esik / 2) return true;
  if (fark < -esik / 2) return false;
  return !!toplu;
}

const iki = (n) => String(n).padStart(2, '0');
export const tarihAnahtari = (d) => `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
// 'YYYY-MM-DD' -> gunler (tarih alanı Date olan günler) içindeki sırası; yoksa -1
export function gunSirasi(tarih, gunler) {
  if (typeof tarih !== 'string' || !Array.isArray(gunler)) return -1;
  return gunler.findIndex((g) => g && g.tarih instanceof Date && tarihAnahtari(g.tarih) === tarih);
}

// Takvimden dokunulan gün 7 günlük şeritte mi: şerit içindeki sıra (0..), şeritten eskiyse ya da yoksa -1 (o zaman Takvim kendi gün kartını açar)
export function gunAcKarar(tarih, gunler, G0) {
  const gi = gunSirasi(tarih, gunler);
  return gi >= G0 ? gi - G0 : -1;
}

// Kaydırılabilir ekran modülünü yükler ve kurar. Yüklenemezse, kurucu yoksa ya da fırlatırsa null (arayüz "yüklenemedi" der).
export async function modulKur(ice, kurAdi, kap, baglam) {
  try {
    const mod = await ice();
    const kur = mod && mod[kurAdi];
    if (typeof kur !== 'function') return null;
    const c = kur(kap, baglam);
    if (!c || typeof c.goster !== 'function' || typeof c.gizle !== 'function' || typeof c.yokEt !== 'function') return null;
    return c;
  } catch { return null; }
}

export const DUZEN = { iosTamMi, iosTamGecerli, olcuSatiri, gorunumYuksekligi, duzenModu, genisDuzen, gunIndeksi, etiketGunleri, balonX, klavyeEylem, carkBirikim, carkSure, carkHedef, ekranGecisi, menuToplan, gunSirasi, gunAcKarar, tarihAnahtari, modulKur, kayanMi, BUGUN_W, GENIS_MIN_W, GENIS_MIN_H, TELEFON_MAX_W };
globalThis.DUZEN = DUZEN;
