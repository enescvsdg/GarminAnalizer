import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { istekIsle } from '../src/api/router.js';
import { durumYaz, gunUpsert } from '../src/db.js';
import { gunEkle } from '../src/zaman.js';
import { apiYaniti } from '../src/stats/ozet.js';
import { bant, OLCUMLER } from '../src/stats/baseline.js';

const SIMDI = Date.UTC(2026, 10, 12, 9, 0); // 12 Kas 2026 12:00 İstanbul
const ORIGIN = 'https://ornek.github.io';

function ortam(ek = {}) {
  return { DB: testD1(), DEVICE_KEY: 'gizli', IZINLI_ORIGIN: ORIGIN, ...ek };
}
function istek(yol, { yontem = 'GET', basliklar = {}, anahtar = 'gizli' } = {}) {
  const b = { ...basliklar };
  if (anahtar !== null) b['X-Device-Key'] = anahtar;
  return new Request(`https://w.test${yol}`, { method: yontem, headers: b });
}
const json = (r) => r.json();

test('anahtar yoksa 401 ve gövdede veri yok', async () => {
  const r = await istekIsle(istek('/api/gunler', { anahtar: null }), ortam(), SIMDI);
  assert.equal(r.status, 401);
  assert.deepEqual(await json(r), { hata: 'yetkisiz' });
});

test('yanlış anahtar 401', async () => {
  const r = await istekIsle(istek('/api/gunler', { anahtar: 'yanlis' }), ortam(), SIMDI);
  assert.equal(r.status, 401);
  assert.deepEqual(await json(r), { hata: 'yetkisiz' });
});

test('doğru anahtarla /api/gunler 200 ve 28 gün', async () => {
  const r = await istekIsle(istek('/api/gunler'), ortam(), SIMDI);
  assert.equal(r.status, 200);
  const g = await json(r);
  assert.equal(g.gunler.length, 28);
  assert.equal(g.bugun, '2026-11-12');
});

test('gun parametresi 1-90 arasına sıkıştırılır', async () => {
  const env = ortam();
  const al = async (q) => (await json(await istekIsle(istek(`/api/gunler${q}`), env, SIMDI))).gunler.length;
  assert.equal(await al('?gun=500'), 90);
  assert.equal(await al('?gun=abc'), 28);
  assert.equal(await al('?gun=0'), 1);
  assert.equal(await al('?gun=-5'), 1);
  assert.equal(await al('?gun=7'), 7);
});

test('CORS: izinli origin yansıtılır, başkası yansıtılmaz', async () => {
  const env = ortam();
  const a = await istekIsle(istek('/api/durum', { basliklar: { Origin: ORIGIN } }), env, SIMDI);
  assert.equal(a.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(a.headers.get('Vary'), 'Origin');
  assert.equal(a.headers.get('Cache-Control'), 'no-store');
  assert.equal(a.headers.get('Content-Type'), 'application/json; charset=utf-8');
  const b = await istekIsle(istek('/api/durum', { basliklar: { Origin: 'https://kotu.example' } }), env, SIMDI);
  assert.equal(b.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(b.headers.get('Vary'), 'Origin');
  const c = await istekIsle(istek('/api/durum'), env, SIMDI);
  assert.equal(c.headers.get('Access-Control-Allow-Origin'), null);
});

test('izinli listede ikinci origin (localhost) yansıtılır', async () => {
  const env = ortam({ IZINLI_ORIGIN: ` ${ORIGIN} , http://localhost:4173 ` });
  const r = await istekIsle(istek('/api/durum', { basliklar: { Origin: 'http://localhost:4173' } }), env, SIMDI);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'http://localhost:4173');
  const k = await istekIsle(istek('/api/durum', { basliklar: { Origin: 'http://localhost:4174' } }), env, SIMDI);
  assert.equal(k.headers.get('Access-Control-Allow-Origin'), null);
});

test('OPTIONS 204, Allow-Headers X-Device-Key içerir, kimlik istemez', async () => {
  const r = await istekIsle(
    istek('/api/gunler', { yontem: 'OPTIONS', anahtar: null, basliklar: { Origin: ORIGIN } }), ortam(), SIMDI);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Headers'), 'X-Device-Key');
  assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  assert.equal(r.headers.get('Access-Control-Max-Age'), '86400');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(r.headers.get('Vary'), 'Origin');
});

test('bilinmeyen yol 404, POST 405', async () => {
  const env = ortam();
  const a = await istekIsle(istek('/api/yok'), env, SIMDI);
  assert.equal(a.status, 404);
  assert.deepEqual(await json(a), { hata: 'bulunamadi' });
  const b = await istekIsle(istek('/api/gunler', { yontem: 'POST' }), env, SIMDI);
  assert.equal(b.status, 405);
  assert.deepEqual(await json(b), { hata: 'yontem' });
});

test('/api/durum key_durum ve son_esitleme döner', async () => {
  const env = ortam();
  await durumYaz(env.DB, 'key_durum', 'gecerli');
  await durumYaz(env.DB, 'son_esitleme', 1234567);
  await durumYaz(env.DB, 'gecmis_imlec', { sonraki: '2026-01-01', bitti: true, bosArdisik: 0 });
  const r = await istekIsle(istek('/api/durum'), env, SIMDI);
  assert.equal(r.status, 200);
  assert.deepEqual(await json(r), { sonEsitleme: 1234567, keyDurum: 'gecerli', gecmisBitti: true });
});

test('/api/durum boş veritabanında null ve false döner', async () => {
  const r = await istekIsle(istek('/api/durum'), ortam(), SIMDI);
  assert.deepEqual(await json(r), { sonEsitleme: null, keyDurum: null, gecmisBitti: false });
});

test('anahtar karşılaştırması uzunluk farkında da 401 verir ve fırlatmaz', async () => {
  const env = ortam();
  for (const k of ['g', 'gizli-ve-cok-daha-uzun-bir-anahtar', '']) {
    const r = await istekIsle(istek('/api/durum', { anahtar: k }), env, SIMDI);
    assert.equal(r.status, 401);
  }
});

test('DEVICE_KEY boşken ya da tanımsızken her istek 401', async () => {
  for (const dk of ['', undefined]) {
    const env = ortam({ DEVICE_KEY: dk });
    const a = await istekIsle(istek('/api/durum', { anahtar: '' }), env, SIMDI);
    assert.equal(a.status, 401);
    const b = await istekIsle(istek('/api/durum', { anahtar: 'gizli' }), env, SIMDI);
    assert.equal(b.status, 401);
  }
});

test('401 yanıtı da Vary: Origin ve izinli origin için Allow-Origin taşır', async () => {
  const r = await istekIsle(istek('/api/gunler', { anahtar: null, basliklar: { Origin: ORIGIN } }), ortam(), SIMDI);
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('Vary'), 'Origin');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
});

test('/api/gunler satır yokken de 200 ve N gün döner, değerler null', async () => {
  const r = await istekIsle(istek('/api/gunler?gun=5'), ortam(), SIMDI);
  assert.equal(r.status, 200);
  const g = await json(r);
  assert.equal(g.gunler.length, 5);
  for (const gun of g.gunler) {
    for (const v of Object.values(gun.d)) assert.equal(v, null);
  }
});

test('/api/gunler meta ve satır verisini yansıtır', async () => {
  const env = ortam();
  await durumYaz(env.DB, 'son_esitleme', 777);
  await durumYaz(env.DB, 'key_durum', 'gecersiz');
  await gunUpsert(env.DB, { date: '2026-11-12', steps: 1234 });
  const g = await json(await istekIsle(istek('/api/gunler?gun=3'), env, SIMDI));
  assert.equal(g.sonEsitleme, 777);
  assert.equal(g.keyDurum, 'gecersiz');
  assert.equal(g.gunler.length, 3);
});

test('anahtar sorgu parametresinde verilirse 401', async () => {
  const r = await istekIsle(
    istek('/api/gunler?key=gizli&anahtar=gizli&device_key=gizli', { anahtar: null }), ortam(), SIMDI);
  assert.equal(r.status, 401);
});

test('beklenmeyen hata 500 ve gövdede ileti yok', async () => {
  const env = ortam({ DB: { prepare() { throw new Error('GIZLI-IZ-ILETI'); } } });
  const yaz = console.error;
  const kayit = [];
  console.error = (...a) => kayit.push(a.join(' '));
  let r;
  try { r = await istekIsle(istek('/api/durum'), env, SIMDI); } finally { console.error = yaz; }
  assert.equal(r.status, 500);
  assert.deepEqual(await json(r), { hata: 'sunucu' });
  assert.equal(kayit.length, 1);
  assert.match(kayit[0], /Error/);
});

test('worker.js varsayılan dışa aktarımı fetch ve scheduled içerir', async () => {
  const { default: worker } = await import('../src/worker.js');
  assert.equal(typeof worker.fetch, 'function');
  assert.equal(typeof worker.scheduled, 'function');
});

// Bugün 2026-11-12. Satırlar bugun-31 ... bugun-3 (29 gün) + son üç gün.
function satirUret(bugun) {
  const satirlar = [];
  for (let k = 31; k >= 0; k -= 1) {
    satirlar.push({
      date: gunEkle(bugun, -k),
      sleep_score: 60 + (k % 7) * 3,
      bb_high: 50 + (k % 5) * 4,
      hrv_avg: 40 + (k % 4) * 2,
      steps: 1000 + k,
    });
  }
  return satirlar;
}

test('/api/gunler: okuma aralığı istenen günlerden eskisini kapsar, değerler doğru tarihte', async () => {
  const env = ortam();
  const bugun = '2026-11-12';
  const tum = satirUret(bugun);
  for (const s of tum) await gunUpsert(env.DB, s);
  // Bugünün değerleri belirgin olsun
  await gunUpsert(env.DB, { date: bugun, sleep_score: 91, steps: 4321 });

  const g = await json(await istekIsle(istek('/api/gunler?gun=3'), env, SIMDI));
  assert.equal(g.gunler.length, 3);
  assert.deepEqual(g.gunler.map((x) => x.tarih), ['2026-11-10', '2026-11-11', '2026-11-12']);
  // 2b: eklenen değer doğru tarihte
  assert.equal(g.gunler.at(-1).d.uyku, 91);
  assert.equal(g.gunler[1].d.uyku, 60 + (1 % 7) * 3);

  // 2a: en eski günün kişisel bandı istenen pencereden eski satırlara dayanır
  const eskiTarih = g.gunler[0].tarih;
  const uykuOlcum = OLCUMLER.find((o) => o.id === 'uyku');
  const tamSatirlar = tum.map((s) => (s.date === bugun ? { ...s, sleep_score: 91 } : s));
  assert.equal(bant(tamSatirlar, uykuOlcum, eskiTarih).kisisel, true);
  const dar = tamSatirlar.filter((s) => s.date >= eskiTarih);
  assert.equal(bant(dar, uykuOlcum, eskiTarih).kisisel, false);

  const beklenen = apiYaniti(tamSatirlar, bugun, 3, { sonEsitleme: null, keyDurum: null });
  const darYanit = apiYaniti(dar, bugun, 3, { sonEsitleme: null, keyDurum: null });
  assert.notEqual(beklenen.gunler[0].e, darYanit.gunler[0].e); // test dar okumaya duyarlı
  assert.equal(g.gunler[0].e, beklenen.gunler[0].e);
  assert.equal(g.gunler[0].gerekce, beklenen.gunler[0].gerekce);

  // Bugünün bandı da kişisel (olcumler) ve yanıtla aynı
  assert.equal(g.olcumler.find((o) => o.id === 'uyku').kisisel, true);
  assert.deepEqual(g.olcumler, beklenen.olcumler);
});

test('/api/gunler: İstanbul gün sınırı (21:30 UTC ertesi gün, 20:59 UTC aynı gün)', async () => {
  const env = ortam();
  const a = await json(await istekIsle(istek('/api/gunler?gun=2'), env, Date.UTC(2026, 10, 12, 21, 30)));
  assert.equal(a.bugun, '2026-11-13');
  assert.equal(a.gunler.at(-1).tarih, '2026-11-13');
  const b = await json(await istekIsle(istek('/api/gunler?gun=2'), env, Date.UTC(2026, 10, 12, 20, 59)));
  assert.equal(b.bugun, '2026-11-12');
  assert.equal(b.gunler.at(-1).tarih, '2026-11-12');
});

test('gun parametresi sınırları: 12abc, 1.9, boş, 0, -3', async () => {
  const env = ortam();
  const al = async (q) => (await json(await istekIsle(istek(`/api/gunler${q}`), env, SIMDI))).gunler.length;
  assert.equal(await al('?gun=12abc'), 12);
  assert.equal(await al('?gun=1.9'), 1);
  assert.equal(await al('?gun='), 28);
  assert.equal(await al('?gun=0'), 1);
  assert.equal(await al('?gun=-3'), 1);
});

test('OPTIONS izinsiz origin: 204 ve Allow-Origin yok', async () => {
  const r = await istekIsle(
    istek('/api/gunler', { yontem: 'OPTIONS', anahtar: null, basliklar: { Origin: 'https://kotu.example' } }), ortam(), SIMDI);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(r.headers.get('Vary'), 'Origin');
});

test('kimliksiz POST ve HEAD 405', async () => {
  const env = ortam();
  const p = await istekIsle(istek('/api/gunler', { yontem: 'POST', anahtar: null }), env, SIMDI);
  assert.equal(p.status, 405);
  assert.deepEqual(await json(p), { hata: 'yontem' });
  const h = await istekIsle(istek('/api/gunler', { yontem: 'HEAD' }), env, SIMDI);
  assert.equal(h.status, 405);
});
