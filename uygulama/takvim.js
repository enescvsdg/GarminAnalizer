// Takvim ekranı: ay ay geçmiş, her gün enerji rengiyle bir daire.
// ES modülü; DOM'u kendisi kurar (yalnız createElement/textContent), stilini kendi <style> etiketiyle bir kez ekler.
// Veri biçimi (sözleşme W): { gunler: [{ tarih, e: 0..1|null, hukum: string|null, kartlar: { [id]: { v, durum } } }] } eskiden yeniye.
import { AY, GUN_UZUN, DURUM_METIN, OK } from './veri-canli.js';

const sonlu = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- enerji → renk ----------
// Kaynak: uygulama.js içindeki yedi gün şeridi `renk = gsap.utils.interpolate(['#ff7a45', '#ffb07a', '#c9f5b4'])`.
// Aynı üç durak, eşit aralıklı, RGB doğrusal geçiş; bir gün burada da şeritteki gibi görünür.
export const ENERJI_DURAKLARI = [[255, 122, 69], [255, 176, 122], [201, 245, 180]];

export function enerjiRengi(e) {
  if (!sonlu(e)) return null;
  const p = Math.min(1, Math.max(0, e)) * (ENERJI_DURAKLARI.length - 1);
  const i = Math.min(ENERJI_DURAKLARI.length - 2, Math.floor(p)), t = p - i;
  const a = ENERJI_DURAKLARI[i], b = ENERJI_DURAKLARI[i + 1];
  const k = (j) => Math.round(a[j] + (b[j] - a[j]) * t);
  return `rgb(${k(0)}, ${k(1)}, ${k(2)})`;
}

// Hüküm basamakları worker/src/stats/ozet.js `hukum` ile aynı eşikler (0.3 / 0.48 / 0.62 / 0.85);
// aylık özette üç kelimeye indirilir: < 0.48 yorgun, 0.48–0.62 dengeli, ≥ 0.62 zinde.
export function enerjiKelime(e) {
  if (!sonlu(e)) return null;
  if (e < 0.48) return 'yorgun';
  if (e < 0.62) return 'dengeli';
  return 'zinde';
}

// ---------- tarih yardımcıları ----------
const TARIH = /^(\d{4})-(\d{2})-(\d{2})$/;

export function tarihCoz(s) {
  const m = typeof s === 'string' ? TARIH.exec(s) : null;
  if (!m) return null;
  const y = +m[1], a = +m[2] - 1, g = +m[3];
  const d = new Date(Date.UTC(y, a, g));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== a || d.getUTCDate() !== g) return null;
  return { y, a, g, hg: (d.getUTCDay() + 6) % 7 }; // hg: 0 = Pazartesi … 6 = Pazar
}
const iki = (n) => String(n).padStart(2, '0');
const tarihYaz = (y, a, g) => `${y}-${iki(a + 1)}-${iki(g)}`;
const ayGunSayisi = (y, a) => new Date(Date.UTC(y, a + 1, 0)).getUTCDate();

export function bugunTarih(simdi = new Date()) {
  return tarihYaz(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
}

const bosGun = (tarih) => ({ tarih, e: null, hukum: null, kartlar: {} });

// Günleri aylara böler: en yeni ay önce, her ayın içinde günler eskiden yeniye.
// bosluk = ayın ilk görünen gününün Pazartesi başlangıçlı sütunu (0..6). Aradaki eksik günler boş gün olarak tamamlanır.
export function aylaraBol(gunler) {
  const liste = [];
  for (const g of Array.isArray(gunler) ? gunler : []) {
    const t = g && tarihCoz(g.tarih);
    if (t) liste.push({ g, t });
  }
  liste.sort((x, y) => (x.g.tarih < y.g.tarih ? -1 : x.g.tarih > y.g.tarih ? 1 : 0));
  const aylar = new Map();
  for (const { g, t } of liste) {
    const kod = `${t.y}-${iki(t.a + 1)}`;
    if (!aylar.has(kod)) aylar.set(kod, { yil: t.y, ay: t.a, ad: AY[t.a], anahtar: kod, bosluk: t.hg, gunler: [], son: 0 });
    const ay = aylar.get(kod);
    if (ay.son === t.g) continue; // aynı gün iki kez gelirse ilki kalır
    for (let d = ay.son + 1; d < t.g && ay.son > 0; d++) ay.gunler.push(bosGun(tarihYaz(t.y, t.a, d)));
    ay.gunler.push(g);
    ay.son = t.g;
  }
  return [...aylar.values()].reverse().map(({ son, ...ay }) => ay);
}

const KART_IDLER = ['uyku', 'bb', 'hrv', 'nabiz', 'stres', 'yuk'];
// Normal dışı: kart ölçümlerinden herhangi biri lo/hi.
export function normalDisiMi(gun) {
  const k = gun && gun.kartlar;
  if (!k || typeof k !== 'object') return false;
  return Object.keys(k).some((id) => k[id] && (k[id].durum === 'lo' || k[id].durum === 'hi'));
}

export function ayOzeti(gunler) {
  const liste = Array.isArray(gunler) ? gunler : [];
  let top = 0, n = 0, disi = 0;
  for (const g of liste) {
    if (sonlu(g && g.e)) { top += g.e; n++; }
    if (normalDisiMi(g)) disi++;
  }
  const ort = n ? top / n : null;
  return { ort, kelime: enerjiKelime(ort), veriGunu: n, normalDisi: disi };
}

// ---------- gün metinleri ----------
const METRIKLER = [
  { id: 'uyku', ad: 'Uyku', birim: '' },
  { id: 'bb', ad: 'Body Battery', birim: '' },
  { id: 'hrv', ad: 'HRV', birim: ' ms' },
  { id: 'nabiz', ad: 'Dinlenme nabzı', birim: '' },
  { id: 'stres', ad: 'Stres', birim: '' },
  { id: 'yuk', ad: 'Dünkü yük', birim: '' },
];

export function tarihUzun(tarih) {
  const t = tarihCoz(tarih);
  return t ? `${t.g} ${AY[t.a]} ${t.y}, ${GUN_UZUN[(t.hg + 1) % 7]}` : '';
}

export function gunEtiketi(gun) {
  const t = tarihCoz(gun && gun.tarih);
  if (!t) return '';
  const bas = `${GUN_UZUN[(t.hg + 1) % 7]} ${t.g} ${AY[t.a]}`;
  if (typeof gun.hukum === 'string' && gun.hukum) return `${bas}: ${gun.hukum}`;
  if (sonlu(gun.e)) return `${bas}: enerji ${enerjiKelime(gun.e)}`;
  return `${bas}: veri yok`;
}

export function degerMetni(m, kart) {
  const v = kart && sonlu(kart.v) ? kart.v : null;
  if (v === null) return '–';
  return `${Math.round(v)}${m.birim}`;
}

// ---------- örnek veri ----------
const ORNEK_BANT = { uyku: [70, 85], bb: [60, 85], hrv: [48, 62], nabiz: [50, 55], stres: [25, 40], yuk: [40, 150] };
const ORNEK_HUKUM = (e) => (e < 0.3 ? 'Bugün hafif tut.' : e < 0.48 ? 'Yavaşla.' : e < 0.62 ? 'Dengeli bir gün.' : e < 0.85 ? 'İyi gidiyorsun.' : 'Tam gaz.');

function ornekUret(bugun = new Date(), sayi = 120) {
  const b = Date.UTC(bugun.getFullYear(), bugun.getMonth(), bugun.getDate());
  let tohum = 20261117;
  const rnd = () => { tohum = (tohum * 1664525 + 1013904223) >>> 0; return tohum / 4294967296; };
  const gunler = [];
  for (let i = sayi - 1; i >= 0; i--) {
    const d = new Date(b - i * 86400000);
    const tarih = tarihYaz(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const bos = i === 0 ? false : i % 37 === 11 || i % 53 === 20; // arada veri olmayan günler
    const kartlar = {};
    if (bos) {
      KART_IDLER.forEach((id) => { kartlar[id] = { v: null, durum: null }; });
      gunler.push({ tarih, e: null, hukum: null, kartlar });
      continue;
    }
    const e = Math.min(0.98, Math.max(0.06, 0.5 + 0.3 * Math.sin(i / 5.3) + 0.12 * Math.sin(i / 1.9) + (rnd() - 0.5) * 0.22));
    KART_IDLER.forEach((id) => {
      const [lo, hi] = ORNEK_BANT[id], orta = (lo + hi) / 2, yay = (hi - lo) / 2;
      const iyi = id === 'nabiz' || id === 'stres' || id === 'yuk' ? 1 - e : e;
      const v = Math.round(orta + (iyi - 0.55) * yay * 2.1+ (rnd() - 0.5) * yay * 0.8);
      kartlar[id] = { v, durum: v < lo ? 'lo' : v > hi ? 'hi' : 'ok' };
    });
    gunler.push({ tarih, e: Math.round(e * 100) / 100, hukum: ORNEK_HUKUM(e), kartlar });
  }
  return { gunler };
}
export const ORNEK = ornekUret();

// ---------- stil ----------
const STIL = `
.tkv{--tkv-metin:#fff6ec;--tkv-isaret:#ffc9a6;container-type:inline-size;color:var(--tkv-metin);padding:4px 16px 20px;font-family:'Onest',system-ui,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.tkv[hidden]{display:none}
.tkv *{box-sizing:border-box}
.tkv-ust{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:2px 4px 14px;padding-right:48px}
.tkv-ust h2{font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100,'opsz' 144;font-weight:430;font-size:34px;line-height:1;letter-spacing:-.025em;margin:0}
.tkv-etiket{font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(255,201,166,.14);border:1px solid rgba(255,201,166,.5);color:var(--tkv-metin);white-space:nowrap}
.tkv-etiket[hidden]{display:none}
.tkv-lejant{display:flex;align-items:center;gap:8px;margin:0 4px 14px;font-size:11.5px;color:rgba(255,246,236,.72)}
.tkv-lejant .bar{flex:1;max-width:150px;height:8px;border-radius:99px}
.tkv-lejant .halka{width:12px;height:12px;border-radius:50%;border:1.5px solid rgba(255,246,236,.4);margin-left:8px}
.tkv-aylar{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
.tkv-ay{padding:16px 14px 12px;border-radius:26px;background:linear-gradient(158deg,rgba(255,246,236,.15),rgba(255,246,236,.04) 62%);border:1px solid rgba(255,246,236,.16);box-shadow:0 12px 30px rgba(4,2,8,.4),inset 0 1px 0 rgba(255,255,255,.16)}
.tkv-ayba{display:flex;flex-direction:column;gap:6px;margin:0 6px 10px}
.tkv-ayba h3{font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100,'opsz' 144;font-weight:430;font-size:26px;line-height:1.05;letter-spacing:-.02em;margin:0}
.tkv-ayba h3 span{color:rgba(255,246,236,.6);font-weight:400}
.tkv-ozet{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:13px;color:rgba(255,246,236,.82)}
.tkv-ozet .ort{display:inline-flex;align-items:center;gap:7px;font-weight:600;color:var(--tkv-metin)}
.tkv-ozet .ort i{width:10px;height:10px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c)}
.tkv-ozet .ayrac{opacity:.4}
.tkv-izgara{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px 0}
.tkv-hg{height:24px;display:grid;place-items:center;font-size:11px;font-weight:500;color:rgba(255,246,236,.6)}
.tkv-bos{min-height:44px}
.tkv-gun{appearance:none;-webkit-appearance:none;border:0;background:none;color:inherit;font:inherit;padding:0;margin:0;min-height:44px;display:grid;place-items:center;cursor:pointer;border-radius:14px;touch-action:manipulation}
.tkv-gun:focus-visible{outline:2px solid var(--tkv-isaret);outline-offset:-2px}
.tkv-d{width:min(100%,38px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:600;color:#1a1022;background:var(--c);box-shadow:0 0 10px color-mix(in srgb,var(--c) 45%,transparent);outline:2px solid transparent;outline-offset:3px;transition:transform .18s cubic-bezier(.2,.9,.3,1.5),outline-color .25s}
.tkv-gun.bos .tkv-d{background:transparent;box-shadow:none;border:1.5px solid rgba(255,246,236,.28);color:rgba(255,246,236,.5);font-weight:500}
.tkv-gun.bugun .tkv-d{outline-color:rgba(255,246,236,.9)}
.tkv-gun[aria-expanded=true] .tkv-d{outline-color:var(--tkv-isaret);transform:scale(1.08)}
.tkv-gun:active .tkv-d{transform:scale(.9)}
@media (hover:hover){.tkv-gun:hover .tkv-d{transform:scale(1.08)}}
.tkv-kart{grid-column:1/-1;margin:8px 0 10px;padding:16px 16px 14px;border-radius:22px;background:linear-gradient(158deg,rgba(255,246,236,.2),rgba(255,246,236,.07) 62%);border:1px solid rgba(255,201,166,.45);box-shadow:0 12px 30px rgba(4,2,8,.45),inset 0 1px 0 rgba(255,255,255,.2);animation:tkv-ac .28s cubic-bezier(.2,.8,.2,1)}
.tkv-kart:focus{outline:none}
.tkv-kart:focus-visible{outline:2px solid var(--tkv-isaret);outline-offset:2px}
@keyframes tkv-ac{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.tkv-kartust{display:flex;align-items:flex-start;gap:10px}
.tkv-kartust>div{flex:1;min-width:0}
.tkv-tarih{font-size:12.5px;font-weight:500;color:rgba(255,246,236,.75)}
.tkv-hukum{font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100,'opsz' 144;font-weight:430;font-size:23px;line-height:1.12;letter-spacing:-.015em;margin-top:4px;text-wrap:balance}
.tkv-kapat{appearance:none;-webkit-appearance:none;flex:none;width:44px;height:44px;margin:-8px -8px 0 0;display:grid;place-items:center;border:0;background:none;color:rgba(255,246,236,.85);border-radius:50%;cursor:pointer}
.tkv-kapat:focus-visible{outline:2px solid var(--tkv-isaret);outline-offset:-2px}
.tkv-kapat svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
.tkv-olc{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.tkv-o{padding:10px 12px;border-radius:16px;background:rgba(255,246,236,.07);border:1px solid rgba(255,246,236,.1);min-width:0}
.tkv-o.sap{border-color:rgba(255,201,166,.5)}
.tkv-o .ad{font-size:11.5px;color:rgba(255,246,236,.68)}
.tkv-o .dg{font-size:22px;font-weight:600;letter-spacing:-.02em;margin-top:2px}
.tkv-o .dr{display:flex;align-items:center;gap:5px;font-size:12px;margin-top:2px;color:rgba(255,246,236,.78);min-height:16px}
.tkv-o.sap .dr{color:var(--tkv-isaret);font-weight:600}
.tkv-o .dr svg{width:10px;height:10px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.tkv-durum{padding:56px 20px;text-align:center;font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100;font-weight:430;font-size:19px;line-height:1.35;color:rgba(255,246,236,.85)}
@container (min-width:760px){
  .tkv{padding:8px 24px 28px}
  .tkv-aylar{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:18px}
  .tkv-ay{padding:20px 18px 14px}
}
@media (prefers-reduced-motion:reduce){.tkv-kart{animation:none}.tkv-d{transition:none}.tkv-gun:active .tkv-d,.tkv-gun:hover .tkv-d,.tkv-gun[aria-expanded=true] .tkv-d{transform:none}}
.tkv.rm .tkv-kart{animation:none}.tkv.rm .tkv-d{transition:none}
`;
const stilVerildi = new WeakSet();
function stilEkle(doc) {
  if (stilVerildi.has(doc)) return;
  stilVerildi.add(doc);
  const s = doc.createElement('style');
  s.setAttribute('data-modul', 'takvim');
  s.textContent = STIL;
  (doc.head || doc.documentElement).appendChild(s);
}

// ---------- ekran ----------
const KAPAT_SVG = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14"/></svg>';
const TIK_SVG = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2l2.1 2.1L8 3"/></svg>';
const HG_BAS = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];

export function takvimKur(kap, baglam = {}) {
  const doc = kap.ownerDocument || globalThis.document;
  stilEkle(doc);
  const ek = (tag, cls, txt) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  const rm = !!baglam.rm || !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const kok = ek('div', 'tkv' + (rm ? ' rm' : ''));
  kok.hidden = true;
  const ust = ek('div', 'tkv-ust');
  ust.appendChild(ek('h2', null, 'Takvim'));
  const etiket = ek('span', 'tkv-etiket', 'Örnek veri');
  etiket.hidden = !baglam.ornek;
  ust.appendChild(etiket);
  const lejant = ek('div', 'tkv-lejant');
  lejant.appendChild(ek('span', null, 'yorgun'));
  const bar = ek('span', 'bar');
  bar.style.background = `linear-gradient(90deg,${enerjiRengi(0)},${enerjiRengi(0.5)},${enerjiRengi(1)})`;
  lejant.appendChild(bar);
  lejant.appendChild(ek('span', null, 'zinde'));
  lejant.appendChild(ek('span', 'halka'));
  lejant.appendChild(ek('span', null, 'veri yok'));
  const icerik = ek('div', 'tkv-icerik');
  kok.appendChild(ust); kok.appendChild(lejant); kok.appendChild(icerik);
  kap.appendChild(kok);

  let veri = null, belirteç = 0, yok = false, acik = null, gorunur = false;

  function durumGoster(metin) {
    icerik.textContent = '';
    icerik.appendChild(ek('p', 'tkv-durum', metin));
  }

  function kartKapat(odak) {
    if (!acik) return;
    const { kart, dugme } = acik;
    acik = null;
    if (kart.parentNode) kart.parentNode.removeChild(kart);
    dugme.setAttribute('aria-expanded', 'false');
    if (odak && dugme.focus) dugme.focus();
  }

  function olcumKutusu(m, kart) {
    const v = kart && sonlu(kart.v) ? kart.v : null;
    const durum = v !== null && kart && DURUM_METIN[kart.durum] ? kart.durum : null;
    const kutu = ek('div', 'tkv-o' + (durum === 'lo' || durum === 'hi' ? ' sap' : ''));
    kutu.appendChild(ek('div', 'ad', m.ad));
    kutu.appendChild(ek('div', 'dg', degerMetni(m, kart)));
    const dr = ek('div', 'dr');
    if (durum === 'lo' || durum === 'hi') dr.innerHTML = OK[durum]; // sabit şablon
    else if (durum === 'ok') dr.innerHTML = TIK_SVG; // sabit şablon
    dr.appendChild(ek('span', null, v === null ? 'veri yok' : durum ? DURUM_METIN[durum] : ''));
    kutu.appendChild(dr);
    return kutu;
  }

  function kartAc(gun, dugme, ay, indeks, hucreler) {
    kartKapat(false);
    const kart = ek('div', 'tkv-kart');
    kart.setAttribute('role', 'group');
    kart.setAttribute('tabindex', '-1');
    kart.setAttribute('aria-label', `${tarihUzun(gun.tarih)} ayrıntısı`);
    const ustBolum = ek('div', 'tkv-kartust');
    const metin = ek('div');
    metin.appendChild(ek('div', 'tkv-tarih', tarihUzun(gun.tarih)));
    const veriVar = sonlu(gun.e) || (typeof gun.hukum === 'string' && gun.hukum);
    metin.appendChild(ek('div', 'tkv-hukum', typeof gun.hukum === 'string' && gun.hukum ? gun.hukum : veriVar ? `Enerji ${enerjiKelime(gun.e)}` : 'Bu gün için veri yok'));
    ustBolum.appendChild(metin);
    const kapat = ek('button', 'tkv-kapat');
    kapat.type = 'button';
    kapat.setAttribute('aria-label', 'Kapat');
    kapat.innerHTML = KAPAT_SVG; // sabit şablon
    kapat.addEventListener('click', () => kartKapat(true));
    ustBolum.appendChild(kapat);
    kart.appendChild(ustBolum);
    const olc = ek('div', 'tkv-olc');
    const kartlar = gun.kartlar && typeof gun.kartlar === 'object' ? gun.kartlar : {};
    METRIKLER.forEach((m) => olc.appendChild(olcumKutusu(m, kartlar[m.id])));
    kart.appendChild(olc);
    // kart, günün bulunduğu haftanın hemen altına girer
    const sonSutun = Math.min(hucreler.length - 1, indeks + (6 - ((ay.bosluk + indeks) % 7)));
    const izgara = dugme.parentNode;
    izgara.insertBefore(kart, hucreler[sonSutun + 1] || null);
    dugme.setAttribute('aria-expanded', 'true');
    acik = { kart, dugme };
    if (kart.focus) kart.focus({ preventScroll: true });
    if (typeof kart.scrollIntoView === 'function') kart.scrollIntoView({ block: 'nearest', behavior: rm ? 'auto' : 'smooth' });
  }

  function gunDugmesi(gun, ay, indeks, hucreler, bugun) {
    const t = tarihCoz(gun.tarih);
    const renk = sonlu(gun.e) ? enerjiRengi(gun.e) : null;
    const d = ek('button', 'tkv-gun' + (renk ? '' : ' bos') + (gun.tarih === bugun ? ' bugun' : ''));
    d.type = 'button';
    d.setAttribute('aria-label', gunEtiketi(gun));
    d.setAttribute('aria-expanded', 'false');
    if (gun.tarih === bugun) d.setAttribute('aria-current', 'date');
    const daire = ek('span', 'tkv-d', String(t.g));
    if (renk) daire.style.setProperty('--c', renk);
    d.appendChild(daire);
    d.addEventListener('click', () => {
      if (acik && acik.dugme === d) { kartKapat(true); return; }
      let ele = false;
      try { ele = typeof baglam.gunAc === 'function' && baglam.gunAc(gun.tarih) === true; } catch (_) { ele = false; }
      if (ele) return;
      kartAc(gun, d, ay, indeks, hucreler);
    });
    return d;
  }

  function ayKur(ay, bugun) {
    const sec = ek('section', 'tkv-ay');
    sec.setAttribute('aria-label', `${ay.ad} ${ay.yil}`);
    const ba = ek('div', 'tkv-ayba');
    const h = ek('h3', null, `${ay.ad} `);
    h.appendChild(ek('span', null, String(ay.yil)));
    ba.appendChild(h);
    const oz = ayOzeti(ay.gunler);
    const ozet = ek('div', 'tkv-ozet');
    if (oz.kelime) {
      const ort = ek('span', 'ort');
      const nokta = ek('i');
      nokta.style.setProperty('--c', enerjiRengi(oz.ort));
      ort.appendChild(nokta);
      ort.appendChild(ek('span', null, oz.kelime));
      ort.setAttribute('aria-label', `Ortalama enerji ${oz.kelime}`);
      ozet.appendChild(ort);
      ozet.appendChild(ek('span', 'ayrac', '·'));
      ozet.appendChild(ek('span', null, oz.normalDisi ? `${oz.normalDisi} gün normal dışı` : 'normal dışı gün yok'));
    } else {
      ozet.appendChild(ek('span', null, 'veri yok'));
    }
    ba.appendChild(ozet);
    sec.appendChild(ba);
    const izgara = ek('div', 'tkv-izgara');
    HG_BAS.forEach((c) => { const x = ek('span', 'tkv-hg', c); x.setAttribute('aria-hidden', 'true'); izgara.appendChild(x); });
    for (let i = 0; i < ay.bosluk; i++) { const b = ek('span', 'tkv-bos'); b.setAttribute('aria-hidden', 'true'); izgara.appendChild(b); }
    const hucreler = [];
    ay.gunler.forEach((g, i) => { const b = gunDugmesi(g, ay, i, hucreler, bugun); hucreler.push(b); izgara.appendChild(b); });
    sec.appendChild(izgara);
    return sec;
  }

  function ciz() {
    kartKapat(false);
    const aylar = aylaraBol(veri && veri.gunler);
    if (!aylar.length) { durumGoster('Henüz veri yok.'); return; }
    icerik.textContent = '';
    const kapAylar = ek('div', 'tkv-aylar');
    const bugun = bugunTarih();
    aylar.forEach((ay) => kapAylar.appendChild(ayKur(ay, bugun)));
    icerik.appendChild(kapAylar);
  }

  async function yukle() {
    const b = ++belirteç;
    if (baglam.ornek) { veri = ORNEK; ciz(); return; }
    if (!veri) durumGoster('Yükleniyor…');
    let yanit = null;
    try { yanit = typeof baglam.getir === 'function' ? await baglam.getir() : null; } catch (_) { yanit = null; }
    if (yok || b !== belirteç) return;
    if (yanit && Array.isArray(yanit.gunler)) { veri = yanit; ciz(); }
    else if (!veri) durumGoster('Takvim şu an alınamadı.');
  }

  kok.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && acik) { ev.stopPropagation(); kartKapat(true); }
  });

  return {
    goster() {
      kok.hidden = false; gorunur = true;
      return yukle();
    },
    gizle() { kok.hidden = true; gorunur = false; kartKapat(false); },
    yokEt() {
      yok = true; gorunur = false;
      kartKapat(false);
      if (kok.parentNode) kok.parentNode.removeChild(kok);
    },
    get gorunur() { return gorunur; },
  };
}
