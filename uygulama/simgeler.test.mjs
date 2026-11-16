import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simgeKur, OLCUM_IDLERI } from './simgeler.js';
import { ACIKLAMA } from './aciklama.js';
import { simgeOrani } from './duzen.js';
import { OLCUMLER } from '../worker/src/stats/baseline.js';

test('her ölçümün simgesi ve kısa Türkçe açıklaması vardır', () => {
  const ids = OLCUMLER.map(o => o.id).sort();
  assert.deepEqual(Object.keys(ACIKLAMA).sort(), ids);
  assert.deepEqual([...OLCUM_IDLERI].sort(), ids);
  for (const { soru, metin, yon } of Object.values(ACIKLAMA)) {
    assert.ok(soru.endsWith('?') && soru.length <= 40);
    assert.ok(metin.length >= 60 && metin.length <= 260);
    assert.ok(yon.length > 0 && yon.length <= 80);
  }
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
