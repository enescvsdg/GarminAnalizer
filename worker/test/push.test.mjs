import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, hkdfSync, createDecipheriv } from 'node:crypto';
import { pushSifrele, b64urlCoz, b64urlKodla } from '../src/push/sifrele.js';
import { vapidBaslik } from '../src/push/vapid.js';
import { pushGonder, ucNoktaGecerli } from '../src/push/gonder.js';

// RFC 8291 bölüm 5 / Ek A örneği
const RFC = {
  duzMetin: 'When I grow up, I want to be a watermelon',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaGizli: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaAcik: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asGizli: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asAcik: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  tuz: 'DGv6ra1nlYgDCS1FRnbzlw',
  govde:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

async function abonelikUret() {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    ua, auth,
    p256dh: b64urlKodla(new Uint8Array(ua.getPublicKey())),
    authB64: b64urlKodla(auth),
  };
}

// Bağımsız alıcı tarafı (node:crypto): RFC 8291 bölüm 3.4 / RFC 8188
function coz(govde, ua, auth) {
  const salt = govde.slice(0, 16);
  const rs = new DataView(govde.buffer, govde.byteOffset).getUint32(16, false);
  const idlen = govde[20];
  const asAcik = Buffer.from(govde.slice(21, 21 + idlen));
  const sifreli = govde.slice(21 + idlen);
  const ecdh = ua.computeSecret(asAcik);
  const uaAcik = ua.getPublicKey();
  const ikm = Buffer.from(hkdfSync('sha256', ecdh, auth,
    Buffer.concat([Buffer.from('WebPush: info\0'), uaAcik, asAcik]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(Buffer.from(sifreli.slice(-16)));
  const duz = Buffer.concat([d.update(Buffer.from(sifreli.slice(0, -16))), d.final()]);
  return { rs, idlen, duz };
}

test('RFC 8291 Ek A: sabit anahtar ve tuzla gövde bayt bayt aynı', async () => {
  const cikti = await pushSifrele({
    yuk: new TextEncoder().encode(RFC.duzMetin),
    p256dh: RFC.uaAcik, auth: RFC.auth,
    tuz: b64urlCoz(RFC.tuz),
    yerelAnahtar: { gizli: RFC.asGizli, acik: RFC.asAcik },
  });
  assert.equal(b64urlKodla(cikti), RFC.govde);
});

test('RFC 8291 örneği bağımsız alıcıyla da çözülür', () => {
  const ua = createECDH('prime256v1');
  ua.setPrivateKey(Buffer.from(b64urlCoz(RFC.uaGizli)));
  const { duz } = coz(b64urlCoz(RFC.govde), ua, Buffer.from(b64urlCoz(RFC.auth)));
  assert.equal(duz.at(-1), 0x02);
  assert.equal(duz.subarray(0, -1).toString(), RFC.duzMetin);
});

test('rastgele anahtarlarla şifrele → bağımsız alıcı çözer; başlık biçimi doğru', async () => {
  const { ua, auth, p256dh, authB64 } = await abonelikUret();
  const metin = JSON.stringify({ baslik: 'Hazırsın', govde: 'Uyku iyi çıktı ✓', etiket: 'brifing', url: './' });
  const yuk = new TextEncoder().encode(metin);
  const g1 = await pushSifrele({ yuk, p256dh, auth: authB64 });
  const g2 = await pushSifrele({ yuk, p256dh, auth: authB64 });
  const { rs, idlen, duz } = coz(g1, ua, auth);
  assert.equal(rs, 4096);
  assert.equal(idlen, 65);
  assert.equal(g1[21], 0x04);
  assert.equal(g1.length, 86 + yuk.length + 1 + 16);
  assert.equal(duz.at(-1), 0x02);
  assert.equal(duz.subarray(0, -1).toString(), metin);
  assert.notDeepEqual(g1.slice(0, 16), g2.slice(0, 16), 'tuz her seferinde değişir');
  assert.notDeepEqual(g1.slice(21, 86), g2.slice(21, 86), 'yerel anahtar her seferinde değişir');
});

test('pushSifrele geçersiz girdide fırlatır', async () => {
  const { p256dh, authB64 } = await abonelikUret();
  const yuk = new Uint8Array(3);
  await assert.rejects(pushSifrele({ yuk, p256dh: 'a!b', auth: authB64 }));
  await assert.rejects(pushSifrele({ yuk, p256dh: 'AAAA', auth: authB64 }));
  await assert.rejects(pushSifrele({ yuk, p256dh, auth: 'AAAA' }));
  await assert.rejects(pushSifrele({ yuk: new Uint8Array(4080), p256dh, auth: authB64 }));
  await assert.rejects(pushSifrele({ yuk: 'metin', p256dh, auth: authB64 }));
});

// ---- VAPID ----
async function vapidAnahtari() {
  const cift = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const acik = new Uint8Array(await crypto.subtle.exportKey('raw', cift.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', cift.privateKey);
  return { cift, acik: b64urlKodla(acik), gizli: jwk.d };
}

test('vapidBaslik: biçim, JWT alanları ve imza doğrulanır', async () => {
  const { cift, acik, gizli } = await vapidAnahtari();
  const simdiSn = 1_800_000_000;
  const konu = 'https://ornek.example/uygulama/';
  const deger = await vapidBaslik({
    ucNokta: 'https://web.push.apple.com/abc/def?x=1', acikAnahtar: acik, gizliAnahtar: gizli, konu, simdiSn,
  });
  const m = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(deger);
  assert.ok(m, 'vapid t=<jwt>, k=<anahtar> biçimi');
  assert.equal(m[4], acik);
  const dec = (s) => JSON.parse(new TextDecoder().decode(b64urlCoz(s)));
  assert.deepEqual(dec(m[1]), { typ: 'JWT', alg: 'ES256' });
  const yukJwt = dec(m[2]);
  assert.equal(yukJwt.aud, 'https://web.push.apple.com');
  assert.equal(yukJwt.sub, konu);
  assert.ok(yukJwt.exp > simdiSn && yukJwt.exp <= simdiSn + 24 * 3600);
  assert.equal(yukJwt.exp, simdiSn + 12 * 3600);
  const imza = b64urlCoz(m[3]);
  assert.equal(imza.length, 64);
  const gecerli = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, cift.publicKey, imza, new TextEncoder().encode(`${m[1]}.${m[2]}`),
  );
  assert.equal(gecerli, true);
  const bozuk = new Uint8Array(imza); bozuk[0] ^= 1;
  assert.equal(await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, cift.publicKey, bozuk, new TextEncoder().encode(`${m[1]}.${m[2]}`),
  ), false);
});

test('vapidBaslik: bozuk anahtarlarda fırlatır', async () => {
  const { acik, gizli } = await vapidAnahtari();
  const temel = { ucNokta: 'https://fcm.googleapis.com/fcm/send/x', konu: 'mailto:a@b.example', simdiSn: 1 };
  await assert.rejects(vapidBaslik({ ...temel, acikAnahtar: 'AAAA', gizliAnahtar: gizli }));
  await assert.rejects(vapidBaslik({ ...temel, acikAnahtar: acik, gizliAnahtar: 'AAAA' }));
  await assert.rejects(vapidBaslik({ ...temel, acikAnahtar: acik, gizliAnahtar: '!!!' }));
});

// ---- ucNoktaGecerli ----
test('ucNoktaGecerli: izinli servisler', () => {
  assert.equal(ucNoktaGecerli('https://web.push.apple.com/QGx9'), true);
  assert.equal(ucNoktaGecerli('https://fcm.googleapis.com/fcm/send/abc:def'), true);
  assert.equal(ucNoktaGecerli('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(ucNoktaGecerli('https://db5p.notify.windows.com/w/?token=x'), true);
});

test('ucNoktaGecerli: reddedilenler', () => {
  const red = [
    'http://web.push.apple.com/x',
    'https://ornek.example/x',
    'https://web.push.apple.com.evil.example/',
    'https://evilpush.apple.com.example/',
    'https://evilpush.apple.com/x'.replace('evilpush.apple.com', 'evil-push.apple.co'),
    'https://fcm.googleapis.com.evil.example/x',
    'https://xfcm.googleapis.com/x',
    'https://user@web.push.apple.com/x',
    'https://user:pw@web.push.apple.com/x',
    'https://web.push.apple.com@evil.example/x',
    'https://evil.example\\@web.push.apple.com/x',
    'https://web.push.apple.com:8443/x',
    'https://web.push.apple.com/' + 'a'.repeat(2048),
    'https://web.push.apple.com/ x',
    'ftp://web.push.apple.com/x',
    '', 'web.push.apple.com', '//web.push.apple.com/x',
  ];
  for (const u of red) assert.equal(ucNoktaGecerli(u), false, u);
  for (const v of [null, undefined, 42, {}, [], true]) assert.equal(ucNoktaGecerli(v), false);
});

// ---- pushGonder ----
async function ortam(durum = 201) {
  const sahip = await abonelikUret();
  const vapid = await vapidAnahtari();
  const cagrilar = [];
  const fetchSahte = async (url, secenek) => { cagrilar.push({ url, secenek }); return { status: durum }; };
  return {
    sahip, cagrilar, fetchSahte,
    girdi: {
      abonelik: { endpoint: 'https://web.push.apple.com/abc123', p256dh: sahip.p256dh, auth: sahip.authB64 },
      yuk: { baslik: 'GarminAnalizer', govde: 'Bildirimler çalışıyor.', etiket: 'deneme', url: './' },
      vapid: { acik: vapid.acik, gizli: vapid.gizli, konu: 'https://ornek.example/' },
      fetch: fetchSahte,
      simdiSn: 1_800_000_000,
    },
  };
}

test('pushGonder: istek biçimi ve başarı eşlemesi', async () => {
  const o = await ortam(201);
  const sonuc = await pushGonder(o.girdi);
  assert.deepEqual(sonuc, { durum: 'tamam', kod: 201 });
  assert.equal(o.cagrilar.length, 1);
  const { url, secenek } = o.cagrilar[0];
  assert.equal(url, 'https://web.push.apple.com/abc123');
  assert.equal(secenek.method, 'POST');
  const b = secenek.headers;
  assert.equal(b['Content-Encoding'], 'aes128gcm');
  assert.equal(b['Content-Type'], 'application/octet-stream');
  assert.equal(b.TTL, '43200');
  assert.equal(b.Urgency, 'normal');
  assert.ok(b.Authorization.startsWith('vapid t='));
  assert.ok(secenek.body instanceof Uint8Array);
  const { rs, idlen, duz } = coz(secenek.body, o.sahip.ua, o.sahip.auth);
  assert.equal(rs, 4096);
  assert.equal(idlen, 65);
  assert.deepEqual(JSON.parse(duz.subarray(0, -1).toString()), o.girdi.yuk);
});

test('pushGonder: ttl ve aciliyet geçirilir', async () => {
  const o = await ortam(200);
  await pushGonder({ ...o.girdi, ttl: 60, aciliyet: 'high' });
  assert.equal(o.cagrilar[0].secenek.headers.TTL, '60');
  assert.equal(o.cagrilar[0].secenek.headers.Urgency, 'high');
});

test('pushGonder: durum kodu eşlemesi', async () => {
  const beklenen = [
    [201, 'tamam'], [200, 'tamam'], [202, 'tamam'],
    [404, 'gitti'], [410, 'gitti'],
    [400, 'hata'], [413, 'hata'], [429, 'hata'], [500, 'hata'], [403, 'hata'], [301, 'hata'],
  ];
  for (const [kod, durum] of beklenen) {
    const o = await ortam(kod);
    assert.deepEqual(await pushGonder(o.girdi), { durum, kod }, String(kod));
  }
});

test('pushGonder: ağ hatası fırlatmaz, hata döner', async () => {
  const o = await ortam();
  const sonuc = await pushGonder({ ...o.girdi, fetch: async () => { throw new Error('ağ'); } });
  assert.deepEqual(sonuc, { durum: 'hata', kod: null });
});

test('pushGonder: bozuk anahtarlarda fırlatmaz, istek atmaz', async () => {
  const o = await ortam();
  const bozuklar = [
    { ...o.girdi.abonelik, p256dh: '***' },
    { ...o.girdi.abonelik, p256dh: 'AAAA' },
    { ...o.girdi.abonelik, auth: 'AAAA' },
    { ...o.girdi.abonelik, auth: undefined },
    { ...o.girdi.abonelik, p256dh: 5 },
    null,
  ];
  for (const abonelik of bozuklar) {
    assert.deepEqual(await pushGonder({ ...o.girdi, abonelik }), { durum: 'hata', kod: null });
  }
  for (const vapid of [{ ...o.girdi.vapid, gizli: 'AAAA' }, { ...o.girdi.vapid, acik: '!!' }, undefined]) {
    assert.deepEqual(await pushGonder({ ...o.girdi, vapid }), { durum: 'hata', kod: null });
  }
  assert.equal(o.cagrilar.length, 0);
});

test('pushGonder: aşırı büyük yük hata, istek yok', async () => {
  const o = await ortam();
  const sonuc = await pushGonder({ ...o.girdi, yuk: { baslik: 'x'.repeat(5000) } });
  assert.deepEqual(sonuc, { durum: 'hata', kod: null });
  assert.equal(o.cagrilar.length, 0);
});

test('pushGonder: geçersiz uç nokta hata, istek yok', async () => {
  const o = await ortam();
  for (const endpoint of ['https://ornek.example/x', 'http://web.push.apple.com/x', 'https://web.push.apple.com.evil.example/']) {
    const sonuc = await pushGonder({ ...o.girdi, abonelik: { ...o.girdi.abonelik, endpoint } });
    assert.deepEqual(sonuc, { durum: 'hata', kod: null });
  }
  assert.equal(o.cagrilar.length, 0);
});
