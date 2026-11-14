import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { istekIsle } from '../src/api/router.js';
import { durumYaz, gunUpsert } from '../src/db.js';
import { gunEkle } from '../src/zaman.js';
import { apiYaniti } from '../src/stats/ozet.js';
import { bant, OLCUMLER } from '../src/stats/baseline.js';
import { yorumGuncelle } from '../src/yorum/yorum.js';

const SIMDI = Date.UTC(2026, 10, 12, 9, 0); // 12 Kas 2026 12:00 İstanbul
const ORIGIN = 'https://ornek.github.io';

function ortam(ek = {}) {
  return { DB: testD1(), DEVICE_KEY: 'gizli', IZINLI_ORIGIN: ORIGIN, ...ek };
}
function istek(yol, { yontem = 'GET', basliklar = {}, anahtar = 'gizli', govde } = {}) {
  const b = { ...basliklar };
  if (anahtar !== null) b['X-Device-Key'] = anahtar;
  const init = { method: yontem, headers: b };
  if (govde !== undefined) init.body = typeof govde === 'string' ? govde : JSON.stringify(govde);
  return new Request(`https://w.test${yol}`, init);
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
  assert.equal(r.headers.get('Access-Control-Allow-Headers'), 'X-Device-Key, Content-Type');
  assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'GET, PUT, OPTIONS');
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

// ---- Gemini yorumu ve ayar ----
const BUGUN = '2026-11-12';
async function dolu(env) {
  for (let k = 30; k >= 1; k -= 1) {
    await gunUpsert(env.DB, {
      date: gunEkle(BUGUN, -k), sleep_score: 75 + (k % 5), bb_high: 70 + (k % 4), hrv_avg: 50 + (k % 3),
      resting_hr: 52 + (k % 2), stress_avg: 30 + (k % 4), training_load: 80 + (k % 6),
    });
  }
  await gunUpsert(env.DB, {
    date: BUGUN, sleep_score: 82, bb_high: 78, hrv_avg: 55, resting_hr: 52, stress_avg: 28, training_load: 90,
  });
}
const YORUM = { hukum: 'Rahat bir gün', gerekce: 'Uykun ve HRV değerin normalin içinde, rahat tempo uygun.' };
async function yorumYaz(env) {
  const { gunleriOku } = await import('../src/db.js');
  const satirlar = await gunleriOku(env.DB, gunEkle(BUGUN, -60), BUGUN);
  const r = await yorumGuncelle({ db: env.DB, satirlar, bugun: BUGUN, simdiMs: SIMDI, yaz: async () => ({ ...YORUM }) });
  assert.equal(r.durum, 'yazildi');
}
const gunlerAl = async (env, q = '?gun=5') => json(await istekIsle(istek(`/api/gunler${q}`), env, SIMDI));

test('yorumKaynak: kayıt yokken sablon ve yanıt değişmez', async () => {
  const env = ortam();
  await dolu(env);
  const g = await gunlerAl(env);
  assert.equal(g.yorumKaynak, 'sablon');
  const { yorumKaynak, ...gerisi } = g;
  assert.deepEqual(gerisi, apiYaniti(await (await import('../src/db.js')).gunleriOku(env.DB, gunEkle(BUGUN, -34), BUGUN), BUGUN, 5, { sonEsitleme: null, keyDurum: null }));
});

test('yorumKaynak gemini: yalnız son günün hukum ve gerekce alanları değişir', async () => {
  const env = ortam();
  await dolu(env);
  const once = await gunlerAl(env);
  await yorumYaz(env);
  const sonra = await gunlerAl(env);
  assert.equal(sonra.yorumKaynak, 'gemini');
  const son = sonra.gunler.at(-1);
  assert.equal(son.hukum, YORUM.hukum);
  assert.equal(son.gerekce, YORUM.gerekce);
  assert.deepEqual({ ...son, hukum: null, gerekce: null }, { ...once.gunler.at(-1), hukum: null, gerekce: null });
  assert.deepEqual(sonra.gunler.slice(0, -1), once.gunler.slice(0, -1));
  assert.deepEqual(sonra.olcumler, once.olcumler);
  const { yorumKaynak: a, gunler: ga, ...digerSonra } = sonra;
  const { yorumKaynak: b, gunler: gb, ...digerOnce } = once;
  assert.deepEqual(digerSonra, digerOnce);
});

test('veri değişince eski Gemini yorumu gösterilmez', async () => {
  const env = ortam();
  await dolu(env);
  await yorumYaz(env);
  await gunUpsert(env.DB, { date: BUGUN, hrv_avg: 57 });
  const g = await gunlerAl(env);
  assert.equal(g.yorumKaynak, 'sablon');
  assert.notEqual(g.gunler.at(-1).hukum, YORUM.hukum);
});

test('/api/ayar: varsayılan açık, PUT gidiş-dönüş', async () => {
  const env = ortam();
  const al = async () => json(await istekIsle(istek('/api/ayar'), env, SIMDI));
  assert.deepEqual(await al(), { yapayZeka: true });
  const k = await istekIsle(istek('/api/ayar', { yontem: 'PUT', govde: { yapayZeka: false } }), env, SIMDI);
  assert.equal(k.status, 200);
  assert.deepEqual(await json(k), { yapayZeka: false });
  assert.deepEqual(await al(), { yapayZeka: false });
  const a = await istekIsle(istek('/api/ayar', { yontem: 'PUT', govde: { yapayZeka: true } }), env, SIMDI);
  assert.deepEqual(await json(a), { yapayZeka: true });
  assert.deepEqual(await al(), { yapayZeka: true });
});

test('/api/ayar PUT anahtarsız 401 ve ayar değişmez', async () => {
  const env = ortam();
  const r = await istekIsle(istek('/api/ayar', { yontem: 'PUT', anahtar: null, govde: { yapayZeka: false } }), env, SIMDI);
  assert.equal(r.status, 401);
  assert.deepEqual(await json(r), { hata: 'yetkisiz' });
  const y = await istekIsle(istek('/api/ayar', { yontem: 'PUT', anahtar: 'yanlis', govde: { yapayZeka: false } }), env, SIMDI);
  assert.equal(y.status, 401);
  assert.deepEqual(await json(await istekIsle(istek('/api/ayar'), env, SIMDI)), { yapayZeka: true });
});

test('/api/ayar PUT kimlik gövde okunmadan önce denetlenir', async () => {
  const env = ortam();
  let okundu = false;
  const r = istek('/api/ayar', { yontem: 'PUT', anahtar: null, govde: { yapayZeka: false } });
  for (const ad of ['text', 'json', 'arrayBuffer']) {
    const orijinal = r[ad].bind(r);
    Object.defineProperty(r, ad, { value: () => { okundu = true; return orijinal(); } });
  }
  assert.equal((await istekIsle(r, env, SIMDI)).status, 401);
  assert.equal(okundu, false);
});

test('/api/ayar PUT geçersiz gövde 400 ve ayar değişmez', async () => {
  const env = ortam();
  const dene = async (govde, ek) => {
    const r = await istekIsle(istek('/api/ayar', { yontem: 'PUT', govde, ...ek }), env, SIMDI);
    assert.equal(r.status, 400, JSON.stringify(govde)?.slice(0, 40));
    return json(r);
  };
  assert.deepEqual(await dene('{bozuk'), { hata: 'gecersiz' });
  assert.deepEqual(await dene(''), { hata: 'gecersiz' });
  assert.deepEqual(await dene({ yapayZeka: 'false' }), { hata: 'gecersiz' });
  assert.deepEqual(await dene({ yapayZeka: 0 }), { hata: 'gecersiz' });
  assert.deepEqual(await dene({ yapayZeka: null }), { hata: 'gecersiz' });
  assert.deepEqual(await dene({}), { hata: 'gecersiz' });
  assert.deepEqual(await dene('[true]'), { hata: 'gecersiz' });
  assert.deepEqual(await dene('null'), { hata: 'gecersiz' });
  assert.deepEqual(await dene({ yapayZeka: false, ek: 'x'.repeat(2000) }), { hata: 'gecersiz' });
  assert.deepEqual(await json(await istekIsle(istek('/api/ayar'), env, SIMDI)), { yapayZeka: true });
});

test('PUT /api/gunler, PUT /api/yok, POST /api/ayar, DELETE /api/ayar 405', async () => {
  const env = ortam();
  for (const [yol, yontem] of [['/api/gunler', 'PUT'], ['/api/durum', 'PUT'], ['/api/yok', 'PUT'], ['/api/ayar', 'POST'], ['/api/ayar', 'DELETE']]) {
    const r = await istekIsle(istek(yol, { yontem, govde: yontem === 'DELETE' ? undefined : { yapayZeka: false } }), env, SIMDI);
    assert.equal(r.status, 405, `${yontem} ${yol}`);
    assert.deepEqual(await json(r), { hata: 'yontem' });
  }
});

test('OPTIONS /api/ayar yeni başlıkları döner', async () => {
  const r = await istekIsle(
    istek('/api/ayar', { yontem: 'OPTIONS', anahtar: null, basliklar: { Origin: ORIGIN } }), ortam(), SIMDI);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'GET, PUT, OPTIONS');
  assert.equal(r.headers.get('Access-Control-Allow-Headers'), 'X-Device-Key, Content-Type');
});

test('ayar kapatılınca yorumKaynak sablon olur, açılınca eski yorum geri gelmez', async () => {
  const env = ortam();
  await dolu(env);
  await yorumYaz(env);
  assert.equal((await gunlerAl(env)).yorumKaynak, 'gemini');
  await istekIsle(istek('/api/ayar', { yontem: 'PUT', govde: { yapayZeka: false } }), env, SIMDI);
  const g = await gunlerAl(env);
  assert.equal(g.yorumKaynak, 'sablon');
  assert.notEqual(g.gunler.at(-1).hukum, YORUM.hukum);
  await istekIsle(istek('/api/ayar', { yontem: 'PUT', govde: { yapayZeka: true } }), env, SIMDI);
  assert.equal((await gunlerAl(env)).yorumKaynak, 'sablon');
});

// ---- Fix round 1: gövde sınırı akış sırasında uygulanır ----

function akisIstek(parcalar, { anahtar = 'gizli' } = {}) {
  const enc = new TextEncoder();
  let iptal = false;
  let i = 0;
  const govde = new ReadableStream({
    pull(c) {
      if (i < parcalar.length) c.enqueue(enc.encode(parcalar[i++]));
      else c.close();
    },
    cancel() { iptal = true; },
  }, { highWaterMark: 0 });
  const basliklar = { 'Content-Type': 'application/json' };
  if (anahtar !== null) basliklar['X-Device-Key'] = anahtar;
  const r = new Request('https://w.test/api/ayar', { method: 'PUT', headers: basliklar, body: govde, duplex: 'half' });
  return { r, iptalEdildi: () => iptal, okunan: () => i };
}

test('/api/ayar PUT: Content-Length olmadan akan 1 KB üstü gövde 400, akış iptal, ayar değişmez', async () => {
  const env = ortam();
  const parcalar = ['{"yapayZeka":false,"ek":"', ...Array(20).fill('x'.repeat(200)), '"}'];
  const { r, iptalEdildi, okunan } = akisIstek(parcalar);
  assert.equal(r.headers.get('Content-Length'), null);
  const y = await istekIsle(r, env, SIMDI);
  assert.equal(y.status, 400);
  assert.deepEqual(await json(y), { hata: 'gecersiz' });
  assert.equal(iptalEdildi(), true);
  assert.ok(okunan() < parcalar.length, 'gövdenin tamamı okunmamalı');
  assert.deepEqual(await json(await istekIsle(istek('/api/ayar'), env, SIMDI)), { yapayZeka: true });
});

test('/api/ayar PUT: küçük akan gövde çalışır', async () => {
  const env = ortam();
  const { r } = akisIstek(['{"yapayZeka":', 'false}']);
  const y = await istekIsle(r, env, SIMDI);
  assert.equal(y.status, 200);
  assert.deepEqual(await json(y), { yapayZeka: false });
  assert.deepEqual(await json(await istekIsle(istek('/api/ayar'), env, SIMDI)), { yapayZeka: false });
});

test('/api/ayar PUT: tam 1024 bayt kabul, 1025 bayt red; gövdesiz istek 400', async () => {
  const env = ortam();
  const doldur = (n) => { const bas = '{"yapayZeka":true,"ek":"'; const son = '"}'; return bas + 'x'.repeat(n - bas.length - son.length) + son; };
  const tam = akisIstek([doldur(1024)]);
  assert.equal((await istekIsle(tam.r, env, SIMDI)).status, 200);
  const fazla = akisIstek([doldur(1025)]);
  assert.equal((await istekIsle(fazla.r, env, SIMDI)).status, 400);
  const yok = new Request('https://w.test/api/ayar', { method: 'PUT', headers: { 'X-Device-Key': 'gizli' } });
  assert.equal(yok.body, null);
  const g = await istekIsle(yok, env, SIMDI);
  assert.equal(g.status, 400);
  assert.deepEqual(await json(g), { hata: 'gecersiz' });
});

test('/api/ayar PUT: akışlı istekte de kimlik gövde okunmadan önce denetlenir', async () => {
  const env = ortam();
  const { r, okunan } = akisIstek(['{"yapayZeka":false}'], { anahtar: null });
  assert.equal((await istekIsle(r, env, SIMDI)).status, 401);
  assert.equal(okunan(), 0);
});
