import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duzenModu, genisDuzen, gunIndeksi, etiketGunleri, balonX, klavyeEylem, carkBirikim, carkSure, carkHedef, gorunumYuksekligi, iosTamMi, iosTamGecerli, olcuSatiri, DUZEN, ekranGecisi, sahneGecisi, sahneSirasi, menuToplan, bugunSecimi, gunSirasi, gunAcKarar, tarihAnahtari, modulKur, kayanMi, sapmaMetni, ozetCumlesi, sapmaVurgusu } from './duzen.js';

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

test('klavyeEylem: değiştirici tuş, giriş alanı odağı ve açık Ayarlar eylem üretmez', () => {
  const d = { gun: 5, olcum: 2, gunSayisi: 28, olcumSayisi: 9 };
  assert.deepEqual(klavyeEylem('ArrowLeft', d, {}), { tur: 'gun', deger: 4 });
  for (const kosul of [{ meta: true }, { ctrl: true }, { alt: true }, { inputOdak: true }, { ayarAcik: true }]) {
    for (const tus of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '1', 'Home', 'End']) {
      assert.equal(klavyeEylem(tus, d, kosul), null, `${tus} ${JSON.stringify(kosul)}`);
    }
  }
});

test('carkBirikim: 50 piksel ya da bir satır = bir gün', () => {
  assert.deepEqual(carkBirikim({ deltaY: 50, deltaMode: 0 }, 0), { adim: 1, birikim: 0 });
  assert.deepEqual(carkBirikim({ deltaY: 100, deltaMode: 0 }, 0), { adim: 2, birikim: 0 });
  assert.deepEqual(carkBirikim({ deltaY: 1, deltaMode: 1 }, 0), { adim: 1, birikim: 0 });
  assert.deepEqual(carkBirikim({ deltaY: -1, deltaMode: 1 }, 0), { adim: -1, birikim: 0 });
  assert.deepEqual(carkBirikim({ deltaY: 1, deltaMode: 2 }, 0), { adim: 3, birikim: 0 });
});

test('carkBirikim: dokunmatik yüzeyin küçük olayları birikir', () => {
  let b = 0, toplam = 0;
  for (let i = 0; i < 10; i++) { const r = carkBirikim({ deltaY: 6, deltaMode: 0 }, b); b = r.birikim; toplam += r.adim; }
  assert.equal(toplam, 1);
  assert.ok(Math.abs(b - 10) < 1e-9);
});

test('carkBirikim: yatay kaydırma baskınsa o kullanılır; tek olayda en çok ±3', () => {
  assert.equal(carkBirikim({ deltaX: 400, deltaY: 5, deltaMode: 0 }, 0).adim, 3);
  assert.equal(carkBirikim({ deltaX: 60, deltaY: 5, deltaMode: 0 }, 0).adim, 1);
  assert.equal(carkBirikim({ deltaY: -9999, deltaMode: 0 }, 0).adim, -3);
});

test('carkBirikim: sonlu olmayan girdi sıfırlar', () => {
  for (const o of [{ deltaY: NaN }, { deltaY: Infinity }, { deltaX: -Infinity, deltaY: 1 }, {}, null, undefined]) {
    assert.deepEqual(carkBirikim(o, 12), { adim: 0, birikim: 0 });
  }
  assert.deepEqual(carkBirikim({ deltaY: 10, deltaMode: 0 }, NaN), { adim: 0, birikim: 10 });
});

test('carkBirikim: yön değişince birikim işareti doğru taşınır', () => {
  const a = carkBirikim({ deltaY: 30, deltaMode: 0 }, 0);
  const b = carkBirikim({ deltaY: -40, deltaMode: 0 }, a.birikim);
  assert.equal(a.adim, 0); assert.equal(b.adim, 0); assert.ok(Math.abs(b.birikim + 10) < 1e-9);
});

test('carkSure: 1 gün 0.32, 2 gün 0.41, 27 gün 0.9 (üst sınır), 0 gün 0', () => {
  assert.equal(carkSure(0), 0);
  assert.ok(Math.abs(carkSure(1) - 0.32) < 1e-9);
  assert.ok(Math.abs(carkSure(2) - 0.41) < 1e-9);
  assert.equal(carkSure(27), 0.9);
  assert.equal(carkSure(-3), carkSure(3));
  assert.equal(carkSure(NaN), 0);
});

test('carkHedef: sınırlar', () => {
  assert.equal(carkHedef(0, -1, 28), 0);
  assert.equal(carkHedef(27, 3, 28), 27);
  assert.equal(carkHedef(5, 2, 28), 7);
  assert.ok(Number.isFinite(carkHedef(NaN, 2, 28)));
});

test('gorunumYuksekligi: en büyük geçerli aday seçilir (iOS ana ekran: innerHeight kısa, ölçü elemanı uzun)', () => {
  assert.equal(gorunumYuksekligi({ ic: 790, dvh: 852, standalone: true }), 852);
  assert.equal(gorunumYuksekligi({ ic: 790, dvh: 852, gorsel: 800, kok: 852, standalone: true }), 852);
  assert.equal(gorunumYuksekligi({ ic: 852, dvh: 790, standalone: true }), 852);
});

test('gorunumYuksekligi: ekran yüksekliğini aşmaz; ekran bilinmiyorsa sınır yok', () => {
  assert.equal(gorunumYuksekligi({ ic: 700, dvh: 900, ekran: 852, standalone: true }), 852);
  assert.equal(gorunumYuksekligi({ ic: 700, dvh: 900, standalone: true }), 900);
  assert.equal(gorunumYuksekligi({ ic: 700, ekran: 852, standalone: true }), 700);
});

test('gorunumYuksekligi: sıfır, NaN, negatif ve sayı olmayan adaylar yok sayılır; hiç aday yoksa 844', () => {
  assert.equal(gorunumYuksekligi({ ic: 0, dvh: NaN, gorsel: -5, kok: '800', standalone: true }), 844);
  assert.equal(gorunumYuksekligi({ ic: 0, dvh: 700, standalone: true }), 700);
  assert.equal(gorunumYuksekligi({}), 844);
  assert.equal(gorunumYuksekligi(), 844);
  assert.equal(gorunumYuksekligi({ ic: Infinity, standalone: true }), 844);
  assert.equal(gorunumYuksekligi({ ekran: 600 }), 600);
});

test('gorunumYuksekligi: ana ekran değilse innerHeight esas alınır (Safari araç çubuğu)', () => {
  assert.equal(gorunumYuksekligi({ ic: 664, dvh: 750, kok: 750, standalone: false }), 664);
  assert.equal(gorunumYuksekligi({ ic: 0, dvh: 750, standalone: false }), 750);
});

test('DUZEN gorunumYuksekligi içerir', () => {
  assert.equal(DUZEN.gorunumYuksekligi, gorunumYuksekligi);
});

test('gorunumYuksekligi: iOS tam ekranda kısa bildirilen yükseklikler yerine ekran yüksekliği kullanılır', () => {
  assert.equal(gorunumYuksekligi({ ic: 797, dvh: 797, gorsel: 797, kok: 797, ekran: 852, standalone: true, iosTam: true }), 852);
  assert.equal(gorunumYuksekligi({ ic: 797, dvh: 797, ekran: 852, standalone: true, iosTam: false }), 797);
  assert.equal(gorunumYuksekligi({ ic: 797, ekran: 0, standalone: true, iosTam: true }), 797);
  assert.equal(gorunumYuksekligi({ ic: 797, ekran: NaN, iosTam: true }), 797);
});

test('iosTamMi: yalnız iOS ana ekranı, dikey ve ekran genişliğinde; vazgeçilince kapalı', () => {
  const t = { iosAnaEkran: true, ekranW: 393, ekranH: 852, iw: 393 };
  assert.equal(iosTamMi(t), true);
  assert.equal(iosTamMi({ ...t, iw: 390 }), false);
  assert.equal(iosTamMi({ ...t, iosAnaEkran: false }), false);
  assert.equal(iosTamMi({ ...t, vazgec: true }), false);
  assert.equal(iosTamMi({ ...t, ekranH: NaN }), false);
  assert.equal(iosTamMi(), false);
  assert.equal(iosTamMi({ ...t, ekranW: 852, ekranH: 393 }), true);
});

test('iosTamGecerli: sahne altı ekrana yakın ve kayma yoksa geçerli; aksi halde eski yola dönülür', () => {
  const g = { sahneAlt: 852, ekran: 852, kaydirma: 0, gorselUst: 0 };
  assert.equal(iosTamGecerli(g), true);
  assert.equal(iosTamGecerli({ ...g, sahneAlt: 851 }), true);
  assert.equal(iosTamGecerli({ ...g, sahneAlt: 797 }), false);
  assert.equal(iosTamGecerli({ ...g, kaydirma: 59 }), false);
  assert.equal(iosTamGecerli({ ...g, gorselUst: 20 }), false);
  assert.equal(iosTamGecerli({ ...g, sahneAlt: NaN }), false);
  assert.equal(iosTamGecerli({}), false);
});

test('olcuSatiri: sayıları yuvarlar, eksik değere ? yazar, NaN/undefined/null yazısı çıkmaz', () => {
  const tam = olcuSatiri({ ic: 797, ekran: 852, gorsel: 797.4, kok: 797, sabit: 797, dvh: 797, ust: 59, alt: 34, sahne: 852, tam: true });
  assert.equal(tam, 'Ölçü: ic 797 · ekran 852 · gorsel 797 · kok 797 · sabit 797 · dvh 797 · üst 59 · alt 34 · sahne 852 · tam evet');
  const bos = olcuSatiri({ ic: NaN, gorsel: undefined, sahne: null });
  assert.match(bos, /ic \? · ekran \? · gorsel \?/);
  assert.match(bos, /tam hayır$/);
  assert.doesNotMatch(bos, /NaN|undefined|null/);
  assert.match(olcuSatiri(), /^Ölçü: /);
});

test('ekranGecisi: ana ↔ ana, açma, değiştirme, kapatma', () => {
  assert.deepEqual(ekranGecisi('bugun', 'trend'), { tur: 'ana', alt: 'bugun' });
  assert.deepEqual(ekranGecisi('trend', 'bugun'), { tur: 'ana', alt: 'trend' });
  assert.deepEqual(ekranGecisi('trend', 'aktivite'), { tur: 'ac', alt: 'trend' });
  assert.deepEqual(ekranGecisi('bugun', 'takvim'), { tur: 'ac', alt: 'bugun' });
  assert.deepEqual(ekranGecisi('aktivite', 'takvim', 'trend'), { tur: 'degis', alt: 'trend' });
  assert.deepEqual(ekranGecisi('takvim', 'bugun', 'bugun'), { tur: 'kapat', alt: 'bugun' });
  assert.deepEqual(ekranGecisi('aktivite', 'trend', 'bugun'), { tur: 'kapatGec', alt: 'bugun' });
  assert.deepEqual(ekranGecisi('aktivite', 'bugun', 'trend'), { tur: 'kapatGec', alt: 'trend' });
  assert.deepEqual(ekranGecisi('aktivite', 'bugun', 'saçma'), { tur: 'kapat', alt: 'bugun' });
});
test('ekranGecisi: aynı ya da bilinmeyen ekranda null; kayanMi', () => {
  assert.equal(ekranGecisi('bugun', 'bugun'), null);
  assert.equal(ekranGecisi('takvim', 'takvim'), null);
  assert.equal(ekranGecisi('bugun', 'ayar'), null);
  assert.equal(ekranGecisi(undefined, 'bugun'), null);
  assert.deepEqual(['bugun', 'trend', 'aktivite', 'takvim'].map(kayanMi), [false, false, true, true]);
});
test('menuToplan: aşağı toplar, yukarı ve en üst açar, küçük oynama durumu korur', () => {
  assert.equal(menuToplan(0, 40, false), true);
  assert.equal(menuToplan(100, 130, true), true);
  assert.equal(menuToplan(130, 100, true), false);
  assert.equal(menuToplan(100, 102, true), true);
  assert.equal(menuToplan(100, 102, false), false);
  assert.equal(menuToplan(50, 4, true), false); // en üstte hep açık
  assert.equal(menuToplan(NaN, 40, true), true);
  assert.equal(menuToplan(0, undefined, false), false);
});
test('gunSirasi ve tarihAnahtari: yerel gün anahtarı, bulunamazsa -1', () => {
  const gunler = [new Date(2026, 10, 10), new Date(2026, 10, 11), new Date(2026, 10, 12)].map((tarih) => ({ tarih }));
  assert.equal(tarihAnahtari(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(gunSirasi('2026-11-11', gunler), 1);
  assert.equal(gunSirasi('2026-11-12', gunler), 2);
  assert.equal(gunSirasi('2026-10-01', gunler), -1);
  assert.equal(gunSirasi(null, gunler), -1);
  assert.equal(gunSirasi('2026-11-11', null), -1);
  assert.equal(gunSirasi('2026-11-11', [null, {}]), -1);
});
test('modulKur: başarıda denetleyiciyi verir; yükleme, kurucu ya da biçim hatasında null (yedek yol)', async () => {
  const c = { goster() {}, gizle() {}, yokEt() {} };
  let verilen = null;
  const iyi = await modulKur(async () => ({ aktiviteKur: (kap, b) => { verilen = [kap, b]; return c; } }), 'aktiviteKur', 'KAP', { ornek: true });
  assert.equal(iyi, c);
  assert.deepEqual(verilen, ['KAP', { ornek: true }]);
  assert.equal(await modulKur(async () => { throw new TypeError('Failed to fetch dynamically imported module'); }, 'aktiviteKur', {}, {}), null);
  assert.equal(await modulKur(() => { throw new Error('eşzamanlı'); }, 'aktiviteKur', {}, {}), null);
  assert.equal(await modulKur(async () => ({}), 'aktiviteKur', {}, {}), null);
  assert.equal(await modulKur(async () => ({ aktiviteKur: () => { throw new Error('kurulum'); } }), 'aktiviteKur', {}, {}), null);
  assert.equal(await modulKur(async () => ({ aktiviteKur: () => ({ goster() {} }) }), 'aktiviteKur', {}, {}), null);
  assert.equal(await modulKur(async () => null, 'aktiviteKur', {}, {}), null);
});

test('gunAcKarar: yalnız 7 günlük şeritteki günler Bugün\'e geçer; eski gün ve bilinmeyen gün -1', () => {
  const gunler = Array.from({ length: 28 }, (_, i) => ({ tarih: new Date(2026, 9, 20 + i) }));
  const G0 = 21;
  assert.equal(gunAcKarar(tarihAnahtari(gunler[27].tarih), gunler, G0), 6);
  assert.equal(gunAcKarar(tarihAnahtari(gunler[21].tarih), gunler, G0), 0);
  assert.equal(gunAcKarar(tarihAnahtari(gunler[20].tarih), gunler, G0), -1); // şeritten eski: Takvim kendi kartını açar
  assert.equal(gunAcKarar(tarihAnahtari(gunler[0].tarih), gunler, G0), -1);
  assert.equal(gunAcKarar('2020-01-01', gunler, G0), -1);
  assert.equal(gunAcKarar(null, gunler, G0), -1);
});

test('sapmaMetni / ozetCumlesi: yönlü ölçümde "normalin", yönsüz (iyi 0) ölçümde nötr "aralığın" ve "her zamankinden"', () => {
  for (const iyi of [1, -1]) {
    assert.equal(sapmaMetni(iyi, 'hi'), 'normalin üstünde');
    assert.equal(sapmaMetni(iyi, 'lo'), 'normalin altında');
    assert.equal(sapmaMetni(iyi, 'ok'), 'normal aralıkta');
    assert.equal(ozetCumlesi(iyi, 0, 28), 'Son 28 günde hep normal aralığında kaldın.');
    assert.equal(ozetCumlesi(iyi, 5, 28), 'Son 28 günde 5 gün normal aralığının dışında.');
    assert.equal(sapmaVurgusu(iyi, 'hi'), true);
    assert.equal(sapmaVurgusu(iyi, 'ok'), false);
  }
  assert.equal(sapmaMetni(0, 'hi'), 'aralığın üstünde');
  assert.equal(sapmaMetni(0, 'lo'), 'aralığın altında');
  assert.equal(sapmaMetni(0, 'ok'), 'her zamanki aralıkta');
  assert.equal(ozetCumlesi(0, 0, 28), 'Son 28 günde hep her zamanki aralığında kaldın.');
  assert.equal(ozetCumlesi(0, 5, 28), 'Son 28 günde 5 gün her zamankinden farklıydı.');
  assert.doesNotMatch(ozetCumlesi(0, 5, 28), /normal/);
  assert.equal(sapmaVurgusu(0, 'hi'), false);
  assert.equal(sapmaVurgusu(0, 'lo'), false);
  assert.equal(sapmaVurgusu(1, null), false);
});

test('bugunSecimi: menüden Bugün her zaman son günü seçer', () => {
  // N=28, G0=21 → şeritte 0..6; son gün 6
  assert.equal(bugunSecimi(22, 21, 28, 1, true), 6);      // Trend'de eski gün
  assert.equal(bugunSecimi(5, 21, 28, 2, true), 6);       // Trend şeridin dışında
  assert.equal(bugunSecimi(NaN, 21, 28, 0, true), 6);     // Takvim'den açılmış eski gün
  assert.equal(bugunSecimi(27, 21, 28, 6, true), 6);
});
test('bugunSecimi: menü dışı dönüşte Trend konumu korunur', () => {
  assert.equal(bugunSecimi(23.4, 21, 28, 6, false), 2);
  assert.equal(bugunSecimi(5, 21, 28, 4, false), 4);      // şeridin dışında: mevcut seçim
  assert.equal(bugunSecimi(99, 21, 28, 1, false), 6);     // sınır kırpılır
  assert.equal(bugunSecimi(undefined, 21, 28, 3, false), 3);
});

test('sahneGecisi: telefonda beş sahneli geçiş türü; Bugün ↔ Trend ve geçersiz null', () => {
  assert.equal(sahneGecisi('bugun', 'aktivite'), 'bugun-kayan');
  assert.equal(sahneGecisi('trend', 'takvim'), 'trend-kayan');
  assert.equal(sahneGecisi('aktivite', 'takvim', 'trend'), 'kayan-kayan');
  assert.equal(sahneGecisi('takvim', 'aktivite', 'bugun'), 'kayan-kayan');
  assert.equal(sahneGecisi('takvim', 'bugun', 'bugun'), 'kayan-bugun');
  assert.equal(sahneGecisi('aktivite', 'bugun', 'trend'), 'kayan-bugun');
  assert.equal(sahneGecisi('takvim', 'trend', 'trend'), 'kayan-trend');
  assert.equal(sahneGecisi('aktivite', 'trend', 'bugun'), 'kayan-trend');
  assert.equal(sahneGecisi('bugun', 'trend'), null);
  assert.equal(sahneGecisi('trend', 'bugun'), null);
  assert.equal(sahneGecisi('takvim', 'takvim'), null);
  assert.equal(sahneGecisi('ayar', 'bugun'), null);
  assert.equal(sahneGecisi(undefined, null), null);
  assert.equal(DUZEN.sahneGecisi, sahneGecisi);
});

test('sahneSirasi: görünen öğeler sıra değerine göre, eşitlerde belge sırası; görünmeyen, boyutsuz ve bozuk öğeler atlanır', () => {
  const l = [
    { sira: '2', ust: 300, alt: 400 }, { sira: '0', ust: 40, alt: 80 }, { sira: '1', ust: 100, alt: 280 },
    { sira: '3', ust: 900, alt: 960 }, // görünüm altında
    { sira: '1', ust: -200, alt: -10 }, // görünüm üstünde
    { sira: '4', ust: 500, alt: 500 }, // yüksekliği yok (gizli)
    { sira: 'x', ust: 420, alt: 460 }, // sayı değil: sona
    { sira: '1', ust: 600, alt: 700 }, // eş sıra: belge sırası
    null, { sira: '0', ust: NaN, alt: 10 },
  ];
  assert.deepEqual(sahneSirasi(l, 0, 844), [1, 2, 7, 0, 6]);
  assert.deepEqual(sahneSirasi(l, 0, 844, 2), [1, 2]);
  assert.deepEqual(sahneSirasi(l, 0, 844, -1), []);
  assert.deepEqual(sahneSirasi([{ sira: 0, ust: 0, alt: 10 }], 10, 20), [], 'yalnız kenara değen görünür sayılmaz');
  assert.deepEqual(sahneSirasi([], 0, 10), []);
  assert.deepEqual(sahneSirasi(null, 0, 10), []);
  assert.deepEqual(sahneSirasi(l, NaN, 10), []);
});
