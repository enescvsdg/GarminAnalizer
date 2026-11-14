# GitHub Yayını ve PWA Kabuğu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uygulamayı herkese açık `GarminAnalizer` deposundan GitHub Pages'te yayınlamak ve iPhone'da ana ekrana eklenip uygulama gibi açılır hale getirmek.

**Architecture:** `prototip/` klasörü yayınlanan `uygulama/` klasörüne dönüşür: `index.html` + ayrı betik dosyaları, yerelde tutulan GSAP, manifest, simgeler ve sürümlü bir service worker. GitHub Actions her `main` gönderiminde `uygulama/` klasörünü, içine commit kimliğini sürüm olarak yazarak Pages'e yükler. Veri yine Cloudflare Worker'dan gelir; Worker'a dokunulmaz.

**Tech Stack:** Vanilla JS (derleme yok), service worker + web manifest, GitHub Pages (Actions), Node 24 `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-12-garmin-kocu-design.md` (Bölüm 2, 9, 9.1, 11, 15)

## Global Constraints

- Depo herkese açıktır: anahtar, parola, Worker adresi (`*.workers.dev` tam adı), ham sağlık verisi repoya girmez. `worker/.dev.vars` ve `kesif/ham/` okunmaz.
- Çerçeve, derleyici ve çalışma zamanı bağımlılığı eklenmez. Yayınlanan sayfa hiçbir üçüncü taraf betiği yüklemez (GSAP depoda tutulur); tek dış kaynak Google Fonts stil ve yazı dosyalarıdır.
- Sayfada satır içi betik olmaz; `Content-Security-Policy` meta etiketi `script-src 'self'` uygular. Cihaz anahtarı yalnız `localStorage`'da ve `X-Device-Key` başlığında bulunur.
- Bütün yollar görelidir (`./…`); uygulama `https://enescvsdg.github.io/GarminAnalizer/` alt yolunda ve `http://localhost:4173/` kökünde aynı çalışır.
- Service worker Worker API yanıtlarını önbelleğe ALMAZ. Kabuk dosyaları tek sürümlü önbellekte durur; eski HTML ile yeni betik asla karışmaz.
- Mevcut görünüm, animasyon, ses, dokunma ve düzen davranışı değişmez. Sapma renk dışında ok ve metinle verilir; sayılar tabular.
- Uygulama adı: `GarminAnalizer` (kullanıcı kararı); ana ekran kısa adı `Analizer`.
- Dışa açık adımlar (depo oluşturma, gönderme, Pages'i açma) yalnız kullanıcı onayıyla ve denetleyici tarafından yapılır; görev uygulayıcıları ağa çıkmaz, `git push` yapmaz.

## Review Focus

1. **Güncelleme sonrası eski önbellek.** Telefonda eski kabuk dururken yeni sürüm yayınlanır; kullanıcı uygulamayı açtığında ya eski sürümün tamamını ya yeninin tamamını görmeli, ikinci açılışta kesinlikle yeniyi. Eski HTML + yeni betik karışımı (kartların üst üste binmesi) olmamalı. (Task 3)
2. **Bağlantısız açılış.** Uçak modunda ya da zayıf ağda uygulama açılır; son görülen gerçek veriyi "çevrimdışı, son veri şu saatte" etiketiyle göstermeli; örnek veriyi gerçek gibi göstermemeli, boş ekran vermemeli. (Task 2)
3. **Örnek verinin gerçek sanılması.** Hiç bağlantı kurulmamışken ekrandaki sayılar örnek veridir; kullanıcı bunu ana ekranda görmeli ve Ayarlar'a yönlendirilmeli. (Task 2)
4. **Ana ekran uygulamasının ayrı deposu.** iPhone'da ana ekrana eklenen uygulamanın `localStorage`'ı Safari'ninkinden ayrıdır; kullanıcı bağlantıyı orada yeniden girer. Alanlar yapıştırmaya uygun olmalı, hata iletileri neyin yanlış olduğunu söylemeli (adres mi, anahtar mı). (Task 2)
5. **Alt yolda barındırma.** `/GarminAnalizer/` altında mutlak yol (`/sw.js`, `/veri.js`) 404 verir; service worker kapsamı ve manifest `start_url` alt yola göre olmalı. (Task 1, 3)

---

## Dosya yapısı

```
uygulama/                      # yayınlanan klasör (eski prototip/)
  index.html                   # eski uygulama.html; satır içi betik yok
  uygulama.js                  # eski satır içi modül betiği
  veri.js  ses.js  veri-canli.js  sesler.html  sesler.js
  kabuk.js                     # service worker kaydı ve güncelleme akışı
  sw.js                        # service worker
  manifest.webmanifest
  simge/  simge-180.png  simge-192.png  simge-512.png  simge-maske-512.png
  vendor/gsap.min.js           # GSAP 3.12.5 (depoda)
  *.test.mjs                   # yayınlanmaz (iş akışı dışarıda bırakır)
prototip-eski/                 # nabiz.html, arazi.html (yayınlanmaz)
tools/simge-uret.mjs           # PNG simgeleri üretir (bağımlılıksız)
.github/workflows/yayin.yml    # Pages'e yükleme
README.md
```

---

### Task 1: Yayın klasörü, ayrı betikler, yerel GSAP, CSP

**Files:**
- Move: `prototip/` → `uygulama/`; `uygulama.html` → `index.html`; `nabiz.html`, `arazi.html` → `prototip-eski/` (içlerindeki `veri.js` yolu `../uygulama/veri.js` olur)
- Create: `uygulama/uygulama.js`, `uygulama/sesler.js`, `uygulama/vendor/gsap.min.js`, `uygulama/yapi.test.mjs`
- Modify: `uygulama/index.html`, `uygulama/sesler.html`, `package.json` (test yolu `uygulama/**/*.test.mjs`), `.gitignore` (`.env*`, `.dev.vars*` eklenir)

**Interfaces:**
- Produces: `index.html` betikleri şu sırayla ve yalnız `src` ile yükler: `vendor/gsap.min.js`, `veri.js`, `ses.js`, `<script type="module" src="uygulama.js">`. `uygulama.js` içeriği eski satır içi modülün aynısıdır (davranış değişmez).

- [ ] **Step 1: Başarısız yapı testini yaz** (`uygulama/yapi.test.mjs`; dosyaları diskten okur)

```js
test('index.html ve sesler.html satır içi betik içermez', () => { /* /<script(?![^>]*\bsrc=)[^>]*>/ eşleşmez; on\w+= özniteliği yok */ });
test('betik kaynakları yalnız göreli yerel dosyalardır ve diskte vardır', () => { /* her <script src>: http ile başlamaz, / ile başlamaz, dosya mevcut */ });
test('CSP meta etiketi script-src self uygular', () => { /* content içinde "script-src 'self'" var; 'unsafe-inline' script-src içinde yok; "connect-src 'self' https://*.workers.dev http://localhost:*" var */ });
test('bütün yerel href/src yolları görelidir', () => { /* "/" ile başlayan yerel yol yok */ });
test('GSAP dosyası 3.12.5 sürümüdür', () => { /* vendor/gsap.min.js ilk 300 karakterde "3.12.5" geçer; boyut > 50 KB */ });
```

- [ ] **Step 2:** Run: `npm test` → yeni testler FAIL.
- [ ] **Step 3: Taşı ve ayır.** `git mv` ile taşı. Satır içi modülü `uygulama.js`'e, `sesler.html` betiğini `sesler.js`'e aynen çıkar. GSAP `vendor/gsap.min.js` olarak eklenir (denetleyici dosyayı kullanıcı onayıyla indirir: `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js`, ~72 KB; uygulayıcı indirmez, dosya yoksa BLOCKED bildirir). CSP meta: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.workers.dev http://localhost:*; base-uri 'none'; form-action 'none'`. `<title>` ve görünen ad `GarminAnalizer` olur. Dinamik `import('./veri-canli.js')` ve yedek `CANLI` aynen kalır.
- [ ] **Step 4:** Run: `npm test` → hepsi PASS (mevcut 247 + yeniler).
- [ ] **Step 5: Tarayıcıda doğrula** (uygulayıcı yapamazsa raporlar; denetleyici yapar): `python3 -m http.server 4173 --directory uygulama` ile 390×664: Bugün 6 kart, Trend 9 ölçüm, Ayarlar, ses seçimi sayfası açılır; konsolda CSP ihlali ve hata yok.
- [ ] **Step 6:** `git commit -m "refactor: yayın klasörü, ayrı betikler, yerel GSAP ve CSP"`

### Task 2: Son veri önbelleği, çevrimdışı ve örnek veri etiketleri

**Files:**
- Modify: `uygulama/veri-canli.js`, `uygulama/veri-canli.test.mjs`, `uygulama/uygulama.js`, `uygulama/index.html`

**Interfaces:**
- Consumes: `veriGetir`, `veriCevir`, `baglantiOku`, `baglantiSil` (mevcut).
- Produces (`veri-canli.js`):
  - `sonVeriYaz(yanit: object, simdiMs: number, depo?)` — `localStorage['gk-son-veri'] = {zaman, yanit}`; 400 KB'yi aşarsa yazmaz; hata fırlatmaz.
  - `sonVeriOku(depo?): {zaman: number, yanit: object} | null` — bozuk JSON ya da biçim → `null`.
  - `sonVeriSil(depo?)`.
  - `veriYukle(fetchFn?, depo?, simdiMs?): Promise<{veri: VERI|null, kaynak: 'canli'|'onbellek'|'yok', zaman: number|null, neden: 'ag'|'yetki'|'sunucu'|null}>` — bağlantı varsa ham yanıtı alır; başarıda `sonVeriYaz` + `kaynak:'canli'`; başarısızlıkta önbellek varsa `veriCevir(önbellek)` + `kaynak:'onbellek'`; yoksa `kaynak:'yok'`. `neden`: HTTP 401 → `'yetki'`, diğer HTTP → `'sunucu'`, ağ/zaman aşımı → `'ag'`. Asla fırlatmaz. Önbellekteki veri `veriCevir`'de patlarsa silinir ve `'yok'` döner.
  - `baglantiSil` çağrısı `sonVeriSil`'i de yapar (bağlantı kaldırılınca cihazda sağlık verisi kalmaz).
- Şerit metinleri (başlığın üstündeki mevcut şerit, simge + metin):
  - `kaynak:'onbellek'`, `neden:'ag'` → "Çevrimdışı. Son veri: 14 Kas 13:00."
  - `kaynak:'onbellek'`, `neden:'yetki'` → "Cihaz anahtarı kabul edilmedi. Son veri: 14 Kas 13:00."
  - `kaynak:'yok'`, `neden:'yetki'` → "Cihaz anahtarı kabul edilmedi. Ayarlar'dan yeniden gir."
  - `kaynak:'yok'`, diğer → "Bağlanılamadı. Örnek veri gösteriliyor."
  - Bağlantı hiç yok → "Örnek veri. Kendi verin için Ayarlar'dan bağlan." (dokununca Ayarlar açılır; düğme olarak işaretli, hedef ≥ 44 px)
- Ayarlar'daki bağlantı durumu satırı aynı ayrımı yapar ("Adres ya da ağ: bağlanılamadı" / "Cihaz anahtarı kabul edilmedi"). Görünen "Uydurma veri" ifadeleri "Örnek veri" olur.
- Önbellekten gösterilen veride "Yapay zekâ yorumu" etiketi ve uyarı şeritleri (key geçersiz, eski eşitleme) canlı veriyle aynı kurallarla çalışır; ayar anahtarı devre dışıdır.

- [ ] **Step 1: Başarısız testleri yaz** (`veri-canli.test.mjs`; girdi gerçek `apiYaniti`'den)

```js
test('veriYukle başarıda canli döner ve son veriyi yazar', async () => {});
test('veriYukle ağ hatasında önbellekten döner: kaynak onbellek, neden ag, zaman yazılan an', async () => {});
test('veriYukle 401de neden yetki; önbellek varsa onbellek, yoksa yok', async () => {});
test('veriYukle 500de neden sunucu', async () => {});
test('veriYukle bağlantı yokken fetch çağırmaz ve kaynak yok, neden null', async () => { /* çağrı sayısı 0 */ });
test('bozuk önbellek silinir ve kaynak yok döner', async () => { /* depo["gk-son-veri"] = "{" ve biçimi yanlış nesne */ });
test('sonVeriYaz 400 KB üstünü yazmaz, depo dolu hatasında fırlatmaz', () => {});
test('baglantiSil son veriyi de siler', () => {});
test('önbellekteki yanıt cihaz anahtarını içermez', () => { /* yazılan dizgide anahtar geçmez */ });
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** `veri-canli.js`'i genişlet (`veriGetir` ile ortak istek kodu `istekYap`'ta kalır; HTTP durumunu döndürecek şekilde genişlet, `veriGetir` davranışı değişmez). **Step 4:** Run → PASS.
- [ ] **Step 5: `uygulama.js` başlangıcını `veriYukle`'ye bağla** ve şerit metinlerini uygula; metinler `textContent` ile.
- [ ] **Step 6: Tarayıcıda doğrula:** bağlantısız açılışta "Örnek veri…" şeridi görünür ve Ayarlar'ı açar; sahte bir adresle "Bağlanılamadı. Örnek veri gösteriliyor."; 390×664'te şerit başlıkla üst üste binmez.
- [ ] **Step 7:** `git commit -m "feat: son veri önbelleği, çevrimdışı ve örnek veri etiketleri"`

### Task 3: Manifest, simgeler, service worker

**Files:**
- Create: `uygulama/manifest.webmanifest`, `uygulama/sw.js`, `uygulama/kabuk.js`, `uygulama/simge/*.png`, `tools/simge-uret.mjs`, `tools/simge-uret.test.mjs`, `uygulama/kabuk.test.mjs`
- Modify: `uygulama/index.html` (manifest, `apple-touch-icon`, `kabuk.js` betiği), `package.json` (`"simge": "node tools/simge-uret.mjs"`)

**Interfaces:**
- `tools/simge-uret.mjs`: `pngYaz(genislik, yukseklik, pikselFn): Buffer` (RGBA, `node:zlib` ile, bağımlılıksız) ve `simgeCiz(boyut, {maske}): Buffer` — koyu zemin `#0c0812`, ortada sıcak renkli (şeftali → mor) ışıyan yuvarlak şekil; `maske:true` iken şekil güvenli alanın (%80) içinde kalır, zemin kenara kadar doludur. Çalıştırınca dört dosyayı yazar: 180, 192, 512, maske-512.
- `manifest.webmanifest`: `name "GarminAnalizer"`, `short_name "Analizer"`, `lang "tr"`, `start_url "./"`, `scope "./"`, `display "standalone"`, `orientation "portrait"`, `background_color "#0c0812"`, `theme_color "#0c0812"`, simgeler 192, 512 ve `purpose: "maskable"` 512.
- `sw.js`: en üstte `const SURUM = '__SURUM__';` ve `const KABUK = [ './', './index.html', './uygulama.js', … ]` (yayınlanan bütün yerel dosyalar).
  - `install`: `kabuk-<SURUM>` önbelleğine `KABUK`'un tamamı `cache: 'reload'` ile eklenir; biri bile başarısızsa kurulum başarısız olur (yarım önbellek olmaz). `skipWaiting` çağrılır.
  - `activate`: adı `kabuk-` ile başlayıp güncel olmayan önbellekler silinir; `clients.claim()`.
  - `fetch`: yalnız aynı kökenli `GET`. Gezinme isteği → önbellekteki `./index.html`; diğerleri → `ignoreSearch` ile önbellek, yoksa ağ. Köken dışı istekler (Worker API, Google Fonts) SW tarafından HİÇ yanıtlanmaz (`respondWith` çağrılmaz).
- `kabuk.js`: `navigator.serviceWorker` varsa `./sw.js`'i `{scope: './'}` ile kaydeder; `controllerchange` olduğunda ve sayfa açılırken zaten bir denetleyici VARDIYSA (yani bu bir güncellemeyse) sayfayı bir kez yeniler (`sessionStorage['gk-yenilendi']` ile döngü koruması). İlk kurulumda yenileme olmaz. Ayrıca etkin service worker'a `{tur:'surum'}` iletisi gönderir; `sw.js` `SURUM` ile yanıtlar ve `kabuk.js` bunu Ayarlar panelinin en altındaki `#surum` satırına `Sürüm: <SURUM>` olarak yazar (SW yoksa satır gizli).

- [ ] **Step 1: Başarısız testleri yaz**

```js
// tools/simge-uret.test.mjs
test('pngYaz geçerli PNG üretir', () => { /* imza 89 50 4E 47; IHDR genişlik/yükseklik doğru; zlib ile açılınca boyut = h*(1+w*4) */ });
test('simgeCiz köşe pikseli zemin rengidir, merkez değildir', () => {});
test('maske simgesinde şekil %80 güvenli alanın dışına taşmaz', () => { /* güvenli alan dışındaki bütün pikseller zemin rengi */ });

// uygulama/kabuk.test.mjs  (dosyaları diskten okur)
test('KABUK listesindeki her dosya diskte vardır', () => {});
test('index.html ve sesler.html içindeki her yerel src/href KABUK listesindedir', () => { /* betik, manifest, simge; test dosyaları hariç */ });
test('uygulama.js ve diğer betiklerin import ettiği yerel modüller KABUK listesindedir', () => { /* ./veri-canli.js */ });
test('manifest geçerlidir ve simge dosyaları bildirilen boyuttadır', () => { /* PNG IHDR okunur; start_url ve scope "./" */ });
test('sw.js köken dışı isteği yanıtlamaz, POST/PUT isteğini yanıtlamaz', () => { /* sw.js sahte self/caches ortamında (node:vm) çalıştırılır; fetch olayı: workers.dev → respondWith çağrılmaz; aynı köken GET → çağrılır */ });
test('surum iletisine SURUM ile yanıt verir', async () => {});
test('install bir dosya eksikse reddeder; activate eski kabuk-* önbelleklerini siler, başkalarına dokunmaz', async () => { /* sahte caches */ });
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Dosyaları yaz; `npm run simge` ile simgeleri üret ve commit et. **Step 4:** Run → PASS.
- [ ] **Step 5: Tarayıcıda doğrula** (`localhost:4173`): Application panelinde manifest hatasız, SW etkin; çevrimdışına alınca sayfa açılır ve "Çevrimdışı…" ya da "Örnek veri…" şeridi görünür; `sw.js`'te `SURUM` elle değiştirilip yenilenince sayfa bir kez kendiliğinden yenilenir ve eski önbellek silinir.
- [ ] **Step 6:** `git commit -m "feat: manifest, simgeler ve sürümlü service worker"`

### Task 4: Yayın iş akışı ve README

**Files:**
- Create: `.github/workflows/yayin.yml`, `README.md`, `tools/yayin-hazirla.mjs`, `tools/yayin-hazirla.test.mjs`
- Modify: `package.json` (`"yayin-hazirla": "node tools/yayin-hazirla.mjs"`)

**Interfaces:**
- `tools/yayin-hazirla.mjs`: `yayinHazirla({kaynak, hedef, surum}): {dosyalar: string[]}` — `kaynak` (`uygulama/`) içeriğini `hedef`'e kopyalar; `*.test.mjs` dosyalarını atlar; `sw.js` içindeki `__SURUM__` yer tutucusunu `surum` ile değiştirir; yer tutucu bulunamazsa ya da `surum` boşsa hata fırlatır. CLI: `node tools/yayin-hazirla.mjs <hedef> <surum>`.
- `yayin.yml`: `on: push: branches [main]` ve `workflow_dispatch`; `permissions: contents: read, pages: write, id-token: write`; `concurrency: pages`. Adımlar: checkout → setup-node 24 → `npm test` (bağımlılık kurmadan; testler yalnız Node kullanır) → `node tools/yayin-hazirla.mjs _site "${GITHUB_SHA::12}"` → `actions/upload-pages-artifact` (`path: _site`) → `actions/deploy-pages`. Eylemler ana sürüm etiketiyle sabitlenir.
- `README.md` (Türkçe): ne olduğu (kişisel, tek kullanıcılı), "Garmin ile bağlantısı ve onayı yoktur; Garmin, Garmin Ltd.'nin markasıdır" notu, mimari özeti, kendi kopyanı kurma adımları (Worker, D1, secret adları, cihaz anahtarı üretimi), gizlilik (Gemini'ye giden veri, kapatma anahtarı), test komutu. Gerçek Worker adresi ve hiçbir gizli değer yazılmaz.

- [ ] **Step 1: Başarısız testleri yaz**

```js
test('yayinHazirla test dosyalarını kopyalamaz, diğerlerini kopyalar', () => { /* geçici klasör */ });
test('yayinHazirla sw.js içindeki sürümü yazar ve yer tutucu kalmaz', () => {});
test('yer tutucu yoksa ya da sürüm boşsa hata fırlatır', () => {});
test('yayın çıktısındaki sw.js KABUK listesi çıktıda eksiksiz bulunur', () => { /* gerçek uygulama/ üzerinde */ });
test('yayin.yml npm test çalıştırır ve yalnız _site yükler', () => { /* dosya metninde "npm test", "path: _site"; "worker" ya da "kesif" yolu yüklenmez */ });
test('README gizli değer ve workers.dev tam adı içermez', () => { /* /[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/ eşleşmez */ });
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Yaz. **Step 4:** Run → PASS.
- [ ] **Step 5:** `git commit -m "feat: GitHub Pages yayın iş akışı ve README"`

### Task 5: Yayınlama (denetleyici, kullanıcı onayıyla)

- [ ] **Step 1 (kullanıcı kararı):** commit yazarı. Şu an bütün commit'lerde gerçek ad ve e-posta var; gönderilince herkese açık olur. Seçenek: ilk gönderimden önce yazarı GitHub'ın gizli (`noreply`) adresine çevirmek.
- [ ] **Step 2 (onayla):** `gh repo create GarminAnalizer --public --source . --remote origin --push`
- [ ] **Step 3 (onayla):** Pages'i Actions kaynağıyla aç: `gh api -X POST repos/{owner}/GarminAnalizer/pages -f build_type=workflow`; iş akışının bitmesini bekle.
- [ ] **Step 4: Canlıda doğrula:** `https://enescvsdg.github.io/GarminAnalizer/` 200; `sw.js` içinde `__SURUM__` kalmamış; `manifest.webmanifest` ve simgeler 200; `*.test.mjs` 404; Worker'ın `IZINLI_ORIGIN` listesi bu kökeni içeriyor (ön istek 204 + `Access-Control-Allow-Origin`).
- [ ] **Step 5 (kullanıcı, iPhone):** Safari'de adresi aç → Paylaş → Ana Ekrana Ekle → uygulamayı aç → Ayarlar'da Worker adresi ve cihaz anahtarını gir → gerçek veri görünür; uçak modunda yeniden aç → "Çevrimdışı. Son veri: …" şeridiyle son veri görünür.
- [ ] **Step 6:** Küçük bir değişiklik gönder (README) → telefonda uygulamayı iki kez aç → yeni sürüm gelmiş (Ayarlar'da sürüm satırı; Task 3'te `kabuk.js` sürümü Ayarlar'ın altına yazar).
- [ ] **Step 7:** Spec Bölüm 15'te yayın adımını tamamlandı işaretle; `docs/garmin-alanlar.md`'ye yayın adresini YAZMA (depo herkese açık; adres zaten depo adından türetilebilir, Worker adresi yazılmaz). Commit ve gönder.
