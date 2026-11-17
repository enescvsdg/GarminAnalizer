import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simgeKur, OLCUM_IDLERI } from './simgeler.js';
import { ACIKLAMA } from './aciklama.js';
import { simgeOrani } from './duzen.js';
import { OLCUMLER } from '../worker/src/stats/baseline.js';

const YENI = ['adim', 'kat', 'kalori', 'yogun', 'maxnabiz'];

test('her ölçümün simgesi ve kısa Türkçe açıklaması vardır (on dört ölçüm)', () => {
  const ids = OLCUMLER.map(o => o.id).sort();
  assert.equal(ids.length, 14);
  assert.deepEqual(Object.keys(ACIKLAMA).sort(), ids);
  assert.deepEqual([...OLCUM_IDLERI].sort(), ids);
  assert.deepEqual(OLCUM_IDLERI.slice(9), YENI);
  for (const { soru, metin, yon } of Object.values(ACIKLAMA)) {
    assert.ok(soru.endsWith('?') && soru.length <= 40);
    assert.ok(metin.length >= 60 && metin.length <= 260);
    assert.ok(yon.length > 0 && yon.length <= 80);
  }
});

test('yeni açıklamalar kısa, tıbbi iddia ve tavsiye içermez', () => {
  for (const id of YENI) {
    const { soru, metin, yon } = ACIKLAMA[id];
    const hepsi = `${soru} ${metin} ${yon}`;
    assert.doesNotMatch(hepsi, /hastalık|tanı|teşhis|tedavi|doktor|risk|sağlıklı|tehlike|kalp kriz|yapmalısın|gerekir/i);
    assert.ok(metin.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length <= 3);
  }
  assert.match(ACIKLAMA.maxnabiz.yon, /yönü yok/);
});

test('günlük ölçümlerin simge oranı sabit aralıkta; uçlar sıkıştırılır, eksik gün null', () => {
  const ARALIK = { adim: [0, 15000], kat: [0, 25], kalori: [0, 1200], yogun: [0, 90], maxnabiz: [90, 190] };
  for (const [id, [a, b]] of Object.entries(ARALIK)) {
    assert.equal(simgeOrani(id, a), 0);
    assert.equal(simgeOrani(id, b), 1);
    assert.equal(simgeOrani(id, (a + b) / 2), 0.5);
    assert.equal(simgeOrani(id, a - 1000), 0);
    assert.equal(simgeOrani(id, b + 1000), 1);
    for (const v of [null, undefined, NaN, Infinity]) assert.equal(simgeOrani(id, v), null);
    // kişisel bant oranı değiştirmez (Takvim bantsız çizer)
    assert.equal(simgeOrani(id, (a + b) / 2, { min: a, max: a + 1 }), 0.5);
  }
  assert.equal(simgeOrani('adim', 7500), 0.5);
  assert.equal(simgeOrani('maxnabiz', 140), 0.5);
});

test('simge oranı eksik günü saklar, SpO₂ farkını ve kişisel bant merkezini gösterir', () => {
  for (const id of OLCUM_IDLERI) {
    for (const v of [null, undefined, NaN, Infinity]) assert.equal(simgeOrani(id, v, {min: 50, max: 70}), null);
  }
  assert.equal(simgeOrani('bb', 0), 0);
  assert.equal(simgeOrani('uyku', 100), 1);
  assert.equal(simgeOrani('spo2', 94), .5);
  assert.equal(simgeOrani('spo2', 88), 0);
  assert.equal(simgeOrani('hrv', 60, {min: 50, max: 70}), .5);
  assert.equal(simgeOrani('hrv', 70, {min: 50, max: 70}), .75);
  assert.equal(simgeOrani('derin', 55, {min: 55, max: 55}), null);
});

class Eleman {
  constructor() {
    this.at = {};
    this.style = {};
    this.children = [];
  }
  setAttribute(key, value) { this.at[key] = String(value); }
  appendChild(el) { this.children.push(el); el.parent = this; }
  remove() { this.parent.children = this.parent.children.filter(el => el !== this); }
  *gez() {
    yield this;
    for (const el of this.children) yield* el.gez();
  }
}

test('SVG kimlikleri eşsizdir; boş gün, hareket tercihi ve yokEt kaynakları yönetir', (t) => {
  const root = new Eleman();
  const tick = new Set(), listeners = new Set(), observers = new Set(), tweens = new Set();
  const mq = {
    matches: false,
    addEventListener(_, fn) { listeners.add(fn); },
    removeEventListener(_, fn) { listeners.delete(fn); },
  };
  const tarayici = {
    document: { createElementNS: () => new Eleman() },
    matchMedia: () => mq,
    IntersectionObserver: class {
      observe() { observers.add(this); }
      disconnect() { observers.delete(this); }
    },
  };
  for (const [key, value] of Object.entries(tarayici)) {
    const eski = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (eski) Object.defineProperty(globalThis, key, eski);
      else delete globalThis[key];
    });
  }
  const gsap = {
    ticker: { add: fn => tick.add(fn), remove: fn => tick.delete(fn) },
    to(state, config) {
      const tween = {
        kill() { tweens.delete(tween); },
        progress() {
          for (const key of ['o', 'bos', 'sic', 'sog']) state[key] = config[key];
          config.onUpdate();
          return tween;
        },
      };
      tweens.add(tween);
      return tween;
    },
  };
  const icons = [...OLCUM_IDLERI, 'uyku', 'bilinmeyen', 'constructor'].map(id => simgeKur(root, id, { gsap }));
  const ids = [...root.gez()].map(el => el.at.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(root.children.length, icons.length);

  for (const icon of icons) icon.guncelle({ oran: .7, durum: 'ok', ham: 57 });
  for (const icon of icons) icon.guncelle({ oran: .8, durum: 'hi', ham: 65 });
  assert.ok(tick.size > 0 && tweens.size > 0);
  for (const icon of icons) icon.guncelle({ oran: NaN, durum: 'ok', ham: null });
  assert.equal(tick.size, 0, 'eksik ölçüm önceki animasyonu sürdürmez');
  assert.equal(tweens.size, 0);
  assert.doesNotMatch(JSON.stringify([...root.gez()].map(el => el.at)), /NaN|undefined/);

  mq.matches = true;
  for (const fn of listeners) fn();
  for (const icon of icons) icon.guncelle({ oran: .4, durum: 'lo', ham: 42 });
  assert.equal(tick.size, 0);
  assert.equal(tweens.size, 0);
  for (const icon of icons) {
    icon.yokEt();
    icon.yokEt();
  }
  assert.deepEqual([root.children.length, tick.size, listeners.size, observers.size, tweens.size], [0, 0, 0, 0, 0]);
});

test('yeni simgeler: SVG kurulur, eşsiz kimlik, null/NaN güvenli, hareket tercihi ve yokEt temizler', (t) => {
  const root = new Eleman();
  const tick = new Set(), tweens = new Set(), observers = new Set();
  const mq = { matches: false, addEventListener() {}, removeEventListener() {} };
  const tarayici = {
    document: { createElementNS: () => new Eleman() },
    matchMedia: () => mq,
    IntersectionObserver: class { observe() { observers.add(this); } disconnect() { observers.delete(this); } },
  };
  for (const [key, value] of Object.entries(tarayici)) {
    const eski = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => { if (eski) Object.defineProperty(globalThis, key, eski); else delete globalThis[key]; });
  }
  const gsap = {
    ticker: { add: fn => tick.add(fn), remove: fn => tick.delete(fn) },
    to(state, config) {
      const tween = { kill() { tweens.delete(tween); }, progress() { Object.assign(state, config); config.onUpdate(); return tween; } };
      tweens.add(tween);
      return tween;
    },
  };
  const icons = [...YENI, ...YENI].map((id) => simgeKur(root, id, { gsap, boyut: 24 }));
  assert.equal(root.children.length, icons.length);
  for (const svg of root.children) assert.ok(svg.children.length >= 2 && svg.at.width === '24');
  const ids = [...root.gez()].map(el => el.at.id).filter(Boolean);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
  // her simge kendi çizim kökünü doldurur (boş tanım değil)
  for (const svg of root.children) assert.ok(svg.children[1].children.length >= 3);

  const kare = () => { for (const fn of tick) for (let i = 0; i < 40; i++) fn(0, 16 + (i % 3) * 20); };
  const ornek = [[0, 'ok', 0], [0.02, 'lo', 1200], [0.5, 'ok', 140], [0.97, 'hi', 186], [1, 'hi', 220], [0.4, 'ok', null]];
  for (const [oran, durum, ham] of ornek) {
    for (const icon of icons) icon.guncelle({ oran, durum, ham });
    for (const tw of [...tweens]) tw.progress(1);
    kare();
  }
  assert.ok(tick.size > 0);
  assert.doesNotMatch(JSON.stringify([...root.gez()].map(el => el.at)), /NaN|undefined|Infinity/);
  for (const v of [null, undefined, NaN, Infinity]) for (const icon of icons) icon.guncelle({ oran: v, durum: 'ok', ham: v });
  assert.equal(tick.size, 0, 'eksik değer animasyonu durdurur');
  assert.doesNotMatch(JSON.stringify([...root.gez()].map(el => el.at)), /NaN|undefined|Infinity/);

  // az hareket: döngü yok, durağan kare yine de çizilir
  const az = YENI.map((id) => simgeKur(root, id, { gsap, azHareket: true }));
  for (const icon of az) icon.guncelle({ oran: 0.6, durum: 'ok', ham: 150 });
  assert.equal(tick.size, 0);
  assert.equal(tweens.size, 0);
  assert.doesNotMatch(JSON.stringify([...root.gez()].map(el => el.at)), /NaN|undefined|Infinity/);
  for (const icon of [...icons, ...az]) { icon.yokEt(); icon.yokEt(); }
  assert.deepEqual([root.children.length, tick.size, tweens.size, observers.size], [0, 0, 0, 0]);
});
