import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORNEK, aylaraBol, enerjiRengi, enerjiKelime, ayOzeti, gunEtiketi, tarihCoz, degerMetni, takvimKur } from './takvim.js';

const iki = (n) => String(n).padStart(2, '0');
function tamAy(y, a, e = 0.5) {
  const n = new Date(Date.UTC(y, a + 1, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => ({ tarih: `${y}-${iki(a + 1)}-${iki(i + 1)}`, e, hukum: 'Dengeli bir gün.', kartlar: {} }));
}
const bos = (tarih) => ({ tarih, e: null, hukum: null, kartlar: {} });

test('aylaraBol: ay sınırları, en yeni ay önce, günler eskiden yeniye', () => {
  const a = aylaraBol([...tamAy(2026, 9), ...tamAy(2026, 10)]);
  assert.deepEqual(a.map((x) => x.anahtar), ['2026-11', '2026-10']);
  assert.equal(a[0].ad, 'Kasım');
  assert.equal(a[0].gunler.length, 30);
  assert.equal(a[1].gunler.length, 31);
  assert.equal(a[0].gunler[0].tarih, '2026-11-01');
  assert.equal(a[1].gunler.at(-1).tarih, '2026-10-31');
});

test('aylaraBol: Pazartesi başlangıçlı sütun kayması', () => {
  // 1 Kasım 2026 Pazar → 6 boşluk; 1 Aralık 2026 Salı → 1; 1 Haziran 2026 Pazartesi → 0
  assert.equal(aylaraBol(tamAy(2026, 10))[0].bosluk, 6);
  assert.equal(aylaraBol(tamAy(2026, 11))[0].bosluk, 1);
  assert.equal(aylaraBol(tamAy(2026, 5))[0].bosluk, 0);
});

test('aylaraBol: artık yıl şubatı 29 gün; normal yıl 28', () => {
  assert.equal(aylaraBol(tamAy(2028, 1))[0].gunler.length, 29);
  assert.equal(aylaraBol(tamAy(2027, 1))[0].gunler.length, 28);
  assert.equal(aylaraBol(tamAy(2028, 1))[0].bosluk, 1); // 1 Şubat 2028 Salı
});

test('aylaraBol: ay ortasında başlayan veri boşluğu o günün sütunundan alır; bozuk girdiler atlanır', () => {
  const a = aylaraBol([bos('2026-11-18'), bos('2026-11-19'), { tarih: 'bozuk' }, null]);
  assert.equal(a.length, 1);
  assert.equal(a[0].bosluk, 2); // 18 Kasım 2026 Çarşamba
  assert.equal(a[0].gunler.length, 2);
  assert.deepEqual(aylaraBol(null), []);
  assert.deepEqual(aylaraBol([]), []);
});

test('aylaraBol: aradaki eksik gün boş gün olarak tamamlanır', () => {
  const a = aylaraBol([bos('2026-11-03'), bos('2026-11-06')]);
  assert.deepEqual(a[0].gunler.map((g) => g.tarih), ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
});

test('tarihCoz: geçersiz tarih null', () => {
  assert.equal(tarihCoz('2026-02-30'), null);
  assert.equal(tarihCoz('x'), null);
  assert.equal(tarihCoz('2026-11-01').hg, 6);
});

test('enerjiRengi: null/NaN yok, uçlar ve örnekler uygulamadaki şerit rampasıyla aynı', () => {
  assert.equal(enerjiRengi(null), null);
  assert.equal(enerjiRengi(undefined), null);
  assert.equal(enerjiRengi(NaN), null);
  assert.equal(enerjiRengi(0), 'rgb(255, 122, 69)'); // #ff7a45
  assert.equal(enerjiRengi(0.5), 'rgb(255, 176, 122)'); // #ffb07a
  assert.equal(enerjiRengi(1), 'rgb(201, 245, 180)'); // #c9f5b4
  assert.equal(enerjiRengi(0.25), 'rgb(255, 149, 96)');
  assert.equal(enerjiRengi(0.75), 'rgb(228, 211, 151)');
  assert.equal(enerjiRengi(-3), enerjiRengi(0));
  assert.equal(enerjiRengi(9), enerjiRengi(1));
});

test('enerjiKelime: hüküm eşiklerinden türeyen üç kelime', () => {
  assert.equal(enerjiKelime(null), null);
  assert.equal(enerjiKelime(0.1), 'yorgun');
  assert.equal(enerjiKelime(0.479), 'yorgun');
  assert.equal(enerjiKelime(0.48), 'dengeli');
  assert.equal(enerjiKelime(0.619), 'dengeli');
  assert.equal(enerjiKelime(0.62), 'zinde');
  assert.equal(enerjiKelime(1), 'zinde');
});

test('ayOzeti: ortalama, normal dışı gün sayısı, boş ay', () => {
  const g = [
    { tarih: '2026-11-01', e: 0.4, hukum: 'x', kartlar: { uyku: { v: 60, durum: 'lo' }, hrv: { v: 50, durum: 'ok' } } },
    { tarih: '2026-11-02', e: 0.6, hukum: 'x', kartlar: { uyku: { v: 75, durum: 'ok' } } },
    { tarih: '2026-11-03', e: 0.8, hukum: 'x', kartlar: { stres: { v: 50, durum: 'hi' }, hrv: { v: 70, durum: 'hi' } } },
    bos('2026-11-04'),
  ];
  const o = ayOzeti(g);
  assert.ok(Math.abs(o.ort - 0.6) < 1e-9);
  assert.equal(o.kelime, 'dengeli');
  assert.equal(o.normalDisi, 2);
  assert.equal(o.veriGunu, 3);
  const b = ayOzeti([bos('2026-11-01'), bos('2026-11-02')]);
  assert.deepEqual(b, { ort: null, kelime: null, veriGunu: 0, normalDisi: 0 });
  assert.equal(ayOzeti(null).ort, null);
});

test('ORNEK: sözleşme biçimi', () => {
  assert.ok(Array.isArray(ORNEK.gunler));
  assert.ok(ORNEK.gunler.length >= 100);
  const idler = ['uyku', 'bb', 'hrv', 'nabiz', 'stres', 'yuk'];
  let onceki = '';
  for (const g of ORNEK.gunler) {
    assert.deepEqual(Object.keys(g).sort(), ['e', 'hukum', 'kartlar', 'tarih']);
    assert.match(g.tarih, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(g.tarih > onceki, 'eskiden yeniye');
    onceki = g.tarih;
    assert.ok(g.e === null || (typeof g.e === 'number' && g.e >= 0 && g.e <= 1));
    assert.ok(g.hukum === null || typeof g.hukum === 'string');
    assert.deepEqual(Object.keys(g.kartlar).sort(), [...idler].sort());
    for (const id of idler) {
      const k = g.kartlar[id];
      assert.deepEqual(Object.keys(k).sort(), ['durum', 'v']);
      assert.ok(k.v === null || Number.isFinite(k.v));
      assert.ok([null, 'lo', 'ok', 'hi'].includes(k.durum));
    }
  }
  assert.ok(ORNEK.gunler.some((g) => g.e === null), 'veri olmayan gün de var');
  assert.ok(ayOzeti(ORNEK.gunler).normalDisi > 0);
});

// ---- minimal sahte DOM ----
function sahteDom() {
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.parentNode = null; this.attrs = {}; this.listeners = {}; this._text = ''; this.hidden = false; this.className = ''; this.style = { setProperty() {} }; this.innerHTML = ''; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._text = String(v); }
    get ownerDocument() { return doc; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
    fire(t, ev = {}) { (this.listeners[t] || []).forEach((f) => f(ev)); }
    focus() { doc.aktif = this; }
    all(f, out = []) { if (f(this)) out.push(this); this.children.forEach((c) => c.all(f, out)); return out; }
    get html() { return this.innerHTML + this.children.map((c) => c.html).join(''); }
  }
  const doc = { aktif: null, head: new El('head'), createElement: (t) => new El(t) };
  return { doc, El };
}

async function kurVeGoster(veri, ekBaglam = {}) {
  const { doc } = sahteDom();
  const kap = doc.createElement('section');
  const acilan = [];
  const t = takvimKur(kap, { getir: async () => veri, ornek: false, canli: true, rm: true, gunAc: (d) => { acilan.push(d); return false; }, ...ekBaglam });
  await t.goster();
  return { doc, kap, t, acilan };
}
const kokKapat = (s) => s.replace(/\s+/g, ' ');

test('takvimKur: ORNEK ile kurulur, gün düğmeleri etiketli, "NaN/undefined/null" yazısı yok', async () => {
  const { doc, kap, t } = await kurVeGoster(null, { ornek: true });
  const dugmeler = kap.all((e) => e.tagName === 'button' && e.className.includes('tkv-gun'));
  assert.equal(dugmeler.length, ORNEK.gunler.length);
  for (const d of dugmeler) assert.ok(d.getAttribute('aria-label').length > 5);
  const metin = kokKapat(kap.textContent);
  assert.doesNotMatch(metin, /NaN|undefined|null/);
  assert.match(metin, /Takvim/);
  assert.equal(doc.head.children.length, 1);
  assert.equal(doc.head.children[0].getAttribute('data-modul'), 'takvim');
  t.gizle(); t.yokEt();
});

test('takvimKur: dokununca gunAc çağrılır; false ise kart açılır, kapat ve Esc ile kapanır, odak güne döner', async () => {
  const gunler = tamAy(2026, 10, 0.7).map((g, i) => ({ ...g, kartlar: { uyku: { v: i === 0 ? null : 80, durum: i === 0 ? null : 'ok' }, hrv: { v: 40, durum: 'lo' } } }));
  const { kap, acilan } = await kurVeGoster({ gunler });
  const dugme = kap.all((e) => e.tagName === 'button' && e.className.includes('tkv-gun'))[1]; // 2 Kasım
  dugme.fire('click');
  assert.deepEqual(acilan, ['2026-11-02']);
  let kart = kap.all((e) => e.className === 'tkv-kart')[0];
  assert.ok(kart, 'kart açıldı');
  const m = kokKapat(kart.textContent);
  assert.match(m, /2 Kasım 2026/);
  assert.match(m, /Uyku80normalde/);
  assert.match(m, /HRV40 msaltında/);
  assert.match(m, /Stres–veri yok/); // kartlarda olmayan ölçüm
  assert.doesNotMatch(m, /NaN|undefined|null/);
  assert.equal(dugme.getAttribute('aria-expanded'), 'true');
  // kapat düğmesi
  kart.all((e) => e.className === 'tkv-kapat')[0].fire('click');
  assert.equal(kap.all((e) => e.className === 'tkv-kart').length, 0);
  assert.equal(dugme.getAttribute('aria-expanded'), 'false');
  // Esc
  dugme.fire('click');
  assert.equal(kap.all((e) => e.className === 'tkv-kart').length, 1);
  kap.children[0].fire('keydown', { key: 'Escape', stopPropagation() {} });
  assert.equal(kap.all((e) => e.className === 'tkv-kart').length, 0);
});

test('takvimKur: gunAc true dönerse kart açılmaz', async () => {
  const { kap } = await kurVeGoster({ gunler: tamAy(2026, 10) }, { gunAc: () => true });
  kap.all((e) => e.tagName === 'button' && e.className.includes('tkv-gun'))[3].fire('click');
  assert.equal(kap.all((e) => e.className === 'tkv-kart').length, 0);
});

test('takvimKur: bütün günleri boş ay, veri yok (null kart) — NaN/undefined yok; veri yoksa sakin metin', async () => {
  const gunler = tamAy(2026, 10).map((g) => ({ ...g, e: null, hukum: null, kartlar: { uyku: { v: null, durum: null } } }));
  const { kap } = await kurVeGoster({ gunler });
  const d = kap.all((e) => e.tagName === 'button' && e.className.includes('tkv-gun'));
  assert.ok(d.every((x) => /veri yok$/.test(x.getAttribute('aria-label'))));
  assert.ok(d.every((x) => x.className.includes('bos')));
  d[0].fire('click');
  const m = kokKapat(kap.textContent);
  assert.doesNotMatch(m, /NaN|undefined|null/);
  assert.match(m, /Bu gün için veri yok/);
  const bosYanit = await kurVeGoster({ gunler: [] });
  assert.match(bosYanit.kap.textContent, /Henüz veri yok/);
  const hata = await kurVeGoster(null);
  assert.match(hata.kap.textContent, /alınamadı/);
});

test('gunEtiketi / degerMetni', () => {
  assert.equal(gunEtiketi({ tarih: '2026-11-18', e: 0.7, hukum: 'İyi gidiyorsun.', kartlar: {} }), 'Çarşamba 18 Kasım: İyi gidiyorsun.');
  assert.equal(gunEtiketi(bos('2026-11-18')), 'Çarşamba 18 Kasım: veri yok');
  assert.equal(degerMetni({ birim: ' ms' }, { v: 52.4 }), '52 ms');
  assert.equal(degerMetni({ birim: '' }, { v: null }), '–');
  assert.equal(degerMetni({ birim: '' }, undefined), '–');
});

test('takvimKur: 5 dakikadan taze veri varken yeniden alınmaz ve açık kart kapanmaz; bayatlayınca yenilenir', async () => {
  const gunler = tamAy(2026, 10, 0.7);
  let cagri = 0;
  const { kap, t } = await kurVeGoster({ gunler }, { getir: async () => { cagri += 1; return { gunler }; } });
  assert.equal(cagri, 1);
  kap.all((e) => e.tagName === 'button' && e.className.includes('tkv-gun'))[1].fire('click');
  assert.ok(kap.all((e) => e.className === 'tkv-kart')[0]);
  t.gizle(); // gizlemek kartı kapatır; yeniden gösterimde veri tazeyse yine yeniden alınmaz
  await t.goster();
  assert.equal(cagri, 1);
  const gercek = Date.now;
  try {
    Date.now = () => gercek() + 5 * 60 * 1000 + 1000;
    await t.goster();
  } finally { Date.now = gercek; }
  assert.equal(cagri, 2);
});

test('takvimKur: açık kartlı sayfa yeniden gösterilince (taze veri) kart açık kalır', async () => {
  const gunler = tamAy(2026, 10, 0.7);
  const { kap, t } = await kurVeGoster({ gunler });
  kap.all((e) => e.tagName === 'button' && e.className.includes('tkv-gun'))[1].fire('click');
  await t.goster();
  assert.ok(kap.all((e) => e.className === 'tkv-kart')[0], 'kart hâlâ açık');
});
