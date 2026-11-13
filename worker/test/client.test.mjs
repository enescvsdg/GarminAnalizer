import { test } from 'node:test';
import assert from 'node:assert/strict';
import { garminIstemci, jwtBitis, GarminKeyHatasi, GarminGeciciHata } from '../src/garmin/client.js';

const BASE = 'https://personal.connectapi.garmin.com';
const TOKEN_URL = BASE + '/personalapitoken-service/personal-api/personal-api-key/token';
const SIMDI = 1_800_000_000;
const jwt = (exp) => 'x.' + btoa(JSON.stringify({ exp })) + '.y';

// Sıralı yanıtlar döndüren sahte fetch; çağrıları kaydeder.
function sahteFetch(yanitlar) {
  const cagrilar = [];
  const fn = async (url, init = {}) => {
    cagrilar.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {} });
    const y = yanitlar[cagrilar.length - 1];
    if (!y) throw new Error('beklenmeyen çağrı');
    return new Response(y.body ?? '', { status: y.durum });
  };
  fn.cagrilar = cagrilar;
  return fn;
}

function kur({ yanitlar, onbellek = null, apiKey = 'K' }) {
  const fetch = sahteFetch(yanitlar);
  const yazilan = [];
  const istemci = garminIstemci({
    apiKey,
    fetch,
    tokenOku: async () => onbellek,
    tokenYaz: async (t) => { yazilan.push(t); },
    simdi: () => SIMDI,
  });
  return { istemci, fetch, yazilan };
}

test('önbellekte token yoksa key ile alır, Bearer ile istek atar', async () => {
  const tok = jwt(SIMDI + 86400);
  const { istemci, fetch, yazilan } = kur({
    yanitlar: [{ durum: 200, body: tok + '\n' }, { durum: 200, body: '{"ok":1}' }],
  });
  const sonuc = await istemci.get('/a');
  assert.deepEqual(sonuc, { ok: 1 });
  assert.equal(fetch.cagrilar.length, 2);
  assert.equal(fetch.cagrilar[0].method, 'POST');
  assert.equal(fetch.cagrilar[0].url, TOKEN_URL);
  assert.equal(fetch.cagrilar[0].headers.Authorization, 'ApiKey K');
  assert.equal(fetch.cagrilar[1].url, BASE + '/a');
  assert.equal(fetch.cagrilar[1].headers.Authorization, 'Bearer ' + tok);
  assert.equal(yazilan.length, 1);
  assert.deepEqual(yazilan[0], { access_token: tok, expires_at: SIMDI + 86400 });
});

test('bitişe 1 saatten fazla varsa önbellekteki token kullanılır', async () => {
  const tok = jwt(SIMDI + 7200);
  const { istemci, fetch, yazilan } = kur({
    onbellek: { access_token: tok, expires_at: SIMDI + 7200 },
    yanitlar: [{ durum: 200, body: '[]' }],
  });
  await istemci.get('/a');
  assert.equal(fetch.cagrilar.length, 1);
  assert.equal(fetch.cagrilar[0].method, 'GET');
  assert.equal(fetch.cagrilar[0].headers.Authorization, 'Bearer ' + tok);
  assert.equal(yazilan.length, 0);
});

test('bitişe 1 saatten az kalınca yeniler', async () => {
  const eski = jwt(SIMDI + 3000);
  const yeni = jwt(SIMDI + 86400);
  const { istemci, fetch } = kur({
    onbellek: { access_token: eski, expires_at: SIMDI + 3000 },
    yanitlar: [{ durum: 200, body: yeni }, { durum: 200, body: '{}' }],
  });
  await istemci.get('/a');
  assert.equal(fetch.cagrilar.length, 2);
  assert.equal(fetch.cagrilar[0].method, 'POST');
  assert.equal(fetch.cagrilar[1].headers.Authorization, 'Bearer ' + yeni);
});

test('401 gelince bir kez yeniler ve tekrarlar', async () => {
  const eski = jwt(SIMDI + 7200);
  const yeni = jwt(SIMDI + 86400);
  const { istemci, fetch, yazilan } = kur({
    onbellek: { access_token: eski, expires_at: SIMDI + 7200 },
    yanitlar: [{ durum: 401 }, { durum: 200, body: yeni }, { durum: 200, body: '{"v":2}' }],
  });
  const sonuc = await istemci.get('/a');
  assert.deepEqual(sonuc, { v: 2 });
  assert.equal(fetch.cagrilar.length, 3);
  assert.equal(fetch.cagrilar[0].headers.Authorization, 'Bearer ' + eski);
  assert.equal(fetch.cagrilar[1].method, 'POST');
  assert.equal(fetch.cagrilar[2].headers.Authorization, 'Bearer ' + yeni);
  assert.equal(yazilan.length, 1);
});

test('yenilemeden sonra yine 401 ise GarminKeyHatasi', async () => {
  const { istemci, fetch } = kur({
    onbellek: { access_token: jwt(SIMDI + 7200), expires_at: SIMDI + 7200 },
    yanitlar: [{ durum: 401 }, { durum: 200, body: jwt(SIMDI + 86400) }, { durum: 401 }],
  });
  await assert.rejects(istemci.get('/a'), GarminKeyHatasi);
  assert.equal(fetch.cagrilar.length, 3);
});

test('token uç noktası 401/403 ise GarminKeyHatasi', async () => {
  for (const durum of [401, 403]) {
    const { istemci, fetch } = kur({ yanitlar: [{ durum }] });
    await assert.rejects(istemci.get('/a'), GarminKeyHatasi);
    assert.equal(fetch.cagrilar.length, 1);
  }
});

test('429 ve 5xx GarminGeciciHata, durum alanı dolu', async () => {
  for (const durum of [429, 500, 503, 404]) {
    const { istemci } = kur({
      onbellek: { access_token: jwt(SIMDI + 7200), expires_at: SIMDI + 7200 },
      yanitlar: [{ durum }],
    });
    await assert.rejects(istemci.get('/a'), (e) => {
      assert.ok(e instanceof GarminGeciciHata);
      assert.equal(e.durum, durum);
      return true;
    });
  }
});

test('hata iletilerinde key ve token geçmez', async () => {
  const tok = jwt(SIMDI + 7200);
  const { istemci } = kur({
    apiKey: 'GIZLI-KEY-123',
    onbellek: { access_token: tok, expires_at: SIMDI + 7200 },
    yanitlar: [{ durum: 500, body: 'GIZLI-KEY-123 ' + tok }],
  });
  await assert.rejects(istemci.get('/a'), (e) => {
    assert.ok(!e.message.includes('GIZLI-KEY-123'));
    assert.ok(!e.message.includes(tok));
    assert.match(e.message, /\/a/);
    assert.match(e.message, /500/);
    return true;
  });
});

test('params sorgu dizgisine eklenir; undefined/null atlanır', async () => {
  const { istemci, fetch } = kur({
    onbellek: { access_token: jwt(SIMDI + 7200), expires_at: SIMDI + 7200 },
    yanitlar: [{ durum: 200, body: '{}' }, { durum: 200, body: '{}' }],
  });
  await istemci.get('/a', { startDate: '2026-11-01' });
  assert.equal(fetch.cagrilar[0].url, 'https://personal.connectapi.garmin.com/a?startDate=2026-11-01');
  await istemci.get('/b', { x: undefined, y: null, z: 5 });
  assert.equal(fetch.cagrilar[1].url, BASE + '/b?z=5');
});

test('jwtBitis exp değerini okur; çözülemezse 0', () => {
  assert.equal(jwtBitis(jwt(1234567890)), 1234567890);
  // base64url (- ve _) ve dolgusuz
  const payload = btoa(JSON.stringify({ exp: 99, n: '???>>>' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(jwtBitis('a.' + payload + '.b'), 99);
  assert.equal(jwtBitis('bozuk'), 0);
  assert.equal(jwtBitis('a.!!!.b'), 0);
  assert.equal(jwtBitis('a.' + btoa('{}') + '.b'), 0);
});

test('jwtBitis 0 ise önbelleğe simdi+82800 yazılır', async () => {
  const { istemci, yazilan } = kur({
    yanitlar: [{ durum: 200, body: 'opak-token' }, { durum: 200, body: '{}' }],
  });
  await istemci.get('/a');
  assert.equal(yazilan[0].expires_at, SIMDI + 86400 - 3600);
});

test('token uç noktası boş/boşluk gövdeyle 200 dönerse GarminGeciciHata, önbellek yazılmaz, veri isteği atılmaz', async () => {
  for (const body of ['', '  \n\t ']) {
    const { istemci, fetch, yazilan } = kur({ yanitlar: [{ durum: 200, body }] });
    await assert.rejects(istemci.get('/a'), (e) => {
      assert.ok(e instanceof GarminGeciciHata);
      assert.equal(e.durum, 200);
      return true;
    });
    assert.equal(yazilan.length, 0);
    assert.equal(fetch.cagrilar.length, 1);
    assert.equal(fetch.cagrilar[0].method, 'POST');
  }
});
