import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geminiYaz, metniCikar } from '../src/yorum/gemini.js';

const ANAHTAR = 'TEST-ANAHTAR-123';
const GIRDI = 'Uyku: 80; GIRDI-METNI-ISARETI';
const SEMA = { type: 'object', properties: { hukum: { type: 'string' } }, required: ['hukum'] };

function yanitla(govde, { status = 200, ham = null } = {}) {
  return new Response(ham ?? JSON.stringify(govde), { status, headers: { 'Content-Type': 'application/json' } });
}

function sahte(donus) {
  const cagrilar = [];
  const fetch = async (url, init) => {
    cagrilar.push({ url, init });
    return typeof donus === 'function' ? donus(url, init) : donus;
  };
  return { fetch, cagrilar };
}

const tamam = (metin) => ({ status: 'completed', output_text: metin });

function cagir(fetch, ek = {}) {
  return geminiYaz({
    apiKey: ANAHTAR, model: 'gemini-test', fetch, sistem: 'SISTEM-METNI', girdi: GIRDI, sema: SEMA, ...ek,
  });
}

test('istek: URL, yöntem, başlıklar ve gövde', async () => {
  const { fetch, cagrilar } = sahte(yanitla(tamam('{"hukum":"iyi"}')));
  const sonuc = await cagir(fetch);
  assert.deepEqual(sonuc, { hukum: 'iyi' });
  assert.equal(cagrilar.length, 1);
  const { url, init } = cagrilar[0];
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.ok(!String(url).includes(ANAHTAR));
  assert.ok(!String(url).includes('key='));
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-goog-api-key'], ANAHTAR);
  assert.equal(init.headers['Content-Type'], 'application/json');
  const g = JSON.parse(init.body);
  assert.equal(g.model, 'gemini-test');
  assert.equal(g.input, GIRDI);
  assert.equal(g.system_instruction, 'SISTEM-METNI');
  assert.equal(g.store, false);
  assert.deepEqual(g.generation_config, { thinking_level: 'minimal', max_output_tokens: 600 });
  assert.deepEqual(g.response_format, { type: 'text', mime_type: 'application/json', schema: SEMA });
  assert.ok(!init.body.includes(ANAHTAR));
});

test('metniCikar: dört biçim ve boş', () => {
  assert.equal(metniCikar({ output_text: 'a' }), 'a');
  assert.equal(
    metniCikar({
      steps: [
        { type: 'thought', content: [{ type: 'text', text: 'gizli' }] },
        { type: 'model_output', content: [{ type: 'text', text: 'x' }, { type: 'image', text: 'no' }, { type: 'text', text: 'y' }] },
      ],
    }),
    'xy',
  );
  assert.equal(metniCikar({ outputs: [{ type: 'thought', text: 'no' }, { type: 'text', text: 'b' }] }), 'b');
  assert.equal(metniCikar({ candidates: [{ content: { parts: [{ text: 'c' }, { text: 'd' }] } }] }), 'cd');
  // sıra: output_text önce
  assert.equal(metniCikar({ output_text: 'ilk', outputs: [{ type: 'text', text: 'ikinci' }] }), 'ilk');
  // boş dizgi atlanır, sıradaki denenir
  assert.equal(metniCikar({ output_text: '', outputs: [{ type: 'text', text: 'ikinci' }] }), 'ikinci');
  assert.equal(metniCikar({}), null);
  assert.equal(metniCikar(null), null);
  assert.equal(metniCikar({ output_text: 5, steps: [], outputs: [], candidates: [] }), null);
});

test('geminiYaz: her yanıt biçiminden JSON ayrıştırır', async () => {
  const biçimler = [
    { output_text: '{"a":1}' },
    { steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"a":1}' }] }] },
    { outputs: [{ type: 'text', text: '{"a":1}' }] },
    { candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] },
  ];
  for (const b of biçimler) {
    const { fetch } = sahte(yanitla({ status: 'completed', ...b }));
    assert.deepEqual(await cagir(fetch), { a: 1 });
  }
});

test('HTTP 429 ve 500 null döner, gunluk http ve kod alır', async () => {
  for (const kod of [429, 500]) {
    const olaylar = [];
    const { fetch } = sahte(yanitla({ error: 'x' }, { status: kod }));
    assert.equal(await cagir(fetch, { gunluk: (o) => olaylar.push(o) }), null);
    assert.deepEqual(olaylar, [{ asama: 'http', kod }]);
  }
});

test('fetch fırlatırsa null (ag), fırlatmaz', async () => {
  const olaylar = [];
  const fetch = async () => { throw new Error('ag-hatasi-ANAHTAR'); };
  assert.equal(await cagir(fetch, { gunluk: (o) => olaylar.push(o) }), null);
  assert.deepEqual(olaylar, [{ asama: 'ag' }]);
});

test('zaman aşımı null (zaman), sinyal iptal edilir', async () => {
  const olaylar = [];
  let iptal = false;
  const fetch = (url, init) => new Promise((_, red) => {
    init.signal.addEventListener('abort', () => { iptal = true; red(new Error('abort')); });
  });
  assert.equal(await cagir(fetch, { zamanAsimiMs: 20, gunluk: (o) => olaylar.push(o) }), null);
  assert.equal(iptal, true);
  assert.deepEqual(olaylar, [{ asama: 'zaman' }]);
});

test('sinyali yok sayan fetch de zaman aşımına uğrar', async () => {
  const fetch = () => new Promise(() => {});
  assert.equal(await cagir(fetch, { zamanAsimiMs: 20 }), null);
});

test('bozuk gövde ve bozuk metin JSON null (bicim)', async () => {
  const olaylar = [];
  const g = (o) => olaylar.push(o);
  assert.equal(await cagir(sahte(yanitla(null, { ham: '<html>' })).fetch, { gunluk: g }), null);
  assert.equal(await cagir(sahte(yanitla(tamam('{bozuk'))).fetch, { gunluk: g }), null);
  assert.equal(await cagir(sahte(yanitla({ status: 'completed' })).fetch, { gunluk: g }), null);
  assert.equal(await cagir(sahte(yanitla(tamam('"metin"'))).fetch, { gunluk: g }), null);
  assert.equal(await cagir(sahte(yanitla(tamam('[1]'))).fetch, { gunluk: g }), null);
  assert.deepEqual(olaylar, [{ asama: 'bicim' }, { asama: 'bicim' }, { asama: 'bicim' }, { asama: 'bicim' }, { asama: 'bicim' }]);
});

test("status 'completed' değilse null (durum)", async () => {
  const olaylar = [];
  const { fetch } = sahte(yanitla({ status: 'failed', output_text: '{"a":1}' }));
  assert.equal(await cagir(fetch, { gunluk: (o) => olaylar.push(o) }), null);
  assert.deepEqual(olaylar, [{ asama: 'durum' }]);
});

test('gunluk girdi metnini ve anahtarı asla almaz; gunluk fırlatsa da sorun olmaz', async () => {
  const olaylar = [];
  const senaryolar = [
    sahte(yanitla({}, { status: 500 })).fetch,
    async () => { throw new Error(`${ANAHTAR} ${GIRDI}`); },
    sahte(yanitla(null, { ham: 'x' })).fetch,
    sahte(yanitla({ status: 'failed' })).fetch,
    sahte(yanitla(tamam('{x'))).fetch,
  ];
  for (const f of senaryolar) await cagir(f, { gunluk: (o) => olaylar.push(o) });
  assert.equal(olaylar.length, senaryolar.length);
  const hepsi = JSON.stringify(olaylar);
  assert.ok(!hepsi.includes(ANAHTAR));
  assert.ok(!hepsi.includes('GIRDI-METNI-ISARETI'));
  for (const o of olaylar) assert.deepEqual(Object.keys(o).filter((k) => !['asama', 'kod'].includes(k)), []);
  assert.equal(await cagir(senaryolar[0], { gunluk: () => { throw new Error('x'); } }), null);
});
