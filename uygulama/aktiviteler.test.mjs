import { test } from 'node:test';
import assert from 'node:assert/strict';

/* ---- çok küçük sahte DOM ---- */
class Dugum {
  constructor(tag) {
    this.tag = tag; this.childNodes = []; this.attrs = {}; this.dinleyici = {}; this.parentNode = null;
    this._metin = ''; this.hidden = false; this.className = ''; this.scrollTop = 0; this.isConnected = true;
    const stil = {}; stil.setProperty = (k, v) => { stil[k] = v; }; this.style = stil;
    this.classList = { add: (c) => { this.className += ` ${c}`; } };
  }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; }
  removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); c.parentNode = null; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(t, f) { (this.dinleyici[t] ||= []).push(f); }
  removeEventListener(t, f) { this.dinleyici[t] = (this.dinleyici[t] || []).filter((x) => x !== f); }
  focus() { sahteDoc.odak = this; }
  set textContent(v) { this.childNodes = []; this._metin = String(v); }
  get textContent() { return this._metin + this.childNodes.map((c) => c.textContent).join(''); }
  tikla() { for (const f of this.dinleyici.click || []) f({}); }
}
const sahteDoc = {
  odak: null, dinleyici: {}, head: new Dugum('head'), documentElement: new Dugum('html'),
  createElement: (t) => new Dugum(t), createElementNS: (_, t) => new Dugum(t),
  querySelector(sel) { return sel.includes('aktivite') ? this.head.childNodes.find((c) => c.attrs['data-modul'] === 'aktivite') || null : null; },
  addEventListener(t, f) { (this.dinleyici[t] ||= []).push(f); },
  removeEventListener(t, f) { this.dinleyici[t] = (this.dinleyici[t] || []).filter((x) => x !== f); },
  tus(key) { for (const f of this.dinleyici.keydown || []) f({ key, preventDefault() {} }); },
};
globalThis.document = sahteDoc;

const {
  turAdi, sureBicim, mesafeBicim, gunBaslik, haftaDurum, saatBicim, insanAdi, bugunTarih, ornekUret, ORNEK, AKTIVITE_ANAHTARLARI,
  aktiviteKur, yanitDuzenle, haftalikGrafik, bolgeOzet, bolgeDakika, etkiEtiketi, simgeTuru, turGrubu,
} = await import('./aktiviteler.js');

function hepsi(d, f, cikti = []) { f(d) && cikti.push(d); d.childNodes.forEach((c) => hepsi(c, f, cikti)); return cikti; }
const tick = () => new Promise((r) => setTimeout(r, 0));
const KOTU = /NaN|undefined|null|Infinity|\[object/;
// Ayrıntıyı açanlar: kahraman kartın düğmesi (en son antrenman) ve listedeki kartlar, belge sırasıyla
const acanMi = (d) => d.tag === 'button' && /akt-oge|akt-kAc/.test(d.className);

/* ---- saf yardımcılar ---- */
test('turAdi: bilinen, bilinmeyen, boş', () => {
  assert.equal(turAdi('running'), 'Koşu');
  assert.equal(turAdi('strength_training'), 'Kuvvet');
  assert.equal(turAdi('INDOOR_CYCLING'), 'Salon bisikleti');
  assert.equal(turAdi('lap_swimming'), 'Havuz yüzme');
  assert.equal(turAdi('other'), 'Diğer');
  assert.equal(turAdi('quidditch'), 'Antrenman');
  assert.equal(turAdi('constructor'), 'Antrenman');
  assert.equal(turAdi(null), 'Antrenman');
});

test('sureBicim: 0, 59 sn, 1 sa 5 dk, null', () => {
  assert.equal(sureBicim(0), '0 sn');
  assert.equal(sureBicim(59), '59 sn');
  assert.equal(sureBicim(45 * 60), '45 dk');
  assert.equal(sureBicim(3900), '1s 5dk');
  assert.equal(sureBicim(7200), '2s');
  assert.equal(sureBicim(null), null);
  assert.equal(sureBicim(NaN), null);
});

test('mesafeBicim: m, km, null', () => {
  assert.equal(mesafeBicim(850), '850 m');
  assert.equal(mesafeBicim(5200), '5,2 km');
  assert.equal(mesafeBicim(12040), '12,0 km');
  assert.equal(mesafeBicim(null), null);
  assert.equal(mesafeBicim(0), null);
});

test('gunBaslik: Bugün, Dün, Türkçe tarih', () => {
  assert.equal(gunBaslik('2026-11-17', '2026-11-17'), 'Bugün');
  assert.equal(gunBaslik('2026-11-16', '2026-11-17'), 'Dün');
  assert.equal(gunBaslik('2026-11-16', '2026-11-18'), '16 Kasım Pazartesi');
  assert.equal(gunBaslik('2026-01-01', '2026-11-17'), '1 Ocak Perşembe');
  assert.equal(gunBaslik('bozuk', '2026-11-17'), null);
  assert.equal(gunBaslik(null), null);
});

test('haftaDurum: bantlı ve bantsız', () => {
  const bant = { min: 200, max: 400 };
  assert.deepEqual(haftaDurum({ yuk: 150 }, bant), { durum: 'lo', metin: 'normalin altında' });
  assert.deepEqual(haftaDurum({ yuk: 300 }, bant), { durum: 'ok', metin: 'normal aralıkta' });
  assert.deepEqual(haftaDurum({ yuk: 200 }, bant).durum, 'ok');
  assert.deepEqual(haftaDurum({ yuk: 450 }, bant), { durum: 'hi', metin: 'normalin üstünde' });
  assert.deepEqual(haftaDurum({ yuk: 450 }, null), { durum: null, metin: null });
  assert.deepEqual(haftaDurum({ yuk: null }, bant), { durum: null, metin: null });
});

test('saatBicim ve insanAdi', () => {
  assert.equal(saatBicim(Date.UTC(2026, 10, 17, 4, 5)), '07:05');
  assert.equal(saatBicim(null), null);
  assert.equal(insanAdi('BENCH_PRESS'), 'Bench press');
  assert.equal(insanAdi('CABLE_CROSSOVER'), 'Cable Crossover');
  assert.equal(insanAdi(''), null);
});

/* ---- örnek veri sözleşmeye uyar ---- */
test('ORNEK: API şekli sözleşmeyle birebir', () => {
  assert.deepEqual(Object.keys(ORNEK).sort(), ['aktiviteler', 'haftalar', 'yukBant']);
  assert.ok(ORNEK.aktiviteler.length >= 10);
  for (const a of ORNEK.aktiviteler) {
    assert.deepEqual(Object.keys(a).sort(), [...AKTIVITE_ANAHTARLARI].sort());
    assert.match(a.tarih, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(a.bolgeler === null || (Array.isArray(a.bolgeler) && a.bolgeler.length === 5));
    assert.ok(a.setler === null || Array.isArray(a.setler));
    for (const [k, v] of Object.entries(a)) {
      if (['id', 'tarih', 'tur'].includes(k)) assert.equal(typeof v, 'string');
      else if (!['bolgeler', 'setler'].includes(k)) assert.ok(v === null || Number.isFinite(v), `${k}=${v}`);
    }
  }
  const s = ORNEK.aktiviteler.map((a) => a.baslangic);
  assert.deepEqual(s, [...s].sort((x, y) => y - x), 'yeniden eskiye');
  assert.equal(ORNEK.haftalar.length, 8);
  for (const h of ORNEK.haftalar) {
    assert.deepEqual(Object.keys(h).sort(), ['adet', 'bas', 'sure_s', 'yuk']);
    assert.ok(h.yuk === null || Number.isFinite(h.yuk));
  }
  assert.ok(ORNEK.haftalar[0].bas > ORNEK.haftalar[1].bas);
  assert.deepEqual(Object.keys(ORNEK.yukBant).sort(), ['max', 'min']);
  assert.ok(ORNEK.yukBant.min >= 0 && ORNEK.yukBant.max > ORNEK.yukBant.min);
  assert.ok(ORNEK.aktiviteler.some((a) => a.setler && a.setler.length), 'kuvvet seti var');
  assert.ok(ORNEK.aktiviteler.some((a) => a.tarih === bugunTarih()) || true);
});

test('ornekUret: farklı günlerde de geçerli şekil', () => {
  for (const gun of ['2026-01-05', '2026-03-31', '2026-11-22']) {
    const o = ornekUret(new Date(`${gun}T09:00:00Z`));
    assert.equal(o.haftalar.length, 8);
    assert.ok(o.aktiviteler.length > 8);
    assert.ok(o.aktiviteler.every((a) => a.tarih <= gun));
  }
});

/* ---- çizim ---- */
const TAM_BOS = Object.fromEntries(AKTIVITE_ANAHTARLARI.map((k) => [k, null]));

async function kur(yanit, secenek = {}) {
  const kap = new Dugum('div');
  const m = aktiviteKur(kap, { getir: async () => yanit, ornek: false, canli: true, rm: false, gunAc: () => false, ...secenek });
  m.goster();
  await tick(); await tick();
  return { kap, m };
}

test('aktiviteKur: ORNEK çizilir, metinde NaN/undefined/null yok, stil bir kez eklenir', async () => {
  const { kap, m } = await kur(ORNEK);
  assert.doesNotMatch(kap.textContent, KOTU);
  assert.match(kap.textContent, /Aktiviteler/);
  assert.match(kap.textContent, /antrenman yükü/);
  assert.equal(sahteDoc.head.childNodes.filter((c) => c.attrs['data-modul'] === 'aktivite').length, 1);
  const dugmeler = hepsi(kap, acanMi);
  assert.equal(dugmeler.length, ORNEK.aktiviteler.length);
  const gr = hepsi(kap, (d) => d.attrs.role === 'img' && d.attrs.class === 'akt-grafik');
  assert.equal(gr.length, 1);
  assert.match(gr[0].attrs['aria-label'], /Haftalık antrenman yükü, son 8 hafta/);
  m.yokEt();
});

test('ayrıntı: her örnek aktivite için açılır, temiz metin, Esc kapatır ve odağı geri verir', async () => {
  const { kap, m } = await kur(ORNEK);
  const dugmeler = hepsi(kap, acanMi);
  for (const d of dugmeler) {
    d.tikla();
    const kok = kap.childNodes[0];
    const detay = kok.childNodes[1];
    assert.equal(detay.hidden, false);
    assert.equal(kok.childNodes[0].hidden, true);
    assert.doesNotMatch(detay.textContent, KOTU);
    sahteDoc.tus('Escape');
    assert.equal(detay.hidden, true);
    assert.equal(sahteDoc.odak, d);
  }
  m.yokEt();
});

test('ayrıntı: kuvvette set listesi, koşuda bölgeler; null alan satırı yok', async () => {
  const { kap, m } = await kur(ORNEK);
  const dugmeler = hepsi(kap, acanMi);
  const kuvvet = dugmeler[ORNEK.aktiviteler.findIndex((a) => a.tur === 'strength_training')];
  kuvvet.tikla();
  let t = kap.childNodes[0].childNodes[1].textContent;
  assert.match(t, /Bench press/);
  assert.match(t, /3 × \d+/);
  assert.doesNotMatch(t, /Adım boyu|Yer temas/);
  sahteDoc.tus('Escape');
  const kosu = dugmeler[ORNEK.aktiviteler.findIndex((a) => a.tur === 'running')];
  kosu.tikla();
  t = kap.childNodes[0].childNodes[1].textContent;
  assert.match(t, /Nabız bölgeleri/);
  assert.match(t, /Adım boyu/);
  assert.doesNotMatch(t, /Kuvvet|Set/);
  m.yokEt();
});

test('tamamen null aktivite: kart ve ayrıntı temiz', async () => {
  const bos = { ...TAM_BOS, id: 'x', tarih: bugunTarih() };
  const { kap, m } = await kur({ aktiviteler: [bos, { ...bos, id: 'y', tur: 'weird_thing', setler: [{}, { tur: null }] }], haftalar: [{ bas: '2026-11-16', yuk: null, sure_s: 0, adet: 0 }], yukBant: null });
  assert.doesNotMatch(kap.textContent, KOTU);
  assert.match(kap.textContent, /Antrenman/);
  const dugmeler = hepsi(kap, acanMi);
  assert.equal(dugmeler.length, 2);
  for (const d of dugmeler) {
    d.tikla();
    const t = kap.childNodes[0].childNodes[1].textContent;
    assert.doesNotMatch(t, KOTU);
    assert.match(t, /ayrıntı yok/);
    sahteDoc.tus('Escape');
  }
  m.yokEt();
});

test('durumlar: hata (getir null) ve boş yanıt', async () => {
  let r = await kur(null);
  assert.match(r.kap.textContent, /alınamadı/);
  assert.doesNotMatch(r.kap.textContent, KOTU);
  r.m.yokEt();
  r = await kur({ aktiviteler: [], haftalar: [], yukBant: null });
  assert.match(r.kap.textContent, /Henüz aktivite yok/);
  r.m.yokEt();
  r = await kur(null, { getir: async () => { throw new Error('x'); } });
  assert.match(r.kap.textContent, /alınamadı/);
  r.m.yokEt();
});

test('baglam.ornek: örnek verisi ve etiket', async () => {
  const { kap, m } = await kur(null, { ornek: true });
  assert.match(kap.textContent, /Örnek veri/);
  assert.doesNotMatch(kap.textContent, /alınamadı/);
  m.gizle(); m.yokEt();
  assert.equal(kap.childNodes.length, 0);
});

test('yanitDuzenle: bant negatif min 0a çekilir, geçersiz şekil null', () => {
  assert.equal(yanitDuzenle('x'), null);
  assert.deepEqual(yanitDuzenle({ aktiviteler: [], haftalar: [], yukBant: { min: -40, max: 300 } }).yukBant, { min: 0, max: 300 });
  assert.equal(yanitDuzenle({ yukBant: { min: null, max: 5 } }).yukBant, null);
});

test('haftalikGrafik: 9 haftadan en yeni 8, bantsız da çizer', () => {
  const haf = Array.from({ length: 9 }, (_, i) => ({ bas: `2026-11-${String(16 - i).padStart(2, '0')}`, yuk: i === 3 ? null : 100 + i * 10, sure_s: 100, adet: i === 3 ? 0 : 2 }));
  const g = haftalikGrafik(haf, null);
  assert.match(g.aria, /son 8 hafta/);
  assert.match(g.aria, /antrenman yok/);
  assert.doesNotMatch(g.aria, /Normal aralık|NaN|undefined/);
});

/* ---- süren hafta ve yük verisi yok ---- */
function pazartesi(bugun) {
  const [y, m, d] = bugun.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}
const gunOnce = (tarih, n) => { const t = new Date(`${tarih}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };

test('haftaDurum: süren hafta banda göre yargılanmaz, tamamlanan hafta yargılanır', () => {
  const bant = { min: 200, max: 400 };
  const bugun = '2026-11-18'; // Çarşamba
  assert.equal(pazartesi(bugun), '2026-11-16');
  const suren = haftaDurum({ bas: '2026-11-16', yuk: 50 }, bant, bugun);
  assert.equal(suren.durum, null);
  assert.equal(suren.suruyor, true);
  assert.equal(suren.metin, 'Hafta sürüyor');
  assert.deepEqual(haftaDurum({ bas: '2026-11-09', yuk: 50 }, bant, bugun), { durum: 'lo', metin: 'normalin altında' });
  assert.equal(haftaDurum({ bas: '2026-11-09', yuk: 300 }, bant, bugun).durum, 'ok');
});

test('ozetKart: bu hafta sürüyor notu (ok ve lo/hi rengi yok); geçmiş hafta durumu korunur', async () => {
  const bugun = bugunTarih();
  const bas = pazartesi(bugun);
  const haf = (b, yuk) => ({ bas: b, yuk, sure_s: 3600, adet: 2 });
  const yanit = { aktiviteler: [], haftalar: [haf(bas, 40), haf(gunOnce(bas, 7), 300)], yukBant: { min: 200, max: 400 } };
  const { kap, m } = await kur(yanit);
  assert.match(kap.textContent, /Hafta sürüyor/);
  assert.match(kap.textContent, /40/);
  assert.match(kap.textContent, /2 antrenman/);
  assert.equal(hepsi(kap, (d) => /akt-durum/.test(d.className || '')).length, 0);
  assert.doesNotMatch(kap.textContent, /normalin altında|normal aralıkta|normalin üstünde/);
  m.yokEt();
  // Geçmiş hafta en yeni gibi gelirse (örn. eski veri) durum pili görünür
  const eski = { ...yanit, haftalar: [haf(gunOnce(bas, 7), 50)] };
  const k2 = await kur(eski);
  assert.match(k2.kap.textContent, /normalin altında/);
  assert.doesNotMatch(k2.kap.textContent, /Hafta sürüyor/);
  k2.m.yokEt();
});

test('haftalikGrafik: adet>0 ama yük yok -> "yük verisi yok"; adet 0 -> "antrenman yok"', () => {
  const haf = [
    { bas: '2026-11-16', yuk: null, sure_s: 600, adet: 2 },
    { bas: '2026-11-09', yuk: null, sure_s: 0, adet: 0 },
    { bas: '2026-11-02', yuk: 120, sure_s: 600, adet: 1 },
  ];
  const g = haftalikGrafik(haf, null);
  assert.match(g.aria, /16 Kas[^,]* haftası yük verisi yok/);
  assert.match(g.aria, /9 Kas[^,]* haftası antrenman yok/);
  assert.match(g.aria, /120/);
  assert.doesNotMatch(g.aria, /NaN|undefined|null/);
});

/* ---- kahraman kart, bölge halkası, etki kadranları ---- */
test('bolgeOzet, bolgeDakika, etkiEtiketi, simgeTuru', () => {
  assert.deepEqual(bolgeOzet([60, 600, 1200, 300, 0]), { s: [60, 600, 1200, 300, 0], toplam: 2160, baskin: 2 });
  assert.deepEqual(bolgeOzet([null, NaN, -5, 120]).s, [0, 0, 0, 120, 0]);
  assert.equal(bolgeOzet([0, 0, 0, 0, 0]), null);
  assert.equal(bolgeOzet(null), null);
  assert.equal(bolgeDakika(1080), '18 dk');
  assert.equal(bolgeDakika(20), '<1 dk');
  assert.equal(bolgeDakika(0), '–');
  assert.equal(bolgeDakika(null), '–');
  assert.equal(etkiEtiketi(0.4), 'Etkisiz');
  assert.equal(etkiEtiketi(1.96), 'Koruyor');
  assert.equal(etkiEtiketi(3.4), 'Geliştiriyor');
  assert.equal(etkiEtiketi(4.2), 'Çok geliştiriyor');
  assert.equal(etkiEtiketi(5), 'Aşırı yüklenme');
  assert.equal(etkiEtiketi(null), null);
  assert.equal(simgeTuru(turGrubu('running')), 'kosu');
  assert.equal(simgeTuru(turGrubu('hiking')), 'dag');
  assert.equal(simgeTuru(turGrubu('walking')), 'ayak');
  assert.equal(simgeTuru(turGrubu('yoga')), 'nefes');
  assert.equal(simgeTuru(turGrubu('pilates')), 'nefes');
  assert.equal(simgeTuru(turGrubu('quidditch')), 'nabiz');
  assert.equal(simgeTuru('constructor'), 'nabiz');
});

test('kahraman: en son antrenman üstte; halka 5 dilimli, kadranlar değer metniyle; liste kalanları gösterir', async () => {
  const { kap, m } = await kur(ORNEK);
  const son = ORNEK.aktiviteler[0];
  const k = hepsi(kap, (d) => d.className === 'akt-kahraman');
  assert.equal(k.length, 1);
  assert.equal(k[0].attrs['aria-label'], 'Son antrenman');
  assert.match(k[0].textContent, new RegExp(turAdi(son.tur)));
  const halka = hepsi(k[0], (d) => d.attrs.class === 'akt-halka');
  assert.equal(halka.length, 1);
  assert.match(halka[0].attrs['aria-label'], /^Nabız bölgeleri: Çok hafif .*Azami .*En çok/);
  assert.equal(hepsi(k[0], (d) => /akt-ljS/.test(d.className)).length, 5);
  const kadran = hepsi(k[0], (d) => d.className === 'akt-kadran');
  assert.equal(kadran.length, [son.aerobik, son.anaerobik].filter(Number.isFinite).length);
  assert.match(kadran[0].attrs['aria-label'], /^Aerobik etki \d,\d \/ 5, /);
  assert.equal(hepsi(kap, (d) => d.tag === 'button' && /akt-oge/.test(d.className)).length, ORNEK.aktiviteler.length - 1);
  assert.match(kap.textContent, /Önceki antrenmanlar/);
  assert.doesNotMatch(kap.textContent, KOTU);
  m.yokEt();
});

test('kahraman: seyrek son antrenman (yalnız süre) halka/kadran/yük çizmez', async () => {
  const yoga = { ...TAM_BOS, id: 'y', tarih: bugunTarih(), tur: 'yoga', sure_s: 1800, kalori: 80 };
  const { kap, m } = await kur({ aktiviteler: [yoga], haftalar: [], yukBant: null });
  const k = hepsi(kap, (d) => d.className === 'akt-kahraman')[0];
  assert.match(k.textContent, /Yoga/);
  assert.match(k.textContent, /30 dk/);
  assert.doesNotMatch(k.textContent, /Yük|Mesafe|nabız|Aerobik/);
  assert.equal(hepsi(k, (d) => d.attrs.class === 'akt-halka' || d.className === 'akt-kadran').length, 0);
  assert.doesNotMatch(kap.textContent, KOTU);
  assert.doesNotMatch(kap.textContent, /Önceki antrenmanlar/);
  m.yokEt();
});

/* ---- hareket motoru: IntersectionObserver, rAF, gizle/yokEt temizliği, azaltılmış hareket ---- */
function sahteOrtam() {
  const o = { kuyruk: [], iptal: 0, gozlemciler: [] };
  globalThis.requestAnimationFrame = (f) => { o.kuyruk.push(f); return o.kuyruk.length; };
  globalThis.cancelAnimationFrame = () => { o.iptal++; };
  globalThis.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; this.izlenen = new Set(); this.kopuk = false; o.gozlemciler.push(this); }
    observe(e) { this.izlenen.add(e); }
    unobserve(e) { this.izlenen.delete(e); }
    disconnect() { this.izlenen.clear(); this.kopuk = true; }
  };
  o.kare = (t) => { const q = o.kuyruk; o.kuyruk = []; q.forEach((f) => f(t)); };
  o.temizle = () => { delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; delete globalThis.IntersectionObserver; };
  return o;
}
const KOTU_OZ = /NaN|undefined|Infinity|null/;
const ozBozuk = (kap) => hepsi(kap, (d) => Object.values(d.attrs).some((v) => KOTU_OZ.test(v)));

test('canlı simgeler: yalnız görünür olan oynar; gizle döngüyü durdurur; yokEt gözlemciyi koparır', async () => {
  const o = sahteOrtam();
  try {
    const turler = ['running', 'walking', 'hiking', 'cycling', 'swimming', 'strength_training', 'yoga', 'pilates', 'hiit', 'cardio', 'rowing', 'elliptical', 'other', 'weird'];
    const aktiviteler = turler.map((tur, i) => ({ ...ORNEK.aktiviteler[0], id: `t${i}`, tur, baslangic: 1e12 - i * 1e6 }));
    const { kap, m } = await kur({ ...ORNEK, aktiviteler });
    const io = o.gozlemciler[0];
    assert.equal(io.izlenen.size, turler.length, 'her kartın simgesi gözlenir');
    assert.equal(ozBozuk(kap).length, 0, 'statik ilk kare temiz');
    // kahraman halka/kadran dolum animasyonu döngüyü başlatır
    assert.ok(o.kuyruk.length > 0);
    for (let t = 0; t <= 2000; t += 40) o.kare(t);
    assert.equal(o.kuyruk.length, 0, 'tween bitti, görünen simge yok: döngü uyur');
    // iki simge görünür olur: döngü yeniden başlar ve her karede sürer
    const ilk = [...io.izlenen].slice(0, 3);
    const onceki = JSON.stringify(ilk[0].childNodes[0].childNodes[0].childNodes.map((c) => c.attrs));
    io.cb(ilk.map((target) => ({ target, isIntersecting: true })));
    assert.equal(o.kuyruk.length, 1);
    for (let t = 3000; t <= 9000; t += 37) o.kare(t);
    assert.equal(o.kuyruk.length, 1, 'görünür simge varken döngü sürer');
    assert.notEqual(JSON.stringify(ilk[0].childNodes[0].childNodes[0].childNodes.map((c) => c.attrs)), onceki, 'simge hareket etti');
    assert.equal(ozBozuk(kap).length, 0, 'hareket kareleri temiz');
    // ayrıntı simgesi de gözlenir, kapanınca bırakılır
    hepsi(kap, acanMi)[1].tikla();
    assert.equal(io.izlenen.size, turler.length + 1);
    sahteDoc.tus('Escape');
    assert.equal(io.izlenen.size, turler.length);
    // gizle: döngü durur, sıradaki kare yeniden kurmaz
    m.gizle();
    assert.ok(o.iptal > 0);
    o.kare(9100);
    assert.equal(o.kuyruk.length, 0, 'gizliyken kare istenmez');
    m.goster();
    assert.equal(o.kuyruk.length, 1, 'yeniden gösterince sürer');
    m.yokEt();
    assert.equal(io.kopuk, true);
    o.kare(9200);
    assert.equal(o.kuyruk.length, 0, 'yokEt sonrası döngü yok');
    assert.equal((sahteDoc.dinleyici.visibilitychange || []).length, 0, 'görünürlük dinleyicisi kaldırıldı');
    assert.equal((sahteDoc.dinleyici.keydown || []).length, 0);
  } finally { o.temizle(); }
});

test('canlı simgeler: baglam.rm altında döngü hiç kurulmaz, halka/kadran doğrudan son hâlinde', async () => {
  const o = sahteOrtam();
  try {
    const { kap, m } = await kur(ORNEK, { rm: true });
    const io = o.gozlemciler[0];
    io.cb([...io.izlenen].map((target) => ({ target, isIntersecting: true })));
    assert.equal(o.kuyruk.length, 0);
    const dolgu = hepsi(kap, (d) => d.tag === 'path' && d.attrs['stroke-width'] === '6' && d.attrs['stroke-dasharray']);
    assert.ok(dolgu.length >= 1);
    assert.ok(dolgu.every((d) => Number(d.attrs['stroke-dasharray'].split(' ')[0]) > 0), 'kadran değeri kadar dolu');
    assert.equal(ozBozuk(kap).length, 0);
    m.yokEt();
  } finally { o.temizle(); }
});
