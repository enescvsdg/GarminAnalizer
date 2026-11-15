// Ses motoru: bütün sesler tarayıcıda üretilir, ses dosyası yok.
// Tarayıcılar (özellikle iOS) ilk dokunuştan önce ses çalmaz; ac() ilk dokunuşta çağrılır.
// Buton, geçiş ve çan seslerinin birden çok seçeneği var; seçim sesler.html'de yapılır ve hatırlanır.
window.SES = (function () {
  let ctx = null, master = null, send = null, gurultuBuf = null, dk = null;
  const ayar = { acik: true, kalp: true, tik: 'cam-tik', gecis: 'supurme', can: 'can' };
  try { Object.assign(ayar, JSON.parse(localStorage.getItem('gk-ses') || '{}')); } catch (e) {}
  function kaydet() { try { localStorage.setItem('gk-ses', JSON.stringify(ayar)); } catch (e) {} }

  const NOTALAR = [196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]; // pentatonik
  const nota = (e) => NOTALAR[Math.max(0, Math.min(9, Math.round(e * 9)))];

  function ac() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    const d = ctx.createDelay(1); d.delayTime.value = 0.24; // hafif yankı
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    send = ctx.createGain(); send.gain.value = 0.35;
    send.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(master);
    gurultuBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = gurultuBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }

  function zarf(v, t0, a, d, g) {
    v.gain.setValueAtTime(0.0001, t0);
    v.gain.exponentialRampToValueAtTime(g, t0 + a);
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function ton({ f, f2, tip = 'sine', t = 0, a = 0.005, d = 0.3, g = 0.2, yanki = 0 }) {
    if (!ctx || !ayar.acik) return;
    const t0 = ctx.currentTime + t, o = ctx.createOscillator(), v = ctx.createGain();
    o.type = tip; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + a + d);
    zarf(v, t0, a, d, g); o.connect(v); v.connect(master);
    if (yanki) { const s = ctx.createGain(); s.gain.value = yanki; v.connect(s); s.connect(send); }
    o.start(t0); o.stop(t0 + a + d + 0.05);
  }
  function gurultu({ t = 0, a = 0.05, d = 0.6, f1 = 300, f2 = 3000, g = 0.1, q = 1.4, tur = 'bandpass' }) {
    if (!ctx || !ayar.acik) return;
    const t0 = ctx.currentTime + t, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), v = ctx.createGain();
    s.buffer = gurultuBuf; s.loop = true; bp.type = tur; bp.Q.value = q;
    bp.frequency.setValueAtTime(f1, t0); bp.frequency.exponentialRampToValueAtTime(f2, t0 + a + d);
    zarf(v, t0, a, d, g); s.connect(bp); bp.connect(v); v.connect(master);
    s.start(t0); s.stop(t0 + a + d + 0.05);
  }

  /* ---------- seçenekler ---------- */
  const SECENEK = {
    tik: {
      'cam-tik': { ad: 'Cam tık (şimdiki)', tarif: 'Kısa, tiz, parlak', cal() { ton({ f: 1900, f2: 1300, d: 0.07, g: 0.11, tip: 'triangle', yanki: 0.4 }); ton({ f: 2850, d: 0.05, g: 0.045 }); } },
      ahsap: { ad: 'Ahşap tok', tarif: 'Pes, kuru, masaya vurur gibi', cal() { ton({ f: 330, f2: 170, d: 0.06, g: 0.32 }); gurultu({ a: 0.002, d: 0.03, f1: 900, f2: 700, g: 0.12, q: 3 }); } },
      damla: { ad: 'Su damlası', tarif: 'Yukarı kayan, ıslak', cal() { ton({ f: 520, f2: 1280, d: 0.09, g: 0.2, yanki: 0.5 }); } },
      cinlama: { ad: 'Cam çınlaması', tarif: 'İnce, uzun süren', cal() { ton({ f: 2100, d: 0.28, g: 0.085, yanki: 0.6 }); ton({ f: 3170, d: 0.16, g: 0.035 }); } },
      klik: { ad: 'Mekanik klik', tarif: 'Tuş sesi, çok kısa', cal() { gurultu({ a: 0.001, d: 0.018, f1: 3600, f2: 2400, g: 0.28, q: 2 }); ton({ f: 150, d: 0.014, g: 0.09, tip: 'square' }); } },
      pop: { ad: 'Pop', tarif: 'Baloncuk, yuvarlak', cal() { ton({ f: 430, f2: 140, d: 0.07, g: 0.32 }); } },
      bas: { ad: 'Bas dokunuş', tarif: 'Derin, gövdeli', cal() { ton({ f: 150, f2: 62, d: 0.13, g: 0.45 }); ton({ f: 300, f2: 150, d: 0.05, g: 0.1 }); } },
      vurus: { ad: 'Tek kalp vuruşu', tarif: 'Nabızla aynı aileden', cal() { ton({ f: 92, f2: 45, d: 0.13, g: 0.42 }); ton({ f: 184, f2: 100, d: 0.08, g: 0.13 }); } },
      mirilti: { ad: 'Yumuşak mırıltı', tarif: 'İki notalı, sıcak', cal() { ton({ f: 262, tip: 'triangle', a: 0.02, d: 0.18, g: 0.12, yanki: 0.5 }); ton({ f: 392, tip: 'triangle', a: 0.02, d: 0.18, g: 0.06, t: 0.03 }); } },
    },
    gecis: {
      supurme: { ad: 'Süpürme (şimdiki)', tarif: 'Yükselen hışırtı ve ton', cal(y) { gurultu({ d: 0.75, f1: y ? 260 : 2800, f2: y ? 3200 : 240, g: 0.08 }); ton({ f: y ? 196 : 587, f2: y ? 587 : 196, a: 0.08, d: 0.6, g: 0.06, yanki: 0.5 }); } },
      nefes: { ad: 'Nefes', tarif: 'Yumuşak, havalı, tonsuz', cal(y) { gurultu({ a: 0.25, d: 0.7, f1: y ? 400 : 1400, f2: y ? 1400 : 400, g: 0.11, q: 0.6, tur: 'lowpass' }); } },
      arpej: { ad: 'Arpej', tarif: 'Dört nota arka arkaya', cal(y) { const n = [261.63, 329.63, 392, 523.25]; (y ? n : n.slice().reverse()).forEach((f, i) => ton({ f, tip: 'triangle', d: 0.22, g: 0.09, t: i * 0.085, yanki: 0.55 })); } },
      derin: { ad: 'Derin kabarma', tarif: 'Pes, sinematik', cal(y) { ton({ f: y ? 70 : 150, f2: y ? 150 : 70, a: 0.3, d: 0.6, g: 0.3 }); ton({ f: y ? 140 : 300, f2: y ? 300 : 140, a: 0.3, d: 0.6, g: 0.08, yanki: 0.5 }); gurultu({ a: 0.3, d: 0.5, f1: 200, f2: 700, g: 0.05 }); } },
    },
    can: {
      can: { ad: 'Çan (şimdiki)', tarif: 'Metalik, uzun', cal(e) { const f = nota(e) * 2; ton({ f, d: 1.3, g: 0.15, yanki: 0.6 }); ton({ f: f * 2.76, d: 0.5, g: 0.035 }); ton({ f: f * 1.5, d: 0.9, g: 0.045, t: 0.02 }); } },
      kalimba: { ad: 'Kalimba', tarif: 'Kısa, tahta tınılı', cal(e) { const f = nota(e) * 2; ton({ f, tip: 'triangle', d: 0.45, g: 0.2, yanki: 0.5 }); ton({ f: f * 2, d: 0.12, g: 0.06 }); } },
      kristal: { ad: 'Kristal', tarif: 'Çok tiz, ışıltılı', cal(e) { const f = nota(e) * 4; ton({ f, d: 1.1, g: 0.07, yanki: 0.7 }); ton({ f: f * 1.5, d: 0.9, g: 0.04, t: 0.05, yanki: 0.7 }); } },
      yumusak: { ad: 'Yumuşak ped', tarif: 'Yavaş açılan, sakin', cal(e) { const f = nota(e); ton({ f, a: 0.06, d: 1.6, g: 0.13, yanki: 0.6 }); ton({ f: f * 1.5, a: 0.08, d: 1.4, g: 0.06, yanki: 0.6 }); } },
    },
  };
  const cal = (tur, id, arg) => { const s = SECENEK[tur][id] || Object.values(SECENEK[tur])[0]; s.cal(arg); };

  return {
    ayar, ac, kaydet, SECENEK, cal,
    hazir: () => !!ctx && ctx.state === 'running',
    // lub-dub; telefon hoparlörü çok pes sesi veremediği için üstüne bir oktav eklenir
    kalp(guc = 1) {
      if (!ayar.kalp) return;
      ton({ f: 72, f2: 40, d: 0.16, g: 0.45 * guc }); ton({ f: 144, f2: 84, d: 0.11, g: 0.16 * guc });
      ton({ f: 60, f2: 36, d: 0.14, g: 0.28 * guc, t: 0.2 }); ton({ f: 120, f2: 74, d: 0.09, g: 0.1 * guc, t: 0.2 });
    },
    tik() { cal('tik', ayar.tik); },
    gecis(yukari = true) { cal('gecis', ayar.gecis, yukari); },
    can(e = 0.5) { cal('can', ayar.can, e); },
    nota(e) { ton({ f: nota(e), tip: 'triangle', d: 0.32, g: 0.12, yanki: 0.5 }); },
    akor(e) {
      const n = e < 0.4 ? [220, 261.63, 329.63] : e < 0.7 ? [196, 293.66, 392, 440] : [261.63, 329.63, 392, 587.33];
      n.forEach((f, i) => ton({ f, a: 0.04, d: 1.4, g: 0.055, t: i * 0.035, yanki: 0.6 }));
    },
    // şekle dokunma: gerilen lastik. Çektikçe gıcırdar (tutup bırakan sürtünme), bırakınca geri çarpar.
    dokunBasla() {
      if (!ctx || !ayar.acik || dk) return;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 62;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7; bp.frequency.value = 280;
      const trem = ctx.createGain(); trem.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 18;
      const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(trem.gain);
      const ns = ctx.createBufferSource(); ns.buffer = gurultuBuf; ns.loop = true;
      const ng = ctx.createGain(); ng.gain.value = 0.3;
      const v = ctx.createGain(); v.gain.value = 0.0001;
      o.connect(bp); ns.connect(ng); ng.connect(bp); bp.connect(trem); trem.connect(v); v.connect(master);
      o.start(); lfo.start(); ns.start(); dk = { o, bp, lfo, ns, v, x: 0 };
    },
    dokunAyar(x) { // x: 0..1 gerilim; ses yalnızca gerilim değişirken çıkar
      if (!dk) return; const t = ctx.currentTime, dx = Math.abs(x - dk.x); dk.x = x;
      dk.o.frequency.setTargetAtTime(58 + x * 150, t, 0.04);
      dk.bp.frequency.setTargetAtTime(240 + x * 1500, t, 0.04);
      dk.lfo.frequency.setTargetAtTime(14 + x * 52, t, 0.05);
      const g = Math.max(0.0001, Math.min(0.24, dx * 7) * (0.35 + x));
      dk.v.gain.cancelScheduledValues(t); dk.v.gain.setTargetAtTime(g, t, 0.025); dk.v.gain.setTargetAtTime(0.0001, t + 0.09, 0.11);
    },
    dokunBitir() {
      if (!dk) return; const t = ctx.currentTime, k = dk, x = k.x; dk = null;
      k.v.gain.cancelScheduledValues(t); k.v.gain.setTargetAtTime(0.0001, t, 0.02);
      k.o.stop(t + 0.2); k.lfo.stop(t + 0.2); k.ns.stop(t + 0.2);
      if (x > 0.12) { // geri çarpma
        gurultu({ a: 0.001, d: 0.045, f1: 2600, f2: 800, g: 0.26 * x, q: 1 });
        ton({ f: 130 + 260 * x, f2: 64, tip: 'triangle', d: 0.3, g: 0.32 * x });
        ton({ f: (130 + 260 * x) * 2.02, f2: 140, d: 0.17, g: 0.1 * x });
      }
    },
  };
})();
