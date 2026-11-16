import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duzenModu, genisDuzen, gunIndeksi, etiketGunleri, balonX, klavyeEylem, DUZEN } from './duzen.js';

const hepsiSonlu = (o) => Object.entries(o).every(([, v]) => typeof v === 'number' && Number.isFinite(v));

test('duzenModu: geniş eşiği 1000×620 (ikisi birden)', () => {
  assert.equal(duzenModu(1000, 620), 'genis');
  assert.equal(duzenModu(999, 620), 'cerceve');
  assert.equal(duzenModu(1000, 619), 'cerceve');
  assert.equal(duzenModu(999, 619), 'cerceve');
  assert.equal(duzenModu(1440, 900), 'genis');
  assert.equal(duzenModu(5120, 2880), 'genis');
  assert.equal(duzenModu(2560, 600), 'cerceve'); // geniş ama alçak
});

test('duzenModu: telefon eşiği 520 (bugünkü telOlcek ile aynı)', () => {
  assert.equal(duzenModu(520, 900), 'telefon');
  assert.equal(duzenModu(521, 900), 'cerceve');
  assert.equal(duzenModu(390, 664), 'telefon');
  assert.equal(duzenModu(800, 600), 'cerceve');
  assert.equal(duzenModu(999, 800), 'cerceve');
  assert.equal(duzenModu(520, 2000), 'telefon'); // dar ve uzun: telefon
});

test('duzenModu: sıfır / NaN / eksik boyut telefon döner', () => {
  for (const [w, h] of [[0, 0], [0, 900], [1440, 0], [NaN, 900], [1440, NaN], [undefined, undefined], [-5, 900], [Infinity, 900]]) {
    assert.equal(duzenModu(w, h), 'telefon', `${w}×${h}`);
  }
});

test('genisDuzen: geçerli aralıkta her alan sonlu; bölgeler pencerede ve üst üste binmez', () => {
  for (let w = 1000; w <= 5120; w += 137) {
    for (let h = 620; h <= 2880; h += 113) {
      const d = genisDuzen(w, h);
      assert.ok(hepsiSonlu(d), `${w}×${h} sonlu değil: ${JSON.stringify(d)}`);
      const e = 1e-6;
      assert.ok(d.s > 0 && d.hb > 0 && d.dw > 0, `${w}×${h} pozitif`);
      assert.ok(d.bx >= -e && d.tx >= d.bx + d.bw - e, `${w}×${h} çakışma`);
      assert.ok(d.tx + d.tw <= w + e, `${w}×${h} Trend pencereden taşıyor`);
      assert.ok(d.bw <= w * 0.46 + e, `${w}×${h} Bugün %46'dan geniş`);
      assert.ok(Math.abs(d.hb * d.s - h) < 1e-6, `${w}×${h} bölge yüksekliği pencereyi doldurmuyor`);
      assert.ok(Math.abs(d.tw - d.twu * d.s) < 1e-6);
      assert.ok(d.twu <= 1100 + e, `${w}×${h} Trend içerik sınırı`);
      assert.ok(d.solPay + d.sagPay + d.dw * 27 <= d.twu + e, `${w}×${h} 28 gün bölgeye sığmıyor`);
      assert.ok(d.ust < d.alt, `${w}×${h} grafik üstü altından aşağıda`);
      // boş yer varsa iki bölge ortalanır: sol ve sağ boşluk eşit
      assert.ok(Math.abs(d.bx - (w - d.tx - d.tw)) < 1e-6, `${w}×${h} ortalanmamış`);
    }
  }
});

test('genisDuzen: 5120×2880 ve sınırda sonlu, Trend içeriği sınırlı ve çift ortada', () => {
  const d = genisDuzen(5120, 2880);
  assert.ok(hepsiSonlu(d));
  assert.equal(d.twu, 1100);
  assert.ok(d.ox > 0);
  const k = genisDuzen(1000, 620);
  assert.ok(hepsiSonlu(k));
  assert.equal(k.ox, 0);
  assert.ok(k.tx + k.tw <= 1000 + 1e-9 && Math.abs(k.tx + k.tw - 1000) < 1e-6, 'küçük pencerede Trend sağ kenara kadar');
});

test('genisDuzen: ölçek yükseklikle artar (üst sınıra kadar), Trend genişliği pencereyle artar', () => {
  let once = 0;
  for (let h = 620; h <= 2880; h += 20) { const s = genisDuzen(2400, h).s; assert.ok(s >= once - 1e-12, `h=${h}`); once = s; }
  assert.ok(once <= 1.5);
  once = 0;
  for (let w = 1000; w <= 5120; w += 20) { const t = genisDuzen(w, 900).twu; assert.ok(t >= once - 1e-9, `w=${w}`); once = t; }
  // dar pencerede Bugün genişlik sınırına (%46) takılır, yükseklik ölçeği değil
  assert.ok(genisDuzen(1000, 2000).bw <= 460 + 1e-9);
});

test('genisDuzen: geçersiz girdi ve küçük pencere NaN üretmez', () => {
  for (const [w, h] of [[0, 0], [NaN, NaN], [undefined, undefined], [999, 619], [800, 600], [390, 664], [1, 1], [-100, 50], [Infinity, Infinity]]) {
    const d = genisDuzen(w, h);
    assert.ok(hepsiSonlu(d), `${w}×${h}: ${JSON.stringify(d)}`);
    assert.ok(d.dw > 0 && d.s > 0);
  }
  assert.ok(hepsiSonlu(genisDuzen(1440, 900, NaN)));
  assert.ok(hepsiSonlu(genisDuzen(1440, 900, 1)));
});

test('gunIndeksi: en yakın gün, uçlarda kenetlenir, NaN güvenli', () => {
  const sp = 64, dw = 30, n = 28;
  assert.equal(gunIndeksi(64, sp, dw, n), 0);
  assert.equal(gunIndeksi(64 + 27 * 30, sp, dw, n), 27);
  assert.equal(gunIndeksi(64 + 30 * 4.49, sp, dw, n), 4);
  assert.equal(gunIndeksi(64 + 30 * 4.51, sp, dw, n), 5);
  assert.equal(gunIndeksi(-500, sp, dw, n), 0);
  assert.equal(gunIndeksi(1e6, sp, dw, n), 27);
  assert.equal(gunIndeksi(NaN, sp, dw, n), 27);
  assert.equal(gunIndeksi(100, sp, 0, n), 27);
  assert.equal(gunIndeksi(100, sp, NaN, n), 27);
  for (let x = 0; x < 1000; x += 7) { const i = gunIndeksi(x, sp, dw, n); assert.ok(Number.isInteger(i) && i >= 0 && i < n); }
});

test('etiketGunleri: son gün hep var, etiketler çakışmaz, öncelikli gün eklenir', () => {
  const kontrol = (n, dw, min, onc) => {
    const e = etiketGunleri(n, dw, min, onc);
    assert.ok(e.includes(n - 1), 'bugün etiketli');
    for (let k = 1; k < e.length; k++) {
      assert.ok(e[k] > e[k - 1]);
      assert.ok((e[k] - e[k - 1]) * dw >= min - 1e-9, `çakışma ${e[k - 1]}-${e[k]} dw=${dw}`);
    }
    return e;
  };
  assert.deepEqual(kontrol(28, 58, 44), [...Array(28).keys()]); // telefon aralığında hepsi
  const e2 = kontrol(28, 24, 44); // her 2 günde bir
  assert.equal(e2.length, 14);
  const e3 = kontrol(28, 12, 44); // her 4 günde bir
  assert.ok(e3.length >= 7 && e3.length <= 8);
  const ayBasi = kontrol(28, 24, 44, [10]);
  assert.ok(ayBasi.includes(10), 'ay başı yazılır');
  kontrol(28, 24, 44, [26]); // bugüne çok yakın öncelikli gün atlanır
  assert.ok(!etiketGunleri(28, 24, 44, [26]).includes(26));
  assert.deepEqual(etiketGunleri(0, 24), []);
  assert.deepEqual(etiketGunleri(28, 0), [27]);
  assert.deepEqual(etiketGunleri(28, NaN), [27]);
  assert.deepEqual(etiketGunleri(28, 24, 44, [-1, 99, 3.5, NaN]), etiketGunleri(28, 24, 44));
});

test('balonX: sağa sığmazsa sola döner, kenardan taşmaz', () => {
  assert.equal(balonX(100, 120, 900), 116);
  assert.equal(balonX(800, 120, 900), 800 - 16 - 120);
  assert.equal(balonX(10, 2000, 900), 12); // her iki yana sığmıyor: sol kenara
  assert.equal(balonX(NaN, 120, 900), 16);
  assert.ok(Number.isFinite(balonX(500, NaN, NaN)));
});

test('klavyeEylem: ok tuşları, Home/End, 1–9, sınırlar', () => {
  const b = { gun: 27, olcum: 0, gunSayisi: 28, olcumSayisi: 9 };
  assert.deepEqual(klavyeEylem('ArrowLeft', b), { tur: 'gun', deger: 26 });
  assert.deepEqual(klavyeEylem('ArrowRight', b), { tur: 'gun', deger: 27 });
  assert.deepEqual(klavyeEylem('ArrowLeft', { ...b, gun: 0 }), { tur: 'gun', deger: 0 });
  assert.deepEqual(klavyeEylem('Home', b), { tur: 'gun', deger: 0 });
  assert.deepEqual(klavyeEylem('End', { ...b, gun: 3 }), { tur: 'gun', deger: 27 });
  assert.deepEqual(klavyeEylem('ArrowUp', b), { tur: 'olcum', deger: 0 });
  assert.deepEqual(klavyeEylem('ArrowDown', b), { tur: 'olcum', deger: 1 });
  assert.deepEqual(klavyeEylem('ArrowDown', { ...b, olcum: 8 }), { tur: 'olcum', deger: 8 });
  assert.deepEqual(klavyeEylem('1', b), { tur: 'olcum', deger: 0 });
  assert.deepEqual(klavyeEylem('9', b), { tur: 'olcum', deger: 8 });
  assert.equal(klavyeEylem('9', { ...b, olcumSayisi: 6 }), null);
  assert.equal(klavyeEylem('0', b), null);
  assert.equal(klavyeEylem('a', b), null);
  assert.equal(klavyeEylem('Enter', b), null);
});

test('DUZEN globalThis üzerinde de vardır', () => {
  assert.equal(globalThis.DUZEN, DUZEN);
  assert.equal(DUZEN.duzenModu(1440, 900), 'genis');
});
