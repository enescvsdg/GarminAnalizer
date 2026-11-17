// Trend, Takvim ve önizleme galerisi için canlı ölçüm simgeleri (dokuz sabah ölçümü + beş günlük hareket ölçümü).
// Bağımlılık yok; GSAP örneği dışarıdan verilir. Global stil, innerHTML ya da filtre kullanılmaz:
// ışıma radyal gradyanlarla yapılır (kare başına ucuz), her örneğin kimlikleri kendine özeldir.
//
//   const s = simgeKur(kap, 'uyku', { gsap, boyut: 44, azHareket: false });
//   s.guncelle({ oran: 0.7, durum: 'ok', ham: 76 });  s.durdur(); s.baslat(); s.yokEt();

const NS = 'http://www.w3.org/2000/svg';
let sayac = 0;

/* ---------- küçük yardımcılar ---------- */
const kl = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const fr = (x) => x - Math.floor(x);
const ss = (a, b, x) => { const t = kl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hs = (i) => fr(Math.sin(i * 127.1 + 311.7) * 43758.5453) * 2 - 1; // -1..1 sözde rastgele
const gur = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hs(i) * (1 - u) + hs(i + 1) * u; };
const f2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : 0);
const TAU = Math.PI * 2;

function yap(tag, at, ebeveyn) {
  const e = document.createElementNS(NS, tag);
  for (const k in at) e.setAttribute(k, at[k]);
  if (ebeveyn) ebeveyn.appendChild(e);
  return e;
}
// Yalnız değişen özniteliği yazar (DOM işini azaltır).
function ata(e, k, v) {
  const s = typeof v === 'number' ? String(f2(v)) : v;
  const m = e.__v || (e.__v = {});
  if (m[k] !== s) { m[k] = s; e.setAttribute(k, s); }
}
// Catmull-Rom → kübik Bezier; kapalı ve açık eğri.
function kapali(p) {
  const n = p.length; let d = `M${f2(p[0][0])},${f2(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n], e = p[(i + 2) % n];
    d += `C${f2(b[0] + (c[0] - a[0]) / 6)},${f2(b[1] + (c[1] - a[1]) / 6)} ${f2(c[0] - (e[0] - b[0]) / 6)},${f2(c[1] - (e[1] - b[1]) / 6)} ${f2(c[0])},${f2(c[1])}`;
  }
  return d + 'Z';
}
function acik(p) {
  const n = p.length; let d = `M${f2(p[0][0])},${f2(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], e = p[Math.min(n - 1, i + 2)];
    d += `C${f2(b[0] + (c[0] - a[0]) / 6)},${f2(b[1] + (c[1] - a[1]) / 6)} ${f2(c[0] - (e[0] - b[0]) / 6)},${f2(c[1] - (e[1] - b[1]) / 6)} ${f2(c[0])},${f2(c[1])}`;
  }
  return d;
}

/* ---------- renk ---------- */
// a: ışık çekirdeği, b: şeftali ışıma, c: mor/gül gölge, d: derin zemin.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const RENK = {
  ok: { a: '#fff4e4', b: '#ffc9a6', c: '#b597ff', d: '#2e1f52' },
  hi: { a: '#ffe6cc', b: '#ff9a68', c: '#e2668c', d: '#40183a' },
  lo: { a: '#eee4ff', b: '#d8a6cc', c: '#8878da', d: '#211a48' },
  bos: { a: '#b6adc0', b: '#8a8196', c: '#655c73', d: '#1c1725' },
};
for (const k in RENK) for (const r in RENK[k]) RENK[k][r] = hex(RENK[k][r]);
const karis = (x, y, t) => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
const rgb = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
function palet(s) {
  const P = {};
  for (const k of ['a', 'b', 'c', 'd']) {
    let v = RENK.ok[k];
    v = karis(v, RENK.hi[k], s.sic * 0.75); v = karis(v, RENK.lo[k], s.sog * 0.75); v = karis(v, RENK.bos[k], s.bos);
    P[k] = v;
  }
  return P;
}
// Gauss benzeri ışıma: çok duraklı, koyu zeminde bantlaşmaz.
const HALO = [[0, 1], [0.16, 0.82], [0.32, 0.58], [0.48, 0.34], [0.64, 0.16], [0.8, 0.05], [1, 0]];
const YILDIZ = 'M0,-1C.15,-.15 .15,-.15 1,0C.15,.15 .15,.15 0,1C-.15,.15 -.15,.15 -1,0C-.15,-.15 -.15,-.15 0,-1Z';

/* ---------- sabah ölçümü simgeleri ----------
   Her tanım (g, c) alır ve { ciz(s, dt, t, statik), tempo?(o, ham) } döndürür.
   s: { o: 0..1 değer, sic: yüksek, sog: düşük, bos: veri yok, tempo } — hepsi yumuşak geçer.
   statik: az hareket; döngüsel faz yerine değeri en iyi gösteren sabit kare çizilir. */
const IKON = {};

// Uyku: ay, uyku skoru kadar dolar; kötü gecede yıldızlar huzursuz titrer.
IKON.uyku = (g, c) => {
  const halo = yap('circle', { cx: 26, cy: 25, r: 22, fill: c.halo('b') }, g);
  const ay = yap('g', {}, g);
  yap('circle', { r: 13, fill: c.grad('radialGradient', { gradientUnits: 'userSpaceOnUse', cx: -5, cy: -6, r: 20 }, [[0, (P) => karis(P.d, P.c, 0.32), 1], [1, 'd', 0.9]]) }, ay);
  c.renk(yap('circle', { r: 12.55, fill: 'none', 'stroke-width': 0.9, 'stroke-opacity': 0.3 }, ay), 'stroke', 'a');
  const isik = yap('path', { fill: c.grad('radialGradient', { gradientUnits: 'userSpaceOnUse', cx: 3, cy: -6, r: 19 }, [[0, 'a', 1], [0.55, 'b', 1], [1, (P) => karis(P.b, P.c, 0.7), 1]]) }, ay);
  const bos = yap('circle', { r: 13, fill: 'none', 'stroke-width': 1.1, 'stroke-dasharray': '1.6 2.5' }, ay);
  c.renk(bos, 'stroke', 'a');
  const Y = [[10.5, 11, 3.4, 1.1, 0], [19.5, 5.4, 2.1, 1.7, 2], [6.8, 23.5, 1.9, 1.3, 4], [41, 7.6, 1.6, 2.1, 1]];
  const yl = Y.map(() => { const e = yap('path', { d: YILDIZ }, g); c.renk(e, 'fill', 'a'); return e; });
  return {
    ciz(s, dt, t, st) {
      const k = 0.07 + 0.93 * s.o, rx = 13 * Math.abs(1 - 2 * k), sw = k >= 0.5 ? 1 : 0;
      ata(isik, 'd', `M0,-13A13,13 0 0 1 0,13A${f2(rx)},13 0 0 ${sw} 0,-13Z`);
      ata(isik, 'opacity', 1 - s.bos);
      ata(bos, 'opacity', s.bos * 0.75);
      ata(halo, 'opacity', (0.12 + 0.5 * k) * (1 - 0.8 * s.bos));
      // huzursuzluk: skor düştükçe (ve "düşük" durumda) yıldızlar düzensiz titrer, ay hafifçe kıpırdar
      const hz = st ? 0 : kl(kl((0.5 - s.o) / 0.5) + s.sog * 0.35) * (1 - s.bos);
      const rot = -16 + hz * 2.2 * gur(t * 5.3), jx = hz * 0.35 * gur(t * 7.1 + 3);
      ata(ay, 'transform', `translate(${f2(26 + jx)},25) rotate(${f2(rot)})`);
      const tt = st ? 2 : t;
      for (let i = 0; i < Y.length; i++) {
        const [x, y, sz, fq, ph] = Y[i];
        const tw = 0.5 + 0.5 * Math.sin(tt * fq + ph), fl = 0.5 + 0.5 * gur(tt * 11 + i * 7);
        const op = (0.3 + 0.7 * s.o) * (0.55 + 0.45 * tw) * (1 - hz * 0.75 * fl) * (1 - 0.6 * s.bos);
        const sc = sz * (0.72 + 0.28 * tw) * (1 - hz * 0.25 * fl);
        const dx = Math.sin(tt * 0.13 + i) * 0.9, dy = Math.cos(tt * 0.11 + i * 2) * 0.7;
        ata(yl[i], 'transform', `translate(${f2(x + dx)},${f2(y + dy)}) scale(${f2(sc)})`);
        ata(yl[i], 'opacity', op);
      }
    },
  };
};

// Body Battery: hücredeki ışıklı sıvı değer kadar yükselir; doluyken kıvılcımlanır, boşken kor gibi söner.
IKON.bb = (g, c) => {
  const halo = yap('circle', { cx: 24, cy: 28, r: 21, fill: c.halo('b') }, g);
  const govde = yap('rect', { x: 13, y: 8.5, width: 22, height: 34, rx: 7.5, 'stroke-width': 1.4, 'fill-opacity': 0.5 }, g);
  c.renk(govde, 'stroke', (P) => karis(P.a, P.b, 0.35)); c.renk(govde, 'fill', 'd');
  const uc = yap('rect', { x: 19.5, y: 4.4, width: 9, height: 2.9, rx: 1.45 }, g); c.renk(uc, 'fill', 'a');
  const kid = c.id('k'), kp = yap('clipPath', { id: kid }, c.defs);
  yap('rect', { x: 15.2, y: 10.7, width: 17.6, height: 29.6, rx: 5.3 }, kp);
  const ic = yap('g', { 'clip-path': `url(#${kid})` }, g);
  const [sivU, sivG] = c.grad2('linearGradient', { gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: 20, y2: 41 }, [[0, 'a', 1], [0.28, 'b', 1], [1, 'c', 0.85]]);
  const siv = yap('path', { fill: sivU }, ic);
  const yuz = yap('path', { fill: 'none', 'stroke-width': 1.1 }, ic); c.renk(yuz, 'stroke', 'a');
  const kv = [0, 1, 2].map(() => { const e = yap('circle', { r: 0.9 }, ic); c.renk(e, 'fill', 'a'); return e; });
  const cam = yap('path', { d: 'M17.4,14.6V23', fill: 'none', 'stroke-width': 1.2, 'stroke-opacity': 0.28 }, g); c.renk(cam, 'stroke', 'a');
  const bos = yap('rect', { x: 13, y: 8.5, width: 22, height: 34, rx: 7.5, fill: 'none', 'stroke-width': 1.3, 'stroke-dasharray': '1.8 2.6' }, g); c.renk(bos, 'stroke', 'a');
  let onceO = null, egim = 0;
  return {
    ciz(s, dt, t, st) {
      const o = s.o, oo = 0.05 + 0.95 * o, sev = 40.4 - oo * 31.2;
      // seviye değişirken yüzey o yöne çalkalanır (günler arası geçişin sürekli hissi)
      if (onceO !== null && dt > 0) egim += (kl((o - onceO) / dt * 0.9, -2, 2) - egim) * Math.min(1, dt * 6);
      else if (dt > 0) egim *= 0.9;
      onceO = o;
      const tt = st ? 1.2 : t, A = st ? 0.5 : 0.45 + 0.55 * o;
      const tilt = (st ? 0 : 0.9 * Math.sin(tt * 0.9)) + egim * 3;
      const p = [];
      for (let x = 13.5; x <= 34.6; x += 2.62) p.push([x, sev + A * Math.sin(x * 0.42 + tt * 2.4) + 0.5 * A * Math.sin(x * 0.93 - tt * 3.1) + tilt * (x - 24) / 10]);
      const ust = acik(p);
      ata(siv, 'd', `${ust}L35,42L13,42Z`); ata(yuz, 'd', ust);
      ata(sivG, 'y1', sev - 1); ata(sivG, 'y2', 41);
      const kor = ss(0.35, 0, o) * (st ? 0.5 : 0.5 + 0.5 * Math.sin(tt * 1.5));
      ata(siv, 'opacity', (1 - 0.4 * kor) * (1 - s.bos)); ata(yuz, 'opacity', (0.9 - 0.4 * kor) * (1 - s.bos));
      ata(halo, 'opacity', (0.12 + 0.48 * o + 0.12 * kor) * (1 - 0.85 * s.bos));
      ata(govde, 'stroke-opacity', 0.55 * (1 - s.bos)); ata(bos, 'opacity', s.bos * 0.8);
      const kiv = ss(0.5, 0.95, o) * (1 - s.bos);
      for (let i = 0; i < 3; i++) {
        const u = st ? 0.3 + i * 0.22 : fr(tt * 0.38 + i / 3);
        ata(kv[i], 'cx', 18.5 + i * 5.2 + Math.sin(tt * 1.3 + i) * 0.9);
        ata(kv[i], 'cy', 39 - u * (39 - sev - 1.6));
        ata(kv[i], 'opacity', kiv * Math.sin(Math.PI * u) * 0.9);
      }
    },
  };
};

// HRV: kalp izi; atımlar arası boşluk HRV yükseldikçe değişkenleşir, düşükken tekdüzeleşir.
IKON.hrv = (g, c) => {
  const TP = [[-4.6, 0], [-3.6, -1.5], [-2.6, 0], [-1.3, 0], [-0.65, 1.7], [0, -14], [0.8, 6], [1.7, 0], [3.2, 0], [4.5, -2.4], [5.8, 0]];
  const ARA = 16, Y0 = 26;
  const halo = yap('ellipse', { cx: 24, cy: 24, rx: 23, ry: 17, fill: c.halo('b') }, g);
  const iz = c.grad('linearGradient', { gradientUnits: 'userSpaceOnUse', x1: 1, y1: 0, x2: 47, y2: 0 }, [[0, 'c', 0], [0.2, 'b', 0.8], [0.62, 'a', 1], [0.84, 'a', 0.9], [1, 'a', 0]]);
  const isima = yap('path', { fill: 'none', stroke: iz, 'stroke-width': 3.4, 'stroke-opacity': 0.12 }, g);
  const cizgi = yap('path', { fill: 'none', stroke: iz, 'stroke-width': 1.75 }, g);
  const nk = [0, 1, 2, 3, 4].map(() => { const e = yap('circle', { cy: 41.2, r: 1.2 }, g); c.renk(e, 'fill', 'b'); return e; });
  let kay = 0;
  return {
    ciz(s, dt, t, st) {
      if (!st) kay += dt * 10.5;
      const off = st ? 6 : kay, v = 0.03 + 0.97 * s.o, amp = 1 - 0.85 * s.bos;
      const i0 = Math.floor((off - 8) / ARA), i1 = Math.ceil((off + 56) / ARA), xs = [];
      for (let i = i0 - 1; i <= i1 + 1; i++) xs.push(i * ARA + 5.4 * v * hs(i * 1.71 + 0.3) - off);
      const p = [[-2, Y0]]; let n = 0;
      for (let j = 1; j < xs.length - 1; j++) {
        const x = xs[j];
        // yakın atımlarda dalga biçimi daralır: çizgi geriye dönmez
        const sxL = Math.min(1, (x - xs[j - 1]) / 11), sxR = Math.min(1, (xs[j + 1] - x) / 11);
        for (const [dx, dy] of TP) p.push([x + dx * (dx < 0 ? sxL : sxR), Y0 + dy * amp]);
        if (x > 0 && x < 48 && n < nk.length) {
          const e = nk[n++];
          ata(e, 'cx', x); ata(e, 'opacity', ss(1, 11, x) * ss(47, 37, x) * 0.75 * (1 - s.bos));
        }
      }
      for (; n < nk.length; n++) ata(nk[n], 'opacity', 0);
      p.push([50, Y0]);
      const d = 'M' + p.map((q) => `${f2(q[0])},${f2(q[1])}`).join('L');
      ata(cizgi, 'd', d); ata(isima, 'd', d);
      ata(halo, 'opacity', (0.1 + 0.3 * s.o) * (1 - 0.8 * s.bos));
    },
  };
};

// Dinlenme nabzı: kalp gerçek hızda (ham bpm) iki vuruşla atar, her atımda bir dalga yayılır.
const KALP = 'M0,10.5C-2.5,8.2 -13.5,1.8 -13.5,-5.2C-13.5,-9.6 -10.2,-12.5 -6.6,-12.5C-3.6,-12.5 -1.3,-10.7 0,-8.2C1.3,-10.7 3.6,-12.5 6.6,-12.5C10.2,-12.5 13.5,-9.6 13.5,-5.2C13.5,1.8 2.5,8.2 0,10.5Z';
IKON.nabiz = (g, c) => {
  const halo = yap('circle', { cx: 24, cy: 25, r: 22, fill: c.halo('b') }, g);
  const dalga = yap('path', { d: KALP, fill: 'none' }, g); c.renk(dalga, 'stroke', (P) => karis(P.a, P.b, 0.5));
  const kg = yap('g', {}, g);
  const kalp = yap('path', { d: KALP, fill: c.grad('radialGradient', { gradientUnits: 'userSpaceOnUse', cx: -5, cy: -7, r: 21 }, [[0, 'a', 1], [0.45, 'b', 1], [1, 'c', 1]]) }, kg);
  const kenar = yap('path', { d: KALP, fill: 'none', 'stroke-width': 0.8, 'stroke-opacity': 0.35 }, kg); c.renk(kenar, 'stroke', 'a');
  const par = yap('ellipse', { cx: -6.4, cy: -6.6, rx: 3.3, ry: 2, transform: 'rotate(-38 -6.4 -6.6)' }, kg); c.renk(par, 'fill', 'a');
  const bos = yap('path', { d: KALP, fill: 'none', 'stroke-width': 1.1, 'stroke-dasharray': '1.7 2.5', transform: 'translate(24,25.5)' }, g); c.renk(bos, 'stroke', 'a');
  const pul = (x) => (x <= 0 ? 0 : (x / 0.05) * Math.exp(1 - x / 0.05));
  let faz = 0;
  return {
    tempo: (o, ham) => (Number.isFinite(ham) ? kl(ham, 30, 180) : 46 + o * 34),
    ciz(s, dt, t, st) {
      if (!st) faz += dt * s.tempo / 60;
      const p = st ? 0.05 : fr(faz);
      const dub = kl(0.3 * s.tempo / 60, 0.16, 0.4);
      const zarf = (pul(p) + 0.55 * pul(p - dub)) * (1 - s.bos);
      ata(kg, 'transform', `translate(24,25.5) scale(${f2(1 + 0.085 * zarf)})`);
      ata(kalp, 'opacity', 1 - s.bos); ata(par, 'opacity', 0.5 * (1 - s.bos)); ata(kenar, 'opacity', 1 - s.bos);
      const u = st ? 0.32 : p, rs = 1.04 + 0.46 * (1 - (1 - u) * (1 - u));
      ata(dalga, 'transform', `translate(24,25.5) scale(${f2(rs)})`);
      ata(dalga, 'stroke-width', 1.3 / rs);
      ata(dalga, 'opacity', Math.pow(1 - u, 2.4) * 0.7 * (1 - s.bos));
      ata(halo, 'opacity', (0.2 + 0.32 * zarf) * (1 - 0.8 * s.bos));
      ata(bos, 'opacity', s.bos * 0.8);
    },
  };
};

// Stres: halkalar; düşükken sakin ve seyrek, yüksekken sık, hızlı, titrek ve sıcak.
IKON.stres = (g, c) => {
  const sicak = (P, s) => karis(karis(P.c, P.a, 0.42), karis(P.b, P.a, 0.22), ss(0.15, 0.95, s.o));
  const halo = yap('circle', { cx: 24, cy: 24, r: 14, fill: c.halo(sicak) }, g);
  const hl = [0, 1, 2, 3, 4].map(() => { const e = yap('path', { fill: 'none', 'stroke-width': 1.6 }, g); c.renk(e, 'stroke', sicak); return e; });
  const oz = yap('circle', { cx: 24, cy: 24, r: 2.3 }, g); c.renk(oz, 'fill', 'a');
  let faz = 0, w = 0;
  return {
    ciz(s, dt, t, st) {
      const o = s.o;
      if (!st) { faz += dt * (0.09 + 0.48 * Math.pow(o, 1.2)); w += dt * (0.8 + 10 * o); }
      const amp = 1.8 * Math.pow(o, 2.3) * (1 - s.bos), rmax = 20.6 - 4.6 * o, r0 = 2.6;
      const jt = Math.floor(w * 2.6);
      for (let i = 0; i < 5; i++) {
        const u = fr(i / 5 + (st ? 0.1 : faz)), r = r0 + (rmax - r0) * u, p = [];
        for (let j = 0; j < 22; j++) {
          const th = (j / 22) * TAU;
          const rr = r + amp * u * (0.6 * Math.sin(7 * th + w + i * 1.9) + 0.3 * Math.sin(11 * th - w * 1.4 + i) + 0.35 * hs(j + jt * 13 + i * 31));
          p.push([24 + rr * Math.cos(th), 24 + rr * Math.sin(th)]);
        }
        ata(hl[i], 'd', kapali(p));
        ata(hl[i], 'opacity', Math.pow(Math.sin(Math.PI * u), 0.85) * (1 - 0.35 * u));
      }
      ata(oz, 'r', 2.2 + (st ? 0 : 0.45 * Math.sin(w * 0.9) * o));
      ata(halo, 'opacity', 0.28 + 0.4 * o);
    },
  };
};

// Dünkü yük: alev yük kadar büyür; yük yoksa közde küçük bir kor kalır.
IKON.yuk = (g, c) => {
  const BX = 24, BY = 40.6;
  const halo = yap('circle', { cx: 24, cy: 30, r: 16, fill: c.halo('b') }, g);
  const kor = yap('ellipse', { cx: 24, cy: 41.2, rx: 9.5, ry: 2.6, fill: c.halo((P) => karis(P.b, P.a, 0.3)) }, g);
  const [dU, dG] = c.grad2('linearGradient', { gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: BY, y2: 10 }, [[0, 'b', 1], [0.45, (P) => karis(P.b, P.c, 0.55), 0.9], [1, 'c', 0]]);
  const [iU, iG] = c.grad2('linearGradient', { gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: BY, y2: 20 }, [[0, 'a', 1], [0.7, 'a', 0.85], [1, 'b', 0]]);
  const dis = yap('path', { fill: dU }, g);
  const ic = yap('path', { fill: iU }, g);
  const kv = [0, 1, 2].map(() => { const e = yap('circle', { r: 0.9 }, g); c.renk(e, 'fill', 'a'); return e; });
  const bos = yap('ellipse', { cx: 24, cy: 40.6, rx: 7, ry: 2, fill: 'none', 'stroke-width': 1.1, 'stroke-dasharray': '1.6 2.4' }, g); c.renk(bos, 'stroke', 'a');
  const alev = (w, h, sw, cs) => `M${f2(BX)},${f2(BY)}C${f2(BX - w * 1.08)},${f2(BY - h * 0.05)} ${f2(BX - w * 0.9 + cs)},${f2(BY - h * 0.58)} ${f2(BX + sw)},${f2(BY - h)}C${f2(BX + w * 0.9 + cs)},${f2(BY - h * 0.58)} ${f2(BX + w * 1.08)},${f2(BY - h * 0.05)} ${f2(BX)},${f2(BY)}Z`;
  return {
    ciz(s, dt, t, st) {
      const o = s.o, tt = st ? 3.1 : t;
      const h = (9 + 25 * Math.pow(o, 0.8)) * (1 + (st ? 0 : 0.07 * gur(tt * 7))), w = 4.2 + 6.8 * Math.pow(o, 0.6);
      const sw = st ? 0.6 : gur(tt * 1.7) * (0.7 + 2.4 * o) + gur(tt * 6.3) * 0.6 * o;
      const cs = st ? 0 : gur(tt * 2.9 + 5) * 1.2 * o;
      ata(dis, 'd', alev(w, h, sw, cs)); ata(dG, 'y2', BY - h);
      const hi = h * 0.56; ata(ic, 'd', alev(w * 0.48, hi, sw * 0.55, cs * 0.5)); ata(iG, 'y2', BY - hi);
      ata(dis, 'opacity', 1 - s.bos); ata(ic, 'opacity', 1 - s.bos);
      const nefes = ss(0.4, 0, o) * (st ? 0.5 : 0.5 + 0.5 * Math.sin(tt * 1.3));
      ata(kor, 'opacity', (0.7 + 0.2 * o + 0.3 * nefes) * (1 - 0.8 * s.bos));
      ata(halo, 'cy', BY - h * 0.42); ata(halo, 'r', 8 + h * 0.42);
      ata(halo, 'opacity', (0.22 + 0.36 * o + 0.15 * nefes) * (1 - 0.85 * s.bos));
      const akt = ss(0.3, 0.9, o) * (1 - s.bos);
      for (let i = 0; i < 3; i++) {
        const u = st ? 0.25 + i * 0.25 : fr(tt * 0.6 + i / 3);
        ata(kv[i], 'cx', BX + sw * 0.6 + (i - 1) * 3.2 * u + Math.sin(u * 6 + i * 2) * 1.1);
        ata(kv[i], 'cy', Math.max(3, BY - h * 0.72 - u * 9));
        ata(kv[i], 'r', 0.95 * (1 - u * 0.45));
        ata(kv[i], 'opacity', akt * Math.sin(Math.PI * u) * 0.9);
      }
      ata(bos, 'opacity', s.bos * 0.8);
    },
  };
};

// Derin uyku: bir kuyu; ışık derin uyku süresi kadar derine iner, dalgalar uzar ve yavaşlar.
IKON.derin = (g, c) => {
  const kid = c.id('k'), kp = yap('clipPath', { id: kid }, c.defs);
  yap('circle', { cx: 24, cy: 24, r: 19 }, kp);
  yap('circle', { cx: 24, cy: 24, r: 19, fill: c.grad('linearGradient', { gradientUnits: 'userSpaceOnUse', x1: 0, y1: 6, x2: 0, y2: 43 }, [[0, 'c', 0.05], [0.3, 'c', 0.16], [1, 'd', 0.95]]) }, g);
  const ic = yap('g', { 'clip-path': `url(#${kid})` }, g);
  const RK = ['a', 'b', 'c', 'c'], OP = [0.85, 0.6, 0.45, 0.32], GN = [1.4, 1.3, 1.2, 1.1];
  const dl = RK.map((k, i) => { const e = yap('path', { fill: 'none', 'stroke-width': GN[i], 'stroke-opacity': OP[i] }, ic); c.renk(e, 'stroke', k); return e; });
  const ip = yap('line', { x1: 24, x2: 24, y1: 12, 'stroke-width': 1, 'stroke-dasharray': '0.8 2.2', 'stroke-opacity': 0.55 }, ic); c.renk(ip, 'stroke', 'a');
  const halo = yap('circle', { cx: 24, r: 9, fill: c.halo('b') }, ic);
  const kure = yap('circle', { cx: 24, r: 2.7, fill: c.grad('radialGradient', {}, [[0, 'a', 1], [0.6, 'a', 1], [1, 'b', 1]]) }, ic);
  const kenar = yap('circle', { cx: 24, cy: 24, r: 19, fill: 'none', 'stroke-width': 1.1, 'stroke-opacity': 0.26 }, g); c.renk(kenar, 'stroke', 'a');
  const fz = [0, 0, 0, 0];
  return {
    ciz(s, dt, t, st) {
      const o = s.o, lam = 15 + 13 * o, sp = 1.5 - 1.0 * o, kf = TAU / lam, sak = 1 - 0.7 * s.bos;
      for (let k = 0; k < 4; k++) {
        if (!st) fz[k] += dt * sp * (1 - k * 0.18);
        const A = (1.5 - k * 0.24) * (0.65 + 0.55 * o) * sak, yk = 12.5 + k * 6.6, p = [];
        for (let x = 3; x <= 45.1; x += 3.5) p.push([x, yk + A * Math.sin(x * kf + (st ? k : fz[k]) + k * 1.3)]);
        ata(dl[k], 'd', acik(p));
      }
      const y = 15 + o * 21.5 + (st ? 0 : 0.7 * Math.sin(t * 0.8));
      ata(kure, 'cy', y); ata(halo, 'cy', y);
      ata(kure, 'opacity', 1 - s.bos); ata(halo, 'opacity', (0.55 + 0.25 * o) * (1 - s.bos));
      ata(ip, 'y2', Math.max(12, y - 3.6)); ata(ip, 'opacity', 1 - s.bos);
    },
  };
};

// SpO₂: halka oksijen doygunluğu kadar kapanır; damlada kabarcıklar yükselir.
const DAMLA = 'M0,-11C3.5,-6.2 8,-1.8 8,3.2C8,7.8 4.4,11 0,11C-4.4,11 -8,7.8 -8,3.2C-8,-1.8 -3.5,-6.2 0,-11Z';
IKON.spo2 = (g, c) => {
  const R = 19.4;
  const halo = yap('circle', { cx: 24, cy: 24, r: 22, fill: c.halo('b') }, g);
  const iz = yap('circle', { cx: 24, cy: 24, r: R, fill: 'none', 'stroke-width': 2.4, 'stroke-opacity': 0.14 }, g); c.renk(iz, 'stroke', 'a');
  const ag = c.grad('linearGradient', { gradientUnits: 'userSpaceOnUse', x1: 6, y1: 4, x2: 42, y2: 44 }, [[0, 'a', 1], [1, 'b', 1]]);
  const ortak = { cx: 24, cy: 24, r: R, fill: 'none', pathLength: 100, transform: 'rotate(-90 24 24)', stroke: ag };
  const yIs = yap('circle', { ...ortak, 'stroke-width': 6, 'stroke-opacity': 0.16 }, g);
  const yay = yap('circle', { ...ortak, 'stroke-width': 2.4 }, g);
  const bas = yap('circle', { r: 2.1 }, g); c.renk(bas, 'fill', 'a');
  const dg = yap('g', { transform: 'translate(24,25)' }, g);
  const kid = c.id('k'), kp = yap('clipPath', { id: kid }, c.defs); yap('path', { d: DAMLA }, kp);
  const damla = yap('path', { d: DAMLA, fill: c.grad('radialGradient', { gradientUnits: 'userSpaceOnUse', cx: -3, cy: -2, r: 15 }, [[0, 'a', 1], [0.5, 'b', 1], [1, 'c', 1]]) }, dg);
  const kab = yap('g', { 'clip-path': `url(#${kid})` }, dg);
  const kb = [0, 1, 2, 3].map(() => { const e = yap('circle', { r: 1 }, kab); c.renk(e, 'fill', 'a'); return e; });
  const par = yap('path', { d: 'M-4.7,2.2C-4.9,-0.6 -3.6,-3.4 -1.9,-5.6', fill: 'none', 'stroke-width': 1.1, 'stroke-opacity': 0.75 }, dg); c.renk(par, 'stroke', 'a');
  const bos = yap('path', { d: DAMLA, fill: 'none', 'stroke-width': 1.1, 'stroke-dasharray': '1.6 2.4' }, dg); c.renk(bos, 'stroke', 'a');
  let faz = 0;
  return {
    ciz(s, dt, t, st) {
      const o = s.o, L = 100 * (0.05 + 0.95 * o) * (1 - s.bos);
      const da = `${f2(L)} 100`;
      ata(yay, 'stroke-dasharray', da); ata(yIs, 'stroke-dasharray', da);
      ata(yay, 'opacity', L > 0.3 ? 1 : 0); ata(yIs, 'opacity', L > 0.3 ? 1 : 0);
      const a = -Math.PI / 2 + TAU * L / 100;
      ata(bas, 'cx', 24 + R * Math.cos(a)); ata(bas, 'cy', 24 + R * Math.sin(a)); ata(bas, 'opacity', (1 - s.bos) * (L < 99.5 ? 1 : 0));
      ata(damla, 'opacity', 1 - s.bos); ata(par, 'opacity', 1 - s.bos); ata(bos, 'opacity', s.bos * 0.8);
      ata(halo, 'opacity', (0.12 + 0.3 * o) * (1 - 0.8 * s.bos));
      if (!st) faz += dt * (0.22 + 0.45 * o);
      for (let i = 0; i < 4; i++) {
        const u = st ? 0.2 + i * 0.2 : fr(faz + i / 4), vis = ss(i / 4 - 0.12, i / 4 + 0.12, o) * (1 - s.bos);
        ata(kb[i], 'cx', hs(i * 3.1) * 3.2 + Math.sin(u * 5 + i) * 0.9);
        ata(kb[i], 'cy', 9.5 - u * 16);
        ata(kb[i], 'r', 0.7 + 0.25 * (i % 3) + 0.3 * u);
        ata(kb[i], 'opacity', vis * Math.sin(Math.PI * u) * 0.85);
      }
    },
  };
};

// Solunum: altı yapraklı çiçek; dakikadaki nefes sayısı hızında açılıp kapanır (nefes alma kısa, verme uzun).
IKON.solunum = (g, c) => {
  const halo = yap('circle', { cx: 24, cy: 24, r: 18, fill: c.halo('b') }, g);
  const pg = c.grad('radialGradient', { gradientUnits: 'userSpaceOnUse', cx: 24, cy: 24, r: 20 }, [[0, 'a', 0.95], [0.45, 'b', 0.75], [1, 'c', 0.4]]);
  const yp = [0, 1, 2, 3, 4, 5].map(() => { const e = yap('circle', { fill: pg, 'fill-opacity': 0.42, 'stroke-width': 0.8, 'stroke-opacity': 0.3 }, g); c.renk(e, 'stroke', 'a'); return e; });
  const oz = yap('circle', { cx: 24, cy: 24, r: 1.6 }, g); c.renk(oz, 'fill', 'a');
  const io = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
  let faz = 0;
  return {
    tempo: (o, ham) => (Number.isFinite(ham) ? kl(ham, 4, 40) : 10 + o * 10),
    ciz(s, dt, t, st) {
      if (!st) faz += dt * s.tempo / 60;
      const p = fr(faz);
      let b = st ? 0.72 : p < 0.42 ? io(p / 0.42) : 1 - io((p - 0.42) / 0.58);
      b = b * (1 - s.bos) + 0.3 * s.bos;
      const d = 3.4 + 5.8 * b, r = 7.6 + 3.1 * b, rot = (30 * b + (st ? 0 : t * 2)) * Math.PI / 180;
      for (let i = 0; i < 6; i++) {
        const a = rot + i * TAU / 6;
        ata(yp[i], 'cx', 24 + d * Math.cos(a)); ata(yp[i], 'cy', 24 + d * Math.sin(a)); ata(yp[i], 'r', r);
        ata(yp[i], 'fill-opacity', 0.42 * (1 - 0.75 * s.bos));
      }
      ata(halo, 'opacity', (0.15 + 0.45 * b) * (1 - 0.8 * s.bos));
      ata(oz, 'opacity', (0.5 + 0.5 * b) * (1 - s.bos));
    },
  };
};

/* ---------- günlük hareket simgeleri (Trend'de ve Takvim gün kartında) ---------- */

// Adım: ayak izleri yukarı doğru birer birer basılır; adım arttıkça tempo hızlanır, iz uzar.
const TABAN = 'M0,-6.2C2.2,-6.2 3,-3.7 2.9,-1.3C2.8,.9 1.9,2.2 .1,2.2C-1.8,2.2 -2.6,.7 -2.6,-1.4C-2.6,-3.9 -1.9,-6.2 0,-6.2Z';
IKON.adim = (g, c) => {
  const halo = yap('ellipse', { cx: 24, cy: 25, rx: 20, ry: 21, fill: c.halo('b') }, g);
  const ig = c.grad('radialGradient', { gradientUnits: 'userSpaceOnUse', cx: -1, cy: -3, r: 10 }, [[0, 'a', 1], [0.55, 'b', 1], [1, (P) => karis(P.b, P.c, 0.6), 1]]);
  // Beş iz yerinde durur; basılma sırası ve sönüşü canlandırılır.
  const YON = 29.4, ux = 0.87, uy = 0.49;
  const izler = [0, 1, 2, 3, 4].map((j) => {
    const t = j / 4, yan = j % 2 ? 3.7 : -3.7;
    const x = 15 + 18 * t + ux * yan, y = 40 - 31 * t + uy * yan;
    const k = yap('g', {}, g);
    yap('path', { d: TABAN, fill: ig }, k);
    yap('ellipse', { cx: 0.1, cy: 5.3, rx: 2.05, ry: 2.25, fill: ig }, k);
    const toz = yap('circle', { cx: x, cy: y + 1, fill: 'none', 'stroke-width': 0.8 }, g); c.renk(toz, 'stroke', 'a');
    return { k, toz, x, y, ayna: j % 2 ? 1 : -1 };
  });
  const bos = yap('g', { transform: 'translate(24,24) rotate(29.4) scale(1.1)' }, g);
  for (const e of [yap('path', { d: TABAN, fill: 'none', 'stroke-width': 0.9, 'stroke-dasharray': '1.4 2.1' }, bos), yap('ellipse', { cx: 0.1, cy: 5.3, rx: 2.05, ry: 2.25, fill: 'none', 'stroke-width': 0.9, 'stroke-dasharray': '1.4 2.1' }, bos)]) c.renk(e, 'stroke', 'a');
  let faz = 0;
  return {
    ciz(s, dt, t, st) {
      const o = s.o, L = 1.8 + 2.9 * o;
      if (!st) faz += dt * (0.7 + 2.1 * o);
      const f = st ? 3.55 : faz;
      for (let j = 0; j < 5; j++) {
        const iz = izler[j], yas = ((f - j) % 5 + 5) % 5;
        const gir = kl(yas / 0.1), son = kl(1 - yas / L);
        const sc = 0.95 * (1 + 0.2 * Math.exp(-yas * 9));
        ata(iz.k, 'transform', `translate(${f2(iz.x)},${f2(iz.y)}) rotate(${YON}) scale(${f2(sc * iz.ayna)},${f2(sc)})`);
        ata(iz.k, 'opacity', gir * Math.pow(son, 0.8) * (0.35 + 0.65 * (0.4 + 0.6 * o)) * (1 - s.bos));
        const u = kl(yas / 0.55);
        ata(iz.toz, 'r', 2.4 + u * 5.5);
        ata(iz.toz, 'opacity', st ? 0 : (1 - u) * (1 - u) * 0.55 * (1 - s.bos) * (yas < 0.55 ? 1 : 0));
      }
      ata(halo, 'opacity', (0.1 + 0.36 * o + (st ? 0 : 0.05 * Math.sin(t * 2.2))) * (1 - 0.85 * s.bos));
      ata(bos, 'opacity', s.bos * 0.8);
    },
  };
};

// Kat: basamaklar kat sayısı kadar aydınlanır; ışık topu basamak basamak tırmanır, tepede parlar.
IKON.kat = (g, c) => {
  const MERD = 'M6,41H12V35H18.4V29H24.8V23H31.2V17H37.6V11H43';
  const BOY = 67, BAS = (k) => (k === 0 ? 3 : 12.4 * k + 2.8);
  const TX = [9, 15.2, 21.6, 28, 34.4, 40.3], TY = [41, 35, 29, 23, 17, 11];
  const halo = yap('circle', { cx: 24, cy: 26, r: 22, fill: c.halo('b') }, g);
  yap('path', { d: `${MERD}V44H6Z`, fill: c.grad('linearGradient', { gradientUnits: 'userSpaceOnUse', x1: 0, y1: 11, x2: 0, y2: 44 }, [[0, 'c', 0.32], [1, 'd', 0]]) }, g);
  const iz = yap('path', { d: MERD, fill: 'none', 'stroke-width': 1.5, 'stroke-opacity': 0.22 }, g); c.renk(iz, 'stroke', 'a');
  const ag = c.grad('linearGradient', { gradientUnits: 'userSpaceOnUse', x1: 6, y1: 41, x2: 43, y2: 11 }, [[0, 'c', 1], [0.5, 'b', 1], [1, 'a', 1]]);
  const isima = yap('path', { d: MERD, fill: 'none', stroke: ag, 'stroke-width': 5, 'stroke-opacity': 0.16 }, g);
  const yan = yap('path', { d: MERD, fill: 'none', stroke: ag, 'stroke-width': 1.9 }, g);
  const yildiz = yap('path', { d: YILDIZ }, g); c.renk(yildiz, 'fill', 'a');
  const th = yap('circle', { r: 6.5, fill: c.halo('a') }, g);
  const top = yap('ellipse', { rx: 2.1, ry: 2.1, fill: c.grad('radialGradient', {}, [[0, 'a', 1], [0.65, 'a', 1], [1, 'b', 1]]) }, g);
  const bos = yap('path', { d: MERD, fill: 'none', 'stroke-width': 1.2, 'stroke-dasharray': '1.6 2.4' }, g); c.renk(bos, 'stroke', 'a');
  let faz = 0;
  return {
    ciz(s, dt, t, st) {
      const o = s.o, uz = 3 + o * (BOY - 3);
      let n = 0; while (n < 5 && BAS(n + 1) <= uz + 0.01) n++;
      const da = `${f2(uz)} ${BOY + 10}`;
      ata(yan, 'stroke-dasharray', da); ata(isima, 'stroke-dasharray', da);
      ata(yan, 'opacity', 1 - s.bos); ata(isima, 'opacity', 1 - s.bos); ata(bos, 'opacity', s.bos * 0.8);
      const tirman = Math.max(n, 0.6), devir = tirman + 1.5;
      if (!st) faz += dt * (1.9 + 0.8 * o);
      const p = st ? tirman + 0.4 : ((faz % devir) + devir) % devir;
      let x, y, gor = 1, par = 0, ez = 1;
      if (p < tirman) {
        const k = Math.min(Math.floor(p), Math.max(n - 1, 0)), u = n ? p - k : 0;
        const k2 = n ? k + 1 : 0, yay = Math.sin(Math.PI * (n ? u : p / tirman));
        x = TX[k] + (TX[k2] - TX[k]) * u; y = TY[k] + (TY[k2] - TY[k]) * u - 2.4 - 4.2 * yay;
        ez = 1 + 0.12 * yay; gor = kl(p / 0.25);
      } else {
        const r = p - tirman; x = TX[n]; y = TY[n] - 2.4;
        par = Math.exp(-r * 2.6); gor = kl((1.5 - r) / 0.4); ez = 1 - 0.1 * Math.exp(-r * 14);
      }
      ata(top, 'cx', x); ata(top, 'cy', y); ata(top, 'rx', 2.1 / Math.sqrt(ez)); ata(top, 'ry', 2.1 * ez);
      ata(th, 'cx', x); ata(th, 'cy', y);
      ata(top, 'opacity', gor * (1 - s.bos)); ata(th, 'opacity', gor * (0.45 + 0.4 * par) * (1 - s.bos));
      const ys = 2.4 + 1.6 * par + (st ? 0 : 0.35 * Math.sin(t * 3));
      ata(yildiz, 'transform', `translate(${f2(TX[n] + 1.2)},${f2(TY[n] - 8.2)}) scale(${f2(ys)})`);
      ata(yildiz, 'opacity', (0.35 + 0.65 * par) * ss(0.05, 0.3, o) * (1 - s.bos));
      ata(halo, 'cy', 26 - 10 * o);
      ata(halo, 'opacity', (0.1 + 0.32 * o + 0.1 * par) * (1 - 0.85 * s.bos));
    },
  };
};

// Aktif kalori: maytap gibi yanan bir kor; kalori arttıkça kıvılcımlar çoğalır, uzar ve hızlanır.
IKON.kalori = (g, c) => {
  const CX = 24, CY = 26, NK = 11;
  const halo = yap('circle', { cx: CX, cy: CY, r: 16, fill: c.halo('b') }, g);
  const kv = Array.from({ length: NK }, () => {
    const cz = yap('line', { 'stroke-width': 1.15 }, g); c.renk(cz, 'stroke', (P) => karis(P.a, P.b, 0.35));
    const uc = yap('circle', { r: 0.75 }, g); c.renk(uc, 'fill', 'a');
    return { cz, uc };
  });
  const kg = yap('g', {}, g);
  yap('circle', { r: 6.5, fill: c.halo('a') }, kg);
  yap('circle', { r: 3.6, fill: c.grad('radialGradient', { gradientUnits: 'userSpaceOnUse', cx: -1, cy: -1.2, r: 5 }, [[0, 'a', 1], [0.55, 'b', 1], [1, (P) => karis(P.b, P.c, 0.6), 1]]) }, kg);
  const yd = yap('path', { d: YILDIZ }, kg); c.renk(yd, 'fill', 'a');
  const bos = yap('circle', { cx: CX, cy: CY, r: 5, fill: 'none', 'stroke-width': 1.1, 'stroke-dasharray': '1.6 2.4' }, g); c.renk(bos, 'stroke', 'a');
  let faz = 0, don = 0;
  return {
    ciz(s, dt, t, st) {
      const o = s.o, Lr = 5.5 + 13 * Math.pow(o, 0.85), etkin = 3 + 8 * o;
      if (!st) { faz += dt * (0.8 + 1.5 * o); don += dt * (20 + 50 * o); }
      for (let i = 0; i < NK; i++) {
        const v = st ? 0.35 + 0.37 * fr(i * 0.618) : faz + i / NK, dv = Math.floor(v), u = st ? v : fr(v);
        const a = -Math.PI / 2 + hs(dv * 7.31 + i * 3.17) * 2.3;
        const r = 4.2 + u * Lr, kuy = 1.6 + 2.6 * o * (1 - u);
        const ca = Math.cos(a), sa = Math.sin(a), yuk = -u * u * 2.2;
        const g2 = ss(i, i + 1, etkin) * Math.pow(Math.sin(Math.PI * kl(u)), 0.7) * (1 - s.bos);
        ata(kv[i].cz, 'x1', CX + ca * Math.max(4, r - kuy)); ata(kv[i].cz, 'y1', CY + sa * Math.max(4, r - kuy) + yuk);
        ata(kv[i].cz, 'x2', CX + ca * r); ata(kv[i].cz, 'y2', CY + sa * r + yuk);
        ata(kv[i].cz, 'opacity', g2 * 0.85);
        ata(kv[i].uc, 'cx', CX + ca * (r + 0.6)); ata(kv[i].uc, 'cy', CY + sa * (r + 0.6) + yuk);
        ata(kv[i].uc, 'opacity', g2 * ss(0.4, 0.8, u));
      }
      const tit = st ? 0 : 0.5 + 0.5 * gur(t * 9);
      ata(kg, 'transform', `translate(${CX},${CY}) scale(${f2(0.85 + 0.35 * o + 0.08 * tit)})`);
      ata(yd, 'transform', `rotate(${f2(st ? 20 : don)}) scale(${f2(4.6 + 1.6 * o + 0.6 * tit)})`);
      ata(kg, 'opacity', 1 - s.bos);
      ata(halo, 'r', 10 + 11 * o);
      ata(halo, 'opacity', (0.16 + 0.4 * o + 0.08 * tit) * (1 - 0.85 * s.bos));
      ata(bos, 'opacity', s.bos * 0.8);
    },
  };
};

// Yoğun dakika: on iki dakika çentiği hedefe doğru dolar; ortadaki şimşek yoğunluk arttıkça sıklaşan darbelerle çakar.
const SIMSEK = 'M2.3,-10.6L-5.4,1.3H-.5L-2.5,10.6L5.5,-1.7H.7Z';
IKON.yogun = (g, c) => {
  const halo = yap('circle', { cx: 24, cy: 24, r: 17, fill: c.halo('b') }, g);
  const ce = Array.from({ length: 12 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 12) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const e = yap('line', { x1: 24 + 16.2 * ca, y1: 24 + 16.2 * sa, x2: 24 + 20 * ca, y2: 24 + 20 * sa, 'stroke-width': 2 }, g);
    c.renk(e, 'stroke', (P) => karis(P.b, P.a, i / 11));
    return e;
  });
  const dalga = yap('circle', { cx: 24, cy: 24, fill: 'none' }, g); c.renk(dalga, 'stroke', (P) => karis(P.a, P.b, 0.4));
  const sg = yap('g', {}, g);
  yap('circle', { r: 9, fill: c.halo('a') }, sg);
  const sim = yap('path', { d: SIMSEK, fill: c.grad('linearGradient', { gradientUnits: 'userSpaceOnUse', x1: 0, y1: -11, x2: 0, y2: 11 }, [[0, 'a', 1], [0.55, 'b', 1], [1, (P) => karis(P.b, P.c, 0.55), 1]]) }, sg);
  const kenar = yap('path', { d: SIMSEK, fill: 'none', 'stroke-width': 0.7, 'stroke-opacity': 0.5 }, sg); c.renk(kenar, 'stroke', 'a');
  const bos = yap('path', { d: SIMSEK, fill: 'none', 'stroke-width': 1.1, 'stroke-dasharray': '1.6 2.4', transform: 'translate(24,24)' }, g); c.renk(bos, 'stroke', 'a');
  let faz = 0, tur = 0;
  return {
    ciz(s, dt, t, st) {
      const o = s.o, dolu = o * 12;
      if (!st) { faz += dt * (0.55 + 1.9 * o * o); tur += dt * 0.45; }
      const p = st ? 0.18 : fr(faz), cak = Math.exp(-p * 9) * (1 - s.bos);
      const kos = st ? -9 : fr(tur) * Math.max(dolu, 1);
      for (let i = 0; i < 12; i++) {
        const isik = kl(dolu - i), yakin = Math.exp(-Math.pow(i - kos, 2) * 1.2) * ss(0, 1, isik);
        ata(ce[i], 'opacity', (0.16 + 0.84 * isik * (0.62 + 0.38 * yakin)) * (1 - 0.5 * s.bos));
      }
      const jx = st ? 0 : cak * 0.6 * gur(t * 40), jy = st ? 0 : cak * 0.4 * gur(t * 37 + 2);
      ata(sg, 'transform', `translate(${f2(24 + jx)},${f2(24 + jy)}) scale(${f2(0.9 + 0.1 * o + 0.14 * cak)})`);
      ata(sim, 'opacity', (0.55 + 0.45 * Math.max(cak, st ? 0.6 : 0)) * (1 - s.bos)); ata(kenar, 'opacity', 1 - s.bos);
      const rr = 8 + p * 8;
      ata(dalga, 'r', rr); ata(dalga, 'stroke-width', 1.2 * (1 - p * 0.6));
      ata(dalga, 'opacity', st ? 0 : Math.pow(1 - p, 2) * 0.6 * (1 - s.bos));
      ata(halo, 'opacity', (0.12 + 0.3 * o + 0.25 * cak) * (1 - 0.85 * s.bos));
      ata(bos, 'opacity', s.bos * 0.8);
    },
  };
};

// En yüksek nabız: atımlar gittikçe yükselir, en yükseği tepe çizgisine değer; ışık izi o hızda koşar ve tepede parlar.
IKON.maxnabiz = (g, c) => {
  const XS = [10, 18, 26, 34], Y0 = 39;
  const halo = yap('circle', { cx: 34, cy: 22, r: 14, fill: c.halo('b') }, g);
  const tepe = yap('line', { x1: 5, x2: 44, 'stroke-width': 0.9, 'stroke-dasharray': '1.2 2.2' }, g); c.renk(tepe, 'stroke', 'a');
  const ag = c.grad('linearGradient', { gradientUnits: 'userSpaceOnUse', x1: 2, y1: 0, x2: 46, y2: 0 }, [[0, 'c', 0.35], [0.5, 'b', 0.9], [0.75, 'a', 1], [1, 'b', 0.4]]);
  const iz = yap('path', { fill: 'none', stroke: ag, 'stroke-width': 1.5, 'stroke-opacity': 0.55 }, g);
  const kuyruk = yap('path', { fill: 'none', 'stroke-width': 4, 'stroke-opacity': 0.18, pathLength: 100 }, g); c.renk(kuyruk, 'stroke', 'a');
  const kuyrukIc = yap('path', { fill: 'none', 'stroke-width': 1.8, pathLength: 100 }, g); c.renk(kuyrukIc, 'stroke', 'a');
  const th = yap('circle', { r: 7, fill: c.halo('a') }, g);
  const nokta = yap('circle', { r: 1.9 }, g); c.renk(nokta, 'fill', 'a');
  const bos = yap('path', { d: 'M4,39H44', fill: 'none', 'stroke-width': 1.2, 'stroke-dasharray': '1.6 2.4' }, g); c.renk(bos, 'stroke', 'a');
  let faz = 0, oncekiO = -1, d = '', kesir = 0.7, tx = 34, ty = 20;
  const yolKur = (o) => {
    const H = 9 + 22 * o, p = [[3, Y0]];
    XS.forEach((x, k) => {
      const h = H * Math.pow((k + 1) / 4, 1.45), b = Y0 - (x - 3) / 31 * 3.5 * o;
      p.push([x - 2.2, b], [x - 1.1, b + 1.6], [x, Y0 - h], [x + 1.2, b + 0.3 * h * 0.3 + 1.4], [x + 2.4, b]);
    });
    p.push([45, Y0]);
    let top = 0, tepeU = 0; const pk = 3 + 5 * 3 + 2 + 1;
    for (let i = 1; i < p.length; i++) { top += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (i === pk) tepeU = top; }
    d = 'M' + p.map((q) => `${f2(q[0])},${f2(q[1])}`).join('L');
    kesir = tepeU / top; tx = XS[3]; ty = Y0 - H;
  };
  return {
    tempo: (o, ham) => (Number.isFinite(ham) ? kl(ham, 60, 220) : 100 + 80 * o),
    ciz(s, dt, t, st) {
      const o = s.o;
      if (Math.abs(o - oncekiO) > 0.002) { yolKur(o); oncekiO = o; ata(iz, 'd', d); ata(kuyruk, 'd', d); ata(kuyrukIc, 'd', d); }
      if (!st) faz += dt * s.tempo / 60 / 4;
      const bas = st ? kesir : fr(faz) * 1.15 - 0.05;
      const ofs = f2(12 - bas * 100);
      for (const e of [kuyruk, kuyrukIc]) { ata(e, 'stroke-dasharray', '12 120'); ata(e, 'stroke-dashoffset', ofs); ata(e, 'opacity', (st ? 0.8 : kl((1.08 - bas) / 0.12)) * (1 - s.bos)); }
      const du = bas - kesir, par = du >= 0 ? Math.exp(-du * 5) : Math.exp(du * 40) * 0.4;
      ata(tepe, 'y1', ty); ata(tepe, 'y2', ty); ata(tepe, 'opacity', (0.25 + 0.3 * par) * (1 - s.bos));
      ata(nokta, 'cx', tx); ata(nokta, 'cy', ty); ata(nokta, 'r', 1.5 + 1 * par);
      ata(th, 'cx', tx); ata(th, 'cy', ty);
      ata(nokta, 'opacity', (0.55 + 0.45 * par) * (1 - s.bos)); ata(th, 'opacity', (0.25 + 0.6 * par) * (1 - s.bos));
      ata(iz, 'opacity', 1 - s.bos);
      ata(halo, 'cy', ty + 2); ata(halo, 'opacity', (0.1 + 0.28 * o + 0.14 * par) * (1 - 0.85 * s.bos));
      ata(bos, 'opacity', s.bos * 0.8);
    },
  };
};

export const OLCUM_IDLERI = Object.keys(IKON);

/* ---------- örnek ---------- */
export function simgeKur(kap, olcumId, secenek = {}) {
  const { gsap, boyut = 44 } = secenek;
  if (!gsap) throw new Error('simgeKur: gsap örneği gerekli');
  const tanim = Object.hasOwn(IKON, olcumId) ? IKON[olcumId] : null;
  const onek = `cs${++sayac}`;
  let gid = 0;
  const svg = yap('svg', { viewBox: '0 0 48 48', width: boyut, height: boyut, 'aria-hidden': 'true', focusable: 'false', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg.style.display = 'block'; svg.style.overflow = 'hidden';
  const defs = yap('defs', {}, svg), kok = yap('g', {}, svg);
  const boyaListe = []; // [eleman, öznitelik, anahtar]
  const anahtarRenk = (P, s, k) => (typeof k === 'function' ? k(P, s) : P[k]);
  const grad2 = (tur, at, duraklar) => {
    const id = `${onek}-g${gid++}`, e = yap(tur, { id, ...at }, defs);
    for (const [ofs, k, op] of duraklar) boyaListe.push([yap('stop', { offset: ofs, 'stop-opacity': op }, e), 'stop-color', k]);
    return [`url(#${id})`, e];
  };
  const c = {
    defs,
    id: (ad) => `${onek}-${ad}${gid++}`,
    renk: (e, oz, k) => boyaListe.push([e, oz, k]),
    grad2,
    grad: (tur, at, d) => grad2(tur, at, d)[0],
    halo: (k) => grad2('radialGradient', {}, HALO.map(([o, a]) => [o, k, a]))[0],
  };
  const ikon = tanim?.(kok, c);
  // Eksik gün ve yeni/bilinmeyen ölçüm hiçbir zaman önceki değeri göstermesin.
  const bosIz = yap('path', { d: 'M17 24h14', fill: 'none', stroke: '#b6adc0', 'stroke-width': 2 }, svg);
  kap.appendChild(svg);

  const s = { o: 0.5, sic: 0, sog: 0, bos: 1, tempo: 0 };
  s.tempo = ikon?.tempo ? ikon.tempo(s.o, null) : 0;
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let rm = !!secenek.azHareket || !!(mq && mq.matches);
  let elle = false, gorunur = true, calisiyor = false, kirli = true, t = 0, tw = null, olu = false;
  let veriVar = false;

  function boya() { const P = palet(s); for (const [e, oz, k] of boyaListe) ata(e, oz, rgb(anahtarRenk(P, s, k))); }
  function ciz(dt) {
    if (kirli) { boya(); kirli = false; }
    ata(bosIz, 'visibility', veriVar ? 'hidden' : 'visible');
    ata(kok, 'visibility', veriVar ? 'visible' : 'hidden');
    if (!veriVar) return;
    const d = dt * (1 - 0.8 * s.bos); t += d;
    ata(kok, 'opacity', 1 - 0.42 * s.bos);
    ikon.ciz(s, d, t, rm);
  }
  function tik(_, dms) { ciz(Math.min((dms || 16) / 1000, 0.1)); }
  function dongu() {
    const ist = !olu && !rm && !elle && gorunur && veriVar;
    if (ist && !calisiyor) { gsap.ticker.add(tik); calisiyor = true; }
    else if (!ist && calisiyor) { gsap.ticker.remove(tik); calisiyor = false; }
    if (!calisiyor && !olu) {
      if (tw) { tw.progress(1); tw.kill(); tw = null; }
      ciz(0);
    }
  }
  const mqDeg = () => { rm = !!secenek.azHareket || mq.matches; dongu(); };
  if (mq) mq.addEventListener('change', mqDeg);
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => { gorunur = es[es.length - 1].isIntersecting; dongu(); }) : null;
  if (io) io.observe(svg);
  dongu();

  return {
    eleman: svg,
    guncelle({ oran, durum, ham } = {}) {
      if (olu) return;
      const onceVeri = veriVar;
      veriVar = !!ikon && Number.isFinite(oran) && ['lo', 'ok', 'hi'].includes(durum);
      if (tw) { tw.kill(); tw = null; }
      const hedef = { o: veriVar ? kl(oran) : .5, sic: veriVar && durum === 'hi' ? 1 : 0, sog: veriVar && durum === 'lo' ? 1 : 0, bos: veriVar ? 0 : 1 };
      if (ikon?.tempo) hedef.tempo = ikon.tempo(hedef.o, Number.isFinite(ham) ? ham : null);
      if (!onceVeri || !veriVar || rm || elle || !gorunur) {
        Object.assign(s, hedef);
        kirli = true;
        dongu();
        if (calisiyor) ciz(0);
        return;
      }
      const yenile = () => { kirli = true; if (!calisiyor) ciz(0); };
      tw = gsap.to(s, { ...hedef, duration: 0.55, ease: 'power2.inOut', onUpdate: yenile });
      yenile();
    },
    durdur() { elle = true; dongu(); },
    baslat() { elle = false; dongu(); },
    yokEt() {
      if (olu) return;
      olu = true;
      if (tw) tw.kill();
      if (calisiyor) gsap.ticker.remove(tik);
      calisiyor = false;
      if (io) io.disconnect();
      if (mq) mq.removeEventListener('change', mqDeg);
      svg.remove(); boyaListe.length = 0;
    },
  };
}
