import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64urlCoz, abonelikAlanlari, bildirimDurumu, iosMu, anahtarAyni } from './bildirim.js';

const dizi = (u8) => [...u8];

test('b64urlCoz: dolgusuz, dolgulu, - ve _ karakterleri', () => {
  assert.deepEqual(dizi(b64urlCoz('AQID')), [1, 2, 3]);
  assert.deepEqual(dizi(b64urlCoz('AQI')), [1, 2]); // dolgusuz
  assert.deepEqual(dizi(b64urlCoz('AQI=')), [1, 2]); // dolgulu
  assert.deepEqual(dizi(b64urlCoz('AA')), [0]);
  // 0xfb 0xff 0xfe: standart '+//+' , url güvenli '-__-'
  assert.deepEqual(dizi(b64urlCoz('-__-')), [0xfb, 0xff, 0xfe]);
  assert.deepEqual(dizi(b64urlCoz('')), []);
});

test('b64urlCoz: 65 baytlık açık anahtar boyutu korunur', () => {
  const ham = Uint8Array.from({ length: 65 }, (_, i) => (i * 7 + 4) % 256);
  const metin = Buffer.from(ham).toString('base64url');
  assert.deepEqual(dizi(b64urlCoz(metin)), dizi(ham));
  assert.equal(b64urlCoz(metin).length, 65);
});

test('b64urlCoz: geçersiz girdi fırlatmaz, boş dizi döner', () => {
  for (const girdi of ['A', 'AQIDB', 'a+b/', 'ab cd', '@@@@', null, undefined, 5, {}, []]) {
    const s = b64urlCoz(girdi);
    assert.ok(s instanceof Uint8Array);
    assert.equal(s.length, 0, String(girdi));
  }
});

test('abonelikAlanlari: geçerli toJSON biçimi', () => {
  const j = { endpoint: 'https://web.push.apple.com/abc', expirationTime: null, keys: { p256dh: 'P', auth: 'A' } };
  assert.deepEqual(abonelikAlanlari(j), { endpoint: 'https://web.push.apple.com/abc', p256dh: 'P', auth: 'A' });
});

test('abonelikAlanlari: eksik ya da yanlış türde alan null', () => {
  const iyi = { endpoint: 'https://x', keys: { p256dh: 'P', auth: 'A' } };
  const kotu = [
    null, undefined, 'x', 5, [], {},
    { ...iyi, endpoint: '' }, { ...iyi, endpoint: 5 }, { keys: iyi.keys },
    { endpoint: iyi.endpoint }, { ...iyi, keys: null }, { ...iyi, keys: 'k' },
    { ...iyi, keys: { p256dh: 'P' } }, { ...iyi, keys: { auth: 'A' } },
    { ...iyi, keys: { p256dh: '', auth: 'A' } }, { ...iyi, keys: { p256dh: 'P', auth: 7 } },
  ];
  for (const k of kotu) assert.equal(abonelikAlanlari(k), null, JSON.stringify(k));
});

const UYGUN = { destek: true, izin: 'default', standalone: true, ios: true, acikAnahtar: 'BKey', canli: true, yerel: false };

test('bildirimDurumu: kullanılabilir durum', () => {
  assert.deepEqual(bildirimDurumu(UYGUN), { kullanilabilir: true, neden: null });
  assert.deepEqual(bildirimDurumu({ ...UYGUN, izin: 'granted', ios: false, standalone: false }), { kullanilabilir: true, neden: null });
});

test('bildirimDurumu: her neden dizgisi', () => {
  const yok = (g) => bildirimDurumu({ ...UYGUN, ...g });
  assert.deepEqual(yok({ canli: false }), { kullanilabilir: false, neden: "Worker'a bağlanınca kullanılabilir." });
  assert.deepEqual(yok({ destek: false, ios: false }), { kullanilabilir: false, neden: 'Bu tarayıcı bildirimi desteklemiyor.' });
  assert.deepEqual(yok({ standalone: false }), { kullanilabilir: false, neden: "iPhone'da önce uygulamayı ana ekrana ekle." });
  assert.deepEqual(yok({ izin: 'denied' }), { kullanilabilir: false, neden: 'Bildirim izni kapalı. Telefonun Ayarlar > Bildirimler bölümünden aç.' });
  assert.deepEqual(yok({ acikAnahtar: null }), { kullanilabilir: false, neden: "Worker'da bildirim anahtarı tanımlı değil." });
  assert.deepEqual(yok({ acikAnahtar: '' }), { kullanilabilir: false, neden: "Worker'da bildirim anahtarı tanımlı değil." });
  assert.deepEqual(yok({ yerel: true }), { kullanilabilir: false, neden: 'Yerelde bildirim denenemez (service worker kapalı).' });
});

test('bildirimDurumu: öncelik sırası (bağlantı > yerel > iPhone ana ekran > destek > izin > anahtar)', () => {
  const hepsi = { destek: false, izin: 'denied', standalone: false, ios: true, acikAnahtar: null, canli: true, yerel: true };
  assert.match(bildirimDurumu({ ...hepsi, canli: false }).neden, /^Worker'a bağlanınca/);
  assert.match(bildirimDurumu(hepsi).neden, /^Yerelde/);
  assert.match(bildirimDurumu({ ...hepsi, yerel: false }).neden, /^iPhone'da/); // iOS Safari'de PushManager yok: önce ana ekran uyarısı
  assert.match(bildirimDurumu({ ...hepsi, yerel: false, ios: false }).neden, /^Bu tarayıcı/);
  assert.match(bildirimDurumu({ ...hepsi, yerel: false, ios: false, destek: true }).neden, /^Bildirim izni kapalı/);
  assert.match(bildirimDurumu({ ...hepsi, yerel: false, ios: false, destek: true, izin: 'granted' }).neden, /^Worker'da bildirim anahtarı/);
});

test('bildirimDurumu: argümansız çağrı fırlatmaz', () => {
  assert.equal(bildirimDurumu().kullanilabilir, false);
});

test('iosMu: iPhone, iPad ve masaüstü kılığındaki iPadOS', () => {
  assert.equal(iosMu({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15', maxTouchPoints: 5 }), true);
  assert.equal(iosMu({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)', maxTouchPoints: 5 }), true);
  assert.equal(iosMu({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 5 }), true);
  assert.equal(iosMu({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 0 }), false);
  assert.equal(iosMu({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120', maxTouchPoints: 5 }), false);
  assert.equal(iosMu(), false);
});

test('anahtarAyni: bayt karşılaştırması, eksikse null', () => {
  const a = Uint8Array.from([1, 2, 3]);
  assert.equal(anahtarAyni(a.buffer, Uint8Array.from([1, 2, 3])), true);
  assert.equal(anahtarAyni(a, Uint8Array.from([1, 2, 4])), false);
  assert.equal(anahtarAyni(a, Uint8Array.from([1, 2])), false);
  assert.equal(anahtarAyni(null, a), null);
  assert.equal(anahtarAyni(a, undefined), null);
});
