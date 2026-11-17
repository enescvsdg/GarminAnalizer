// Canlı simgeler önizlemesi: on dört simge (dokuz sabah + beş günlük hareket), ortak denetimler, Trend başlığı yerleşimi.
import { simgeKur } from './simgeler.js';

const gsap = window.gsap;
const $ = (id) => document.getElementById(id);

// alt/ust: simgenin oran ölçeği (0..1); min/max: uygulamadaki normal aralık (veri.js ile aynı).
const OLC = [
  { id: 'uyku', ad: 'Uyku', alt: 30, ust: 100, min: 70, max: 85, br: '', acik: 'Ay, uyku skoru kadar dolar. Kötü gecede yıldızlar huzursuz titrer.' },
  { id: 'bb', ad: 'Body Battery', alt: 5, ust: 100, min: 60, max: 85, br: '', acik: 'Hücredeki ışık Body Battery kadar yükselir. Doluyken kıvılcımlanır, boşken kor gibi söner.' },
  { id: 'hrv', ad: 'HRV', alt: 25, ust: 80, min: 48, max: 62, br: ' ms', acik: 'Atımlar arasındaki boşluk HRV yükseldikçe değişkenleşir, düşükken tekdüzeleşir.' },
  { id: 'nabiz', ad: 'Dinlenme nabzı', alt: 40, ust: 72, min: 50, max: 55, br: '', acik: 'Kalp dinlenme nabzının gerçek hızında, iki vuruşla atar.' },
  { id: 'stres', ad: 'Stres', alt: 5, ust: 80, min: 25, max: 40, br: '', acik: 'Halkalar stres arttıkça sıklaşır, hızlanır, titrer ve ısınır.' },
  { id: 'yuk', ad: 'Dünkü yük', alt: 0, ust: 260, min: 40, max: 90, br: '', acik: 'Alev dünkü antrenman yükü kadar büyür. Yük yoksa közde bir kor kalır.' },
  { id: 'derin', ad: 'Derin uyku', alt: 0, ust: 140, min: 50, max: 110, br: ' dk', acik: 'Işık derin uyku süresi kadar derine iner; dalgalar uzar ve yavaşlar.' },
  { id: 'spo2', ad: 'SpO₂', alt: 88, ust: 100, min: 94, max: 99, br: '%', acik: 'Halka oksijen doygunluğu kadar kapanır, damlada kabarcıklar yükselir.' },
  { id: 'solunum', ad: 'Solunum', alt: 8, ust: 24, min: 12, max: 17, br: '/dk', acik: 'Çiçek dakikadaki nefes sayısı hızında açılır ve kapanır.' },
  { id: 'adim', ad: 'Adım', alt: 0, ust: 15000, min: 6200, max: 11800, br: '', acik: 'Ayak izleri birer birer basılır; adım arttıkça tempo hızlanır, iz uzar.' },
  { id: 'kat', ad: 'Kat', alt: 0, ust: 25, min: 4, max: 14, br: '', acik: 'Basamaklar kat sayısı kadar aydınlanır; ışık topu tırmanır, tepede parlar.' },
  { id: 'kalori', ad: 'Aktif kalori', alt: 0, ust: 1200, min: 320, max: 780, br: ' kcal', acik: 'Kor maytap gibi yanar; kalori arttıkça kıvılcımlar çoğalır ve uzar.' },
  { id: 'yogun', ad: 'Yoğun dakika', alt: 0, ust: 90, min: 15, max: 55, br: ' dk', acik: 'On iki çentik dakika kadar dolar; şimşek yoğunluk arttıkça sık çakar.' },
  { id: 'maxnabiz', ad: 'En yüksek nabız', alt: 90, ust: 190, min: 118, max: 166, br: '', acik: 'Atımlar tepeye doğru yükselir; ışık izi nabız hızında koşar, tepede parlar.' },
];
const DURUM_YAZI = { lo: '↓ normalin altında', ok: 'normalde', hi: '↑ normalin üstünde' };

// Günleri gez: uygulamadaki son yedi gün (veri.js) ve öncesine benzer günler; null = o gün veri yok.
const GUNLER = [
  [76, 70, 52, 53, 33, 71, 82, 96, 14], [66, 52, 47, 56, 44, 88, 48, 94, 16], [83, 81, 58, 51, 26, 30, 96, 97, 13],
  [72, 64, 50, 53, 38, 48, 66, null, 14], [79, 76, 55, 52, 31, 95, 84, 97, 14], [85, 84, 61, 50, 27, 62, 101, 98, 13],
  [54, 37, 41, 53, 35, 170, 45, 93, 17], [61, 29, 44, 57, 52, 0, 38, 95, 18], [88, 92, 66, 49, 19, 0, 118, 98, 12],
  [70, 58, 49, 54, 41, 124, 58, 96, 15], [null, 45, 46, 55, null, 210, null, 95, 16], [81, 79, 57, 51, 29, 40, 92, 99, 13],
];
// Günlük hareket ölçümleri (adım, kat, kalori, yoğun dakika, en yüksek nabız) aynı günler için; null = saat takılı değil.
const HAREKET = [
  [8720, 9, 590, 20, 134], [11548, 14, 835, 54, 163], [10115, 11, 726, 29, 151], [9521, 10, 673, 20, 145],
  [8847, 10, 590, 26, 147], [7526, 8, 496, 16, 135], [4728, 5, 277, 7, 118], [null, 0, 0, 0, null],
  [14210, 22, 1110, 86, 184], [6100, 3, 380, 12, 126], [2950, 1, 150, 0, 104], [12030, 17, 905, 61, 172],
];
GUNLER.forEach((g, i) => g.push(...HAREKET[i]));

const oranDen = (o, v) => Math.max(0, Math.min(1, (v - o.alt) / (o.ust - o.alt)));
const hamDen = (o, r) => Math.round(o.alt + r * (o.ust - o.alt));
const durumDen = (o, v) => (v < o.min ? 'lo' : v > o.max ? 'hi' : 'ok');

let azHareket = false, durum = 'ok', oran = 0.65, gezZaman = null, gunNo = 0;
const ornekler = []; // { o, simgeler: [api], olcuEl, durumEl }
let basApi = null, basOlcum = 'uyku';

function kur(kap, id, boyut) { return simgeKur(kap, id, { gsap, boyut, azHareket }); }

function izgaraKur() {
  const iz = $('izgara');
  for (const o of OLC) {
    const kart = document.createElement('article'); kart.className = 'ornek';
    const ust = document.createElement('div'); ust.className = 'ust';
    const buyuk = document.createElement('div');
    const sag = document.createElement('div');
    const h = document.createElement('h3'); h.textContent = o.ad;
    const olcu = document.createElement('div'); olcu.className = 'olcu';
    const b = document.createElement('b'); const sp = document.createElement('span');
    olcu.append(b, sp); sag.append(h, olcu); ust.append(buyuk, sag);
    const p = document.createElement('p'); p.textContent = o.acik;
    const kucuk = document.createElement('div'); kucuk.className = 'kucuk';
    const kaplar = [buyuk];
    for (const n of [44, 28]) {
      const f = document.createElement('figure'); const k = document.createElement('div');
      const cap = document.createElement('figcaption'); cap.textContent = `${n} px`;
      f.append(k, cap); kucuk.append(f); kaplar.push(k);
    }
    kart.append(ust, p, kucuk); iz.append(kart);
    ornekler.push({ o, kaplar, simgeler: [], b, sp });
  }
  simgeleriYenidenKur();
}

function simgeleriYenidenKur() {
  for (const e of ornekler) {
    e.simgeler.forEach((s) => s.yokEt());
    e.simgeler = e.kaplar.map((k, i) => kur(k, e.o.id, [96, 44, 28][i]));
  }
  if (basApi) basApi.yokEt();
  basApi = kur($('basSimge'), basOlcum, 44);
  hepsiniGuncelle();
}

// Her ölçüm için bu anın değeri: kaydırıcı + seçili durum, ya da gezilen gün.
function anDeger(o, j) {
  if (gezZaman !== null) {
    const v = GUNLER[gunNo][j];
    if (v === null) return { oran: null, durum: null, ham: null };
    return { oran: oranDen(o, v), durum: durumDen(o, v), ham: v };
  }
  return { oran, durum: durum || null, ham: hamDen(o, oran) };
}

function hepsiniGuncelle() {
  OLC.forEach((o, j) => {
    const d = anDeger(o, j), e = ornekler[j];
    e.simgeler.forEach((s) => s.guncelle(d));
    e.b.textContent = d.durum ? `${d.ham}${o.br}` : '–';
    e.sp.textContent = d.durum ? DURUM_YAZI[d.durum] : 'veri yok';
    e.sp.className = d.durum === 'lo' || d.durum === 'hi' ? 'sap' : '';
    if (o.id === basOlcum && basApi) { basApi.guncelle(d); gokBoya(d); }
  });
}

// Trend gökyüzü: uygulamadaki renk rampaları (cTop/cMid/cBot/cGunes); e = günün iyiliği.
const ip = (a) => gsap.utils.interpolate(a);
const cTop = ip(['#170d2b', '#141f42', '#0a2748']), cMid = ip(['#5a2a5e', '#3d4f7c', '#2a7a8c']), cBot = ip(['#e0705f', '#eaa47e', '#f7dc9c']), cGunes = ip(['#ff7d62', '#ffc08a', '#fff3c6']);
function gokBoya(d) {
  const o = OLC.find((x) => x.id === basOlcum);
  const iyi = ['nabiz', 'stres', 'yuk', 'solunum'].includes(o.id) ? -1 : 1;
  const e = d.durum ? Math.max(0, Math.min(1, iyi > 0 ? d.oran : 1 - d.oran)) : 0.5;
  $('gok').style.background = `linear-gradient(180deg,${cTop(e)} 0%,${cMid(e)} 52%,${cBot(e)} 100%)`;
  const [r, g, b] = gsap.utils.splitColor(cGunes(e));
  $('gunes').style.background = `radial-gradient(circle,rgb(${r},${g},${b}) 0 34%,rgba(${r},${g},${b},.6) 46%,rgba(${r},${g},${b},0) 70%)`;
}

function durumSec(d) {
  durum = d;
  for (const b of $('durum').children) b.setAttribute('aria-pressed', String(gezZaman === null && b.dataset.d === d));
}

function gezDurdur() {
  if (gezZaman === null) return;
  clearInterval(gezZaman); gezZaman = null;
  $('gez').setAttribute('aria-pressed', 'false'); $('gez').textContent = 'Günleri gez'; $('gunYazi').textContent = '';
  durumSec(durum); hepsiniGuncelle();
}
function gezBaslat() {
  gunNo = 0;
  const adim = () => {
    $('gunYazi').textContent = `Gün ${gunNo + 1} / ${GUNLER.length}`;
    hepsiniGuncelle();
    gunNo = (gunNo + 1) % GUNLER.length;
  };
  gezZaman = setInterval(adim, 1500);
  $('gez').setAttribute('aria-pressed', 'true'); $('gez').textContent = 'Durdur';
  durumSec(durum); gunNo = 0; adim();
}

// denetimler
$('deger').addEventListener('input', (ev) => {
  gezDurdur();
  oran = ev.target.value / 100; $('degerYazi').textContent = `${ev.target.value}%`;
  hepsiniGuncelle();
});
$('durum').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  gezDurdur(); durumSec(b.dataset.d); hepsiniGuncelle();
});
$('gez').addEventListener('click', () => (gezZaman === null ? gezBaslat() : gezDurdur()));
$('az').addEventListener('click', () => {
  azHareket = !azHareket; $('az').setAttribute('aria-checked', String(azHareket));
  simgeleriYenidenKur(); // yokEt + yeniden kur: temizliği de sınar
});
const sec = $('basSec');
for (const o of OLC) { const op = document.createElement('option'); op.value = o.id; op.textContent = o.ad; sec.append(op); }
sec.addEventListener('change', () => {
  basOlcum = sec.value; $('basAd').textContent = OLC.find((o) => o.id === basOlcum).ad;
  basApi.yokEt(); basApi = kur($('basSimge'), basOlcum, 44); hepsiniGuncelle();
});

izgaraKur();
