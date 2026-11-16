# Trend: Çark, Açıklama, Canlı Simge, Eğilim Yorumu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trend ekranına çark hissinde gün gezinmesi, ölçüm açıklamaları, veriye bağlı canlı simgeler ve özetle çalışan yapay zekâ eğilim yorumu eklemek; masaüstü düzeniyle birlikte yayınlamak.

**Architecture:** Gezinme ve yerleşim hesapları saf işlevler olarak `uygulama/duzen.js`'te, açıklama metinleri `uygulama/aciklama.js`'te, simgeler `uygulama/simgeler.js`'te durur; `uygulama.js` yalnız bağlar. Eğilim yorumu Worker'da bugünkü hüküm yorumunun yanında ayrı bir modüldür (`worker/src/yorum/egilim.js`), `/api/gunler` yanıtına eklenir.

**Tech Stack:** Vanilla JS (derleme yok), GSAP 3.12.5 çekirdek, Cloudflare Worker + D1, Gemini Interactions API, Node 24 `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-12-garmin-kocu-design.md` (Bölüm 9.1, 9.2, 9.3, 11)

## Global Constraints

- Dal `masaustu`; `main`'e gönderim otomatik yayındır, yalnız kullanıcı onayıyla ve denetleyici tarafından yapılır. Uygulayıcılar push/merge yapmaz, wrangler çalıştırmaz, ağa çıkmaz (kendi localhost sunucuları hariç), kullanıcının Chrome'una dokunmaz.
- `worker/.dev.vars` ve `kesif/ham/` okunmaz. Gizli değer, Worker adresi, sağlık verisi repoya girmez.
- Telefon ve çerçeve modunun mevcut davranışı, bu planın açıkça değiştirdiği yerler dışında aynı kalır.
- Sayfada satır içi betik yok (CSP `script-src 'self'`); bütün yollar göreli; yeni yerel modüller `sw.js` `KABUK` listesine eklenir; yeni bağımlılık/CDN yok.
- API ve Gemini'den gelen metinler yalnız `textContent` ile eklenir. Sapma renk dışında ok ve metinle verilir; sayılar tabular; `prefers-reduced-motion` altında döngüsel hareket yok.
- Gemini'ye eğilim için giden veri yalnız özet sayılardır: tarih, haftanın günü, gün gün değer, ad, aktivite GİTMEZ; istek `store:false`; "Yapay zekâ yorumu" kapalıyken istek gitmez; günlük toplam istek sınırı (`GUNLUK_SINIR`) bugünkü hükümle ORTAKTIR.
- Eksik veri `null`'dır; hiçbir yerde `NaN`, `undefined`, sahte `0` görünmez.

## Review Focus

1. **Dokunmatik yüzey ve fare tekerleği farkı.** Tekerlek çentik çentik, dokunmatik yüzey yüzlerce küçük olay gönderir; ikisinde de bir çentik/kısa kaydırma tek gün olmalı, uzun kaydırma günleri sırayla geçmeli, grafik asla 28 günü bir anda atlamamalı ve sayfanın kendisi kaymamalı. (Task 1)
2. **Simge ve günün uyuşmazlığı.** Kullanıcı günleri hızla çevirirken simge, balondaki değerle aynı günü göstermeli; veri olmayan günde "boş" durumuna geçmeli, önceki günün değerinde kalmamalı. (Task 2)
3. **Eski eğilim yorumu.** Veri değiştiyse (yeni gün, yeni eşitleme) dünkü yorum bugünün grafiğinin üstünde durmamalı; yorum yoksa 28 günlük özet cümlesi görünmeli, boşluk kalmamalı. (Task 3, 4)
4. **Yapay zekânın uydurduğu sayı ya da tıbbi iddia.** Yorum girdide olmayan bir sayı, teşhis, ilaç ya da hastalık adı içeriyorsa gösterilmemeli. (Task 3)
5. **Açıklama kartı küçük ekranda.** 390×664'te kart grafiğin, seçicinin ve alt çubuğun üstüne binmeden açılıp kapanmalı; Esc ve dışına dokunma kapatmalı; odak geri dönmeli. (Task 2)

---

### Task 1: Çark gezinmesi

**Files:**
- Modify: `uygulama/duzen.js`, `uygulama/duzen.test.mjs`, `uygulama/uygulama.js`, `uygulama/index.html` (ipucu metni, gerekirse stil)

**Interfaces:**
- Produces (`duzen.js`, saf):
  - `carkBirikim(olay: {deltaX, deltaY, deltaMode}, birikim: number): {adim: number, birikim: number}` — baskın ekseni alır (yatay kaydırma da geçerli); `deltaMode` 1 (satır) → her satır 1 çentik, 0 (piksel) → 50 piksel 1 çentik, 2 (sayfa) → 3 çentik; `adim` tam sayı (pozitif = ileri/sonraki gün), artan kısmı `birikim` olarak döner; tek olayda en çok ±3 gün; sonlu olmayan girdi → `{adim: 0, birikim: 0}`.
  - `carkSure(uzaklik: number): number` — hedef güne kayma süresi (sn): 1 gün 0.32, her ek gün +0.09, en çok 0.9.
  - `carkHedef(gun: number, adim: number, gunSayisi: number): number` — 0..gunSayisi-1 arasına sıkıştırır.
- Davranış (`uygulama.js`):
  - **Geniş ekran:** grafikte `pointermove` artık günü DEĞİŞTİRMEZ (fareyi izleyen imleç, `#sabit` noktalı işaret ve `pointerleave` dönüşü kaldırılır). `wheel` (grafik bölgesinde, `{passive:false}`, `preventDefault`) → `carkBirikim` → hedef gün `carkHedef`; kayma `carkSure` ile, `power3.out`; üst üste gelen çentikler hedefi biriktirir (çark hızlanır, sonra yavaşlayarak durur). İmleç bir günün ÜZERİNDEN GEÇERKEN (yuvarlanmış gün değişince) `SES.tik()`; hedefe oturunca mevcut oturma sesi. Tıklama: tıklanan güne `carkSure` ile gider. Klavye ←/→/Home/End aynı kaymayı kullanır.
  - **Telefon/çerçeve:** sürükleme mekaniği aynı kalır; bırakınca en yakın güne oturma süresi `carkSure` ile hesaplanır ve gün değiştikçe mevcut ses/titreşim korunur. `wheel` desteği (mevcutsa) `carkBirikim` kullanır.
  - Geniş ekran ipucu metni: "Tekerlekle gez, bir güne tıkla · ← → gün · ↑ ↓ ya da 1–9 ölçüm".
  - Dokunmatik cihazda geniş mod (iPad): dokunma ile tıklama gün seçer; yatay sürükleme telefon gibi çalışmaz (yalnız tıklama) — ipucu `(hover: none)` iken "Bir güne dokun" olur.

- [ ] **Step 1: Başarısız testleri yaz** (`duzen.test.mjs`)

```js
test('carkBirikim: 50 piksel ya da bir satır = bir gün', () => { /* {deltaY:50, deltaMode:0} → adim 1, birikim 0; {deltaY:100, deltaMode:0} → adim 2; {deltaY:1, deltaMode:1} → 1; {deltaY:-1, deltaMode:1} → -1 */ });
test('carkBirikim: dokunmatik yüzeyin küçük olayları birikir', () => { /* 10 kez {deltaY:6} → toplam adim 1, birikim 10 */ });
test('carkBirikim: yatay kaydırma baskınsa o kullanılır; tek olayda en çok ±3', () => { /* {deltaX:400,deltaY:5} → 3; {deltaY:-9999} → -3 */ });
test('carkBirikim: sonlu olmayan girdi sıfırlar', () => { /* NaN, Infinity, eksik alan */ });
test('carkBirikim: yön değişince birikim işareti doğru taşınır', () => { /* +30 sonra -40 → adim 0, birikim -10 */ });
test('carkSure: 1 gün 0.32, 2 gün 0.41, 27 gün 0.9 (üst sınır), 0 gün 0', () => {});
test('carkHedef: sınırlar', () => { /* (0,-1,28) → 0; (27,3,28) → 27; (5,2,28) → 7 */ });
```

- [ ] **Step 2:** Run: `npm test` → FAIL. **Step 3:** `duzen.js` ve `uygulama.js`'i yaz. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Tarayıcıda doğrula** (yerleşik tarayıcı; 1440×900 ve 390×664): fare gezdirince gün değişmiyor; `WheelEvent` ile tek çentik = bir gün, ardışık 5 çentik 5 gün ve yumuşak duruş; sayfa kaymıyor; tıklama; klavye; telefon sürüklemesi çalışıyor; konsol temiz, NaN yok.
- [ ] **Step 6:** `git commit -m "feat: Trend'de çark gezinmesi (tekerlek, tıklama, klavye)"`

### Task 2: Ölçüm açıklamaları ve canlı simgelerin yerleşimi

**Önkoşul:** kullanıcı simge önizlemesini onayladı (`prototip-eski/simge/`).

**Files:**
- Create: `uygulama/aciklama.js`, `uygulama/aciklama.test.mjs`, `uygulama/simgeler.js` (önizlemeden taşınır), `uygulama/simgeler.test.mjs`
- Modify: `uygulama/uygulama.js`, `uygulama/index.html`, `uygulama/sw.js` (KABUK), `uygulama/duzen.js` + test (simge oranı)

**Interfaces:**
- `aciklama.js`: `ACIKLAMA: { [olcumId]: { soru: string, metin: string, yon: string } }` — dokuz ölçüm; `soru` ör. "Uyku skoru nedir?", `metin` 2–3 cümle (≤ 260 karakter) ne ölçtüğü, `yon` tek cümle ("Yüksek olması iyidir." / "Düşük olması iyidir." / bağlama göre). Tıbbi teşhis ya da tavsiye yok; "Garmin'in hesapladığı" gibi kaynak belirtilebilir.
- `duzen.js`: `simgeOrani(olcumId, deger, bant: {min,max}): number|null` — değeri simgenin 0..1 ana değişkenine çevirir (uyku, bb, stres, spo2: ölçeğin doğal aralığı; hrv, nabiz, solunum, derin, yuk: bandın etrafında genişletilmiş aralık); `null`/sonlu olmayan → `null`; sonuç 0..1'e sıkıştırılır.
- `uygulama.js`: Trend başlığının solunda simge (`simgeKur`), ölçüm ya da gün değişince `guncelle({oran, durum, ham})`; Trend görünür değilken `durdur()`. Simge bir `<button>` içindedir (`aria-label="<ölçüm adı> nedir?"`, `aria-expanded`).
  - **Telefon/çerçeve:** düğmeye dokununca başlığın altında açıklama kartı açılır (`role="dialog"` değil, `aria-controls` ile bağlı bölge; Esc, dışına dokunma ve yeniden dokunma kapatır; odak düğmeye döner; ölçüm değişince kapanır). Kart grafiğin üstünde katman olarak durur, düzeni itmez.
  - **Geniş ekran:** açıklama grafiğin altındaki boş alanda (gün ayrıntısı satırının yanında/altında) her zaman açık; düğme yine odaklanabilir ama aç/kapa yapmaz (`aria-expanded` yok).
- Bugün kartlarında simge YOK (yalnız Trend başlığı).

- [ ] **Step 1: Başarısız testleri yaz**

```js
// aciklama.test.mjs
test('dokuz ölçümün hepsinin açıklaması var ve OLCUMLER kimlikleriyle eşleşir', () => { /* veri.js ve worker baseline OLCUMLER id kümesi */ });
test('metinler sınırlar içinde ve yasak içerik yok', () => { /* soru ≤ 40, metin 60..260, yon ≤ 80; "<" ">" "http" yok; "teşhis", "tedavi", "ilaç", "hastalık" geçmez */ });
// duzen.test.mjs
test('simgeOrani: null ve sonlu olmayan → null; sonuç 0..1', () => {});
test('simgeOrani: uyku 0→0, 100→1; bandın ortası ~0.5 olan ölçümler', () => {});
// simgeler.test.mjs (sahte DOM ile: node:vm ya da küçük sahte document)
test('dokuz kimlik için simgeKur svg üretir, kimlikler örnekler arasında çakışmaz', () => {});
test('guncelle null durumda hata vermez; yokEt düğümleri kaldırır ve tween bırakmaz', () => {});
test('bilinmeyen ölçüm kimliği hata fırlatmaz, boş simge döner', () => {});
// kabuk.test.mjs mevcut testleri yeni dosyaları KABUK'ta arar (ek test gerekmez)
```

- [ ] **Step 2:** FAIL. **Step 3:** yaz. **Step 4:** PASS.
- [ ] **Step 5: Tarayıcıda doğrula** (390×664, 1440×900): simge başlıkta, gün çevirince değişiyor, veri yok gününde boş durum; kart açılıp kapanıyor, hiçbir şeyin üstüne taşmıyor; az hareket modunda durağan.
- [ ] **Step 6:** `git commit -m "feat: ölçüm açıklamaları ve Trend başlığında canlı simgeler"`

### Task 3: Worker — eğilim yorumu

**Files:**
- Create: `worker/src/yorum/egilim.js`, `worker/test/egilim.test.mjs`
- Modify: `worker/src/api/router.js`, `worker/src/worker.js`, `worker/src/yorum/yorum.js` (yalnız ortak yardımcıları dışa aktarmak için), `worker/test/router.test.mjs`

**Interfaces:**
- Consumes: `geminiYaz`, `yorumGecerli` kuralları (yasak karakter kümesi `YASAK`), `sayilarGirdiden`, `yapayZekaAcik`, günlük sayaç (`yorum_sayac`, `GUNLUK_SINIR`), `OLCUMLER`, `bant`, `gunDegerleri`, `durumOku/durumYaz`.
- Produces (`egilim.js`):
  - `egilimOzeti(satirlar, bugun): Promise<{metin: string, karma: string, olcumler: string[]} | null>` — her ölçüm için tek satır: ad; "28 günde N gün veri"; ortalama; normal aralık (kişisel değilse "genel aralık"); normal dışı gün sayısı (altında / üstünde ayrı); "son 7 gün ortalaması X, önceki 21 gün Y" ve yön ("yükseldi" / "düştü" / "aynı", eşik: bandın genişliğinin %10'u); yüksek mi düşük mü iyi. En az 10 günü dolu olmayan ölçüm satıra girmez; hiç ölçüm yoksa `null`. Tarih, gün adı, gün gün değer İÇERMEZ. Sayılar 1 ondalığa yuvarlanır (karma kararlı olsun).
  - `EGILIM_SISTEM` (sabit): Türkçe, "sen"; her ölçüm için 1–2 cümle, en çok 200 karakter; yalnız verilen sayılar; neden uydurma, teşhis, ilaç, hastalık adı, emoji yok; öneri en çok genel yaşam düzeyi ("uyku saatini erkene almayı dene").
  - Şema: `{type:'object', properties:{ yorumlar:{ type:'array', items:{ type:'object', properties:{ id:{type:'string'}, metin:{type:'string'} }, required:['id','metin'] } } }, required:['yorumlar']}`.
  - `egilimGecerli(ham, ozet): {[id]: string}` — yalnız özetteki `olcumler` kimlikleri; her metin `YASAK` kuralından ve `sayilarGirdiden(metin, ozet.metin)`'den geçer, ≤ 240 karakter, boş değil; yasak kelimeler (`teşhis`, `tanı`, `ilaç`, `hastalık`, `tedavi`, `doktor` hariç değil — "doktora danış" da reddedilir) → o ölçüm atılır. Geçen yoksa `{}`.
  - `egilimGuncelle({db, satirlar, bugun, simdiMs, yaz}): Promise<{durum: 'kapali'|'veri-yok'|'ayni'|'sinir'|'hata'|'yazildi'}>` — `yorumGuncelle` ile aynı durum makinesi; kayıt `sync_state['egilim'] = {tarih, karma, yorumlar, uretildi}`; hata sayacı `egilim_hata`; günlük sayaç `yorum_sayac` ORTAK (istekten önce artar); aynı gün ve karma → `ayni`. Ek kural: günde en çok 2 başarılı eğilim yazımı (`egilim_gun = {tarih, n}`) — gün içi küçük değişimler her saat yeni istek doğurmasın.
  - `egilimOku(db, bugun, satirlar): Promise<{[id]: string} | null>` — ayar açık, kayıt bugüne ait VE (karma güncel YA DA kayıt bugün üretilmiş) ise yorumlar (yeniden `egilimGecerli`'den geçirilerek); aksi `null`. (Karma gün içinde değişse de bugünün yorumu gösterilir; ertesi gün gösterilmez.)
- `router.js`: `/api/gunler` yanıtına `egilim: {[id]: string} | null` eklenir. Başka alan değişmez.
- `worker.js`: bugünkü hüküm yorumu adımından SONRA, aynı koşullarla `egilimGuncelle`; biri diğerinin hatasından etkilenmez; log `egilim: <durum>`.

- [ ] **Step 1: Başarısız testleri yaz** (`egilim.test.mjs`, `router.test.mjs` ekleri)

```js
test('egilimOzeti gizlilik: tarih, gün adı, gün gün dizi yok', () => { /* metinde /20\d\d/, "-11-", gün adları, 28 ardışık değer yok */ });
test('egilimOzeti: son 7 / önceki 21 yönü ve eşik', () => { /* yükseldi, düştü, aynı */ });
test('egilimOzeti: 10 günden az verili ölçüm girmez; hepsi azsa null', () => {});
test('egilimOzeti: aynı veri aynı karma; bir değer değişince farklı', () => {});
test('egilimGecerli: bilinmeyen id, yasak kelime, girdide olmayan sayı, uzun metin atılır; geçerli kalır', () => {});
test('egilimGuncelle: kapali/veri-yok/ayni/sinir/hata/yazildi ve çağrı sayıları tam', () => {});
test('egilimGuncelle günlük sayaç yorumGuncelle ile ortaktır', () => { /* sayaç 24 iken sinir, 0 çağrı */ });
test('egilimGuncelle günde en çok 2 başarılı yazım', () => {});
test('egilimOku: dünkü kayıt null; bugünkü kayıt karma değişse de döner; kapalıyken null', () => {});
test('/api/gunler egilim alanı: kayıt varken nesne, yokken null; diğer alanlar aynen', () => { /* deepEqual, egilim hariç */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** yaz. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git commit -m "feat: Gemini ile ölçüm eğilim yorumları"`

### Task 4: Arayüz — eğilim yorumu

**Files:**
- Modify: `uygulama/veri-canli.js`, `uygulama/veri-canli.test.mjs`, `uygulama/uygulama.js`, `uygulama/index.html`

**Interfaces:**
- `veriCevir`: `VERI.meta.egilim = {[id]: string}` — yanıttaki `egilim` nesnesinden yalnız dizgi değerli, bilinen ölçüm kimlikli girdiler; yoksa `{}`.
- Trend: seçili ölçümün yorumu varsa başlığın altındaki özet cümlesinin YERİNE yorum ve altında "Yapay zekâ yorumu" etiketi (Bugün'deki etiketle aynı stil); yoksa mevcut 28 günlük özet cümlesi. Geniş ekranda ikisi birlikte gösterilebilir (özet cümlesi + yorum). Metin `textContent`. Başlık yüksekliği ölçümü (`yerlesimT`) yorum uzunluğuna göre yeniden yapılır; 390×664'te üç satıra kadar yorum grafikle çakışmaz, daha uzunu `…` ile kesilmez — grafik alanı küçülür (en az 90 birim kuralı korunur).
- Önbellekten gelen veride de gösterilir (yanıtın parçası).

- [ ] **Step 1: Başarısız testleri yaz**

```js
test('veriCevir egilim: nesne aktarılır, bilinmeyen kimlik ve dizgi olmayan değer atılır, alan yoksa {}', () => {});
```

- [ ] **Step 2:** FAIL. **Step 3:** yaz. **Step 4:** PASS.
- [ ] **Step 5: Tarayıcıda doğrula** sahte yanıtla (390×664, 1440×900): yorumlu ve yorumsuz ölçüm, uzun yorum, ölçüm değiştirme, çakışma yok.
- [ ] **Step 6:** `git commit -m "feat: Trend'de yapay zekâ eğilim yorumu"`

### Task 5: Son denetim ve yayın (denetleyici, kullanıcı onayıyla)

- [ ] Bütün dalın son denetimi (telefon regresyonu, gizlilik, CSP, KABUK).
- [ ] Kullanıcı onayı → `npx wrangler deploy` (Worker) → canlıda `egilim: yazildi` logu → `main`'e birleştir ve gönder → Pages iş akışı → canlı sitede doğrulama (sürüm satırı, masaüstü ve telefon).
- [ ] README ve spec Bölüm 11'e Gemini'ye giden eğilim özeti eklenir.
