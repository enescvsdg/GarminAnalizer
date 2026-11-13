# Gerçek Veri Hattı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garmin Connect Personal API'den gerçek veriyi çekip D1'de biriktiren, kişisel normal aralığı hesaplayan ve prototip arayüzünü bu veriyle açan bir Cloudflare Worker.

**Architecture:** Zamanlanmış bir Worker Garmin'den günlük özetleri çeker, kendi şemamıza çevirir ve D1'e yazar. Saf fonksiyonlardan oluşan istatistik katmanı 28 günlük baz çizgiyi, normal bandını, günün enerji puanını ve şablon hükmünü üretir. Worker'ın `DEVICE_KEY` korumalı API'si bunları tek JSON olarak verir; arayüz bu JSON'u prototipin beklediği `VERI` biçimine çevirir, bağlantı yoksa uydurma veriyle açılır.

**Tech Stack:** Cloudflare Workers (ES modülleri), D1, wrangler 4, Node 24 (`node --test`, `node:sqlite`), vanilla JS. Çerçeve ve derleme adımı yok.

**Spec:** `docs/superpowers/specs/2026-11-12-garmin-kocu-design.md` (Bölüm 3-6, 9, 10-12). Gemini brifingi, web push ve uyarı bildirimleri (Bölüm 7-8) ile PWA kabuğu ve yayın **bu planın dışında**; sonraki iki planda.

## Global Constraints

- Garmin key'i, `DEVICE_KEY` ve diğer gizli değerler yalnızca Worker secret'ı ya da `worker/.dev.vars` içinde durur. Tarayıcıya, repoya, loga, test çıktısına ve sohbete girmez. Ajan `worker/.dev.vars` ve `kesif/ham/` içeriğini okumaz, yazdırmaz.
- Repo herkese açık olacak: gerçek sağlık verisi repoya girmez. `kesif/ham/` gitignore'dadır; commit edilen örnekler anonimleştirilmiştir.
- Eksik metrik `NULL`'dır, asla `0` yazılmaz. Arayüzde "veri yok" olarak görünür.
- Bütün veritabanı yazmaları upsert'tir; aynı günü tekrar çekmek kaydı çoğaltmaz.
- Loglara sağlık verisi yazılmaz (yalnızca tarih, sayım, HTTP durumu).
- Saat dilimi `Europe/Istanbul`; "bugün" UTC'ye göre değil bu dilime göre hesaplanır.
- Worker API'si `X-Device-Key` başlığı ister; CORS yalnızca `IZINLI_ORIGIN` değerine izin verir.
- Garmin taban adresi `https://personal.connectapi.garmin.com`; token yolu `/personalapitoken-service/personal-api/personal-api-key/token`, başlık `Authorization: ApiKey <key>`, yanıt düz metin JWT.
- Çerçeve, derleyici ve çalışma zamanı bağımlılığı eklenmez. Tek geliştirme bağımlılığı `wrangler`.
- Sapma renk dışında ok ve metinle de verilir; bütün sayılar tabular rakamdır (mevcut arayüz kuralları korunur).

## Review Focus

1. **Saat takılmayan gün.** Bir günün bütün metrikleri `NULL` gelir; kullanıcı kartta "veri yok" görmeyi bekler, `0`, `NaN` ya da çökmüş bir ekran değil. (Task 8)
2. **14 günden az veri.** İlk haftalarda kişisel bant hesaplanamaz; kullanıcı yine çalışan bir ekran ve bantların henüz genel varsayılan olduğunu belirten bir işaret bekler. (Task 6, 8)
3. **Kısmi Garmin hatası.** Bir uç nokta 500 verirken diğerleri çalışır; daha önce kaydedilmiş dolu bir değer `NULL` ile ezilmemelidir. (Task 5)
4. **Gece yarısı ve saat dilimi.** UTC'de gün değişmişken İstanbul'da değişmemiş olabilir; "bugün" ve "dünkü yük" yanlış güne kaymamalıdır. (Task 5, 6)
5. **Süresi dolmuş ya da silinmiş Garmin key'i.** Eşitleme durur; kullanıcı sessiz bir bayat ekran değil, "Garmin key'ini yenile" uyarısını ve son eşitleme zamanını görmeyi bekler. (Task 2, 7, 8)

---

## Dosya yapısı

```
.gitignore
package.json                      test betiği, wrangler geliştirme bağımlılığı
tools/kesif.mjs                   Garmin'i yoklar, ham yanıtları kaydeder, anonim örnek üretir
tools/anonim.mjs                  yanıtı yapısını koruyarak anonimleştirir (saf fonksiyon)
kesif/ham/                        ham yanıtlar (gitignore)
kesif/ornek/                      anonim örnekler (commit edilir, test verisi)
docs/garmin-alanlar.md            keşif sonucu: alan haritası, aralık ve geçmiş sınırları
worker/wrangler.toml
worker/schema.sql
worker/.dev.vars                  yerel gizli değerler (gitignore; kullanıcı oluşturur)
worker/src/worker.js              giriş: fetch + scheduled
worker/src/garmin/client.js       token ve GET
worker/src/garmin/normalize.js    Garmin yanıtı → günlük satır
worker/src/garmin/sync.js         aralık çekme, upsert, geçmiş doldurma
worker/src/db.js                  D1 okuma/yazma
worker/src/stats/baseline.js      medyan, MAD, bant, üst üste sapma
worker/src/stats/ozet.js          enerji, hüküm, şablon gerekçe, API yanıtı
worker/src/api/router.js          kimlik doğrulama, CORS, rotalar
worker/src/zaman.js               saat dilimi yardımcıları
worker/test/*.test.mjs            birim testleri
worker/test/helpers/d1.mjs        node:sqlite üzerinde D1 benzeri arayüz
prototip/veri-canli.js            API yanıtı → VERI biçimi, bağlantı ayarı
prototip/uygulama.html            (değişir) eşzamansız başlangıç, boş veri durumları, bağlantı alanları
```

Ortak tipler (bütün görevler bu adları kullanır):

```js
// GunSatiri: D1 `daily` tablosunun bir satırı. Eksik değer null.
// { date:'YYYY-MM-DD', sleep_score, sleep_seconds, hrv_avg, resting_hr, stress_avg,
//   bb_high, bb_low, steps, intensity_minutes, calories, raw_json, synced_at }
// OlcumId: 'uyku' | 'bb' | 'hrv' | 'nabiz' | 'stres' | 'yuk'
// OLCUM_KAYNAK: { uyku:'sleep_score', bb:'bb_high', hrv:'hrv_avg', nabiz:'resting_hr',
//                 stres:'stress_avg', yuk:'intensity_minutes' }   // yuk bir ÖNCEKİ günün değeridir
```

---

### Task 0: Depo iskeleti

**Files:**
- Create: `.gitignore`, `package.json`

- [ ] **Step 1: `garmin-kocu/` içinde `git init -b main` çalıştır.**

- [ ] **Step 2: `.gitignore` yaz**

```
.superpowers/
.DS_Store
node_modules/
.wrangler/
worker/.dev.vars
kesif/ham/
```

- [ ] **Step 3: `package.json` yaz** — `"type": "module"`, `"private": true`, `"engines": {"node": ">=22.5"}`, betikler: `"test": "node --test worker/test/ tools/"`, `"kesif": "node tools/kesif.mjs"`. `devDependencies`: `wrangler` (`^4`). `npm install` çalıştır.

- [ ] **Step 4: Doğrula ve commit et**

Run: `git status --short` → `.superpowers/` ve `node_modules/` listede yok.

```bash
git add .gitignore package.json package-lock.json docs prototip
git commit -m "chore: depo iskeleti, tasarım dokümanı ve prototip"
git switch -c veri-hatti
```

---

### Task 1: Garmin keşfi

Yanıtların alan adları, aralık sınırı ve geçmiş derinliği belgelenmemiş (spec Bölüm 4). Bu görev onları ölçer. **Kullanıcı adımı içerir:** key'i yalnızca kullanıcı girer.

**Files:**
- Create: `tools/anonim.mjs`, `tools/anonim.test.mjs`, `tools/kesif.mjs`, `docs/garmin-alanlar.md`, `kesif/ornek/*.json`

**Interfaces:**
- Produces: `anonimlestir(deger: unknown): unknown`; `kesif/ornek/<ad>.json` dosyaları (ad: `dailysummaries`, `sleep`, `bodybattery`, `hrv`, `stress`, `steps`, `activities`); `docs/garmin-alanlar.md`.

- [ ] **Step 1: Başarısız testi yaz** (`tools/anonim.test.mjs`)

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { anonimlestir } from './anonim.mjs';
test('yapıyı korur, değerleri değiştirir', () => {
  const g = { calendarDate: '2026-11-12', sleepScore: 54, name: 'Ali', nested: [{ v: 3.5, ok: true, n: null }] };
  const c = anonimlestir(g);
  assert.deepEqual(Object.keys(c), Object.keys(g));
  assert.match(c.calendarDate, /^\d{4}-\d{2}-\d{2}$/);      // tarih biçimi korunur
  assert.equal(typeof c.sleepScore, 'number');
  assert.notEqual(c.name, 'Ali');                            // serbest metin maskelenir
  assert.equal(c.nested[0].ok, true); assert.equal(c.nested[0].n, null);
  assert.equal(Number.isInteger(c.sleepScore), true);        // tam sayı tam sayı kalır
});
test('kimlik benzeri anahtarlar sabit değerle değişir', () => {
  const c = anonimlestir({ userProfilePK: 123456, displayName: 'x', activityId: 987 });
  assert.equal(c.userProfilePK, 0); assert.equal(c.activityId, 0);
});
```

- [ ] **Step 2:** Run: `node --test tools/` → FAIL (`anonim.mjs` yok).

- [ ] **Step 3: `anonimlestir` yaz** (`tools/anonim.mjs`). Özyinelemeli. Sayılar ±%15 rastgele kaydırılır (tam sayı tam kalır, işaret korunur); ISO tarih ve tarih-saat dizgileri olduğu gibi kalır; diğer dizgiler aynı uzunlukta `x`; anahtarı `/id$|pk$|uuid|guid|email|name/i` ile eşleşen sayılar `0`, dizgiler `x`; boolean ve null aynen.

- [ ] **Step 4:** Run: `node --test tools/` → PASS.

- [ ] **Step 5: `tools/kesif.mjs` yaz.** Key'i `worker/.dev.vars` içindeki `GARMIN_PERSONAL_API_KEY=` satırından okur (ortam değişkeni varsa onu kullanır); key'i hiçbir yere yazdırmaz. Sırayla:
  1. Token alır; yalnızca HTTP durumunu ve JWT `exp` değerinden kalan süreyi (saat) yazdırır.
  2. Global Constraints'teki taban adreste, son 7 gün için şu yedi uç noktayı çağırır (yollar spec Bölüm 4'te): `dailysummaries`, `sleep` (dailySleepSummariesByDate), `bodybattery`, `hrv` (daily aralık), `stress`, `steps`, `activities` (`start=0&limit=20`). Her yanıtı `kesif/ham/<ad>.json` olarak, anonimini `kesif/ornek/<ad>.json` olarak kaydeder.
  3. `dailysummaries` için aralık sınırını yoklar: 7, 28, 90 günlük isteklerin HTTP durumunu ve dönen öğe sayısını kaydeder.
  4. Geçmiş derinliğini yoklar: 90, 180, 365 gün önceki tek günlük isteklerin durumunu ve boş olup olmadığını kaydeder.
  5. İstekler arası 400 ms bekler; 429 görürse durur ve bunu rapora yazar.
  6. Konsola yalnızca yapı özeti basar: her uç nokta için alan yolları ve tipleri (`dizi[].sleepScore: number`), değerler değil.

- [ ] **Step 6 (kullanıcı): key'i yerel dosyaya koy ve keşfi çalıştır.** Kullanıcıya şu talimatı ver ve beklet; dosyayı ajan oluşturmaz, okumaz:

```bash
mkdir -p worker && printf 'GARMIN_PERSONAL_API_KEY=' > worker/.dev.vars && pbpaste >> worker/.dev.vars
```
```bash
npm run kesif
```
(İlk komuttan önce key panoya kopyalanmış olmalı. Key ekranda görünmez.)

- [ ] **Step 7: `docs/garmin-alanlar.md` yaz.** `kesif/ornek/` dosyalarından ve betiğin yapı özetinden: her uç nokta için kök yapı (dizi mi nesne mi), gün anahtarı alanı, ve şu hedef alanların her birinin kaynağı: `sleep_score`, `sleep_seconds`, `hrv_avg`, `resting_hr`, `stress_avg`, `bb_high`, `bb_low`, `steps`, `intensity_minutes`, `calories`. Ayrıca: ölçülen aralık sınırı, geçmiş derinliği, uykunun hangi takvim gününe yazıldığı (uyanılan gün mü), görülen hata kodları. Bulunamayan hedef alan "yok" olarak yazılır ve o metrik `NULL` kalır.

- [ ] **Step 8: Commit**

```bash
git add tools docs/garmin-alanlar.md kesif/ornek
git commit -m "feat: Garmin keşif aracı ve alan haritası"
```

---

### Task 2: Garmin istemcisi

**Files:**
- Create: `worker/src/garmin/client.js`, `worker/test/client.test.mjs`

**Interfaces:**
- Produces:
  - `class GarminKeyHatasi extends Error`, `class GarminGeciciHata extends Error` (alan: `durum: number`)
  - `jwtBitis(token: string): number` — saniye cinsinden `exp`; çözülemezse `0`
  - `garminIstemci({ apiKey, fetch, tokenOku, tokenYaz, simdi }): { get(yol: string, params?: object): Promise<any> }`
    - `tokenOku(): Promise<{access_token, expires_at}|null>`, `tokenYaz(t): Promise<void>`, `simdi(): number` (saniye)

- [ ] **Step 1: Başarısız testleri yaz** (`worker/test/client.test.mjs`). Sahte `fetch` çağrıları bir diziye kaydeder. Sahte JWT: `'x.' + btoa(JSON.stringify({exp})) + '.y'`.

```js
test('önbellekte token yoksa key ile alır, Bearer ile istek atar', async () => { /* 2 çağrı: POST token (Authorization: 'ApiKey K'), GET (Authorization: 'Bearer <jwt>'); tokenYaz 1 kez */ });
test('bitişe 1 saatten fazla varsa önbellekteki token kullanılır', async () => { /* expires_at = simdi+7200 → 1 çağrı, POST yok */ });
test('bitişe 1 saatten az kalınca yeniler', async () => { /* expires_at = simdi+3000 → POST + GET */ });
test('401 gelince bir kez yeniler ve tekrarlar', async () => { /* GET 401, POST 200, GET 200 → sonuç döner, toplam 3 çağrı */ });
test('yenilemeden sonra yine 401 ise GarminKeyHatasi', async () => { await assert.rejects(p, GarminKeyHatasi); });
test('token uç noktası 401/403 ise GarminKeyHatasi', async () => {});
test('429 ve 5xx GarminGeciciHata, durum alanı dolu', async () => { /* e.durum === 429 */ });
test('params sorgu dizgisine eklenir', async () => { /* get('/a', {startDate:'2026-11-01'}) → URL '...com/a?startDate=2026-11-01' */ });
```

- [ ] **Step 2:** Run: `node --test worker/test/client.test.mjs` → FAIL.
- [ ] **Step 3: `client.js` yaz.** Yenileme eşiği 3600 saniye. Hata iletilerine key ya da token konmaz.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** `git add worker && git commit -m "feat: Garmin istemcisi (token önbelleği, 401 yenileme)"`

---

### Task 3: Veritabanı

**Files:**
- Create: `worker/schema.sql`, `worker/src/db.js`, `worker/test/helpers/d1.mjs`, `worker/test/db.test.mjs`

**Interfaces:**
- Produces:
  - `gunUpsert(db, satir: GunSatiri): Promise<void>` — var olan dolu değeri `NULL` ile ezmez
  - `gunleriOku(db, bas: string, son: string): Promise<GunSatiri[]>` — tarihe göre artan, `raw_json` hariç
  - `durumOku(db, anahtar: string): Promise<any|null>`, `durumYaz(db, anahtar: string, deger: any): Promise<void>` — JSON olarak saklar
  - `testD1(): D1Benzeri` (`helpers/d1.mjs`) — `schema.sql` yüklenmiş, bellekte

- [ ] **Step 1: `schema.sql` yaz.** Tablolar: `daily` (Dosya yapısı bölümündeki `GunSatiri` alanları; `date TEXT PRIMARY KEY`, sayılar `REAL`/`INTEGER`, hepsi null olabilir), `activities(id TEXT PRIMARY KEY, date TEXT, type TEXT, start_ts INTEGER, duration_s INTEGER, distance_m REAL, avg_hr REAL, raw_json TEXT)`, `sync_state(key TEXT PRIMARY KEY, value TEXT)`, `settings(key TEXT PRIMARY KEY, value TEXT)`. Hepsi `CREATE TABLE IF NOT EXISTS`.

- [ ] **Step 2: `helpers/d1.mjs` yaz.** `node:sqlite` `DatabaseSync(':memory:')` üzerinde D1'in kullanılan alt kümesi: `prepare(sql).bind(...a)` → `{ run(), all() → {results}, first() }`, `batch(stmts)`, `exec(sql)`.

- [ ] **Step 3: Başarısız testleri yaz** (`worker/test/db.test.mjs`)

```js
test('aynı gün iki kez yazılınca tek satır kalır', async () => { /* 2 upsert → gunleriOku 1 satır */ });
test('upsert dolu değeri null ile ezmez', async () => {
  await gunUpsert(db, { date: '2026-11-12', sleep_score: 54, hrv_avg: 41 });
  await gunUpsert(db, { date: '2026-11-12', sleep_score: null, hrv_avg: 43 });
  const [s] = await gunleriOku(db, '2026-11-12', '2026-11-12');
  assert.equal(s.sleep_score, 54); assert.equal(s.hrv_avg, 43);
});
test('eksik alan null okunur, 0 değil', async () => { /* yalnız date ile upsert → steps === null */ });
test('gunleriOku aralığı kapsar ve sıralar', async () => {});
test('durumYaz/durumOku nesneyi korur; yoksa null', async () => {});
```

- [ ] **Step 4:** Run → FAIL. **Step 5: `db.js` yaz** (`ON CONFLICT(date) DO UPDATE SET x = COALESCE(excluded.x, daily.x)`). **Step 6:** Run → PASS.
- [ ] **Step 7:** `git commit -m "feat: D1 şeması ve veri katmanı"`

---

### Task 4: Garmin yanıtını satıra çevirme

**Files:**
- Create: `worker/src/garmin/normalize.js`, `worker/test/normalize.test.mjs`

**Interfaces:**
- Consumes: `docs/garmin-alanlar.md`, `kesif/ornek/*.json`
- Produces: `gunleriCikar(yanitlar: { dailysummaries?, sleep?, bodybattery?, hrv?, stress?, steps? }): GunSatiri[]` — her takvim günü için tek satır; `raw_json` o günün kaynak parçalarının JSON'u. `aktiviteleriCikar(yanit): object[]` (`activities` tablosu alanları).

- [ ] **Step 1: Başarısız testleri yaz.** Örnek dosyaları `kesif/ornek/` içinden yükler.

```js
test('örnek yanıtlardan her gün için tek satır çıkar', () => { /* tarihler benzersiz, biçim YYYY-MM-DD */ });
test('sayısal alanlar sayı ya da null', () => { /* her satır, 10 hedef alan: typeof number && isFinite, ya da null */ });
test('değerler makul aralıkta', () => { /* sleep_score 0-100, resting_hr 25-120, stress_avg 0-100, bb_high 0-100, hrv_avg 5-250; null serbest */ });
test('bir kaynak eksikse o alanlar null, diğerleri dolu', () => { /* hrv verilmeden çağır → hrv_avg null, sleep_score dolu */ });
test('boş girdi boş dizi', () => { assert.deepEqual(gunleriCikar({}), []); });
test('negatif ya da -1 gibi yer tutucu değerler null olur', () => { /* örnek bir günde sleepScore = -1 yap → null */ });
```

- [ ] **Step 2:** Run → FAIL. **Step 3: `normalize.js` yaz** — alan eşlemesi `docs/garmin-alanlar.md`'deki haritadan. **Step 4:** Run → PASS.
- [ ] **Step 5:** `git commit -m "feat: Garmin yanıtlarını günlük satıra çevirme"`

---

### Task 5: Eşitleme

**Files:**
- Create: `worker/src/zaman.js`, `worker/src/garmin/sync.js`, `worker/test/zaman.test.mjs`, `worker/test/sync.test.mjs`

**Interfaces:**
- Consumes: `garminIstemci().get`, `gunleriCikar`, `aktiviteleriCikar`, `gunUpsert`, `durumOku`, `durumYaz`, `GarminKeyHatasi`, `GarminGeciciHata`
- Produces:
  - `yerelTarih(ms: number, dilim = 'Europe/Istanbul'): string` — `YYYY-MM-DD`
  - `gunEkle(tarih: string, n: number): string`
  - `aralikEsitle({ istemci, db, bas, son }): Promise<{ gun: number, hatalar: string[] }>` — uç nokta başına bağımsız; biri hata verirse diğerleri yazılır, hata adı `hatalar`'a eklenir. `GarminKeyHatasi` yukarı fırlatılır.
  - `esitle({ istemci, db, simdiMs }): Promise<{ durum: 'tamam'|'kismi'|'key-gecersiz'|'atlandi' }>` — son 3 günü çeker; sonra geçmiş doldurmayı bir adım ilerletir.
  - `sync_state` anahtarları: `son_esitleme` (ms), `key_durum` (`'gecerli'|'gecersiz'`), `gecmis_imlec` (`{ sonraki: 'YYYY-MM-DD', bitti: boolean, bosArdisik: number }`)

- [ ] **Step 1: Başarısız testleri yaz**

```js
// zaman.test.mjs
test('UTC 21:30 İstanbulda ertesi gündür', () => { assert.equal(yerelTarih(Date.UTC(2026, 10, 12, 21, 30)), '2026-11-13'); });
test('UTC 20:59 aynı gündür', () => { assert.equal(yerelTarih(Date.UTC(2026, 10, 12, 20, 59)), '2026-11-12'); });
test('gunEkle ay sonunu geçer', () => { assert.equal(gunEkle('2026-10-31', 1), '2026-11-01'); assert.equal(gunEkle('2026-11-01', -1), '2026-10-31'); });

// sync.test.mjs  (sahte istemci: yol → yanıt ya da fırlatılacak hata; db: testD1())
test('aralikEsitle örnek yanıtları yazar', async () => { /* gunleriOku > 0 satır */ });
test('bir uç nokta GarminGeciciHata verirse diğerleri yazılır', async () => { /* hrv fırlatır → hatalar ['hrv'], sleep_score dolu */ });
test('kısmi hata var olan dolu değeri silmez', async () => { /* önce tam eşitle, sonra hrv hatalı eşitle → hrv_avg eski değer */ });
test('ikinci eşitleme satır çoğaltmaz', async () => {});
test('esitle key hatasında key_durum gecersiz yazar ve durum döner', async () => { /* durum 'key-gecersiz', fırlatmaz */ });
test('esitle başarıda son_esitleme ve key_durum gecerli yazar', async () => {});
test('esitle son 3 günü İstanbul tarihine göre ister', async () => { /* simdiMs = UTC 2026-11-12 21:30 → istek son=2026-11-13, bas=2026-11-11 */ });
test('geçmiş doldurma her çağrıda 7 gün geri gider', async () => { /* 2 çağrı → gecmis_imlec.sonraki 14 gün geride */ });
test('üst üste 2 boş parça gelince geçmiş doldurma biter', async () => { /* boş yanıt → bitti: true */ });
test('geçmiş doldurma 365 günde durur', async () => {});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: `zaman.js` ve `sync.js` yaz.** Geçmiş parçası 7 gün (Task 1 daha küçük bir aralık sınırı ölçtüyse o); çağrı başına 1 parça. İstek tarihleri `yerelTarih` ile. **Step 4:** Run → PASS.
- [ ] **Step 5:** `git commit -m "feat: eşitleme ve geçmiş doldurma"`

---

### Task 6: İstatistik ve özet

**Files:**
- Create: `worker/src/stats/baseline.js`, `worker/src/stats/ozet.js`, `worker/test/baseline.test.mjs`, `worker/test/ozet.test.mjs`

**Interfaces:**
- Consumes: `GunSatiri[]`, `gunEkle`
- Produces (`baseline.js`):
  - `medyan(a: number[]): number|null`, `mad(a: number[]): number|null`
  - `OLCUMLER`: sabit dizi, öğe `{ id, ad, birim, iyi, kaynak, tabanSigma, varsayilan: [min, max], agirlik }`:

    | id | ad | birim | iyi | kaynak | tabanSigma | varsayilan | agirlik |
    |---|---|---|---|---|---|---|---|
    | uyku | Uyku | `''` | 1 | sleep_score | 4 | 70–85 | 0.25 |
    | bb | Body Battery | `''` | 1 | bb_high | 6 | 60–85 | 0.20 |
    | hrv | HRV | `' ms'` | 1 | hrv_avg | 3 | 48–62 | 0.25 |
    | nabiz | Dinlenme nabzı | `''` | -1 | resting_hr | 1.5 | 50–55 | 0.15 |
    | stres | Stres | `''` | -1 | stress_avg | 4 | 25–40 | 0.10 |
    | yuk | Dünkü yük | `' dk'` | -1 | intensity_minutes | 15 | 40–90 | 0.05 |

  - `gunDegerleri(satirlar: GunSatiri[], tarih: string): Record<OlcumId, number|null>` — `yuk` bir önceki günün `intensity_minutes` değeridir
  - `bant(satirlar, olcum, tarih): { min, max, medyan, sigma, kisisel: boolean }` — `tarih`'ten önceki 28 günün dolu değerleri; en az 14 değer varsa `sigma = max(1.4826 × MAD, tabanSigma)`, `min/max = medyan ∓ 1.5 × sigma` (bir ondalığa yuvarlı), `kisisel: true`; yoksa `varsayilan` bant, `medyan` = bandın ortası, `sigma` = bant genişliği / 3, `kisisel: false`
  - `durum(bant, v): 'lo'|'ok'|'hi'|null` — `v` null ise null
  - `ustUsteSapma(satirlar, olcum, tarih): boolean` — `tarih` ve bir önceki gün ikisi de aynı yönde bant dışıysa true
- Produces (`ozet.js`):
  - `enerji(degerler, bantlar): number|null` — her dolu ölçüm için `g = clamp(0.5 + 0.25 × iyi × (v − medyan) / (1.5 × sigma), 0, 1)`; ağırlıklı ortalama; 3'ten az dolu ölçüm varsa null
  - `hukum(e: number|null): string` — `< 0.3` "Bugün hafif tut." · `< 0.48` "Yavaşla." · `< 0.62` "Dengeli bir gün." · `< 0.85` "İyi gidiyorsun." · diğer "Tam gaz." · null "Bugün için yeterli veri yok."
  - `gerekce(degerler, bantlar): string` — bant dışı ölçüm yoksa "Bütün ölçümlerin normal aralığında."; bir tane ise "`<Ad>` normalinin `altında|üstünde`, gerisi yerinde."; birden çoksa "`<n>` ölçümün normal aralığının dışında: `a, b ve c`." (adlar küçük harf, `toLocaleLowerCase('tr')`); hiç dolu ölçüm yoksa "Saat verisi gelmemiş."
  - `apiYaniti(satirlar: GunSatiri[], bugun: string, gunSayisi: number, meta: { sonEsitleme, keyDurum }): object`:
    ```js
    { bugun, sonEsitleme, keyDurum,
      olcumler: [{ id, ad, birim, iyi, min, max, kisisel }],          // bantlar `bugun` için
      gunler: [{ tarih, e, hukum, gerekce, d: { uyku, bb, hrv, nabiz, stres, yuk } }] }  // eskiden yeniye, tam `gunSayisi` öğe
    ```

- [ ] **Step 1: Başarısız testleri yaz**

```js
// baseline.test.mjs — yardımcı: seri(başlangıçTarih, [değerler], alan) → GunSatiri[]
test('medyan ve mad', () => { assert.equal(medyan([1, 9, 3]), 3); assert.equal(mad([1, 2, 3, 4, 100]), 1); assert.equal(medyan([]), null); });
test('14 dolu günden az ise varsayılan bant, kisisel false', () => { /* 13 gün uyku → {min:70,max:85,kisisel:false} */ });
test('28 gün sabit 80 uyku: sigma tabana oturur', () => { /* medyan 80, sigma 4, min 74, max 86, kisisel true */ });
test('bant hesabı tarihin kendisini ve null günleri katmaz', () => { /* bugün 10, önceki 28 gün 80 → medyan 80 */ });
test('durum: lo/ok/hi ve null', () => {});
test('yuk bir önceki günün yoğun dakikasıdır', () => { /* 11 Kas intensity 170 → gunDegerleri(.., '2026-11-12').yuk === 170 */ });
test('ustUsteSapma iki gün aynı yönde bant dışıysa true, tek günse false', () => {});
test('ustUsteSapma arada null gün varsa false', () => {});

// ozet.test.mjs
test('her ölçüm medyandaysa enerji 0.5', () => {});
test('iyi yönde 1.5 sigma sapma o ölçümü 0.75 yapar; nabız için ters yön', () => {});
test('3ten az dolu ölçümde enerji null ve hüküm yeterli veri yok', () => {});
test('hüküm eşikleri', () => { /* 0.29, 0.3, 0.47, 0.61, 0.84, 0.85 */ });
test('gerekçe: sıfır, bir ve çok sapma; hiç veri yok', () => { /* tam metin eşitliği */ });
test('apiYaniti tam gunSayisi öğe döner, veri olmayan gün null değerlerle', () => { /* 28 istenir, 10 satır var → 28 öğe, ilk 18in d değerleri null, e null */ });
test('apiYanitinda 0 ya da NaN yok', () => { /* JSON.stringify içinde "NaN" ve ":0," aranır; boş günler null */ });
```

- [ ] **Step 2:** Run → FAIL. **Step 3: İki dosyayı yaz.** **Step 4:** Run → PASS.
- [ ] **Step 5:** `git commit -m "feat: baz çizgi, normal bandı, enerji ve şablon özet"`

---

### Task 7: Worker, API ve dağıtım

**Files:**
- Create: `worker/src/api/router.js`, `worker/src/worker.js`, `worker/wrangler.toml`, `worker/test/router.test.mjs`

**Interfaces:**
- Consumes: `apiYaniti`, `gunleriOku`, `durumOku`, `durumYaz`, `esitle`, `garminIstemci`, `yerelTarih`, `gunEkle`
- Produces:
  - `istekIsle(request: Request, env, simdiMs: number): Promise<Response>`
  - Rotalar: `GET /api/gunler?gun=<1-90, varsayılan 28>` → `apiYaniti` çıktısı; `GET /api/durum` → `{ sonEsitleme, keyDurum, gecmisBitti }`; `OPTIONS *` → CORS ön isteği
  - `env`: `DB` (D1), `GARMIN_PERSONAL_API_KEY`, `DEVICE_KEY`, `IZINLI_ORIGIN`
  - `worker.js` varsayılan dışa aktarım: `{ fetch, scheduled }`

- [ ] **Step 1: Başarısız testleri yaz** (`router.test.mjs`; `env.DB = testD1()`, `DEVICE_KEY: 'gizli'`, `IZINLI_ORIGIN: 'https://ornek.github.io'`)

```js
test('anahtar yoksa 401 ve gövdede veri yok', async () => { /* status 401, gövde {hata:'yetkisiz'} */ });
test('yanlış anahtar 401', async () => {});
test('doğru anahtarla /api/gunler 200 ve 28 gün', async () => { /* gunler.length === 28 */ });
test('gun parametresi 1-90 arasına sıkıştırılır', async () => { /* gun=500 → 90, gun=abc → 28 */ });
test('CORS: izinli origin yansıtılır, başkası yansıtılmaz', async () => { /* Access-Control-Allow-Origin */ });
test('OPTIONS 204, Allow-Headers X-Device-Key içerir', async () => {});
test('bilinmeyen yol 404, POST 405', async () => {});
test('/api/durum key_durum ve son_esitleme döner', async () => {});
test('anahtar karşılaştırması uzunluk farkında da 401 verir ve fırlatmaz', async () => {});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `router.js` ve `worker.js` yaz.** Anahtar karşılaştırması sabit zamanlı. `scheduled`: `son_esitleme` 3 saatten eskiyse ya da geçmiş doldurma bitmediyse `esitle` çağırır; `key_durum` `gecersiz` ise günde bir kez dener. Eşitleme `kismi` dönerse sonraki deneme 30 dakika, üst üste ikincide 1 saat, sonra 3 saat sonraya ertelenir (`sync_state` anahtarı `bekle_bitis`, ms); başarıda sıfırlanır. `router.test.mjs`'e ekle: `test('bekle_bitis gelecekteyse scheduled eşitleme çağırmaz', …)`. Yakalanmamış hata loga yalnızca ileti ve ad olarak yazılır.
- [ ] **Step 4:** Run: `npm test` → hepsi PASS.
- [ ] **Step 5: `wrangler.toml` yaz** — `name = "garmin-analizer"`, `main = "src/worker.js"`, `compatibility_date = "2026-11-01"`, `[triggers] crons = ["*/15 * * * *"]`, `[[d1_databases]] binding = "DB"`, `database_name = "garmin-analizer"`, `database_id` Step 6'da doldurulur, `[vars] IZINLI_ORIGIN = "https://enescvsdg.github.io"`.
- [ ] **Step 6 (kullanıcı onayıyla, dışa açık adım): dağıt.** Kullanıcıya her komutu söyle ve onayını al; gizli değerleri kullanıcı girer.

```bash
npx wrangler login
npx wrangler d1 create garmin-analizer            # çıkan database_id wrangler.toml'a yazılır
npx wrangler d1 execute garmin-analizer --remote --file=worker/schema.sql
npx wrangler secret put GARMIN_PERSONAL_API_KEY   # kullanıcı yapıştırır
npx wrangler secret put DEVICE_KEY                # kullanıcı uzun, rastgele bir parola belirler
npx wrangler deploy
```

- [ ] **Step 7: Canlıda doğrula.** `curl -s -o /dev/null -w '%{http_code}' https://<worker-adresi>/api/durum` → `401`. Anahtarlı isteği kullanıcı kendi terminalinde çalıştırır ve yalnızca `keyDurum` ile `gunler` uzunluğunu bildirir.
- [ ] **Step 8:** `git commit -m "feat: Worker girişi, API ve zamanlanmış eşitleme"`

---

### Task 8: Arayüzü gerçek veriye bağlama

**Files:**
- Create: `prototip/veri-canli.js`, `prototip/veri-canli.test.mjs`
- Modify: `prototip/uygulama.html` (betik başlangıcı, kartlar, Trend, Ayarlar paneli), `package.json` (test yoluna `prototip/` ekle)

**Interfaces:**
- Consumes: `GET /api/gunler` yanıtı (Task 6 `apiYaniti` biçimi); mevcut `window.VERI` biçimi (`prototip/veri.js`): `{ OLCUMLER:[{id,ad,birim,min,max,iyi}], GUNLER:[{tarih:Date,gunKisa,gunUzun,gun,ay,e,d,hukum,gerekce}], durum(o,v), OK, DURUM_METIN }`
- Produces (`veri-canli.js`, hem tarayıcıda `window.CANLI` hem Node'da dışa aktarım):
  - `veriCevir(yanit: object): VERI` — `tarih` dizgisini yerel `Date`'e çevirir, gün ve ay adlarını ekler; `e` null ise `0.5` koyar ve güne `veriYok: true` işaretler; `OLCUMLER[].kisisel` korunur; `VERI.meta = { sonEsitleme, keyDurum }`
  - `baglantiOku(): { adres, anahtar }|null`, `baglantiYaz({adres, anahtar})`, `baglantiSil()` — `localStorage` anahtarı `gk-baglanti`
  - `veriGetir(fetch?): Promise<VERI|null>` — bağlantı yoksa ya da istek başarısızsa null

- [ ] **Step 1: Başarısız testleri yaz** (`prototip/veri-canli.test.mjs`)

```js
test('veriCevir 28 günü VERI biçimine çevirir', () => { /* GUNLER.length 28; GUNLER[27].tarih instanceof Date; gunKisa 'Per' (2026-11-12) ; ay 'Kasım' */ });
test('null değerler null kalır, durum null döner', () => { /* d.uyku null → VERI.durum(o, null) === null */ });
test('e null ise 0.5 ve veriYok true', () => {});
test('durum bant sınırlarını kullanır', () => { /* min 70 max 85: 69 lo, 70 ok, 85 ok, 86 hi */ });
test('veriGetir bağlantı yoksa null', async () => {});
test('veriGetir 401de null döner ve fırlatmaz', async () => {});
test('veriGetir X-Device-Key başlığını gönderir, anahtarı URLye koymaz', async () => { /* sahte fetch: url içinde anahtar yok */ });
```

- [ ] **Step 2:** Run → FAIL. **Step 3: `veri-canli.js` yaz.** **Step 4:** Run → PASS.

- [ ] **Step 5: `uygulama.html` başlangıcını eşzamansız yap.** Ana betik gövdesi `function baslat(VERI) { … }` içine alınır; sonda: `CANLI.veriGetir().then((v) => baslat(v || window.VERI))`. Bağlantı yokken davranış bugünküyle aynıdır (uydurma veri).

- [ ] **Step 6: Boş veri durumları.** Değeri `null` olan kartta değer yerine `–`, durum satırında "veri yok", mini çizgi null günleri atlar. Trend'de null günde nokta çizilmez, sırt komşu dolu günler arasında doğrusal geçer, balonda `–` ve "veri yok" yazar, nota sesi çalmaz. `veriYok` günde hüküm "Bugün için yeterli veri yok." olur ve şekil orta durumda (`e = 0.5`) kalır. Bir ölçümün bütün 28 günü null ise Trend özeti "Bu ölçüm için henüz veri yok." olur. `kisisel: false` ölçümlerde Trend'deki bant yazısı "genel aralık 70–85" olur ("normal" yerine).

- [ ] **Step 7: Ayarlar paneline bağlantı bölümü ekle.** İki alan (`Worker adresi`, `Cihaz anahtarı`, ikincisi `type="password"`), "Bağlan" ve "Bağlantıyı kaldır" düğmeleri; kaydedince sayfa yeniden yüklenir. Altında durum satırı: "Son eşitleme: 12 Kas 07:15" ya da "Uydurma veri gösteriliyor". `keyDurum === 'gecersiz'` ise Bugün başlığının üstünde kalıcı bir şerit: "Garmin key'inin süresi dolmuş. Yenileyene kadar veri güncellenmez." Son eşitleme 12 saatten eskiyse aynı yerde: "Son eşitleme 14 saat önce."

- [ ] **Step 8: Tarayıcıda doğrula.** 390×664 ve 393×852'de: bağlantısız açılış bugünküyle aynı; sahte bir yanıtla (konsoldan `baslat(CANLI.veriCevir(…))` yerine, `veriGetir`'i geçici bir yerel JSON'a yönlendirerek) bir günü tamamen null, bir ölçümü tamamen null ve `keyDurum: 'gecersiz'` durumları açılır; hiçbirinde `NaN`, `0` ya da üst üste binme yok, konsolda hata yok.

- [ ] **Step 9:** `git commit -m "feat: arayüz gerçek veriye bağlanır, boş veri durumları"`

---

### Task 9: Uçtan uca doğrulama

- [ ] **Step 1:** `npm test` → hepsi PASS.
- [ ] **Step 2 (kullanıcı):** Uygulamada Ayarlar → bağlantı alanlarına Worker adresini ve `DEVICE_KEY`'i girer.
- [ ] **Step 3:** Kullanıcıyla birlikte doğrula: Bugün ekranındaki uyku skoru, dinlenme nabzı ve Body Battery, Garmin Connect'te aynı gün için görünen değerlerle eşleşiyor; Trend 28 günü gösteriyor; "Son eşitleme" zamanı son 3 saat içinde.
- [ ] **Step 4:** Bir gün sonra tekrar bak: yeni gün eklenmiş, geçmiş doldurma ilerlemiş (`/api/durum` → `gecmisBitti`).
- [ ] **Step 5:** `docs/garmin-alanlar.md`'ye ölçülen gerçek sınırları ve karşılaşılan sürprizleri ekle; spec Bölüm 4 ve 13'teki "bilinmeyen" maddelerini güncelle. Commit.

---

## Ek A (2026-11-13): Ek veriler

Keşif, planda olmayan işe yarar veriler gösterdi; kullanıcı hepsinin saklanmasını ve kademeli gösterilmesini istedi. Bu ek, Task 3, 4, 5, 6 ve 8'i aşağıdaki gibi genişletir. Yürütme sırası: 1b → **10** → 4 → 5 → **11** → 7 → 8 → 9.

Ek `daily` sütunları ve kaynakları (hepsi null olabilir):

| sütun | tip | kaynak |
|---|---|---|
| sleep_deep_s, sleep_light_s, sleep_rem_s, sleep_awake_s | INTEGER | sleep `deepSleepSeconds`, `lightSleepSeconds`, `remSleepSeconds`, `awakeSleepSeconds` |
| sleep_need_min | INTEGER | sleep `sleepNeed.actual` |
| sleep_stress_avg | REAL | sleep `avgSleepStress` |
| nap_seconds | INTEGER | sleep `napTimeSeconds` |
| spo2_avg, spo2_min | REAL | dailysummaries `pulseOx.avgValue`, `pulseOx.minValue` |
| resp_avg | REAL | dailysummaries `respiration.avgValue` |
| hrv_weekly_avg | REAL | hrv `weeklyAvg` |
| hrv_status | TEXT | hrv `status` |
| bb_charged, bb_drained | INTEGER | dailysummaries `bodyBattery.chargedValue`, `drainedValue` |
| stress_rest_s, stress_low_s, stress_med_s, stress_high_s | INTEGER | dailysummaries `stress.restDurationInMillis`, `lowStressDurationInMillis`, `mediumStressDurationInMillis`, `highStressDurationInMillis` ÷ 1000, yuvarlı |
| calories_active | INTEGER | dailysummaries `calories.burnedActive` |
| hr_max | INTEGER | dailysummaries `heartRate.maxValue` |
| floors | REAL | dailysummaries `movement.floorsAscended.value` |
| training_load | REAL | o günün aktivitelerinin `activityTrainingLoad` toplamı (Task 5 hesaplar) |

Ek `activities` sütunları: `training_load REAL` (`activityTrainingLoad`), `aerobic_te REAL`, `anaerobic_te REAL` (`aerobicTrainingEffect`, `anaerobicTrainingEffect`), `calories REAL`, `max_hr REAL` (`maxHR`), `total_sets INTEGER`, `total_reps INTEGER`, `avg_cadence REAL` (`averageRunningCadenceInStepsPerMinute`), `avg_stride_m REAL` (`avgStrideLength`), `avg_gct_ms REAL` (`avgGroundContactTime`), `avg_power REAL` (`avgPower`), `hr_zones_json TEXT` (`hrTimeInZone_1..5` dizisi), `sets_json TEXT` (`summarizedExerciseSets`).

### Task 10: Ek sütunlar (Task 3'ün uzantısı)

**Files:**
- Modify: `worker/schema.sql`, `worker/src/db.js`, `worker/test/db.test.mjs`

**Interfaces:**
- Produces: `gunUpsert` ve `gunleriOku` yukarıdaki ek `daily` sütunlarını da yazar/okur (aynı COALESCE kuralı; `hrv_status` metin). Yeni: `aktiviteUpsert(db, a: object): Promise<void>` (anahtar `id`; `activities` tablosunun bütün sütunları, eksik alan null, dolu değer null ile ezilmez) ve `aktiviteleriOku(db, bas: string, son: string): Promise<object[]>` (`date` aralığı, `start_ts` artan, `raw_json` hariç).
- `daily.date` ve `activities.id` `NOT NULL` olur; `gunUpsert` tarihsiz, `aktiviteUpsert` kimliksiz çağrıda `TypeError` fırlatır.

- [ ] **Step 1: Başarısız testleri yaz**

```js
test('ek sütunlar yazılır ve okunur', async () => { /* spo2_avg 96.5, sleep_deep_s 4200, hrv_status 'BALANCED', training_load 0 → aynen okunur */ });
test('gerçek sıfır korunur ve sıfır dolu değeri ezer', async () => { /* steps 0 → 0; sonra steps 5 üzerine steps 0 → 0 */ });
test('tarihsiz gunUpsert TypeError fırlatır ve satır eklemez', async () => {});
test('aktiviteUpsert aynı id ile tek satır tutar, null ile ezmez', async () => {});
test('aktiviteleriOku tarih aralığını kapsar, start_ts ile sıralar, raw_json döndürmez', async () => {});
test('kimliksiz aktiviteUpsert TypeError fırlatır', async () => {});
```

- [ ] **Step 2:** Run: `node --test "worker/test/db.test.mjs"` → FAIL.
- [ ] **Step 3:** `schema.sql` ve `db.js`'i genişlet. Sütun listeleri tek sabitte kalır.
- [ ] **Step 4:** Run: `node --test "worker/test/**/*.test.mjs"` → hepsi PASS.
- [ ] **Step 5:** `git commit -m "feat: ek sağlık ve aktivite sütunları"`

### Task 11: Ek ölçümler (Task 6'nın uzantısı)

**Files:**
- Modify: `worker/src/stats/baseline.js`, `worker/src/stats/ozet.js`, `worker/test/baseline.test.mjs`, `worker/test/ozet.test.mjs`

**Interfaces:**
- `OLCUMLER` her öğeye `kart: boolean` alır ve şöyle değişir/genişler:

  | id | ad | birim | iyi | kaynak | tabanSigma | varsayilan | agirlik | kart |
  |---|---|---|---|---|---|---|---|---|
  | yuk | Dünkü yük | `''` | -1 | training_load (bir önceki gün) | 25 | 40–150 | 0.05 | true |
  | derin | Derin uyku | `' dk'` | 1 | sleep_deep_s ÷ 60, yuvarlı | 10 | 50–110 | 0 | false |
  | spo2 | SpO₂ | `'%'` | 1 | spo2_avg | 1 | 94–99 | 0 | false |
  | solunum | Solunum | `'/dk'` | -1 | resp_avg | 0.6 | 12–17 | 0 | false |

  Diğer beş ölçüm (uyku, bb, hrv, nabiz, stres) aynen kalır, `kart: true`. `yuk` artık `intensity_minutes` değil `training_load` okur. Ağırlığı 0 olan ölçümler `enerji`'ye ve `gerekce`'ye girmez; bantları ve durumları hesaplanır.
- `apiYaniti`: `olcumler[]` öğelerine `kart` eklenir; `gunler[].d` dokuz ölçümü taşır; `gunler[]` öğelerine `ek` eklenir:
  ```js
  ek: { uyku: { derin, hafif, rem, uyanik, ihtiyac },   // dakika, yuvarlı; yoksa null
        bb: { dolan, biten },
        stres: { dinlenme, dusuk, orta, yuksek },         // dakika
        hrv: { durum, haftalik } }                        // durum: Garmin'in metni ya da null
  ```

- [ ] **Step 1: Başarısız testleri yaz**

```js
test('yuk bir önceki günün training_load değeridir', () => { /* 11 Kas training_load 180 → gunDegerleri(.., '2026-11-12').yuk === 180; intensity_minutes yok sayılır */ });
test('derin dakikaya çevrilir', () => { /* sleep_deep_s 4230 → derin 71 (4230/60 = 70.5 → 71) */ });
test('ağırlığı 0 olan ölçümler enerjiyi değiştirmez', () => { /* spo2 bant dışı olsa da enerji, o ölçüm null iken olanla aynı */ });
test('gerekçe kart olmayan ölçümleri saymaz', () => { /* yalnız spo2 bant dışı → "Bütün ölçümlerin normal aralığında." */ });
test('apiYaniti dokuz ölçüm, kart bayrağı ve ek alanı döner', () => { /* olcumler.length 9; kart true olan 6; gunler[27].ek.uyku.derin sayı; satır yoksa ek alanları null */ });
test('apiYanitinda NaN ve undefined yok (ek dahil)', () => {});
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** İki dosyayı genişlet. **Step 4:** Run: `node --test "worker/test/**/*.test.mjs"` → PASS.
- [ ] **Step 5:** `git commit -m "feat: derin uyku, SpO2, solunum ölçümleri ve günlük ek ayrıntılar"`

### Task 4, 5 ve 8'e ekler

- **Task 4:** `gunleriCikar` yalnız `{ dailysummaries, sleep, hrv }` alır (stress/steps/bodybattery uç noktaları kullanılmaz) ve yukarıdaki ek `daily` sütunlarını da doldurur (`training_load` hariç). `intensity_minutes = moderate + 2 × vigorous`. `aktiviteleriCikar` ek `activities` sütunlarını da doldurur. Alan yolları `docs/garmin-alanlar.md`'dedir.
- **Task 5:** Eşitleme dört uç nokta çağırır: dailysummaries, sleep, hrv, activities. Aktiviteler `aktiviteUpsert` ile yazılır. Çekilen aralıkta satırı olan her gün için `training_load` = o günün aktivitelerinin `training_load` toplamı (aktivite yoksa 0; aktiviteler uç noktası hata verdiyse o turda yazılmaz). Geçmiş parçası 28 gün.
- **Task 8:** Trend seçicisi dokuz ölçümü gösterir; Bugün yörüngesinde yalnız `kart: true` olan altı ölçüm durur. Trend'de seçili gün için ek ayrıntı satırı: uykuda evre çubuğu (derin / hafif / REM / uyanık, dakikalarıyla) ve "İhtiyaç: 8s 10dk"; Body Battery'de "+62 doldu, −64 bitti"; streste dağılım çubuğu (dinlenme / düşük / orta / yüksek); HRV'de "Haftalık ortalama 53 ms". Ayrıntı verisi null ise satır gösterilmez. Çubuklarda her dilim renk dışında etiketle de verilir.
