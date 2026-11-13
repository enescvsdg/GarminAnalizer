import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { testD1 } from './helpers/d1.mjs';
import { aralikEsitle, esitle } from '../src/garmin/sync.js';
import { GarminKeyHatasi, GarminGeciciHata } from '../src/garmin/client.js';
import { gunleriOku, aktiviteleriOku, durumOku, durumYaz } from '../src/db.js';
import { gunEkle } from '../src/zaman.js';

let db;
beforeEach(() => { db = testD1(); });

const SIMDI = Date.UTC(2026, 10, 12, 21, 30); // İstanbul: 2026-11-13
const BUGUN = '2026-11-13';

// Sahte istemci: yol parçasına göre yanıt ya da hata. Değer fonksiyon olabilir (params alır).
function sahte(cevaplar = {}) {
  const cagrilar = [];
  const anahtar = (yol) => (yol.includes('dailysummaries') ? 'dailysummaries'
    : yol.includes('dailySleepSummariesByDate') ? 'sleep'
    : yol.includes('/hrv-service/') ? 'hrv'
    : yol.includes('activities/search') ? 'activities' : yol);
  return {
    cagrilar,
    async get(yol, params) {
      cagrilar.push({ yol, params });
      const k = anahtar(yol);
      let c = cevaplar[k];
      if (typeof c === 'function') c = c(params, yol);
      if (c instanceof Error) throw c;
      if (c === undefined) return k === 'dailysummaries' ? { data: [] } : k === 'hrv' ? { hrvSummaries: [] } : [];
      return c;
    },
  };
}

const gunluk = (date, steps = 1000) => ({ calendarDate: date, movement: { steps: { value: steps } } });
const uyku = (date, skor = 70) => ({ calendarDate: date, sleepScores: { overall: { value: skor } } });
const hrv = (date, ort = 45) => ({ calendarDate: date, lastNightAvg: ort });
const aktivite = (id, tarih, yuk) => ({
  activityId: id, startTimeLocal: `${tarih} 07:00:00`, beginTimestamp: Date.parse(tarih) + 3600000,
  activityType: { typeKey: 'running' }, duration: 1800, activityTrainingLoad: yuk,
});

const TAM = {
  dailysummaries: { data: [gunluk('2026-11-12', 5000), gunluk('2026-11-13', 800)] },
  sleep: [uyku('2026-11-12', 77)],
  hrv: { hrvSummaries: [hrv('2026-11-12', 48)] },
  activities: [aktivite(1, '2026-11-12', 50), aktivite(2, '2026-11-12', 30)],
};
const ARALIK = { bas: '2026-11-11', son: '2026-11-13', simdiMs: 123456 };

test('aralikEsitle gün ve aktiviteleri yazar, synced_at simdiMs olur', async () => {
  const r = await aralikEsitle({ istemci: sahte(TAM), db, ...ARALIK });
  assert.deepEqual(r, { gun: 2, aktivite: 2, hatalar: [] });
  const gunler = await gunleriOku(db, '2026-11-01', '2026-11-30');
  assert.equal(gunler.length, 2);
  const d12 = gunler.find((g) => g.date === '2026-11-12');
  assert.equal(d12.steps, 5000); assert.equal(d12.sleep_score, 77); assert.equal(d12.hrv_avg, 48);
  assert.ok(gunler.every((g) => g.synced_at === 123456));
  assert.equal((await aktiviteleriOku(db, '2026-11-01', '2026-11-30')).length, 2);
});

test('tam olarak dört uç nokta doğru yol ve parametrelerle çağrılır', async () => {
  const ist = sahte(TAM);
  await aralikEsitle({ istemci: ist, db, ...ARALIK });
  assert.deepEqual(ist.cagrilar, [
    { yol: '/usersummary-service/v2/dailysummaries', params: { startDate: '2026-11-11', endDate: '2026-11-13' } },
    { yol: '/sleep-service/sleep/dailySleepSummariesByDate', params: { startDate: '2026-11-11', endDate: '2026-11-13' } },
    { yol: '/hrv-service/hrv/daily/2026-11-11/2026-11-13', params: undefined },
    { yol: '/activitylist-service/activities/search/activities', params: { start: 0, limit: 100, startDate: '2026-11-11', endDate: '2026-11-13' } },
  ]);
});

test('bir uç nokta GarminGeciciHata verirse adı hatalar olur, diğerleri yazılır', async () => {
  const ist = sahte({ ...TAM, hrv: new GarminGeciciHata('x', 500) });
  const r = await aralikEsitle({ istemci: ist, db, ...ARALIK });
  assert.deepEqual(r.hatalar, ['hrv']);
  const [g] = await gunleriOku(db, '2026-11-12', '2026-11-12');
  assert.equal(g.sleep_score, 77); assert.equal(g.hrv_avg, null);
  assert.equal(r.aktivite, 2);
});

test('Garmin dışı hata (TypeError) da hatalar listesine girer, fırlatılmaz', async () => {
  const r = await aralikEsitle({ istemci: sahte({ ...TAM, sleep: new TypeError('fetch failed') }), db, ...ARALIK });
  assert.deepEqual(r.hatalar, ['sleep']);
  assert.equal(r.gun, 2);
});

test('kısmi hata var olan dolu değeri silmez', async () => {
  await aralikEsitle({ istemci: sahte(TAM), db, ...ARALIK });
  const r = await aralikEsitle({ istemci: sahte({ ...TAM, hrv: new GarminGeciciHata('x', 503) }), db, ...ARALIK });
  assert.deepEqual(r.hatalar, ['hrv']);
  const [g] = await gunleriOku(db, '2026-11-12', '2026-11-12');
  assert.equal(g.hrv_avg, 48);
});

test('ikinci eşitleme satır çoğaltmaz', async () => {
  await aralikEsitle({ istemci: sahte(TAM), db, ...ARALIK });
  await aralikEsitle({ istemci: sahte(TAM), db, ...ARALIK });
  assert.equal((await gunleriOku(db, '2026-11-01', '2026-11-30')).length, 2);
  assert.equal((await aktiviteleriOku(db, '2026-11-01', '2026-11-30')).length, 2);
});

test('training_load: aynı günün aktiviteleri toplanır, aktivitesiz gün 0 olur', async () => {
  await aralikEsitle({ istemci: sahte(TAM), db, ...ARALIK });
  const gunler = await gunleriOku(db, '2026-11-11', '2026-11-13');
  assert.equal(gunler.find((g) => g.date === '2026-11-12').training_load, 80);
  assert.strictEqual(gunler.find((g) => g.date === '2026-11-13').training_load, 0);
  assert.equal(gunler.some((g) => g.date === '2026-11-11'), false); // gün satırı olmayan oluşturulmaz
});

test('training_load: aktivite uç noktası hata verirse mevcut değer korunur, yeni satır null kalır', async () => {
  await aralikEsitle({ istemci: sahte(TAM), db, ...ARALIK });
  const ist = sahte({
    ...TAM,
    dailysummaries: { data: [gunluk('2026-11-12'), gunluk('2026-11-13'), gunluk('2026-11-11')] },
    activities: new GarminGeciciHata('x', 500),
  });
  const r = await aralikEsitle({ istemci: ist, db, ...ARALIK });
  assert.deepEqual(r.hatalar, ['activities']);
  const gunler = await gunleriOku(db, '2026-11-11', '2026-11-13');
  assert.equal(gunler.find((g) => g.date === '2026-11-12').training_load, 80);
  assert.strictEqual(gunler.find((g) => g.date === '2026-11-11').training_load, null);
});

test('training_load: null yük 0 sayılır', async () => {
  const ist = sahte({ ...TAM, activities: [aktivite(1, '2026-11-12', 40), aktivite(2, '2026-11-12', undefined)] });
  await aralikEsitle({ istemci: ist, db, ...ARALIK });
  const [g] = await gunleriOku(db, '2026-11-12', '2026-11-12');
  assert.equal(g.training_load, 40);
});

test('GarminKeyHatasi aralikEsitle dışına fırlar', async () => {
  for (const uc of ['dailysummaries', 'sleep', 'hrv', 'activities']) {
    await assert.rejects(
      aralikEsitle({ istemci: sahte({ [uc]: new GarminKeyHatasi('x') }), db, ...ARALIK }),
      GarminKeyHatasi,
    );
  }
});

test('esitle key hatasında key_durum gecersiz yazar, durum döner, son_esitleme dokunulmaz', async () => {
  await durumYaz(db, 'son_esitleme', 111);
  const r = await esitle({ istemci: sahte({ sleep: new GarminKeyHatasi('x') }), db, simdiMs: SIMDI });
  assert.equal(r.durum, 'key-gecersiz');
  assert.equal(r.gecmisHata, false);
  assert.equal(r.neden, 'x'); // hata iletisi (uç nokta + HTTP kodu) teşhis için aktarılır
  assert.equal(await durumOku(db, 'key_durum'), 'gecersiz');
  assert.equal(await durumOku(db, 'son_esitleme'), 111);
});

test('esitle başarıda son_esitleme ve key_durum gecerli yazar', async () => {
  const r = await esitle({ istemci: sahte(TAM), db, simdiMs: SIMDI });
  assert.deepEqual(r, { durum: 'tamam', gecmisHata: false });
  assert.equal(await durumOku(db, 'son_esitleme'), SIMDI);
  assert.equal(await durumOku(db, 'key_durum'), 'gecerli');
});

test('esitle yakın aralıkta kısmi hatada kismi döner, son_esitleme güncellenmez', async () => {
  await durumYaz(db, 'son_esitleme', 111);
  const r = await esitle({ istemci: sahte({ ...TAM, hrv: new GarminGeciciHata('x', 500) }), db, simdiMs: SIMDI });
  assert.deepEqual(r, { durum: 'kismi', gecmisHata: true }); // hrv hatası geçmiş parçada da var
  assert.equal(await durumOku(db, 'son_esitleme'), 111);
  assert.equal(await durumOku(db, 'key_durum'), 'gecerli');
});

test('esitle yakın aralığı İstanbul tarihine göre ister', async () => {
  const ist = sahte({});
  await esitle({ istemci: ist, db, simdiMs: Date.UTC(2026, 10, 12, 21, 30) });
  assert.deepEqual(ist.cagrilar[0].params, { startDate: '2026-11-11', endDate: '2026-11-13' });
});

// Her istenen aralığın son gününe bir gün satırı döndüren istemci (boş olmayan parça)
const dolu = () => sahte({ dailysummaries: (p) => ({ data: [gunluk(p.endDate)] }) });
const gunlukCagrilar = (ist) => ist.cagrilar.filter((c) => c.yol.includes('dailysummaries')).map((c) => c.params);

test('geçmiş doldurma: ilk parça gunEkle(bugun,-3) ile biter ve 28 gün sürer; iki çağrı sonra imleç 56 gün geri', async () => {
  const ist = dolu();
  await esitle({ istemci: ist, db, simdiMs: SIMDI });
  const parca = gunlukCagrilar(ist)[1];
  assert.equal(parca.endDate, gunEkle(BUGUN, -3));
  assert.equal(parca.startDate, gunEkle(BUGUN, -3 - 27));
  await esitle({ istemci: ist, db, simdiMs: SIMDI });
  const imlec = await durumOku(db, 'gecmis_imlec');
  assert.deepEqual(imlec, { sonraki: gunEkle(BUGUN, -3 - 56), bitti: false, bosArdisik: 0 });
});

test('geçmiş doldurma: üst üste 2 boş parçadan sonra biter ve artık istek yapmaz', async () => {
  const ist = sahte({});
  await esitle({ istemci: ist, db, simdiMs: SIMDI });
  await esitle({ istemci: ist, db, simdiMs: SIMDI });
  const imlec = await durumOku(db, 'gecmis_imlec');
  assert.equal(imlec.bitti, true); assert.equal(imlec.bosArdisik, 2);
  const once = ist.cagrilar.length;
  await esitle({ istemci: ist, db, simdiMs: SIMDI });
  assert.equal(ist.cagrilar.length - once, 4); // yalnızca yakın aralık (4 uç nokta)
});

test('geçmiş doldurma: dolu parça boş sayacını sıfırlar', async () => {
  let n = 0;
  const ist = sahte({ dailysummaries: (p) => (n++ === 3 ? { data: [gunluk(p.endDate)] } : { data: [] }) });
  await esitle({ istemci: ist, db, simdiMs: SIMDI }); // yakın boş (n=0), parça boş (n=1)
  assert.equal((await durumOku(db, 'gecmis_imlec')).bosArdisik, 1);
  await esitle({ istemci: ist, db, simdiMs: SIMDI }); // yakın (n=2), parça dolu (n=3)
  assert.equal((await durumOku(db, 'gecmis_imlec')).bosArdisik, 0);
});

test('geçmiş doldurma 365 günde durur, daha eski parça istemez', async () => {
  const ist = dolu();
  const sinir = gunEkle(BUGUN, -365);
  for (let i = 0; i < 20; i++) await esitle({ istemci: ist, db, simdiMs: SIMDI });
  const imlec = await durumOku(db, 'gecmis_imlec');
  assert.equal(imlec.bitti, true);
  assert.ok(imlec.sonraki < sinir);
  assert.ok(gunlukCagrilar(ist).every((p) => p.endDate >= sinir));
  assert.ok(gunlukCagrilar(ist).length < 40); // 20 yakın + en çok 14 parça
});

test('geçmiş doldurma: hatalı parça imleci değiştirmez, esitle yine tamam döner', async () => {
  const ist = sahte({ dailysummaries: (p) => (p.endDate === gunEkle(BUGUN, -3) ? new GarminGeciciHata('x', 500) : { data: [gunluk(p.endDate)] }) });
  const r = await esitle({ istemci: ist, db, simdiMs: SIMDI });
  assert.deepEqual(r, { durum: 'tamam', gecmisHata: true });
  assert.equal(await durumOku(db, 'son_esitleme'), SIMDI);
  assert.equal(await durumOku(db, 'gecmis_imlec'), null);
  await durumYaz(db, 'gecmis_imlec', { sonraki: '2026-09-01', bitti: false, bosArdisik: 1 });
  const ist2 = sahte({ hrv: (p, yol) => (yol.endsWith('/2026-09-01') ? new TypeError('fetch failed') : { hrvSummaries: [] }) });
  await esitle({ istemci: ist2, db, simdiMs: SIMDI });
  assert.deepEqual(await durumOku(db, 'gecmis_imlec'), { sonraki: '2026-09-01', bitti: false, bosArdisik: 1 });
});

test('gecmisHata: hatalı parça true, temiz çalışma false, imleç değişmez', async () => {
  await durumYaz(db, 'gecmis_imlec', { sonraki: '2026-09-01', bitti: false, bosArdisik: 1 });
  const bozuk = sahte({ hrv: (p, yol) => (yol.endsWith('/2026-09-01') ? new TypeError('fetch failed') : { hrvSummaries: [] }) });
  const r = await esitle({ istemci: bozuk, db, simdiMs: SIMDI });
  assert.deepEqual(r, { durum: 'tamam', gecmisHata: true });
  assert.equal(await durumOku(db, 'son_esitleme'), SIMDI);
  assert.deepEqual(await durumOku(db, 'gecmis_imlec'), { sonraki: '2026-09-01', bitti: false, bosArdisik: 1 });

  const temiz = await esitle({ istemci: dolu(), db, simdiMs: SIMDI });
  assert.deepEqual(temiz, { durum: 'tamam', gecmisHata: false });
});

test('gecmisHata: geçmiş bitmişse false ve parça istenmez', async () => {
  await durumYaz(db, 'gecmis_imlec', { sonraki: '2025-01-01', bitti: true, bosArdisik: 2 });
  const ist = sahte({});
  const r = await esitle({ istemci: ist, db, simdiMs: SIMDI });
  assert.deepEqual(r, { durum: 'tamam', gecmisHata: false });
  assert.equal(ist.cagrilar.length, 4);
});
