# Garmin Koçu — Tasarım (Faz 1 + 2)

Tarih: 2026-11-12, güncelleme 2026-11-13 · Durum: **taslak, kullanıcı onayı bekliyor**

Depo: `GarminAnalizer` (GitHub, herkese açık). Bu doküman da herkese açık olacağı için kişisel bilgi ve key ayrıntısı içermez.

## 1. Amaç

Tek kullanıcılık kişisel bir uygulama. Garmin Connect verilerini
(Personal API) düzenli çekip biriktirir, kişinin **kendi normaline** göre
yorumlar ve her sabah telefona kısa bir brifing bildirimi gönderir. Telefonda
Safari'den ana ekrana eklenen bir PWA olarak çalışır.

Garmin Connect verileri ayrı kutular halinde gösterir ve birbirine bağlamaz.
Bu uygulamanın değeri: metrikleri birleştirmek, kişisel baz çizgiyle
kıyaslamak, geçmişi kendi veritabanında tutmak.

### Başarı ölçütleri
1. Her sabah (ayarlanan saatte, veri geldiyse) telefona bildirim gelir: günün hükmü (tek cümle) ve iki cümlelik gerekçe.
2. Dinlenme nabzı/HRV/uyku/stres kişisel normalinden 2 gün üst üste sapınca ayrı uyarı gelir.
3. Uygulamayı açınca bugünün sayıları ve normale göre sapma, bir ölçüme dokununca o ölçümün 28 günlük trendi görünür.
4. Garmin ve Gemini key'leri hiçbir zaman tarayıcıya/repoya girmez.
5. Gemini veya Garmin geçici çökse bile bildirim kaçmaz (yedek metin).

### Kapsam dışı (sonraki fazlar, ayrı spec)
Neden-sonuç/korelasyon analizi, antrenman verimlilik analizi, "verine sor"
sohbeti, davranış notları (kafein/alkol), Fittakip ile veri birleştirme,
çok kullanıcılı kullanım. Faz 1-2 bunlara zemin hazırlar (ham veri saklanır,
veri katmanı değiştirilebilir) ama hiçbirini içermez.

## 2. Referans ve kısıtlar

- Çalışma mantığı referansı: mevcut Fittakip projesi (GitHub Pages'te vanilla
  JS PWA + Cloudflare Worker: cron, KV, VAPID web push, secret'lar, `DEVICE_KEY`).
  Fittakip koduna dokunulmaz, bu proje **ayrı repo ve ayrı Worker**.
- Garmin Connect Personal API yalnızca kişisel kullanım içindir, çok kullanıcılı
  ticari uygulama için değildir (Garmin SSS). Uygulama bu sınırın içinde kalır.
- iOS'ta web push yalnızca ana ekrana eklenmiş PWA'da çalışır (iOS 16.4+).
- PWA, herkese açık GitHub Pages'te durur; bu yüzden **repoya hiçbir gerçek sağlık
  verisi veya key girmez**.

## 3. Mimari

```
Garmin Connect Personal API
   ▲  (Bearer token, 24 saat)
   │
Cloudflare Worker  ── cron (15 dk'da bir uyanır, işi zamanı gelmişse yapar)
   ├─ sync:    Garmin → D1 (upsert)
   ├─ stats:   baz çizgi, sapma, yük  (düz kod)
   ├─ brief:   sayılar → Gemini → metin  (yedek: şablon metin)
   ├─ push:    web push (VAPID)
   └─ API:     PWA'nın okuduğu uç noktalar (DEVICE_KEY ile korumalı)
D1 (SQLite)
PWA (GitHub Pages) ◄── fetch ── Worker API
```

Parçalar tek amaçlı ve bağımsız test edilebilir olmalı:

| Birim | Ne yapar | Bağımlılık |
|---|---|---|
| `garmin/client` | Token alma/saklama, veri GET'leri | `fetch`, secret |
| `garmin/sync` | Tarih aralığı çek, D1'e upsert, ilk geçmiş doldurma | client, D1 |
| `stats/` | Baz çizgi, sapma, yük hesapları (saf fonksiyonlar) | yok |
| `brief/` | Sayılardan Gemini istemi, yanıt doğrulama, yedek şablon | gemini istemcisi |
| `push/` | VAPID imzalama, abonelik yönetimi | `crypto` |
| `api/` | PWA uç noktaları, kimlik doğrulama, CORS | D1 |
| PWA | Bugün / Trend / Ayarlar ekranları | yalnız `api/` |

### Zamanlama
- Cron her 15 dakikada tetiklenir (Cloudflare ücretsiz plan sınırlarında).
- Her tetiklemede "bu işin zamanı geldi mi?" bakılır: veri eşitleme (saatte
  bir), brifing (ayarlanan saat), key bitiş kontrolü (günde bir).
- Brifing saatinde dünün/gecenin verisi henüz gelmediyse (saat telefona
  eşitlenmemiş olabilir) 15 dakikada bir tekrar denenir; ayarlanan saatten
  3 saat sonra eldeki veriyle gönderilir.
- Saat dilimi: `Europe/Istanbul` (ayarlanabilir).

## 4. Garmin istemcisi

Doğrulanmış (Garmin'in resmî Python istemcisi ve SSS):
- Token: `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token`,
  başlık `Authorization: ApiKey <key>`. Yanıt düz metin bir JWT. Süresi 24 saat,
  **yenileme token'ı yok**, bitmeden yeni token alınır (resmî istemci bitişe
  1 saat kala yeniler).
- Veri uç noktaları (taban adres aynı, Bearer token ile GET):
  - `/usersummary-service/v2/dailysummaries?startDate&endDate`
  - `/sleep-service/sleep/dailySleepSummariesByDate?startDate&endDate`
  - `/wellness-service/wellness/bodyBattery/reports/daily?startDate&endDate`
  - `/hrv-service/hrv/daily/{start}/{end}`
  - `/usersummary-service/stats/stress/daily/{start}/{end}`
  - `/usersummary-service/stats/steps/daily/{start}/{end}`
  - `/activitylist-service/activities/search/activities?start&limit&startDate&endDate`
  - `/weight-service/weight/range/{start}/{end}`
  - Günlük tekil: `/wellness-service/wellness/dailyHeartRate?date`, spo2.

İlk tasarımda bilinmeyenler (2026-11-14'te ölçüldü; sonuçlar `docs/garmin-alanlar.md` → "Canlıda ölçülenler"):
- Yanıtların alan adları ve yapısı.
- Aralık başına en fazla gün sayısı, geçmişe dönük derinlik, hız limitleri.
- Faz 1'in **ilk görevi** bu keşif: örnek yanıtları kaydetmek ve alanları
  haritalamak. Belirsizlik yüzünden ham JSON her zaman saklanır.

Token D1'deki `sync_state` tablosunda önbelleğe alınır (key değil, yalnız
token; key sadece Worker secret'ında kalır). Bitişe 1 saat kala veya 401'de
yenilenir, 401'de istek bir kez tekrarlanır.

## 5. Veri modeli (D1)

- `daily(date PK, sleep_score, sleep_seconds, sleep_stages_json, hrv_avg, hrv_status, resting_hr, stress_avg, bb_high, bb_low, bb_charged, bb_drained, steps, intensity_minutes, calories, raw_json, synced_at)`
- `activities(id PK, date, type, start_ts, duration_s, distance_m, avg_hr, raw_json)`
- `briefs(date PK, text, stats_json, source ['gemini'|'fallback'], sent_at)`
- `settings(key PK, value)` — brifing saati, saat dilimi, bildirim açık/kapalı
- `push_subscriptions(endpoint PK, keys_json, created_at)`
- `sync_state(key PK, value)` — son başarılı eşitleme, token önbelleği

Ek sütunlar (2026-11-13): uyku evreleri ve uyku ihtiyacı, SpO₂, solunum hızı, HRV durumu ve haftalık ortalaması,
Body Battery dolan/biten, stres dağılımı, aktif kalori, en yüksek nabız, çıkılan kat, günlük antrenman yükü;
aktivitelerde antrenman yükü ve etkisi, nabız bölgeleri, koşu dinamikleri, kuvvet setleri. Tam liste planın Ek A bölümünde.

Tüm yazmalar **upsert** (aynı günü tekrar çekmek çoğaltmaz). Eksik metrik
`NULL` olur, asla `0` yazılmaz.

## 6. İstatistik katmanı (saf fonksiyonlar, Gemini yok)

- **Baz çizgi:** son 28 günün medyanı ve dağılımı (medyan mutlak sapma);
  `NULL` günler hesaba katılmaz. En az 14 veri günü yoksa "baz çizgi henüz yok"
  döner ve sapma uyarısı üretilmez.
- **Sapma:** bir metrik baz çizgiden belirgin sapıyorsa işaretlenir. Tek gün
  gürültü sayılır; **üst üste 2 gün** sapma uyarı koşuludur. Eşikler
  yapılandırmada tutulur ve gerçek veriyle ayarlanır.
- **Yük:** dünkü yoğun dakika/aktivite süresi, 28 günlük ortalamaya oranı.
- Çıktı tek bir `stats` nesnesidir (Gemini istemi ve ekran buradan beslenir).

## 7. Brifing

1. `stats` nesnesi oluşturulur (bugünün sayıları + baz çizgi + sapma bayrakları).
2. Gemini'ye **yalnızca bu özet sayılar** gider (ham kayıt yok). İstem: günün hükmü (tek kısa cümle) ve iki cümlelik Türkçe gerekçe; sayı uydurma; teşhis koyma; önerileri "normalinden
   sapıyor, dinlenmeyi düşün" düzeyinde tut.
3. Yanıt doğrulanır (boş değil, uzunluk sınırı, istemde olmayan sayı içermiyor).
   Başarısızsa **yedek şablon** metin kullanılır (sayılar + sapma bayrakları,
   yorum yok). `briefs.source` hangisi olduğunu kaydeder.
4. Web push ile gönderilir, `briefs` tablosuna yazılır.

Gemini model adı sabit kodlanmaz, ortam değişkeni (`GEMINI_MODEL`) ile verilir.

## 8. Uyarılar

Baz çizgi sapması 2 gün üst üste sürerse ayrı bir bildirim gönderilir (günde en
fazla 1 uyarı). Metin şablonludur, teşhis içermez. Ek olarak key bitişine 14 gün
kala ve key geçersiz çıktığında bildirim gönderilir.

### 8.1 Bildirimler — güncel tasarım (2026-11-17, kullanıcı onayı)

Bölüm 7 ve 8'deki "ayarlanan saatte brifing" tasarımının yerini alır.

- **Tetikleyici:** brifing sabit saatte değil, o gecenin uyku verisi (bugünün `sleep_score` değeri) Garmin'den ilk kez geldiğinde gönderilir; günde tek brifing. Veri İstanbul saatiyle 21:00'den sonra gelirse o gün gönderilmez. Uyku verisi hiç gelmezse brifing yoktur (sessiz).
- **Sabah sık bakma:** 05:00–11:00 (İstanbul) arasında, bugünün uyku verisi gelene kadar eşitleme her zamanlayıcı tikinde (15 dk) çalışır; gelince saatlik düzene döner. Mevcut bekleme (kısmi hata, geçersiz key) kuralları önceliklidir.
- **İçerik:** başlık günün hükmü, gövde gerekçe (uygulamadaki metnin aynısı: Gemini yorumu varsa o, yoksa şablon). Bir kart ölçümü iki gün üst üste normal dışındaysa gövdenin sonuna tek satır eklenir ("HRV iki gündür normalin altında."); ayrı bildirim gönderilmez.
- **Garmin key geçersiz:** ayrı bildirim, key geçersiz duruma her geçişte bir kez.
- **Abonelik:** Ayarlar'daki "Bildirimler" anahtarı izin ister ve aboneliği Worker'a kaydeder (D1 `push_subscriptions`); kapatınca silinir. "Deneme bildirimi gönder" düğmesi vardır. iPhone'da yalnızca ana ekrana eklenmiş uygulamada çalışır; değilse anahtar devre dışıdır ve nedeni yazar.
- **Gönderim:** VAPID (ES256) + RFC 8291 `aes128gcm` şifreleme, Worker'ın WebCrypto'suyla, kütüphanesiz. İçerik uçtan uca şifrelidir. Push servisi 404/410 dönerse abonelik silinir. Abonelik uç noktası yalnız bilinen push servislerine (Apple, Google FCM, Mozilla) ait `https` adresi olabilir.
- **Gizli değerler:** `VAPID_PRIVATE_KEY` Worker secret'ıdır (kullanıcı girer); açık anahtar `wrangler.toml` içinde `VAPID_PUBLIC_KEY` ve uygulamaya `/api/ayar` yanıtıyla verilir.
- **Yaklaşımlar:** sabit saat (bazı sabahlar eski ya da geç veri — reddedildi); veri gelince, saatlik eşitlemeyle (bir saate kadar gecikme); seçilen: veri gelince, sabah 15 dakikada bir bakarak.

## 9. PWA ekranları

Üç ekran, altta sekme çubuğu (Bugün / Trend / Ayarlar). Çalışan tasarım
prototipi `uygulama/index.html` içindedir (uydurma veriyle); bu bölüm onun
tarifidir ve gerçek uygulama aynı görünüm ve davranışı taşır.

- **Bugün:** üstte tarih, günün hükmü (tek cümle, büyük yazı) ve iki cümlelik
  gerekçe. Ortada "yaşayan şekil": toparlanma durumuna göre boyutu, rengi ve
  hareketi değişir, dinlenme nabzı ritminde atar. Çevresinde yörüngede altı
  ölçüm kartı (uyku, Body Battery, HRV, dinlenme nabzı, stres, dünkü yük).
  Altta son yedi gün; bir güne dokununca ekran o güne dönüşür.
- **Trend:** tek bir ölçümün 28 günü. Ana sırt günlük değer, arkadaki soluk
  sırt 7 günlük ortalama, yatay kuşak normal aralık. Sola sürükleyerek günler
  arasında gezilir; imlecin yanında o günün değeri ve durumu yazar. Üstte altı
  ölçüm arasında geçiş yapan seçici. Başlıkta ölçüm adı ve 28 günlük özet
  cümlesi (aralık dışı gün sayısı, ortalama).
- **Trend'de dokuz ölçüm:** altı kart ölçümüne ek olarak derin uyku, SpO₂ ve solunum hızı yalnızca Trend'de
  görünür. Seçili gün için ek ayrıntı satırı: uykuda evre dağılımı ve uyku ihtiyacı, Body Battery'de dolan/biten,
  streste dağılım, HRV'de haftalık ortalama. "Dünkü yük" Garmin'in antrenman yükünden gelir.
- **Ayarlar:** ses efektleri, kalp atışı sesi, ses seçimi, brifing saati,
  bildirim izni, Worker adresi ve `DEVICE_KEY`, son eşitleme zamanı, Garmin
  key'inin bitiş tarihi.
- **Bugün → Trend geçişi:** bir ölçüm kartına dokununca o ölçümün trendi açılır.
  Trend sekmesine doğrudan basınca en son bakılan ölçüm açılır.
- Vanilla JS, derleme adımı yok, service worker + manifest (Fittakip düzeni).
  Çevrimdışıyken son görülen veri önbellekten gösterilir.

### 9.1 Görsel tasarım

**Yön.** Koyu, sinematik, veriyle canlanan bir arayüz. Ekranın kahramanı
yaşayan şekildir; geri kalan her şey ona yer açar. Tema koyudur (kullanım anı:
sabah, loş ışık); açık tema bu fazda yoktur.

**Renk.** Zemin koyu patlıcan moru (`#0c0812`). Metin sıcak beyaz (`#fff6ec`).
Sapma işareti şeftali (`#ffc9a6`), normal işareti açık nane (`#bfeedd`). Şeklin
ve Trend gökyüzünün rengi toparlanma durumundan türetilir: kötü günde kor
turuncusu ve mor, orta günde altın ve gül, iyi günde açık sarı ve deniz yeşili.
Renk hiçbir yerde tek başına anlam taşımaz: her sapma ok simgesi ve metinle
("altında", "üstünde", "normalde") birlikte verilir.

**Tipografi.** Başlıklar Fraunces (yumuşak eksen açık), geri kalan her şey
Onest. Bütün sayılar tabular rakamdır. En küçük yazı 11,5 pikseldir.

**Ölçüm kartı.** 104×100, cam yüzey: ölçüm adı, büyük değer ve birim, son 7
günün mini çizgisi (arkasında normal bandı), durum satırı. Sapan ölçümde kenar
ve parıltı şeftali rengine döner. Kart bir butondur: basınca çöker ve Trend'i açar.

**Yerleşim.** Sabit yükseklik varsayılmaz. Başlığın gerçek yüksekliği ölçülür,
yörünge başlık ile gün şeridi arasında kalan boşluğa sığdırılır; kısa ekranda
kartlar ve şekil birlikte küçülür. Metin ve kartlar hiçbir ekran boyutunda üst
üste binmez (375×560, 390×664 ve 393×852'de doğrulandı).

**iOS PWA kuralları.** Güvenli alanlar `env(safe-area-inset-*)` ile gözetilir.
Dokunma hedefleri en az 44×44. `apple-mobile-web-app-capable` ile tam ekran
açılır. Ana ekran ikonu ve açılış rengi manifest'te tanımlanır (ikon henüz
tasarlanmadı).

**Hareket.** GSAP ile. Açılışta şekil bir noktadan büyür, hüküm harf harf
gelir, kartlar yörüngeye saçılır, sayılar sıfırdan sayar. Bugün → Trend
geçişinde kartlar şekle çekilir, şekil yassılaşıp ufuk çizgisine dönüşür,
sırtlar yükselir, dokunulan sayı Trend'deki yerine uçar. Sürekli hareket:
şeklin atışı ve kartların yavaş yörüngesi. `prefers-reduced-motion` açıkken
açılış, geçiş, atış ve yörünge kapanır; ekranlar anında değişir.

**Dokunma.** Şekil yumuşak bir madde gibi tepki verir: basınca çöker ve çevresi
kabarır, çekilince o yöne uzayıp incelir, fazla çekilince parmaktan kayar,
bırakılınca titreyerek geri döner. Tepkinin sıkılığı toparlanmaya bağlıdır:
iyi günde sıkı ve çabuk, kötü günde gevşek ve ağır.

**Ses.** Bütün sesler tarayıcıda üretilir, ses dosyası yoktur: kalp atışı
(yalnızca Bugün ekranında), buton, ekran geçişi, sayının yerine oturması,
Trend'de gün başına bir nota (iyi gün tiz, kötü gün pes), şekli çekerken lastik
sesi. Buton, geçiş ve oturma seslerinin seçenekleri `uygulama/sesler.html`
üzerinden seçilir ve hatırlanır. Ses efektleri ve kalp atışı ayrı ayrı
kapatılabilir; ikisi de varsayılan olarak açıktır. Seslerin son hali henüz
kesinleşmedi; gerekirse dış kaynaktan üretilen ses dosyalarıyla değiştirilecek.

**Dış kütüphaneler.** GSAP (CDN), Google Fonts (Fraunces, Onest). Service
worker ikisini de önbelleğe alır.

### 9.2 Masaüstü (geniş ekran) düzeni (2026-11-15)

Kullanıcı kararı: ayrı bir uygulama değil, aynı sitenin geniş ekranda açılan ikinci düzeni. Soruları atladı; aşağıdakiler tasarımcının kararlarıdır.

- **Ne zaman:** pencere en az 1000 px genişlik ve 620 px yükseklikteyse. Daha dar pencerede bugünkü davranış aynen sürer (≤520 px tam ekran telefon düzeni, arası ortada telefon çerçevesi).
- **Düzen:** telefon çerçevesi yok, sahne pencereyi doldurur. Solda Bugün (hüküm, gerekçe, şekil, altı kart, yedi gün; telefondakiyle aynı), sağda her zaman açık Trend. Alt sekme çubuğu yoktur; sağ üstte ses ve Ayarlar düğmeleri. Ayarlar ortada bir pencere olarak açılır.
- **Trend geniş ekranda:** 28 günün tamamı tek grafikte görünür (kaydırma yok). İmleç fareyi izler; tıklayınca o günde kalır. ← / → bir gün, ↑ / ↓ ya da 1–9 ölçüm değiştirir. Ölçüm seçici, başlık, özet, normal bandı, 7 günlük ortalama sırtı ve gün ayrıntısı satırı telefondakiyle aynı içeriği taşır.
- **Bağ:** soldaki bir ölçüm kartına tıklamak sağdaki Trend'i o ölçüme geçirir (ekran değişmez). Soldaki yedi günden birini seçmek Trend imlecini o güne taşır.
- **Değişmeyenler:** veri katmanı, şeritler, sesler, şeklin dokunma tepkisi, renk dışında ok ve metinle durum, tabular rakamlar, `prefers-reduced-motion`.
- **Pencere eşiği aşılırsa** (geniş ↔ dar) sayfa yeniden yüklenir.
- **Yaklaşımlar:** (1) iki telefon ekranını yan yana ölçekleyerek göstermek — en ucuz, ama grafik dar kalır ve masaüstüne özgü hiçbir şey kazandırmaz; (2) seçilen: Bugün aynı koordinat sisteminde kalır, Trend geniş ekran için ayrı yerleşim ve etkileşim (28 gün, fare/klavye) alır; (3) baştan ayrı bir masaüstü sayfası — iki ayrı arayüzün bakımı. (2) seçildi: en çok değer grafikte, en az risk Bugün'de.

### 9.3 Trend: çark gezinmesi, ölçüm açıklaması, canlı simgeler, yapay zekâ yorumu (2026-11-16)

Kullanıcı istekleri ve kararları (tek tek soruldu):

- **Neden:** grafik, ölçümün ne anlama geldiği bilinmeden az şey söylüyor; bilgisayarda günler arasında gezmek çok hızlı ve denetimsiz.
- **Çark gezinmesi (bilgisayar):** fareyi gezdirmek günü DEĞİŞTİRMEZ. Tekerleğin her çentiği bir gün ilerletir; günler yumuşakça ve hafif bir tık sesiyle yerine oturur; hızlı çevrilirse çark gibi yavaşlayarak durur. Bir güne tıklamak doğrudan oraya götürür; ok tuşları aynı çark hareketini kullanır. Telefonda parmakla kaydırma aynı "gün gün oturma" hissini (tık sesi, titreşim) taşır.
- **Ölçüm açıklaması:** dokuz ölçüm için sabit, kısa Türkçe metin (ne ölçer, yüksek mi düşük mü iyi, neye dikkat). Yapay zekâ yazmaz; uygulamayla gelir, çevrimdışı çalışır. Telefonda başlıktaki simgeye dokununca küçük bir kart olarak açılır; bilgisayarda grafiğin yanında açık durur.
- **Canlı simgeler:** her ölçümün başlığında küçük, hareketli bir simge. Kullanıcı beklentisi: görsel olarak üst seviye. Tasarım kararı: simgeler süs değil, veriyi yaşar — hareketleri seçili günün değerine bağlıdır (ör. pil doluluğu Body Battery kadar, nabız çizgisi dinlenme nabzı hızında atar, ay uyku skoruna göre dolar). Uygulamanın görsel diliyle (sıcak ışıma, şeftali–mor) çizilir; `prefers-reduced-motion` altında durağan ama yine değeri gösterir. Önce ayrı bir önizleme sayfasında dokuzu birden kullanıcıya gösterilir; onaydan sonra uygulamaya girer.
- **Yapay zekâ yorumu (Trend):** her ölçüm için 1–2 cümle eğilim yorumu. Gemini'ye yalnızca ÖZET gider: 28 günün ortalaması, normal dışı gün sayısı, son 7 günün önceki 21 güne göre yönü ve büyüklüğü, normal aralık. Tarih ve gün gün değerler gitmez. Dokuz ölçümün yorumu günde tek istekle yazılır; bugünkü hükümle aynı doğrulama kurallarından geçer (uzunluk, yasak karakter, girdide olmayan sayı yok), geçmezse gösterilmez. "Yapay zekâ yorumu" anahtarı kapalıyken istek gitmez. Telefonda başlığın altındaki 28 günlük özet cümlesinin yerine gelir (yorum yoksa o cümle kalır) ve "Yapay zekâ yorumu" etiketi taşır.
- **Yaklaşımlar (gezinme):** fareyi izleyen imleç (hızlı, denetimsiz — reddedildi); çark + farede sessiz ön izleme; seçilen: yalnız çark, tıklama ve klavye.
- **Yaklaşımlar (Gemini verisi):** 28 günün ham değerleri (zengin yorum, geçmiş Google'a gider — reddedildi); seçilen: yalnız özet; yorum olmaması.
- **Simge kararı (2026-11-16):** kullanıcı önizlemedeki dokuz simgeyi onayladı (`prototip-eski/simge/simgeler.js`). Uygulama simgesi (logo) ayrıdır: kullanıcının hazırladığı "Faz" (`marka/faz/`, rehber `CLAUDE.md`).
- **Yayın sırası:** masaüstü düzeniyle birlikte, tek seferde yayınlanır.

## 10. Hata durumları

| Durum | Davranış |
|---|---|
| Token 401 | Yeni token al, isteği bir kez tekrarla |
| Key geçersiz/süresi dolmuş | Banner + push ("Garmin key'ini yenile"), eşitleme durur |
| Garmin erişilemez / limit | Üstel bekleme, eldeki veriyle devam, ekranda "son eşitleme X saat önce" |
| Gemini hata/geçersiz yanıt | Yedek şablon brifing gider |
| Eksik veri (saat takılmadı) | `NULL`, ekranda "veri yok", baz çizgi o günü atlar |
| Geçersiz push aboneliği (410) | Abonelik silinir |
| Geç gelen veri | Sonraki eşitleme o günü günceller, brifing gönderildiyse tekrar gönderilmez |

## 11. Güvenlik ve gizlilik

- Garmin key'i, Gemini key'i, VAPID özel anahtarı, `DEVICE_KEY`: yalnızca Worker
  secret'ı (`wrangler secret put`). Hiçbiri tarayıcıya, repoya veya loga girmez.
- Worker API'si `DEVICE_KEY` ister ve CORS yalnızca Pages adresine izin verir.
- Loglara sağlık verisi yazılmaz.
- Gemini'ye yalnızca özet sayılar gider; bugünün ve Trend yorumlarının gönderdiği
  alanlar aşağıdaki veri dökümünde açıklanır. Bugün ve Trend istekleri aynı
  günlük 24 istek kotasını paylaşır (`GUNLUK_SINIR`).
- **Doğrulanacak:** kullanılan Gemini katmanının (ücretsiz/ücretli) veri kullanım
  koşulları; Garmin şartlarında üçüncü taraf yapay zekâ kullanımına dair hüküm
  olup olmadığı (SSS'te belirtilmiyor).
- Repo herkese açık olacağından test örnekleri anonimleştirilir veya
  `.gitignore`'da tutulur.

### Gemini'ye giden veri (2026-11-14)

Bugünün hüküm ve gerekçesini Gemini yazar (ücretsiz katman; Google bu katmandaki veriyi ürün geliştirmede kullanabilir ve insan incelemesine açabilir). Bu yüzden gönderilen veri en aza indirilir:

- Giden: yalnız bugünün dokuz ölçüm değeri, normal aralıkları, durumları, enerji puanı ve hüküm kademesi.
- Gitmeyen: ad, tarih, haftanın günü, ham Garmin kaydı, aktiviteler, geçmiş günler, konum.
- İstek durumsuzdur (`store: false`). Anahtar yalnız Worker secret'ıdır.
- Ayarlar'daki "Yapay zekâ yorumu" kapatılınca Gemini'ye istek gitmez; şablon metin gösterilir.
- Gemini yanıt vermezse ya da kurala uymayan metin dönerse şablon metin gösterilir.

### Trend için Gemini'ye giden veri (2026-11-16)

Yeterli verisi olan her ölçüm için tek satırda son 28 günlük ortalama, veri olan
gün sayısı, normal aralık, bu aralığın altında ve üstünde geçen gün sayıları ve
yüksek/düşük değer yönü gönderilir. İki dönemde de yeterli veri varsa son 7 ve
önceki 21 günün ortalamaları ile değişimin yönü de eklenir. Ham günlük değerler, tarihler
ve gün adları gönderilmez. Dokuz ölçümün yorumları bir Gemini isteğinde üretilir;
bugünün hüküm yorumu ve Trend yorumu istekleri Worker'daki ortak günlük 24
istek sayacını kullanır. Yapay zekâ ayarı kapalıysa Gemini isteği yapılmaz.

Trend yorumlarını üreten Worker sürümü 16 Kasım 2026'da Cloudflare'a dağıtıldı.

## 12. Test

Node test koşucusu (Fittakip gibi).
- `stats/`: baz çizgi, sapma, eksik gün, 14 günden az veri, üst üste 2 gün kuralı.
- `garmin/client`: token alma, süre dolunca yenileme, 401'de tekrar, anahtar hatası (sahte `fetch`).
- `garmin/sync`: upsert idempotansı, `NULL` işleme, geçmiş doldurma parçalaması.
- `brief/`: istem içeriği, doğrulama, yedek şablon.
- `push/` ve `api/`: kimlik doğrulama, CORS, 410 temizliği.
- Gerçek yanıt örnekleri keşif görevinden sonra test verisi olur (anonimleştirilmiş).
- Arayüz: prototipteki uydurma veri (`uygulama/veri.js`) Worker API'sinin döndüreceği biçime çevrilir;
  aynı ekranlar hem uydurma hem gerçek veriyle açılabilmelidir.

## 13. Açık sorular ve riskler

1. ~~Garmin yanıt alanları ve geçmiş derinliği/limitleri bilinmiyor.~~ Ölçüldü (2026-11-14): alanlar ve sınırlar `docs/garmin-alanlar.md`'de; geçmiş yaklaşık bir yıl geriye gidiyor, istek sınırına takılınmadı.
2. Gemini veri koşulları ve Garmin şartlarında üçüncü taraf yapay zekâ hükmü doğrulanacak.
3. Cloudflare ücretsiz plan cron/D1 limitleri 15 dakikalık tetiklemeyle yeterli
   olmalı; kurulumda doğrulanacak.
4. Güvenli eşik değerleri (sapma, minimum veri günü) gerçek veriyle ayarlanacak.
5. Garmin key'inin süresi dolar (en fazla bir yıl); yenileme sürecinin yönetimi Bölüm 8'de.
6. iOS Safari titreşim API'sini desteklemez; kullanılan dolambaç (anahtar tipli onay kutusu, iOS 18+) garanti değildir.
7. Sesler ilk dokunuştan önce çalamaz (tarayıcı kuralı); açılış animasyonu sessizdir.
8. WebGL yoksa şekil sabit bir renk geçişine düşer; düşük güçlü cihazda kare hızı ölçülmedi.
9. Garmin Personal API yalnızca kişisel kullanım içindir. Uygulamayı kendi telefonuna kurmak (TestFlight dahil) bu sınırın içindedir; App Store'da başkalarına sunmak Garmin'in iş ortağı programını gerektirir.

## 14. Kurulumda senden gerekecekler

- Cloudflare hesabı (Fittakip'tekiyle aynı olabilir), `wrangler` ile giriş.
- Secret'ların yüklenmesi: Garmin key, Gemini key, VAPID anahtarları, `DEVICE_KEY`
  (değerleri sohbete yapıştırma; komutları birlikte çalıştırırız).
- Telefonda PWA'yı ana ekrana ekleme ve bildirim izni.

## 15. Yapım sırası

1. Garmin keşfi: gerçek yanıtları çek, alanları haritala (Bölüm 4).
2. Worker: eşitleme ve D1 (Bölüm 3, 5).
3. İstatistik katmanı (Bölüm 6).
4. Worker API'si ve arayüzün gerçek veriye bağlanması (Bölüm 9).
5. Gemini brifingi ve yedek şablon (Bölüm 7).
6. Web push ve uyarılar (Bölüm 8).
7. PWA kabuğu: manifest, ikon, service worker; GitHub Pages yayını.
