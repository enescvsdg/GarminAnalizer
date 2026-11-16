import { duzenModu, genisDuzen, gunIndeksi, etiketGunleri, balonX, klavyeEylem, carkBirikim, carkSure, carkHedef, simgeOrani } from './duzen.js';
import { simgeKur } from './simgeler.js';
import { ACIKLAMA } from './aciklama.js';
const $ = (id) => document.getElementById(id);
const telKok = $('tel');
// Düzen açılışta bir kez seçilir: geniş ekran (≥1000×620) ayrı yerleşim alır, altı bugünkü telefon/çerçeve davranışıdır.
// Pencere geniş ↔ dar eşiğini aşarsa sayfa bir kez yeniden yüklenir (aşağıda).
const GENIS = duzenModu(innerWidth, innerHeight) === 'genis';
const KART_EYLEM = GENIS ? 'Trendde göster' : 'Trendini aç'; // geniş ekranda kart ekran değiştirmez
let GD = null, gunSayisi = 28; // geniş ekran geometrisi (duzen.js genisDuzen) ve grafikteki gün sayısı
// Geniş ekran: telefon çerçevesi kalkar; şekil ve Bugün sol, Trend sağ bölgeye taşınır; ses ve Ayarlar sağ üstte
function genisKur() {
  document.documentElement.classList.add('genis'); telKok.classList.add('genis');
  const bolge = (id) => { const d = document.createElement('div'); d.id = id; d.className = 'bolge'; return d; };
  const bB = bolge('bolgeB'), bT = bolge('bolgeT');
  bB.append($('gl'), $('bugun')); bT.append($('trend'));
  telKok.prepend(bB, bT);
  const ab = document.createElement('button'); ab.type = 'button'; ab.id = 'ayarBtn';
  ab.setAttribute('aria-haspopup', 'dialog'); ab.setAttribute('aria-controls', 'ayar'); ab.setAttribute('aria-expanded', 'false');
  ab.innerHTML = '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M3 7h8M15 7h4M3 15h4M11 15h8"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="15" r="2"/></svg><span>Ayarlar</span>';
  const arac = document.createElement('div'); arac.id = 'arac'; $('sesBtn').title = 'Ses efektleri';
  arac.append($('sesBtn'), ab); telKok.insertBefore(arac, $('bekle'));
  $('ipucu').textContent = matchMedia('(hover: none)').matches ? 'Bir güne dokun · ← → gün · ↑ ↓ ya da 1–9 ölçüm' : 'Tekerlekle gez, bir güne tıkla · ← → gün · ↑ ↓ ya da 1–9 ölçüm';
  $('trend').setAttribute('aria-label', 'Trend: gün seçmek için sol ve sağ ok tuşları');
}
function genisOlcek() {
  GD = genisDuzen(innerWidth, innerHeight, gunSayisi);
  const s = GD.s, b = $('bolgeB'), t = $('bolgeT');
  b.style.width = '390px'; b.style.height = GD.hb + 'px'; b.style.transform = `translate(${GD.bx.toFixed(2)}px,0) scale(${s})`;
  t.style.width = GD.twu + 'px'; t.style.height = GD.hb + 'px'; t.style.transform = `translate(${GD.tx.toFixed(2)}px,0) scale(${s})`;
  t.style.setProperty('--dok', Math.max(40, 36 / s).toFixed(1) + 'px');
  t.style.setProperty('--dok-temas', Math.ceil(44 / s) + 'px'); // ölçek sonrası ölçüm düğmeleri en az 44 CSS px
  telKok.classList.toggle('serbest', GD.ox > 1); // ultra geniş: iki bölge ortada, kenarlar da erir
  $('arac').style.right = (16 + GD.ox).toFixed(1) + 'px'; // sağ üst düğmeler içeriğin sağ üst köşesinde
  const ac = $('arac').offsetWidth + 28; // düğmelerin altına seçici girmesin
  $('secici').style.marginRight = Math.max(0, ac / s - 24).toFixed(1) + 'px';
  return { S: s, H: GD.hb };
}
if (GENIS) genisKur();
// Ölçekleme: veri beklenirken de ekran doğru oturur
function telOlcek() {
  if (GENIS) return genisOlcek();
  // Sayfa gizli/sıfır boyutlu açılırsa (arka planda başlatma) ölçek 0 olur ve bütün ölçümler NaN'a döner:
  // boyut yokken tasarım ölçüsü varsayılır; gerçek boyut gelince resize ile yeniden hesaplanır.
  const iw = innerWidth || 390, ih = innerHeight || 844;
  const mob = iw <= 520, S = mob ? iw / 390 : Math.max(0.1, Math.min(1, (ih - 32) / 844)), H = mob ? ih / S : 844;
  telKok.classList.toggle('mob', mob); telKok.style.height = H + 'px'; telKok.style.transform = `scale(${S})`;
  return { S, H };
}
// geniş ↔ dar eşiği aşılınca (yeniden boyutlandırma durulduktan sonra) bir kez yeniden yükle; boyutsuz anlar sayılmaz
let esikZaman = 0, esikYukleniyor = false;
addEventListener('resize', () => {
  clearTimeout(esikZaman);
  esikZaman = setTimeout(() => {
    if (esikYukleniyor || !innerWidth || !innerHeight) return;
    if ((duzenModu(innerWidth, innerHeight) === 'genis') !== GENIS) { esikYukleniyor = true; location.reload(); }
  }, 250);
});

let CANLI; // veri-canli.js dinamik yüklenir; yüklenemezse küçük bir yedek konur, uygulama örnek veriyle açılır
// bag: { baglanti: bağlantı kayıtlı mı, canli: veri şimdi Worker'dan mı geldi, kaynak: 'canli'|'onbellek'|'yok', neden: 'ag'|'yetki'|'sunucu'|null, zaman: önbellek verisinin alındığı an }
function baslat(VERI, bag) {
const { OLCUMLER: O, GUNLER, durum, OK, DURUM_METIN } = VERI;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg', TAU = Math.PI * 2;
const N = GUNLER.length, G0 = N - 7, W = 390, cx = 195;
let DW = 58; // Trend'de gün aralığı; geniş ekranda 28 gün bölgeye sığacak şekilde hesaplanır
gunSayisi = N;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TIK = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.5l2.5 2.5 4.5-6"/></svg>';
const KISA = { nabiz: 'Nabız', yuk: 'Yük' };
const bicim = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
const bpmDe = (g) => g.d.nabiz ?? 60; // nabız verisi yoksa nötr tempo
const tel = $('tel'), cv = $('gl'), bKok = GENIS ? $('bolgeB') : tel; // bKok: Bugün koordinatlarının kökü
let H = 844, S = 1;
let ekran = 'bugun', mesgul = false, sel7 = 6, sonOlcum = 0, ayarAcik = false;
const st = { e: GUNLER[N - 1].e, bpm: bpmDe(GUNLER[N - 1]), ign: RM ? 1 : 0, orbit: 1, flat: 0, cy: 430, P: N - 1, gunesY: 1, yuk: 0, yukA: 0 };
// Bugün yerleşimi: başlık ile gün şeridi arasında kalan boşluğa göre hesaplanır
const lay = { cy: 430, rx: 139, ry0: 150, ry1: 166, ks: 1, rs: 0.86 };
// Trend çizim alanı
const tl = { ust: 300, alt: 640, baslikAlt: 0 };

/* ================= WebGL: yaşayan, esneyen şekil ================= */
const gl = cv.getContext('webgl', { antialias: false, alpha: false });
const FS = `precision highp float;
uniform vec2 uC,uTp,uPull;uniform float uT,uE,uBeat,uIgn,uPh,uSc,uFlat,uPress,uHold,uWave,uRs,uJig;
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float sn(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;
vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);
vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 nr=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=nr.x;p1*=nr.y;p2*=nr.z;p3*=nr.w;
vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
vec3 pal(float e,float k){
 vec3 lc=vec3(1.00,0.52,0.24),le=vec3(0.62,0.17,0.86);
 vec3 mc=vec3(1.00,0.83,0.52),me=vec3(0.93,0.33,0.56);
 vec3 hc=vec3(0.96,1.00,0.74),he=vec3(0.12,0.82,0.68);
 vec3 a=mix(lc,le,k),b=mix(mc,me,k),c=mix(hc,he,k);
 return e<0.5?mix(a,b,e*2.0):mix(b,c,e*2.0-1.0);}
void main(){
 vec2 q=(gl_FragCoord.xy-uC)/uSc;float t=uT;
 float tk=1.0-clamp(uFlat,0.0,1.0);
 vec2 p=vec2(q.x*(1.0-0.66*uFlat),q.y/max(1.0-0.955*uFlat,0.02));
 vec2 ph0=p;
 float r0=mix(0.165,0.215,uE)*uRs*(0.12+0.88*uIgn)*(1.0+0.04*uBeat)*(1.0+0.14*uHold-0.03*uPress);
 float pl=length(uPull);
 if(pl>0.0005){
  vec2 u=uPull/pl;vec2 w=vec2(-u.y,u.x);
  p-=uPull*0.16*tk;
  float a=dot(p,u),b=dot(p,w);
  float lam=max(pl-r0*0.9,0.0)/max(r0,0.001)*tk;
  float sg=smoothstep(-r0*0.5,r0*0.9,a);
  float tip=clamp(a/(r0*(1.0+lam)),0.0,1.0);
  a/=1.0+lam*sg;
  b*=(1.0+0.07*lam)*(1.0+lam*0.9*sg*tip*tip);
  p=u*a+w*b;
 }
 float len=length(p);
 float amp=mix(0.062,0.022,uE)*uRs*(1.0-0.7*uFlat);float sp=mix(0.62,0.20,uE);
 float n=sn(vec3(p*2.3/uRs,t*sp))*0.62+sn(vec3(p*5.1/uRs+3.1,t*sp*1.7))*0.3;
 float d=len-r0-amp*n*uIgn;
 d-=uJig*0.03*r0*sin(3.0*atan(p.y,p.x)-t*19.0)*tk;
 vec2 dp=ph0-uTp;float dd=dot(dp,dp);
 d+=uPress*(0.05*exp(-dd/0.0055)-0.016*exp(-dd/0.03))*uRs*tk;
 vec3 bg=mix(vec3(0.052,0.030,0.072),vec3(0.018,0.070,0.082),uE)*(1.0-0.42*length(q*vec2(1.0,0.55)));
 float depth=clamp(-d/max(r0,0.001),0.0,1.0);
 float flow=sn(vec3(p*3.4/uRs-vec2(0.0,t*0.16),t*0.22))*0.5+0.5;
 float k=clamp(1.0-depth*1.45+flow*0.42-0.08,0.0,1.0);
 vec3 col=pal(uE,k);
 vec2 hc2=vec2(-0.30,0.36)*r0+uTp*uPress*0.35;
 col+=smoothstep(0.62,0.0,length(p-hc2)/max(r0,0.001))*0.34*mix(vec3(1.0,0.82,0.66),vec3(1.0),uE);
 float sh=dot(p/max(len,0.0001),normalize(vec2(0.55,-0.83)));
 col*=1.0-0.42*smoothstep(-0.1,0.9,sh)*(1.0-depth*0.75)*tk;
 col*=mix(0.80,1.04,uE)+0.13*uBeat+0.5*uFlat+0.12*uHold;
 float g=exp(-max(d,0.0)*mix(10.5,6.2,uE)/uRs)*mix(0.50,0.92,uE)*(0.82+0.34*uBeat)*uIgn;
 vec3 c=bg+pal(uE,0.86)*g;
 float rr=r0+uPh*0.5*uRs;
 c+=pal(uE,0.55)*exp(-abs(len-rr-amp*n*0.5)*110.0)*(1.0-uPh)*(1.0-uPh)*0.42*uIgn*tk;
 c+=pal(uE,0.35)*exp(-abs(length(ph0)-(r0+uWave*0.8))*55.0)*(1.0-uWave)*step(0.001,uWave)*0.9;
 c=mix(c,col,smoothstep(0.0035,-0.0035,d));
 c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+t)*43758.5453)-0.5)*0.035;
 gl_FragColor=vec4(c,1.0);}`;
let U = null;
if (gl) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, mk(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}'));
  gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  U = {}; ['uC', 'uT', 'uE', 'uBeat', 'uIgn', 'uPh', 'uSc', 'uFlat', 'uTp', 'uPull', 'uPress', 'uHold', 'uWave', 'uRs', 'uJig'].forEach((n) => (U[n] = gl.getUniformLocation(pr, n)));
} else cv.style.background = 'radial-gradient(circle at 50% 52%,#ff9a5c 0,#8a3bd0 18%,#0c0812 38%)';

/* ================= Yardımcılar ================= */
function bol(el, txt) {
  el.textContent = ''; el.setAttribute('aria-label', txt); const out = [];
  txt.split(' ').forEach((w, wi, a) => {
    const ws = document.createElement('span'); ws.className = 'kel'; ws.setAttribute('aria-hidden', 'true');
    [...w].forEach((ch) => { const s = document.createElement('span'); s.className = 'h'; s.textContent = ch; ws.appendChild(s); out.push(s); });
    el.appendChild(ws); if (wi < a.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return out;
}
function yaz(el, txt) {
  if (el._tl) el._tl.kill();
  const eski = [...el.querySelectorAll('.h')];
  if (RM) { bol(el, txt); return; }
  const t = (el._tl = gsap.timeline());
  if (eski.length) t.to(eski, { yPercent: -70, autoAlpha: 0, duration: 0.2, stagger: 0.008, ease: 'power2.in' });
  t.add(() => { gsap.from(bol(el, txt), { yPercent: 85, autoAlpha: 0, rotation: 7, duration: 0.65, stagger: 0.022, ease: 'back.out(1.8)' }); });
}
function titret(ms) {
  try {
    if (navigator.vibrate) { navigator.vibrate(ms); return; }
    // iOS Safari titreşim API'sini desteklemez; anahtar tipli onay kutusu dokunsal geri bildirim verir (iOS 18+)
    const l = document.createElement('label'); l.style.display = 'none';
    const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); l.appendChild(i);
    document.body.appendChild(l); l.click(); l.remove();
  } catch (e) {}
}
const telY = (el, kenar) => (el.getBoundingClientRect()[kenar] - tel.getBoundingClientRect().top) / S;
function durumHtml(du, uzun) { return du === 'ok' ? TIK + 'normalde' : OK[du] + (uzun ? 'normalin ' : '') + DURUM_METIN[du]; }

/* ================= BUGÜN: kartlar ================= */
const L = O.filter((o) => o.kart).map((o, i) => {
  const el = document.createElement('button'); el.className = 'et'; el.type = 'button';
  el.innerHTML = `<span class="kart"><span class="ust"><span class="ad"></span><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5L7 5 3 8.5"/></svg></span>
    <span class="orta"><span class="deger">0</span><span class="br"></span></span>
    <svg class="kiv" viewBox="0 0 84 20" preserveAspectRatio="none" aria-hidden="true"><rect class="bant" x="0" width="84"/><path class="cz"/><circle class="uc" r="2.6"/></svg>
    <span class="dr"></span></span>`;
  el.querySelector('.ad').textContent = KISA[o.id] || o.ad; el.querySelector('.br').textContent = o.birim.trim(); // API metni: textContent
  $('etiketler').appendChild(el);
  const l = { o, i, el, br: el.querySelector('.br'), deg: el.querySelector('.deger'), dr: el.querySelector('.dr'), bant: el.querySelector('.bant'), cz: el.querySelector('.cz'), uc: el.querySelector('.uc'), k: 0, r: RM ? 1 : 0, val: 0 };
  el.addEventListener('click', () => { titret(10); if (GENIS) kartBag(O.indexOf(o)); else trendeGec(O.indexOf(o), l); });
  return l;
});
function kivrim(l, gi) { // kartın içindeki 7 günlük çizgi ve normal bandı; veri olmayan günler atlanır
  const v = []; for (let d = gi - 6; d <= gi; d++) v.push(GUNLER[Math.max(0, d)].d[l.o.id]);
  const dolu = v.filter((x) => x !== null);
  const lo = Math.min(...dolu, l.o.min), hi = Math.max(...dolu, l.o.max), ar = hi - lo || 1, y = (x) => 18 - ((x - lo) / ar) * 16;
  let yol = '', bagli = false;
  v.forEach((x, j) => {
    if (x === null) { bagli = false; return; }
    const px = j * 13.6, py = y(x).toFixed(1);
    yol += `${bagli ? 'L' : 'M'}${px.toFixed(1)} ${py}`;
    if (!bagli && v[j + 1] == null) yol += `L${(px + 0.01).toFixed(2)} ${py}`; // yalnız kalan gün: yuvarlak uçlu nokta
    bagli = true;
  });
  l.cz.setAttribute('d', yol);
  if (v[6] === null) l.uc.setAttribute('visibility', 'hidden');
  else { l.uc.setAttribute('visibility', 'visible'); l.uc.setAttribute('cx', 81.6); l.uc.setAttribute('cy', y(v[6]).toFixed(1)); }
  l.bant.setAttribute('y', y(l.o.max).toFixed(1)); l.bant.setAttribute('height', Math.max(1, y(l.o.min) - y(l.o.max)).toFixed(1));
}
const renk = gsap.utils.interpolate(['#ff7a45', '#ffb07a', '#c9f5b4']);
const gunBtn = GUNLER.slice(G0).map((g, i) => {
  const b = document.createElement('button'); b.className = 'gun'; b.type = 'button';
  b.style.setProperty('--e', g.e); b.style.setProperty('--c', g.veriYok ? 'rgba(255,246,236,.4)' : renk(g.e));
  b.setAttribute('aria-label', `${g.gunUzun} ${g.gun} ${g.ay}: ${g.hukum}`);
  b.innerHTML = `<span class="yuva"><i></i></span>${g.gunKisa}`;
  b.addEventListener('click', () => { if (i !== sel7) { titret(8); sec(i); if (!g.veriYok) SES.akor(g.e); } if (GENIS) git(G0 + i, carkSure(Math.abs(G0 + i - st.P))); });
  $('gunler').appendChild(b); return b;
});
function sec(i, sessiz) {
  sel7 = i; const g = GUNLER[G0 + i], D = RM || sessiz ? 0 : 1;
  gunBtn.forEach((b, j) => b.setAttribute('aria-pressed', j === i));
  $('bTarih').textContent = `${g.gunUzun}, ${g.gun} ${g.ay}`;
  gsap.to(st, { e: g.e, bpm: bpmDe(g), duration: 1.5 * D, ease: 'power3.inOut', overwrite: 'auto' });
  L.forEach((l, j) => {
    const v = g.d[l.o.id], du = durum(l.o, v), sap = du === 'lo' || du === 'hi';
    l.el.classList.toggle('sap', sap); l.dr.innerHTML = du === null ? 'veri yok' : durumHtml(du); kivrim(l, G0 + i);
    l.el.setAttribute('aria-label', du === null ? `${l.o.ad}: veri yok. ${KART_EYLEM}` : `${l.o.ad} ${bicim(v)}${l.o.birim}, ${du === 'ok' ? 'normal aralıkta' : 'normalin ' + DURUM_METIN[du]}. ${KART_EYLEM}`);
    gsap.to(l, { k: sap ? 1 : 0, duration: 1.1 * D, delay: j * 0.045 * D, ease: 'back.out(1.7)', overwrite: 'auto' });
    gsap.killTweensOf(l, 'val'); l.br.textContent = v === null ? '' : l.o.birim.trim();
    if (v === null) l.deg.textContent = '–';
    else if (D) gsap.to(l, { val: v, duration: 0.9, ease: 'power2.out', onUpdate: () => (l.deg.textContent = Math.round(l.val)) });
    else { l.val = v; l.deg.textContent = Math.round(v); }
  });
  if (D) {
    yaz($('bHukum'), g.hukum);
    gsap.timeline().to(['#bGer', '#bYz'], { autoAlpha: 0, y: -6, duration: 0.18 })
      .add(() => { $('bGer').textContent = g.gerekce; yzEtiket(g); yerlesimB(true); })
      .fromTo(['#bGer', '#bYz'], { y: 8 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' });
  } else { bol($('bHukum'), g.hukum); $('bGer').textContent = g.gerekce; yzEtiket(g); yerlesimB(false); }
}
// "Yapay zekâ yorumu" etiketi yalnız bugün ve yorum Gemini'den geldiyse DOM'da yer kaplar
function yzEtiket(g) { $('bYz').hidden = !(VERI.meta && VERI.meta.yorumKaynak === 'gemini' && g === GUNLER[N - 1] && !g.veriYok); }
function yerlesimB(yumusak) {
  const ust = telY($('bBas'), 'bottom') + 8, alt = telY($('gunler'), 'top') - 4;
  const a = Math.max(60, (alt - ust) / 2), ks = clamp(a / 196, 0.4, 1); // çok kısa ekranda kartlar küçülür, üst üste binmez
  const ry1 = a - 50 * ks, ry0 = ry1 - 12 * ks, rx = 195 - 52 * ks - 5;
  const orb = Math.max(26, Math.min(rx - 52 * ks, ry0 - 50 * ks) - 8);
  const h = { cy: (ust + alt) / 2, rx, ry0, ry1, ks, rs: clamp(orb / 92, 0.3, 1.15) };
  if (yumusak && !RM) gsap.to(lay, { ...h, duration: 0.6, ease: 'power3.out', overwrite: 'auto' }); else Object.assign(lay, h);
  if (ekran === 'bugun' && !mesgul) { if (yumusak && !RM) gsap.to(st, { cy: h.cy, duration: 0.6, ease: 'power3.out' }); else st.cy = h.cy; }
}

/* ================= TREND: tek ölçüm ================= */
const svg = $('katman'), trend = $('trend');
let simge = null, aciklamaAcik = false, olcumGecis = null;
function simgeYaz(o, v, du) {
  if (simge) simge.guncelle({ oran: simgeOrani(o.id, v, o), durum: du, ham: v });
}
function trendMetin(t) {
  const ham = VERI.meta?.egilim?.[t.o.id];
  const yorum = typeof ham === 'string' ? ham.trim() : '';
  $('tGer').textContent = yorum || t.ozet;
  $('tYz').hidden = !yorum;
  metinKayar();
}
// Metin kutusuna sığmıyorsa dokunuşları yakalar (dikey kaydırma çalışsın); sığıyorsa dokunuş Trend'e geçer ve gün kaydırma çalışır.
function metinKayar() {
  const g = $('tGer');
  $('tMetin').classList.toggle('kayar', g.scrollHeight > g.clientHeight + 1);
}
function aciklamaKapat(odak = true) {
  if (GENIS || !aciklamaAcik) return;
  aciklamaAcik = false; $('tAciklama').hidden = true;
  $('tSimge').setAttribute('aria-expanded', 'false');
  if (odak) $('tSimge').focus({ preventScroll: true });
}
function aciklamaYerlesim() {
  const kart = $('tAciklama');
  if (GENIS) {
    kart.style.top = tl.alt + 78 + ($('ekSatir').hidden ? 0 : $('ekSatir').offsetHeight + 12) + 'px';
    kart.style.maxHeight = Math.max(44, telY($('cip'), 'top') - parseFloat(kart.style.top) - 8) + 'px';
  } else {
    kart.style.top = telY($('tBas'), 'bottom') + 8 + 'px';
    kart.style.maxHeight = Math.max(44, telY($('cip'), 'top') - parseFloat(kart.style.top) - 12) + 'px';
  }
}
$('tSimge').addEventListener('pointerdown', (ev) => ev.stopPropagation());
$('tAciklama').addEventListener('pointerdown', (ev) => ev.stopPropagation());
$('tMetin').addEventListener('pointerdown', (ev) => ev.stopPropagation());
$('tSimge').addEventListener('click', () => {
  if (GENIS) return;
  if (aciklamaAcik) { aciklamaKapat(); return; }
  aciklamaAcik = true; $('tAciklama').hidden = false;
  $('tSimge').setAttribute('aria-expanded', 'true'); aciklamaYerlesim();
});
addEventListener('pointerdown', (ev) => {
  if (!ev.target.closest?.('#tSimge,#tAciklama')) aciklamaKapat();
}, { capture: true });
addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && aciklamaAcik) { ev.preventDefault(); aciklamaKapat(); }
});
// ölçüm başına: 0..1'e ölçeklenmiş günlük değer, 7 günlük ortalama, normal bandı, iyilik, özet cümlesi
// null günler: sırt komşu dolu günler arasında doğrusal geçer, uçlarda en yakın dolu değerde kalır
function doldur(a) {
  const dolu = []; a.forEach((x, i) => { if (x !== null) dolu.push(i); });
  if (!dolu.length) return null;
  return a.map((x, i) => {
    if (x !== null) return x;
    let sol = -1, sag = -1;
    for (const k of dolu) { if (k < i) sol = k; else { sag = k; break; } }
    if (sol < 0) return a[sag]; if (sag < 0) return a[sol];
    return a[sol] + ((a[sag] - a[sol]) * (i - sol)) / (sag - sol);
  });
}
const toplam = (a) => a.reduce((x, y) => x + y, 0);
const T = O.map((o) => {
  const v = GUNLER.map((g) => g.d[o.id]); // null = veri yok
  const dolular = v.filter((x) => x !== null), bos = dolular.length === 0, orta = (o.min + o.max) / 2;
  const vf = doldur(v) || v.map(() => orta);
  const ortHam = v.map((_, i) => { const a = v.slice(Math.max(0, i - 6), i + 1).filter((x) => x !== null); return a.length ? toplam(a) / a.length : null; });
  const af = doldur(ortHam) || vf;
  let lo = Math.min(...vf, o.min), hi = Math.max(...vf, o.max); const pay = (hi - lo) * 0.12 || 1; lo -= pay; hi += pay;
  const n = (x) => (x - lo) / (hi - lo);
  const dis = dolular.filter((x) => durum(o, x) !== 'ok').length;
  const eksik = N - dolular.length, not = eksik ? ` ${eksik} günün verisi yok.` : '';
  const ort0 = bos ? 0 : toplam(dolular) / dolular.length, ortalama = o.id === 'spo2' || o.id === 'solunum' ? bicim(Math.round(ort0 * 10) / 10) : Math.round(ort0);
  const ozet = bos ? 'Bu ölçüm için henüz veri yok.'
    : (dis === 0 ? `Son ${N} günde hep normal aralığında kaldın. Ortalaman ${ortalama}${o.birim}.`
      : `Son ${N} günde ${dis} gün normal aralığının dışında. Ortalaman ${ortalama}${o.birim}.`) + not;
  const yarim = ((o.max - o.min) / 2) * 2.4 || 1;
  const iyi = vf.map((x) => clamp(((x - orta) / yarim) * o.iyi, -1, 1) * 0.5 + 0.5);
  return { o, v, nv: vf.map(n), na: af.map(n), bant: [n(o.min), n(o.max)], iyi, ozet };
});
const cur = { v: T[0].nv.slice(), a: T[0].na.slice(), b0: T[0].bant[0], b1: T[0].bant[1] };
function cr(arr, x) {
  const g = (i) => arr[clamp(i, 0, N - 1)];
  const i = Math.floor(x), t = x - i, p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
}
const yy = (n01) => tl.alt - n01 * (tl.alt - tl.ust);
const gunNokta = GUNLER.map(() => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'gn'); $('gunNokta').appendChild(c); return c; });
let xA = -5, xB = N + 4; // sırtların çizildiği gün aralığı: telefonda kaydırma payı, geniş ekranda bölge kenarları
function yollar() {
  let d = '', da = '';
  for (let x = xA; x <= xB + 0.001; x += 0.1) {
    d += `${d ? 'L' : 'M'}${(x * DW).toFixed(1)} ${yy(cr(cur.v, x)).toFixed(1)}`;
    da += `${da ? 'L' : 'M'}${(x * DW).toFixed(1)} ${(yy(cr(cur.a, x)) - 26).toFixed(1)}`;
  }
  const kap = `L${xB * DW} ${H + 300}L${xA * DW} ${H + 300}Z`;
  $('onSirt').setAttribute('d', d); $('onDolgu').setAttribute('d', d + kap);
  $('arkaSirt').setAttribute('d', da); $('arkaDolgu').setAttribute('d', da + kap);
  const t = T[sonOlcum];
  gunNokta.forEach((c, i) => {
    const du = durum(t.o, t.v[i]), dis = du === 'lo' || du === 'hi';
    c.setAttribute('visibility', du === null ? 'hidden' : 'visible'); // veri olmayan günde nokta yok
    c.setAttribute('cx', i * DW); c.setAttribute('cy', yy(cur.v[i]).toFixed(1));
    c.setAttribute('fill', dis ? '#ffc9a6' : 'rgba(255,246,236,.55)'); c.setAttribute('r', dis ? 3.4 : 2.4);
  });
  const y1 = yy(cur.b1), y0 = yy(cur.b0);
  $('bantDolgu').setAttribute('y', y1.toFixed(1)); $('bantDolgu').setAttribute('height', Math.max(2, y0 - y1).toFixed(1));
  $('bantUst').setAttribute('y1', y1); $('bantUst').setAttribute('y2', y1); $('bantAlt').setAttribute('y1', y0); $('bantAlt').setAttribute('y2', y0);
  $('bantYazi').setAttribute('y', (y1 - 7).toFixed(1));
}
function eksen() {
  const c = $('cizgi'); c.innerHTML = '';
  // geniş ekranda 28 gün tek grafikte: her güne çizgi, tarih yalnız çakışmayan bir alt kümede (bugün ve ay başı öncelikli)
  const yazili = GENIS ? new Set(etiketGunleri(N, DW, 44, GUNLER.map((g, i) => (g.gun === 1 ? i : -1)).filter((i) => i >= 0))) : null;
  GUNLER.forEach((g, i) => {
    const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', i * DW); l.setAttribute('x2', i * DW);
    l.setAttribute('y1', tl.alt + 44); l.setAttribute('y2', tl.alt + 52); c.appendChild(l);
    if (yazili && !yazili.has(i)) { l.setAttribute('y2', tl.alt + 48); return; }
    const t = document.createElementNS(NS, 'text'); t.setAttribute('x', i * DW); t.setAttribute('y', tl.alt + 68);
    t.textContent = g.gun === 1 ? `1 ${g.ay.slice(0, 3)}` : g.gun; c.appendChild(t);
  });
}
const secBtn = O.map((o, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = KISA[o.id] || o.ad; b.setAttribute('aria-label', o.ad + ' trendi');
  b.addEventListener('click', () => { if (i !== sonOlcum && !mesgul) { titret(8); SES.tik(); olcumSec(i, true); } });
  $('secici').appendChild(b); return b;
});
$('secici').addEventListener('pointerdown', (ev) => ev.stopPropagation());
let selT = -1, ekDestek = false;
let balonW = 0; // geniş ekran: balonun genişliği
const EK_RENK = { derin: '#8f9bff', hafif: '#bfeedd', rem: '#ffc9a6', uyanik: 'rgba(255,246,236,.55)', dinlenme: '#bfeedd', dusuk: '#9ad6ff', orta: '#ffc9a6', yuksek: '#ff8a6b' };
function ekYaz(g) { // seçili günün ek ayrıntısı; gösterilecek veri yoksa satır gizlenir (yer kaplamaz)
  const el = $('ekSatir'), s = CANLI.ekSatiri(T[sonOlcum].o.id, g.ek);
  el.textContent = '';
  if (!s) { el.hidden = true; return; }
  const ek = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  if (s.metin) el.appendChild(ek('div', 'em', s.metin));
  if (s.ayrinti) el.appendChild(ek('div', 'uykuFarki', s.ayrinti));
  if (s.dilimler) {
    const cb = ek('div', 'cb'), lg = ek('div', 'lg'); cb.setAttribute('aria-hidden', 'true');
    s.dilimler.forEach((d) => {
      const dl = ek('span'); dl.style.setProperty('--c', EK_RENK[d.id]); dl.style.flex = `${d.dk} 1 0`; cb.appendChild(dl);
      const h = ek('div'), b = ek('b', null, d.etiket), sw = ek('i'); sw.style.setProperty('--c', EK_RENK[d.id]); b.prepend(sw);
      h.append(b, ek('span', null, d.metin)); lg.appendChild(h);
    });
    el.append(cb, lg);
  }
  el.hidden = false;
}
function olcumSec(oi, animasyon) {
  aciklamaKapat();
  sonOlcum = oi; const t = T[oi];
  if (olcumGecis) olcumGecis.kill();
  if (simge) simge.yokEt();
  simge = simgeKur($('tSimge'), t.o.id, { gsap, boyut: 50 });
  if (!GENIS && ekran !== 'trend') simge.durdur();
  const ac = Object.hasOwn(ACIKLAMA, t.o.id) ? ACIKLAMA[t.o.id] : { soru: `${t.o.ad} nedir?`, metin: 'Bu ölçüm için ayrıntılı açıklama henüz bulunmuyor.', yon: 'Grafikte gösterilen normal aralıkla karşılaştırabilirsin.' };
  $('tSimge').setAttribute('aria-label', ac.soru);
  if (GENIS) $('tSimge').removeAttribute('aria-expanded');
  $('tAciklama').hidden = !GENIS;
  $('tAciklamaSoru').textContent = ac.soru;
  $('tAciklamaMetin').textContent = ac.metin;
  $('tAciklamaYon').textContent = ac.yon;
  secBtn.forEach((b, j) => b.setAttribute('aria-pressed', j === oi));
  const sc = $('secici'), b = secBtn[oi];
  sc.scrollTo({ left: b.offsetLeft - (sc.clientWidth - b.offsetWidth) / 2, behavior: animasyon && !RM ? 'smooth' : 'auto' });
  $('bantYazi').textContent = `${t.o.kisisel === false ? 'genel aralık' : 'normal'} ${t.o.min}–${t.o.max}${t.o.birim}`;
  ekDestek = GUNLER.some((g) => CANLI.ekSatiri(t.o.id, g.ek) !== null);
  trendMetin(t);
  if (animasyon && !RM) {
    yaz($('tAd'), t.o.ad);
    const a = { v: cur.v.slice(), a: cur.a.slice(), b0: cur.b0, b1: cur.b1 }, pr = { t: 0 };
    olcumGecis = gsap.to(pr, { t: 1, duration: 0.75, ease: 'power3.inOut', onUpdate() {
      for (let i = 0; i < N; i++) { cur.v[i] = lerp(a.v[i], t.nv[i], pr.t); cur.a[i] = lerp(a.a[i], t.na[i], pr.t); }
      cur.b0 = lerp(a.b0, t.bant[0], pr.t); cur.b1 = lerp(a.b1, t.bant[1], pr.t); yollar();
    } });
    gsap.fromTo('#tGer', { autoAlpha: 0.3 }, { autoAlpha: 1, duration: 0.5 });
  } else {
    bol($('tAd'), t.o.ad);
    cur.v = t.nv.slice(); cur.a = t.na.slice(); cur.b0 = t.bant[0]; cur.b1 = t.bant[1];
  }
  yerlesimT(); selT = -1; gunYaz(clamp(Math.round(st.P), 0, N - 1));
}
function gunYaz(i, canli) {
  if (i === selT) return; const ilk = selT < 0; selT = i; const g = GUNLER[i], t = T[sonOlcum], v = t.v[i], du = durum(t.o, v), yok = v === null, sap = du === 'lo' || du === 'hi';
  simgeYaz(t.o, v, du);
  $('tGunMetni').textContent = `${g.gunUzun}, ${g.gun} ${g.ay}`;
  $('cip').textContent = i === N - 1 ? `Bugün, ${g.gun} ${g.ay}` : `${g.gunKisa} ${g.gun} ${g.ay}`;
  const bl = $('balon'); bl.querySelector('b').textContent = yok ? '–' : bicim(v); bl.querySelector('.br').textContent = yok ? '' : t.o.birim.trim();
  bl.querySelector('.dr').innerHTML = yok ? 'veri yok' : durumHtml(du, true); bl.classList.toggle('sap', sap); $('nokta').classList.toggle('sap', sap);
  trend.setAttribute('aria-valuenow', i + 1);
  trend.setAttribute('aria-valuetext', yok ? `${g.gunUzun} ${g.gun} ${g.ay}: ${t.o.ad} için veri yok` : `${g.gunUzun} ${g.gun} ${g.ay}: ${t.o.ad} ${bicim(v)}${t.o.birim}, ${du === 'ok' ? 'normal aralıkta' : 'normalin ' + DURUM_METIN[du]}`);
  ekYaz(g); if (GENIS || aciklamaAcik) aciklamaYerlesim();
  if (GENIS) balonW = bl.offsetWidth; // balonun sağa mı sola mı açılacağı için; gün değişince bir kez ölçülür
  if (!ilk && canli && (ekran === 'trend' || GENIS) && !mesgul && !yok) SES.nota(t.iyi[i]);
}
function yerlesimT() {
  const ekYukseklik = ekDestek ? Math.max(64, $('ekSatir').offsetHeight) : 0;
  tl.alt = Math.round(telY($('cip'), 'top') - 86 - ekYukseklik - (GENIS ? 108 : 0));
  // Önce yorum ve grafik için yer ayır. Dar alanda değer balonu noktanın yanına gelir.
  $('tMetin').style.maxHeight = Math.max(28, tl.alt - 90 - 6 - telY($('tMetin'), 'top')) + 'px';
  tl.baslikAlt = telY($('tBas'), 'bottom');
  tl.ust = Math.round(tl.baslikAlt + (GENIS ? 64 : 76));
  $('ekSatir').style.top = tl.alt + 78 + 'px';
  if (tl.alt - tl.ust < 90) tl.ust = tl.alt - 90;
  const im = $('imlec'); im.setAttribute('x1', cx); im.setAttribute('x2', cx); im.setAttribute('y1', tl.ust - 30); im.setAttribute('y2', tl.alt + 40);
  $('nokta').setAttribute('cx', cx); $('ipucu').style.top = tl.alt + 16 + 'px';
  aciklamaYerlesim();
  metinKayar();
  yollar(); eksen();
}
for (let i = 0; i < 46; i++) {
  const s = document.createElement('i');
  s.style.left = Math.random() * 100 + '%'; s.style.top = Math.random() * 40 + '%';
  s.style.transform = `scale(${0.5 + Math.random()})`; s.dataset.f = (0.6 + Math.random() * 1.6).toFixed(2); s.dataset.o = (Math.random() * 6).toFixed(2);
  $('yildiz').appendChild(s);
}
const yildizlar = [...$('yildiz').children];
const ip = (a) => gsap.utils.interpolate(a);
const cTop = ip(['#170d2b', '#141f42', '#0a2748']), cMid = ip(['#5a2a5e', '#3d4f7c', '#2a7a8c']), cBot = ip(['#e0705f', '#eaa47e', '#f7dc9c']);
const cUzak = ip(['#6a3d68', '#3f4f78', '#2a6f78']), cYakin = ip(['#1b0d23', '#111b33', '#092730']);
const cSirt = ip(['#ffc9b4', '#e4def5', '#d6f6ec']), cGunes = ip(['#ff7d62', '#ffc08a', '#fff3c6']);

let hedef = N - 1, pA = N - 1;
function git(i, sure) { hedef = clamp(Math.round(i), 0, N - 1); gsap.to(st, { P: hedef, duration: RM ? 0 : sure || 0.75, ease: 'power3.out', overwrite: 'auto' }); }
let suruk = false, surukledi = false, x0 = 0, P0 = 0, sonX = 0, sonT = 0, hiz = 0;
trend.addEventListener('pointerdown', (ev) => {
  if (mesgul || ayarAcik || GENIS || ev.target.closest?.('#tSimge,#tAciklama,#tMetin')) return;
  suruk = true; surukledi = false; x0 = sonX = ev.clientX; P0 = st.P; sonT = performance.now(); hiz = 0; gsap.killTweensOf(st, 'P');
});
addEventListener('pointermove', (ev) => {
  if (!suruk) return;
  if (!surukledi && Math.abs(ev.clientX - x0) < 6) return;
  if (!surukledi) { surukledi = true; gsap.to('#ipucu', { autoAlpha: 0, duration: 0.4 }); }
  const t = performance.now(); if (t > sonT) hiz = hiz * 0.6 + ((ev.clientX - sonX) / (t - sonT)) * 0.4;
  sonX = ev.clientX; sonT = t;
  let p = P0 - (ev.clientX - x0) / S / DW;
  if (p < 0) p *= 0.35; if (p > N - 1) p = N - 1 + (p - N + 1) * 0.35;
  st.P = p;
});
const birak = () => {
  if (!suruk) return; suruk = false;
  if (surukledi) { const h = clamp(Math.round(st.P - (hiz * 1000 * 0.16) / S / DW), 0, N - 1); git(h, carkSure(Math.abs(h - st.P))); }
};
addEventListener('pointerup', birak); addEventListener('pointercancel', birak);
trend.addEventListener('keydown', (ev) => {
  if (ev.target !== trend || GENIS) return; // geniş ekranda klavye sayfa düzeyinde dinlenir
  if (ev.key === 'ArrowLeft') git(hedef - 1, 0.45); else if (ev.key === 'ArrowRight') git(hedef + 1, 0.45);
  else if (ev.key === 'Home') git(0); else if (ev.key === 'End') git(N - 1); else return;
  ev.preventDefault(); gsap.to('#ipucu', { autoAlpha: 0, duration: 0.4 });
});
// Çark: tekerlek çentiği ya da dokunmatik yüzey kaydırması gün adımına çevrilir (carkBirikim); üst üste gelen
// adımlar hedefi biriktirir, kayma carkSure ile yavaşlayarak durur. Telefonda trend alanının her yerinde, geniş
// ekranda yalnız grafik bölgesinde dinlenir (Ayarlar, ölçüm seçici ve ctrl+tekerlek/yakınlaştırma serbest).
let carkB = 0, carkT = 0;
function carkGit(h) { if (h !== hedef) git(h, carkSure(Math.abs(h - st.P))); }
function carkOlay(ev, bolge) {
  if (ev.ctrlKey || ayarAcik || mesgul || (ev.target.closest && ev.target.closest('#tBas,#tAciklama'))) return;
  if (bolge && !bolge(ev)) return;
  ev.preventDefault();
  const t = performance.now(); if (t - carkT > 400) carkB = 0; carkT = t; // duran tekerleğin artığı sonraki harekete taşınmaz
  const r = carkBirikim(ev, carkB); carkB = r.birikim;
  if (r.adim) { ipucuGizle(); carkGit(carkHedef(hedef, r.adim, N)); }
}
if (!GENIS) trend.addEventListener('wheel', (ev) => carkOlay(ev), { passive: false });

/* ================= Geniş ekran: fare, klavye ve Bugün ↔ Trend bağı ================= */
// Fare gezdirmek günü değiştirmez: tekerlek (çark), tıklama ve klavye gezinir.
let ipucuAcik = true;
function ipucuGizle() { if (ipucuAcik) { ipucuAcik = false; gsap.to('#ipucu', { autoAlpha: 0, duration: RM ? 0 : 0.4 }); } }
function vurgula(oi) { // kart ya da tuşla seçilen ölçümün düğmesi kısa bir halka ile yanıp söner
  if (RM) return;
  gsap.fromTo(secBtn[oi], { boxShadow: '0 0 0 0px rgba(255,201,166,.65)' }, { boxShadow: '0 0 0 10px rgba(255,201,166,0)', duration: 0.75, ease: 'power2.out', clearProps: 'boxShadow' });
}
function kartBag(oi) { SES.tik(); if (oi !== sonOlcum) olcumSec(oi, true); vurgula(oi); }
if (GENIS) {
  const konum = (ev) => { const r = trend.getBoundingClientRect(); return { x: (ev.clientX - r.left) / S, y: (ev.clientY - r.top) / S }; };
  const grafikte = (p) => p.y > tl.ust - 96 && p.y < tl.alt + 84 && p.x >= 0 && p.x <= GD.twu; // başlığın altı, gün etiketlerinin üstü
  trend.addEventListener('wheel', (ev) => carkOlay(ev, (e) => grafikte(konum(e))), { passive: false });
  trend.addEventListener('click', (ev) => {
    if (ayarAcik || mesgul || ev.target.closest?.('#tBas,#tAciklama')) return;
    const p = konum(ev); if (!grafikte(p)) return;
    const i = gunIndeksi(p.x, GD.solPay, DW, N);
    if (i !== hedef) { titret(8); if (T[sonOlcum].v[i] !== null) SES.can(T[sonOlcum].iyi[i]); }
    ipucuGizle(); carkGit(i);
  });
  addEventListener('keydown', (ev) => {
    const h = ev.target;
    const inputOdak = !!(h && h.closest && h.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])'));
    const e = klavyeEylem(ev.key, { gun: hedef, olcum: sonOlcum, gunSayisi: N, olcumSayisi: O.length },
      { alt: ev.altKey, ctrl: ev.ctrlKey, meta: ev.metaKey, inputOdak, ayarAcik });
    if (!e) return;
    ev.preventDefault(); ipucuGizle();
    if (e.tur === 'gun') { if (e.deger !== hedef || Math.abs(st.P - hedef) > 0.01) git(e.deger, carkSure(Math.abs(e.deger - st.P))); }
    else if (e.deger !== sonOlcum) { SES.tik(); olcumSec(e.deger, true); vurgula(e.deger); } // klavyede titreşim yok
  });
}

/* ================= Ekran geçişleri ================= */
function sekmeGuncelle() {
  [['sBugun', !ayarAcik && ekran === 'bugun'], ['sTrend', !ayarAcik && ekran === 'trend'], ['sAyar', ayarAcik]].forEach(([id, a]) => {
    if (a) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current');
  });
}
function trendeGec(oi, kaynak) {
  if (mesgul || ekran === 'trend' || GENIS) return; // geniş ekranda ekran geçişi yok: Trend hep açık
  dokunBirak(); ekran = 'trend'; sekmeGuncelle();
  st.P = hedef = G0 + sel7; pA = st.P;
  gsap.set(trend, { visibility: 'visible' });
  olcumSec(oi == null ? sonOlcum : oi, false);
  gsap.set('#ipucu', { autoAlpha: 1 });
  const ufuk = yy(cur.v[hedef]);
  if (RM) {
    st.yuk = st.yukA = 1; st.flat = 1; st.cy = ufuk;
    gsap.set(trend, { autoAlpha: 1 }); gsap.set([cv, '#bugun'], { autoAlpha: 0 }); return;
  }
  mesgul = true; SES.tik(); st.yuk = st.yukA = 0;
  gsap.set('#balon', { autoAlpha: kaynak ? 0 : 1 });
  const z = gsap.timeline({ onComplete: () => (mesgul = false) });
  z.to(L, { r: 0, duration: 0.42, stagger: 0.03, ease: 'power2.in' }, 0)
    .to('#bugunUst', { autoAlpha: 0, duration: 0.3 }, 0)
    .add(() => SES.gecis(true), 0.12)
    .to(st, { flat: 1, cy: ufuk, duration: 0.62, ease: 'power3.inOut' }, 0.12)
    .to(trend, { autoAlpha: 1, duration: 0.45 }, 0.58)
    .to(cv, { autoAlpha: 0, duration: 0.5 }, 0.72)
    .to(st, { yukA: 1, duration: 1.3, ease: 'expo.out' }, 0.6)
    .to(st, { yuk: 1, duration: 1.3, ease: 'expo.out' }, 0.7)
    .fromTo(st, { gunesY: 0 }, { gunesY: 1, duration: 1.5, ease: 'power3.out' }, 0.6)
    .fromTo(['#secici', '#tTarih', '#tAd', '#tGer'], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' }, 0.75)
    .set('#bugun', { autoAlpha: 0 }, 1.3);
  if (kaynak) {
    const r = kaynak.deg.getBoundingClientRect(), tr = tel.getBoundingClientRect();
    const u = document.createElement('div'); u.className = 'ucan'; u.textContent = kaynak.deg.textContent;
    u.style.color = getComputedStyle(kaynak.deg).color; tel.appendChild(u);
    gsap.set(u, { x: (r.left - tr.left) / S, y: (r.top - tr.top) / S, fontSize: 27 * lay.ks });
    z.to(u, { x: cx + 16, y: Math.max(tl.baslikAlt + 4, ufuk - 70), fontSize: 40, duration: 0.95, ease: 'power3.inOut' }, 0.08)
      .add(() => { if (T[sonOlcum].v[hedef] !== null) SES.can(T[sonOlcum].iyi[hedef]); gsap.set('#balon', { autoAlpha: 1 }); u.remove(); }, 1.06)
      .fromTo('#balon .dr', { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 1.1);
  }
}
function bugunGec() {
  if (mesgul || ekran === 'bugun') return;
  aciklamaKapat(false); if (simge) simge.durdur();
  ekran = 'bugun'; sekmeGuncelle();
  const gi = clamp(Math.round(st.P), 0, N - 1); if (gi >= G0 && gi - G0 !== sel7) sec(gi - G0, true);
  yerlesimB(false);
  if (RM) {
    st.flat = 0; st.cy = lay.cy; L.forEach((l) => (l.r = 1));
    gsap.set(trend, { autoAlpha: 0 }); gsap.set([cv, '#bugun', '#bugunUst'], { autoAlpha: 1 }); return;
  }
  mesgul = true; SES.gecis(false);
  gsap.timeline({ onComplete: () => (mesgul = false) })
    .to(st, { yuk: 0, duration: 0.5, ease: 'power3.in' }, 0)
    .to(st, { yukA: 0, duration: 0.5, ease: 'power3.in' }, 0.06)
    .set('#bugun', { autoAlpha: 1 }, 0.2)
    .to(cv, { autoAlpha: 1, duration: 0.35 }, 0.3)
    .to(trend, { autoAlpha: 0, duration: 0.4 }, 0.42)
    .to(st, { flat: 0, cy: lay.cy, duration: 1.2, ease: 'elastic.out(1,0.62)' }, 0.5)
    .to(L, { r: 1, duration: 0.9, stagger: 0.06, ease: 'back.out(1.5)' }, 0.72)
    .to('#bugunUst', { autoAlpha: 1, duration: 0.5 }, 0.85);
}
$('sBugun').addEventListener('click', () => { ayarKapat(); bugunGec(); });
$('sTrend').addEventListener('click', () => { ayarKapat(); trendeGec(null, null); });

/* ================= Ses ve ayarlar ================= */
const sesAc = () => SES.ac();
addEventListener('pointerdown', sesAc, { capture: true }); addEventListener('keydown', sesAc, { capture: true });
function sesGoster() {
  $('sesBtn').setAttribute('aria-pressed', SES.ayar.acik); $('aSes').setAttribute('aria-checked', SES.ayar.acik); $('aKalp').setAttribute('aria-checked', SES.ayar.kalp);
}
const sesDegis = (anahtar) => () => { SES.ayar[anahtar] = !SES.ayar[anahtar]; SES.kaydet(); sesGoster(); SES.tik(); };
$('sesBtn').addEventListener('click', sesDegis('acik')); $('aSes').addEventListener('click', sesDegis('acik')); $('aKalp').addEventListener('click', sesDegis('kalp'));
let ayarOnce = null;
function ayarAc() {
  if (ayarAcik) return; aciklamaKapat(false); ayarAcik = true; ayarOnce = document.activeElement; sekmeGuncelle(); SES.tik();
  gsap.to('#perde', { autoAlpha: 1, duration: RM ? 0 : 0.25 });
  if (GENIS) { // geniş ekranda ortada bir pencere
    $('ayarBtn').setAttribute('aria-expanded', 'true'); $('ayar').scrollTop = 0;
    gsap.set('#ayar', { xPercent: -50, yPercent: -50, visibility: 'visible' }); // görünür olmalı ki odak içeri girebilsin
    gsap.fromTo('#ayar', { y: 14, scale: 0.98, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: RM ? 0 : 0.34, ease: 'power3.out', overwrite: 'auto' });
  } else gsap.fromTo('#ayar', { yPercent: 110, autoAlpha: 1 }, { yPercent: 0, duration: RM ? 0 : 0.5, ease: 'power4.out' });
  $('aSes').focus({ preventScroll: true });
  yzOku(); bilOku();
}
function ayarKapat() {
  if (!ayarAcik) return; ayarAcik = false; sekmeGuncelle();
  gsap.to('#perde', { autoAlpha: 0, duration: RM ? 0 : 0.25 });
  if (GENIS) { $('ayarBtn').setAttribute('aria-expanded', 'false'); gsap.to('#ayar', { y: 10, autoAlpha: 0, duration: RM ? 0 : 0.2, ease: 'power2.in', overwrite: 'auto' }); }
  else gsap.to('#ayar', { yPercent: 110, duration: RM ? 0 : 0.32, ease: 'power3.in', onComplete: () => gsap.set('#ayar', { autoAlpha: 0 }) });
  // Safari tıklanan düğmeye odak vermez (activeElement body kalır): geniş ekranda Ayarlar düğmesine dön
  const don = ayarOnce && ayarOnce !== document.body ? ayarOnce : (GENIS ? $('ayarBtn') : ayarOnce);
  if (don) don.focus({ preventScroll: true });
}
$('sAyar').addEventListener('click', () => (ayarAcik ? ayarKapat() : ayarAc()));
if (GENIS) {
  $('ayarBtn').addEventListener('click', () => (ayarAcik ? ayarKapat() : ayarAc()));
  addEventListener('keydown', (ev) => { // Ayarlar açıkken Tab pencerenin içinde döner
    if (!ayarAcik || ev.key !== 'Tab') return;
    const f = [...$('ayar').querySelectorAll('button,input,a[href]')].filter((e) => !e.disabled && e.getClientRects().length);
    if (!f.length) return;
    const ilk = f[0], son = f[f.length - 1], a = document.activeElement;
    if (!$('ayar').contains(a)) { ev.preventDefault(); ilk.focus(); }
    else if (ev.shiftKey && a === ilk) { ev.preventDefault(); son.focus(); }
    else if (!ev.shiftKey && a === son) { ev.preventDefault(); ilk.focus(); }
  });
}
$('perde').addEventListener('click', ayarKapat); $('aKapat').addEventListener('click', ayarKapat);
addEventListener('keydown', (ev) => { if (ev.key === 'Escape') ayarKapat(); });
sesGoster();

/* ================= Yapay zekâ yorumu anahtarı ================= */
const yz = { deger: false, hazir: false, mesgul: false, oku: 0 };
function yzGoster(not) {
  const kapali = !bag.canli || !yz.hazir || yz.mesgul;
  $('aYz').disabled = kapali; $('aYz').setAttribute('aria-disabled', kapali); $('aYz').setAttribute('aria-checked', yz.deger);
  $('yzAcik').textContent = bag.canli ? "Açıkken bugünün özet sayıları ve her ölçümün son 28 günlük özeti (ortalama, normal dışı gün sayısı, son haftanın yönü) yorum için Google Gemini'ye gönderilir. Adın, tarihler ve gün gün değerler gönderilmez." : "Worker'a bağlanınca kullanılabilir.";
  $('yzDurum').textContent = not || '';
}
async function yzOku() { // Ayarlar her açıldığında sunucudaki durum okunur; yanıt gelene kadar anahtar kapalı kalır
  if (!bag.canli || yz.mesgul) return yzGoster();
  const n = ++yz.oku; yz.hazir = false; yzGoster();
  let r = null; try { r = await CANLI.ayarGetir(); } catch (e) { r = null; }
  if (n !== yz.oku || yz.mesgul) return;
  if (r) { yz.deger = r.yapayZeka; yz.hazir = true; yzGoster(); } else yzGoster('Ayar okunamadı.');
}
$('aYz').addEventListener('click', async () => {
  if (!bag.canli || !yz.hazir || yz.mesgul) return;
  yz.mesgul = true; yzGoster();
  let r = null; try { r = await CANLI.ayarYaz(!yz.deger); } catch (e) { r = null; }
  if (!r) { yz.mesgul = false; yzGoster('Kaydedilemedi.'); $('aYz').focus({ preventScroll: true }); return; } // sunucu onaylamadan görünüm değişmez
  yz.deger = r.yapayZeka; yzGoster(); location.reload(); // yorum kaynağı değişti: veri yeniden yüklenir; mesgul açık kalır ki ikinci dokunuş ayarı geri çevirmesin
});
yzGoster();

/* ================= Bildirimler anahtarı (Web Push) ================= */
// Durum sunucudan ve tarayıcının gerçek aboneliğinden okunur; iyimser güncelleme yok. Anahtar, okuma bitene kadar kapalı kalır.
const bil = { abone: false, hazir: false, mesgul: false, deneme: false, oku: 0, mod: null, modDenendi: false, durum: null, acikAnahtar: null };
const bilYerel = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname || '') && !/[?&]sw=1(&|$)/.test(location.search || ''); // kabuk.js yerelde worker kaydetmez
const bilDestek = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function bilOrtam() {
  const standalone = (matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const ios = bil.mod ? bil.mod.iosMu({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }) : false;
  return { destek: bilDestek, izin: bilDestek ? Notification.permission : 'default', standalone, ios, yerel: bilYerel };
}
function bilGoster(not) {
  const d = bil.durum;
  const kapali = bil.mesgul || !bil.hazir || (!bil.abone && !(d && d.kullanilabilir));
  $('aBil').disabled = kapali; $('aBil').setAttribute('aria-disabled', kapali); $('aBil').setAttribute('aria-checked', bil.abone);
  $('bilDene').disabled = !bil.abone || bil.mesgul || bil.deneme;
  let metin = not || '';
  if (!metin && !bil.mod && bil.modDenendi) metin = 'Bildirim modülü yüklenemedi.';
  else if (!metin && d && !d.kullanilabilir) metin = d.neden;
  $('bilDurum').textContent = metin;
}
// Service worker hazır olana kadar bekler ama sonsuza dek değil (kayıt hiç olmayabilir).
function bilKayit() {
  const bekle = new Promise((coz) => setTimeout(() => coz(null), 4000));
  return Promise.race([navigator.serviceWorker.ready.catch(() => null), bekle]);
}
async function bilGercekAbone() {
  const kayit = await bilKayit();
  return kayit ? { kayit, abone: await kayit.pushManager.getSubscription() } : { kayit: null, abone: null };
}
const bilHata = (m) => Object.assign(new Error(m), { bil: true }); // kullanıcıya gösterilecek Türkçe neden
const bilNeden = (e, yedek) => (e && e.bil ? e.message : e && e.name === 'NotAllowedError' ? 'Bildirim izni verilmedi.' : yedek);
async function bilOku() { // Ayarlar her açıldığında
  if (bil.mesgul) return bilGoster();
  const n = ++bil.oku; bil.hazir = false;
  if (!bil.mod) { bil.durum = null; return bilGoster(); }
  if (!bag.canli) { bil.durum = bil.mod.bildirimDurumu({ ...bilOrtam(), canli: false }); return bilGoster(); }
  bilGoster();
  let ayar = null; try { ayar = await CANLI.ayarGetir(); } catch (e) { ayar = null; }
  if (n !== bil.oku || bil.mesgul) return;
  if (!ayar) { bil.durum = null; return bilGoster('Ayar okunamadı.'); }
  bil.acikAnahtar = ayar.bildirim ? ayar.bildirim.acikAnahtar : null;
  bil.durum = bil.mod.bildirimDurumu({ ...bilOrtam(), acikAnahtar: bil.acikAnahtar, canli: true });
  let abone = null;
  if (bilDestek && !bilYerel) { try { abone = (await bilGercekAbone()).abone; } catch (e) { abone = null; } }
  if (n !== bil.oku || bil.mesgul) return;
  bil.abone = !!abone; bil.hazir = true; bilGoster();
}
async function bilBitir(not) { // gerçek durumu geri oku, anahtarı ona göre göster
  let abone = null; try { abone = (await bilGercekAbone()).abone; } catch (e) { abone = null; }
  bil.abone = !!abone; bil.mesgul = false; bilGoster(not); $('aBil').focus({ preventScroll: true });
}
async function bilAcDevam(izinSoz) {
  let kayit = null, abone = null;
  try {
    if (await izinSoz !== 'granted') throw bilHata('Bildirim izni verilmedi.');
    kayit = (await bilKayit());
    if (!kayit) throw bilHata('Service worker hazır değil. Sayfayı yenile.');
    const anahtar = bil.mod.b64urlCoz(bil.acikAnahtar);
    if (!anahtar.length) throw bilHata("Worker'daki bildirim anahtarı geçersiz.");
    abone = await kayit.pushManager.getSubscription();
    // farklı anahtarla yapılmış eski abonelik yenisiyle değiştirilir
    if (abone && bil.mod.anahtarAyni(abone.options && abone.options.applicationServerKey, anahtar) === false) { await abone.unsubscribe(); abone = null; }
    if (!abone) abone = await kayit.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtar });
    const alan = bil.mod.abonelikAlanlari(abone.toJSON());
    if (!alan) throw bilHata('Abonelik bilgisi alınamadı.');
    if (!(await CANLI.abonelikKaydet(alan))) throw bilHata("Worker'a kaydedilemedi.");
  } catch (e) {
    if (abone) { try { await abone.unsubscribe(); } catch (x) { /* zaten kapalı */ } } // sunucuya kaydedilemeyen yerel abonelik kalmaz
    return bilBitir(bilNeden(e, 'Bildirimler açılamadı.'));
  }
  bilBitir('Bildirimler açık.');
}
async function bilKapat() {
  try {
    const { abone } = await bilGercekAbone();
    if (abone) {
      if (!(await CANLI.abonelikSil(abone.endpoint))) throw bilHata("Kapatılamadı. Worker'a ulaşılamadı.");
      await abone.unsubscribe();
    }
  } catch (e) { return bilBitir(bilNeden(e, 'Kapatılamadı.')); }
  bilBitir('Bildirimler kapalı.');
}
$('aBil').addEventListener('click', () => {
  if (!bil.hazir || bil.mesgul || !bil.mod) return;
  if (bil.abone) { bil.mesgul = true; bilGoster(); return bilKapat(); }
  if (!bil.durum || !bil.durum.kullanilabilir) return;
  bil.mesgul = true; bilGoster();
  let izinSoz; // izin penceresi kullanıcı dokunuşunun eşzamanlı yolunda açılmalı (iOS): önünde await yok
  try { izinSoz = Notification.permission === 'default' ? Promise.resolve(Notification.requestPermission()) : Promise.resolve(Notification.permission); } catch (e) { izinSoz = Promise.resolve('denied'); }
  bilAcDevam(izinSoz);
});
$('bilDene').addEventListener('click', async () => {
  if (!bil.abone || bil.mesgul || bil.deneme) return;
  bil.deneme = true; bilGoster('Gönderiliyor…');
  let r = null; try { r = await CANLI.denemeBildirimi(); } catch (e) { r = null; }
  bil.deneme = false;
  bilGoster(!r ? 'Gönderilemedi.' : r.gonderilen === 0 ? 'Kayıtlı cihaz yok.' : r.basarili > 0 ? 'Gönderildi. Birkaç saniye içinde gelmeli.' : 'Gönderilemedi.');
  $('bilDene').focus({ preventScroll: true });
});
(async () => {
  try { bil.mod = await import('./bildirim.js'); } catch (e) { bil.mod = null; }
  bil.modDenendi = true; bilGoster();
  if (ayarAcik) bilOku(); // modül Ayarlar açıldıktan sonra geldiyse durum şimdi okunur
})();

/* ================= Bağlantı ve uyarı şeridi ================= */
const kayitli = CANLI.baglantiOku();
$('bAdres').value = kayitli ? kayitli.adres : ''; // anahtar alana geri doldurulmaz; yalnız "kayıtlı" gösterilir
$('bKayitli').hidden = !kayitli; $('bKaldir').disabled = !kayitli;
function bagDurum() {
  const m = VERI.meta || {};
  if (bag.canli) return m.sonEsitleme ? `Son eşitleme: ${CANLI.sonEsitlemeMetni(m.sonEsitleme)}` : 'Bağlı. Henüz eşitleme yapılmadı.';
  const sorun = bag.neden === 'yetki' ? 'Cihaz anahtarı kabul edilmedi. Anahtarı yeniden gir.' : 'Adres ya da ağ: bağlanılamadı.';
  if (bag.kaynak === 'onbellek') { const t = CANLI.sonEsitlemeMetni(bag.zaman); return `${sorun} ${t ? `Son veri (${t}) gösteriliyor.` : 'Son veri gösteriliyor.'}`; }
  if (bag.baglanti) return bag.neden ? `${sorun} Örnek veri gösteriliyor.` : 'Bağlanılamadı. Adresi ve anahtarı kontrol et. Örnek veri gösteriliyor.';
  return 'Örnek veri gösteriliyor.';
}
if (bag.baglanti && !bag.canli) bagHata(bagDurum()); else bagBilgi(bagDurum());
function bagHata(msg) { $('bDurum').textContent = msg; $('bDurum').classList.add('hata'); }
function bagBilgi(msg) { $('bDurum').textContent = msg; $('bDurum').classList.remove('hata'); }
$('bBagla').addEventListener('click', () => {
  const k = CANLI.baglantiKarar({ adres: $('bAdres').value, anahtar: $('bAnahtar').value, kayitli });
  if (!k.tamam) return bagHata(k.hata);
  if (!CANLI.baglantiYaz(k.baglanti)) return bagHata('Bağlantı kaydedilemedi.');
  $('bAnahtar').value = ''; location.reload();
});
$('bKaldir').addEventListener('click', () => { CANLI.baglantiSil(); location.reload(); });
[$('bAdres'), $('bAnahtar')].forEach((e) => e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('bBagla').click(); }));
$('seritDugme').addEventListener('click', ayarAc); // Ayarlar sekmesiyle aynı açılış yolu
function trendKaynak(b) {
  if (b.canli) return '';
  return b.kaynak === 'onbellek' ? 'Çevrimdışı' : 'Örnek veri';
}
function seritKur() { // Bugün başlığının üstünde kalıcı uyarı
  const tk = $('tKaynak'), durum = trendKaynak(bag);
  tk.textContent = durum; tk.hidden = !durum; // canlı veride gösterge görünmez
  if (!bag.baglanti) { // hiç bağlantı yok: ekrandaki sayılar örnek veridir; dokununca Ayarlar açılır
    $('seritDugmeMetin').textContent = "Örnek veri. Kendi verin için Ayarlar'dan bağlan.";
    $('seritDugme').hidden = false;
    return;
  }
  const m = VERI.meta || {}, satirlar = [], gercek = bag.kaynak === 'canli' || bag.kaynak === 'onbellek'; // gerçek veri: şimdi ya da en son alınan
  if (bag.kaynak === 'onbellek') {
    const t = CANLI.sonEsitlemeMetni(bag.zaman), son = t ? ` Son veri: ${t}.` : '';
    satirlar.push(bag.neden === 'yetki' ? `Cihaz anahtarı kabul edilmedi.${son}` : bag.neden === 'sunucu' ? `Sunucudan veri alınamadı.${son}` : `Çevrimdışı.${son}`);
  } else if (!gercek) { // bağlantı kayıtlı ama hiç veri alınamadı: örnek veri uyarısız kalmasın
    satirlar.push(bag.neden === 'yetki' ? "Cihaz anahtarı kabul edilmedi. Ayarlar'dan yeniden gir." : 'Bağlanılamadı. Örnek veri gösteriliyor.');
  }
  const eski = gercek ? CANLI.eskilikSaat(m.sonEsitleme, Date.now()) : null;
  if (gercek && m.keyDurum === 'gecersiz') {
    const son = CANLI.sonEsitlemeMetni(m.sonEsitleme);
    satirlar.push("Garmin key'inin süresi dolmuş. Yenileyene kadar veri güncellenmez." + (son ? ` Son eşitleme: ${son}.` : ''));
  }
  if (eski !== null) satirlar.push(`Son eşitleme ${eski} saat önce.`);
  if (!satirlar.length) return;
  satirlar.forEach((t) => { const p = document.createElement('p'); p.textContent = t; $('seritMetin').appendChild(p); });
  $('serit').hidden = false;
}

/* ================= Dokunma: şekil yumuşak bir madde gibi tepki verir ================= */
const tch = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, px: 0, py: 0, press: 0, pv: 0, pt: 0, hold: 0, wave: 0, jig: 0, aktif: false };
const KOPMA = 0.5; // bu kadar çekilince parmaktan kayar (ekran genişliğinin oranı)
const dokun = $('dokun');
function dokunHedef(ev) {
  const r = bKok.getBoundingClientRect(), ux =((ev.clientX - r.left) / S - cx) / W, uy = -((ev.clientY - r.top) / S - lay.cy) / W, m = Math.hypot(ux, uy);
  tch.px = ux; tch.py = uy; tch.tx = ux; tch.ty = uy;
  SES.dokunAyar(clamp(m / KOPMA, 0, 1));
  if (m > KOPMA) dokunBirak();
}
dokun.addEventListener('pointerdown', (ev) => {
  if (mesgul || ekran !== 'bugun') return;
  tch.aktif = true; tch.pt = 1; try { dokun.setPointerCapture(ev.pointerId); } catch (e) {}
  gsap.killTweensOf(tch, 'hold,wave'); tch.wave = 0;
  SES.ac(); SES.dokunBasla(); dokunHedef(ev); titret(8);
});
dokun.addEventListener('pointermove', (ev) => { if (tch.aktif) dokunHedef(ev); });
function dokunBirak() {
  if (!tch.aktif) return; tch.aktif = false; tch.pt = 0; tch.tx = 0; tch.ty = 0; SES.dokunBitir();
  const gerilim = Math.hypot(tch.x, tch.y);
  if (tch.hold > 0.55 && gerilim < 0.12) { // yerinde uzun basış: dışarı dalga
    gsap.fromTo(tch, { wave: 0.001 }, { wave: 1, duration: 1.1, ease: 'power2.out', onComplete: () => (tch.wave = 0) });
    if (!GUNLER[G0 + sel7].veriYok) SES.can(st.e); titret(22);
  } else titret(gerilim > 0.2 ? 18 : 6);
  gsap.to(tch, { hold: 0, duration: 0.6, ease: 'power3.out' });
}
dokun.addEventListener('pointerup', dokunBirak); dokun.addEventListener('pointercancel', dokunBirak);
function dokunAdim(ds) {
  if (ds <= 0) return;
  if (tch.aktif) { // tutarken parmağı gecikmesiz izler
    const f = 1 - Math.exp(-ds * 34), nx = tch.x + (tch.tx - tch.x) * f, ny = tch.y + (tch.ty - tch.y) * f;
    tch.vx = (nx - tch.x) / ds; tch.vy = (ny - tch.y) / ds; tch.x = nx; tch.y = ny;
    tch.hold = Math.min(1, tch.hold + ds / 1.1);
  } else { // bırakınca yay: iyi günde sıkı ve çabuk, kötü günde gevşek ve ağır
    const k = 55 + 190 * st.e, c = 3.2 + 7 * st.e, n = 4, h = ds / n;
    for (let i = 0; i < n; i++) {
      tch.vx += (-k * tch.x - c * tch.vx) * h; tch.x += tch.vx * h;
      tch.vy += (-k * tch.y - c * tch.vy) * h; tch.y += tch.vy * h;
    }
  }
  const n = 4, h = ds / n;
  for (let i = 0; i < n; i++) { tch.pv += (-240 * (tch.press - tch.pt) - 15 * tch.pv) * h; tch.press += tch.pv * h; }
  const hj = tch.aktif ? 0 : clamp(Math.hypot(tch.vx, tch.vy) * 0.9, 0, 1);
  tch.jig += (hj - tch.jig) * (1 - Math.exp(-ds * (hj > tch.jig ? 30 : 4)));
}

/* ================= Ölçek ================= */
function sigdir() {
  ({ S, H } = telOlcek());
  const dpr = Math.min(devicePixelRatio || 1, 2) * S;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  if (gl) gl.viewport(0, 0, cv.width, cv.height);
  const tw = GENIS ? GD.twu : W; // Trend çizim genişliği (birim)
  svg.setAttribute('viewBox', `0 0 ${tw} ${H}`); $('ust').setAttribute('viewBox', `0 0 ${tw} ${H}`);
  if (GENIS) genisTrend();
  yerlesimB(false);
  if (ekran === 'trend') { yerlesimT(); st.cy = yy(cur.v[hedef]); }
  if (GENIS) yerlesimT();
}
function genisTrend() { // geniş ekran: 28 gün bölgeye sığar; sırt ve bant bölgenin iki kenarına uzanır
  DW = GD.dw; xA = -GD.solPay / DW - 0.3; xB = N - 1 + GD.sagPay / DW + 0.3;
  const kenar = Math.round(Math.max(14, GD.solPay - 20)); // başlık, bant yazısı ve ayrıntı satırı aynı hizada
  $('bantDolgu').setAttribute('width', GD.twu); $('bantUst').setAttribute('x2', GD.twu); $('bantAlt').setAttribute('x2', GD.twu);
  $('bantYazi').setAttribute('x', kenar); $('tBas').style.left = $('ekSatir').style.left = kenar + 'px';
}
addEventListener('resize', sigdir);

/* ================= Döngü ================= */
let ang = -0.35, bt = 0, curT = 60 / st.bpm, ph = 1, beat = 0;
gsap.ticker.add((time, dt) => {
  const ds = Math.min(dt, 50) / 1000;
  const bugunGorunur = ekran === 'bugun' || mesgul;
  dokunAdim(ds);
  if (!RM) {
    ang += ds * 0.07 * st.orbit; bt += ds;
    if (bt > curT) {
      bt -= curT; curT = (60 / st.bpm) * (1 + (Math.random() - 0.5) * (1 - st.e) * 0.38);
      if (ekran === 'bugun' && !mesgul && !ayarAcik && !tch.aktif && !document.hidden) SES.kalp(0.55 + st.e * 0.25);
    }
    ph = bt / curT; beat = Math.exp(-ph * 10) + (ph > 0.2 ? 0.55 * Math.exp(-(ph - 0.2) * 13) : 0);
  }
  if (U && bugunGorunur) {
    gl.uniform2f(U.uC, (cx / W) * cv.width, (1 - st.cy / H) * cv.height);
    gl.uniform1f(U.uT, RM ? 3 : time); gl.uniform1f(U.uE, st.e); gl.uniform1f(U.uBeat, beat * (1 - st.flat));
    gl.uniform1f(U.uIgn, st.ign); gl.uniform1f(U.uPh, ph); gl.uniform1f(U.uSc, cv.width); gl.uniform1f(U.uFlat, clamp(st.flat, -0.2, 1));
    gl.uniform2f(U.uTp, tch.px, tch.py); gl.uniform2f(U.uPull, tch.x, tch.y);
    gl.uniform1f(U.uPress, tch.press); gl.uniform1f(U.uHold, tch.hold); gl.uniform1f(U.uWave, tch.wave);
    gl.uniform1f(U.uRs, lay.rs); gl.uniform1f(U.uJig, tch.jig);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  if (bugunGorunur) {
    for (const l of L) {
      const a = ang + (l.i * TAU) / L.length - Math.PI / 2, wob = RM ? 0 : l.k * 2.5 * Math.sin(time * 2.1 + l.i * 1.7);
      const ry = lerp(lay.ry0, lay.ry1, l.k) + wob;
      const x = cx + Math.cos(a) * lay.rx * l.r, y = lay.cy + Math.sin(a) * ry * l.r;
      l.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${(lay.ks * (0.5 + 0.5 * l.r)).toFixed(3)})`;
      l.el.style.opacity = Math.min(1, l.r * 1.6); l.el.style.pointerEvents = l.r > 0.9 ? 'auto' : 'none';
    }
    const dr = Math.max(40, lay.rx - 52 * lay.ks);
    dokun.style.left = cx - dr + 'px'; dokun.style.top = lay.cy - dr + 'px'; dokun.style.width = dokun.style.height = dr * 2 + 'px';
    [[$('yIc'), lay.ry0], [$('yDis'), lay.ry1]].forEach(([e, ry]) => { e.setAttribute('cx', cx); e.setAttribute('cy', lay.cy); e.setAttribute('rx', lay.rx); e.setAttribute('ry', ry); });
    $('yDis').style.strokeDashoffset = RM ? 0 : -time * 6;
  }
  if (GENIS || ekran === 'trend' || mesgul) {
    pA = RM ? st.P : pA + (st.P - pA) * (1 - Math.exp(-ds * 7));
    const scl = (y) => `translate(0 ${(tl.alt * (1 - y)).toFixed(2)}) scale(1 ${Math.max(0.0001, y).toFixed(4)})`;
    // telefonda sırtlar kayar, imleç ortada durur; geniş ekranda 28 gün sabit durur, imleç kayar
    $('gOn').setAttribute('transform', `translate(${(GENIS ? GD.solPay : cx - st.P * DW).toFixed(2)} 0) ${scl(st.yuk)}`);
    $('gArka').setAttribute('transform', `translate(${(GENIS ? GD.solPay : cx - pA * DW).toFixed(2)} 0) ${scl(st.yukA)}`);
    const pc = clamp(st.P, 0, N - 1), ny = tl.alt - (tl.alt - yy(cr(cur.v, pc))) * st.yuk;
    const ix = GENIS ? GD.solPay + pc * DW : cx; // imlecin x'i
    if (GENIS) {
      $('imlec').setAttribute('x1', ix.toFixed(1)); $('imlec').setAttribute('x2', ix.toFixed(1)); $('nokta').setAttribute('cx', ix.toFixed(1));
    }
    $('nokta').setAttribute('cy', ny.toFixed(1)); $('nokta').style.opacity = T[sonOlcum].v[clamp(Math.round(pc), 0, N - 1)] === null ? 0 : st.yuk;
    ['bantDolgu', 'bantUst', 'bantAlt', 'bantYazi'].forEach((id) => ($(id).style.opacity = st.yuk));
    $('balon').style.transform = `translate(${GENIS ? balonX(ix, balonW, GD.twu).toFixed(1) : cx + 16}px,${Math.max(tl.baslikAlt + 4, ny - 70).toFixed(1)}px)`;
    const e = clamp(cr(T[sonOlcum].iyi, pc), 0, 1);
    $('gok').style.background = `linear-gradient(180deg,${cTop(e)} 0%,${cMid(e)} ${Math.round((tl.ust / H) * 62)}%,${cBot(e)} ${Math.round((tl.alt / H) * 86)}%)`;
    $('onDolgu').setAttribute('fill', cYakin(e)); $('arkaDolgu').setAttribute('fill', cUzak(e));
    $('onSirt').setAttribute('stroke', cSirt(e)); $('onSirt').setAttribute('stroke-width', 2.4);
    $('arkaSirt').setAttribute('stroke', cSirt(e)); $('arkaSirt').setAttribute('stroke-opacity', 0.35); $('arkaSirt').setAttribute('stroke-width', 1.2);
    const gy = tl.ust + 30 - e * 70 + (1 - st.gunesY) * 160, [gr, gg, gb] = gsap.utils.splitColor(cGunes(e));
    $('gunes').style.transform = `translate(${GENIS ? (GD.twu * 0.3).toFixed(1) : cx - 104}px,${gy.toFixed(1)}px) scale(${(0.8 + e * 0.28 + (RM ? 0 : Math.sin(time * 0.9) * 0.012)).toFixed(3)})`;
    $('gunes').style.background = `radial-gradient(circle,rgb(${gr},${gg},${gb}) 0 34%,rgba(${gr},${gg},${gb},.6) 46%,rgba(${gr},${gg},${gb},0) 70%)`;
    const yo = Math.pow(1 - e, 1.4);
    for (const s of yildizlar) s.style.opacity = RM ? yo * 0.7 : yo * (0.45 + 0.55 * Math.sin(time * s.dataset.f + +s.dataset.o));
    gunYaz(clamp(Math.round(st.P), 0, N - 1), true);
  }
});

/* ================= Açılış ================= */
seritKur(); sigdir(); olcumSec(0, false); sec(6, true); st.cy = lay.cy;
if (GENIS) { gsap.set(trend, { autoAlpha: 1 }); st.yuk = st.yukA = st.gunesY = 1; } // geniş ekranda Trend hep açık
// Başlık sözcük animasyonu ve yazı tipi yüklemesi satır sayısını değiştirebilir.
if (typeof ResizeObserver === 'function') {
  let olcumBekliyor = false;
  const trendBoyutu = new ResizeObserver(() => {
    if (olcumBekliyor) return;
    olcumBekliyor = true;
    requestAnimationFrame(() => { olcumBekliyor = false; yerlesimT(); });
  });
  trendBoyutu.observe($('tBas'));
  trendBoyutu.observe($('ekSatir'));
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (ekran === 'bugun') { yerlesimB(false); if (!mesgul) st.cy = lay.cy; } else yerlesimT(); if (GENIS) yerlesimT(); });
if (!RM) {
  const g = GUNLER[N - 1];
  L.forEach((l) => { l.val = 0; l.deg.textContent = g.d[l.o.id] === null ? '–' : '0'; });
  gsap.set($('bHukum').querySelectorAll('.h'), { autoAlpha: 0 });
  gsap.set(['#bTarih', '#bGer', '#bYz'], { autoAlpha: 0, y: 12 }); gsap.set('#yor', { autoAlpha: 0 });
  mesgul = true; // açılış bitmeden ekran değiştirilmesin
  const acilis = gsap.timeline({ delay: 0.3 })
    .add(() => (mesgul = false), 1.9)
    .to(st, { ign: 1, duration: 2, ease: 'elastic.out(1,0.5)' }, 0)
    .add(() => gsap.fromTo($('bHukum').querySelectorAll('.h'), { yPercent: 85, autoAlpha: 0, rotation: 7 }, { yPercent: 0, autoAlpha: 1, rotation: 0, duration: 0.65, stagger: 0.022, ease: 'back.out(1.8)' }), 0.4)
    .to(['#bTarih', '#bGer', '#bYz'], { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.14, ease: 'power3.out' }, 0.65)
    .to(L, { r: 1, duration: 1.2, stagger: 0.085, ease: 'back.out(1.5)' }, 0.55)
    .add(() => L.forEach((l, j) => { if (g.d[l.o.id] !== null) gsap.to(l, { val: g.d[l.o.id], duration: 1.3, delay: j * 0.08, ease: 'power2.out', onUpdate: () => (l.deg.textContent = Math.round(l.val)) }); }), 0.6)
    .to('#yor', { autoAlpha: 1, duration: 1.2 }, 1.2)
    .from('.gun', { y: 22, autoAlpha: 0, duration: 0.7, stagger: 0.045, ease: 'power3.out' }, 1.0)
    .from(GENIS ? '#arac' : ['.sekme', '#sesBtn'], { autoAlpha: 0, duration: 0.8 }, 1.3);
  if (GENIS) { // Trend sırtları yükselir, güneş doğar, başlık gelir
    st.yuk = st.yukA = 0; gsap.set(['#secici', '#tTarih', '#tAd', '#tGer', '#balon', '#cip'], { autoAlpha: 0 });
    acilis.to(st, { yukA: 1, duration: 1.3, ease: 'expo.out' }, 0.9).to(st, { yuk: 1, duration: 1.3, ease: 'expo.out' }, 1.0)
      .fromTo(st, { gunesY: 0 }, { gunesY: 1, duration: 1.5, ease: 'power3.out' }, 0.9)
      .fromTo(['#secici', '#tTarih', '#tAd', '#tGer'], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' }, 1.05)
      .to(['#balon', '#cip'], { autoAlpha: 1, duration: 0.5 }, 1.5);
  }
}
}

// Başlangıç: bağlantı varsa veri gelene kadar nötr bekleme durumu; açılış animasyonu örnek veriyle başlamaz.
// Her koşulda uygulama bir kez açılır: modül yüklenemezse, veri alınamazsa ya da gerçek veriyle başlatma patlarsa örnek veriyle.
let basladi = false;
function ac(v, bag) {
  if (basladi) return; basladi = true;
  try { baslat(v, bag); } catch (hata) {
    if (bag.kaynak === 'yok') throw hata; // örnek veri de patlıyorsa dönülecek yer yok
    // Yarım kalan ilk başlatmanın dinleyicileri ve çizim döngüsü yaşamasın: sayfa temiz yeniden açılır,
    // bu kez gerçek veri denenmeden örnek veriyle (bir kereliğine; sonraki elle yenileme yine gerçeği dener).
    try { sessionStorage.setItem('gk-canli-hata', '1'); } catch (x) { throw hata; }
    try { CANLI.sonVeriSil?.(); } catch (x) {} // ekranı çökerten veri önbellekte kalıp her açılışı çift yüklemeye çevirmesin
    location.reload();
  }
}
(async () => {
  try { ({ CANLI } = await import('./veri-canli.js')); } catch (e) {
    CANLI = { // modül yüklenemedi: yalnız uygulamanın açılması için en küçük yedek
      baglantiOku() { try { const o = JSON.parse(localStorage.getItem('gk-baglanti')); return o && o.adres && o.anahtar ? o : null; } catch (x) { return null; } },
      baglantiSil() { try { localStorage.removeItem('gk-baglanti'); localStorage.removeItem('gk-son-veri'); } catch (x) {} },
      baglantiYaz: () => false, baglantiKarar: () => ({ tamam: false, hata: 'Bağlantı modülü yüklenemedi.' }),
      adresDuzelt: () => null, ekSatiri: () => null, eskilikSaat: () => null, sonEsitlemeMetni: () => null,
      veriGetir: async () => null, veriYukle: async () => ({ veri: null, kaynak: 'yok', zaman: null, neden: null }), ayarGetir: async () => null, ayarYaz: async () => null,
      abonelikKaydet: async () => false, abonelikSil: async () => false, denemeBildirimi: async () => null,
    };
  }
  const ORNEK = { baglanti: false, canli: false, kaynak: 'yok', neden: null, zaman: null };
  if (!CANLI.baglantiOku()) return ac(window.VERI, ORNEK);
  let canliHata = false;
  try { canliHata = sessionStorage.getItem('gk-canli-hata') === '1'; sessionStorage.removeItem('gk-canli-hata'); } catch (x) {}
  if (canliHata) return ac(window.VERI, { ...ORNEK, baglanti: true });
  telOlcek(); addEventListener('resize', telOlcek); $('bekle').hidden = false;
  let r = null;
  try { r = await CANLI.veriYukle(); } catch (e) { r = null; }
  removeEventListener('resize', telOlcek); $('bekle').hidden = true;
  if (r && r.veri && (r.kaynak === 'canli' || r.kaynak === 'onbellek')) {
    ac(r.veri, { baglanti: true, canli: r.kaynak === 'canli', kaynak: r.kaynak, neden: r.neden || null, zaman: typeof r.zaman === 'number' ? r.zaman : null });
  } else {
    ac(window.VERI, { ...ORNEK, baglanti: true, neden: r && r.neden ? r.neden : null });
  }
})();
