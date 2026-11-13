// Mock veri: gerçek Garmin verisi gelene kadar prototipleri besler.
// 28 gün; son 7 gün elle yazıldı, öncesi tohumlu rastgele üretilir (her açılışta aynı).
(function () {
  const OLCUMLER = [
    { id: 'uyku', ad: 'Uyku', birim: '', min: 70, max: 85, iyi: 1 },
    { id: 'bb', ad: 'Body Battery', birim: '', min: 60, max: 85, iyi: 1 },
    { id: 'hrv', ad: 'HRV', birim: ' ms', min: 48, max: 62, iyi: 1 },
    { id: 'nabiz', ad: 'Dinlenme nabzı', birim: '', min: 50, max: 55, iyi: -1 },
    { id: 'stres', ad: 'Stres', birim: '', min: 25, max: 40, iyi: -1 },
    { id: 'yuk', ad: 'Dünkü yük', birim: ' dk', min: 40, max: 90, iyi: -1 },
  ];
  const KOTU_IYI = { uyku: [52, 88], bb: [34, 88], hrv: [40, 62], nabiz: [58, 49], stres: [47, 23] };
  const SON7 = [
    { e: 0.65, v: [76, 70, 52, 53, 33, 71], g: 'Sakin bir gece geçirdin, ölçümlerinin hepsi normal aralığında.' },
    { e: 0.38, v: [66, 52, 47, 56, 44, 88], g: 'Uykun kısa kaldı. Nabzın ve stresin normalinin üstünde.' },
    { e: 0.8, v: [83, 81, 58, 51, 26, 30], g: 'Uzun ve derin uyudun. Dün neredeyse hiç yüklenmedin.' },
    { e: 0.56, v: [72, 64, 50, 53, 38, 48], g: 'Ölçümlerin normal aralığında, sıradan bir gün.' },
    { e: 0.72, v: [79, 76, 55, 52, 31, 95], g: 'İyi uyudun. Dünkü yük normalinin biraz üstündeydi ama toparlamışsın.' },
    { e: 0.92, v: [85, 84, 61, 50, 27, 62], g: '7 saat 40 dakika uyudun. HRV değerin son iki haftanın en iyisi.' },
    { e: 0.2, v: [54, 37, 41, 53, 35, 170], g: 'Altı saat uyudun ve uykun seni dinlendirmedi. Dün normalinin iki katı hareket ettin.' },
  ];
  const GUN_KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const GUN_UZUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const r = rng(11);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function durum(o, v) { return v < o.min ? 'lo' : v > o.max ? 'hi' : 'ok'; }
  function hukum(e) {
    if (e < 0.3) return 'Bugün hafif tut.';
    if (e < 0.48) return 'Yavaşla.';
    if (e < 0.62) return 'Dengeli bir gün.';
    if (e < 0.85) return 'İyi gidiyorsun.';
    return 'Tam gaz.';
  }
  function gerekceUret(d) {
    const dis = OLCUMLER.filter((o) => durum(o, d[o.id]) !== 'ok');
    if (!dis.length) return 'Bütün ölçümlerin normal aralığında.';
    if (dis.length === 1) {
      const o = dis[0];
      return `${o.ad} normalinin ${durum(o, d[o.id]) === 'lo' ? 'altında' : 'üstünde'}, gerisi yerinde.`;
    }
    const adlar = dis.map((o) => o.ad.toLocaleLowerCase('tr'));
    const son = adlar.pop();
    return `${dis.length} ölçümün normal aralığının dışında: ${adlar.join(', ')} ve ${son}.`;
  }

  const N = 28;
  const bugun = new Date(2026, 10, 12);
  const GUNLER = [];
  for (let i = 0; i < N; i++) {
    const t = new Date(bugun); t.setDate(bugun.getDate() - (N - 1 - i));
    let e, d = {}, g;
    const s = SON7[i - (N - 7)];
    if (s) {
      e = s.e; OLCUMLER.forEach((o, j) => (d[o.id] = s.v[j])); g = s.g;
    } else {
      e = clamp(0.6 + 0.2 * Math.sin(i * 0.62) + 0.14 * Math.sin(i * 0.27 + 1.3) + (r() - 0.5) * 0.22, 0.12, 0.95);
      for (const id in KOTU_IYI) {
        const [k, iy] = KOTU_IYI[id];
        d[id] = Math.round(lerp(k, iy, clamp(e + (r() - 0.5) * 0.25, 0, 1)));
      }
      d.yuk = Math.round(r() < 0.15 ? 120 + r() * 60 : 25 + r() * 75);
      g = gerekceUret(d);
    }
    GUNLER.push({
      tarih: t, gunKisa: GUN_KISA[t.getDay()], gunUzun: GUN_UZUN[t.getDay()],
      gun: t.getDate(), ay: AY[t.getMonth()], e, d, hukum: hukum(e), gerekce: g,
    });
  }

  const OK = {
    lo: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1v8M1.5 5.5L5 9l3.5-3.5"/></svg>',
    hi: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 9V1M1.5 4.5L5 1l3.5 3.5"/></svg>',
  };
  const DURUM_METIN = { lo: 'altında', hi: 'üstünde', ok: 'normalde' };

  window.VERI = { OLCUMLER, GUNLER, durum, OK, DURUM_METIN };
})();
