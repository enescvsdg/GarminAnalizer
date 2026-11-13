import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { istekIsle } from '../src/api/router.js';
import { durumYaz, gunUpsert } from '../src/db.js';

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
