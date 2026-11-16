# GarminAnalizer — Yapılacak İşler

Son güncelleme: 16 Kasım 2026. Bu belge, projeyi hiç görmemiş birinin (ya da başka bir yapay zekâ yardımcısının) kaldığı yerden devam edebilmesi için yazıldı. Önce "Proje nedir" ve "Uyulması gereken kurallar" bölümlerini oku; işler ondan sonra geliyor.

## 1. Proje nedir

Tek kullanıcılı, kişisel bir sağlık uygulaması. Sahibinin Garmin verisini çeker, her ölçümü kişinin kendi 28 günlük ortalamasına göre değerlendirir ve "bugün nasılım" sorusuna tek bakışta cevap verir.

- **Worker** (`worker/`): Cloudflare Worker. Saatte bir Garmin Connect Personal API'den veri çeker, Cloudflare D1 veritabanına yazar, istatistikleri hesaplar ve küçük bir API sunar (`GET /api/gunler`, `GET /api/durum`, `GET|PUT /api/ayar`). Her istek `X-Device-Key` başlığı ister. İsteğe bağlı olarak Google Gemini'ye bugünün hükmünü yazdırır.
- **Uygulama** (`uygulama/`): çerçevesiz, derleme adımı olmayan statik PWA (vanilla JS, GSAP 3.12.5, WebGL, WebAudio). GitHub Pages'ten yayınlanır, iPhone'da ana ekrana eklenir. Üç ekran: Bugün, Trend, Ayarlar.
- **Yayın**: `main` dalına her gönderim GitHub Actions ile testleri çalıştırır ve `uygulama/` klasörünü yayınlar (`.github/workflows/yayin.yml`). Canlı adres: `https://enescvsdg.github.io/GarminAnalizer/`. Depo herkese açık: `github.com/enescvsdg/GarminAnalizer`.

Ayrıntılı tasarım: `docs/superpowers/specs/2026-11-12-garmin-kocu-design.md`. Garmin alan haritası ve canlıda ölçülenler: `docs/garmin-alanlar.md`. Kurulum: `README.md`. Marka ve simge: `CLAUDE.md`.

### Klasörler

| Yol | İçerik |
| --- | --- |
| `worker/src/garmin/` | Garmin istemcisi, yanıt çevirme, eşitleme |
| `worker/src/stats/` | Baz çizgi, normal bandı, enerji puanı, hüküm ve gerekçe |
| `worker/src/yorum/` | Gemini istemcisi, bugünün yorumu (`yorum.js`), eğilim yorumu (`egilim.js`) |
| `worker/src/api/router.js` | API uç noktaları, kimlik doğrulama, CORS |
| `worker/src/zamanlama.js` | Zamanlanmış eşitleme kararı ve bekleme |
| `uygulama/index.html`, `uygulama.js` | Arayüz (tek sayfa) |
| `uygulama/veri-canli.js` | Veri katmanı: Worker'dan okuma, son veri önbelleği, ayar |
| `uygulama/duzen.js` | Saf yerleşim ve gezinme hesapları (masaüstü düzeni, çark) |
| `uygulama/sw.js`, `kabuk.js` | Service worker ve güncelleme akışı |
| `prototip-eski/simge/` | Ölçüm simgelerinin önizleme sayfası (yayınlanmaz) |
| `tools/` | Keşif aracı, anonimleştirici, yayın hazırlama |
| `marka/faz/` | "Faz" uygulama simgesi kaynakları |

### Çalıştırma

```
npm test                                             # bütün testler (Node 24, bağımlılık gerekmez)
python3 -m http.server 4173 --directory uygulama     # uygulama: http://localhost:4173/
python3 -m http.server 4176                          # simge önizlemesi: http://localhost:4176/prototip-eski/simge/
```

Yerelde service worker bilerek kayıt olmaz; denemek için adrese `?sw=1` eklenir. Tarayıcı yerelde betikleri önbellekten verebilir; değişiklikten sonra Cmd+Shift+R ile yenile.

## 2. Uyulması gereken kurallar

Bunlar pazarlık konusu değil; her biri bir kez yaşanmış bir sorundan çıktı.

1. **Gizli değerler:** Garmin anahtarı, `DEVICE_KEY`, `GEMINI_API_KEY` yalnızca Worker secret'ıdır. Koda, repoya, loga, test çıktısına ya da sohbete girmez. `worker/.dev.vars` ve `kesif/ham/` okunmaz, yazdırılmaz. Gizli değerleri hep kullanıcı kendisi girer (`npx wrangler secret put ...`).
2. **Depo herkese açık:** gerçek sağlık verisi, Worker'ın tam adresi (`*.workers.dev`), e-posta ve gerçek ad repoya girmez. Commit yazarı GitHub'ın gizli (`noreply`) adresidir; yerel `git config` buna göre ayarlı, değiştirme.
3. **`main` dalı canlıdır:** `main`'e gönderilen her şey birkaç dakika içinde yayınlanır. Dalda çalış, tarayıcıda doğrula, kullanıcı onaylamadan birleştirme ve gönderme. Worker'ı güncellemek (`npx wrangler deploy`) de kullanıcı onayı ister.
4. **Telefon görünümü kutsaldır:** uygulama her gün iPhone'da kullanılıyor. Masaüstü ya da başka bir özellik eklerken telefon davranışı değişmemeli. Bir kez bir yorum satırı kodu yuttu ve Trend'de parmakla kaydırma çalışmaz oldu; `uygulama/yapi.test.mjs` içinde buna karşı bir koruma testi var. Yorumları kodla aynı satıra yazarken dikkat et.
5. **İçerik güvenlik politikası:** sayfada satır içi betik ve `onclick=` gibi öznitelikler yok (`script-src 'self'`). Bütün yollar görelidir (site `/GarminAnalizer/` alt yolunda çalışır). Yeni bir yerel dosya eklersen `uygulama/sw.js` içindeki `KABUK` listesine de ekle; testler bunu denetler.
6. **Dışarıdan gelen metin:** API'den ve Gemini'den gelen her metin sayfaya yalnızca `textContent` ile eklenir.
7. **Eksik veri:** eksik ölçüm `null`'dır. Hiçbir yerde `NaN`, `undefined`, `null` yazısı ya da sahte `0` görünmez; ekranda "veri yok" yazar.
8. **Erişilebilirlik:** durum (altında / normalde / üstünde) renk dışında ok ve metinle de verilir; sayılar tabular; `prefers-reduced-motion` altında döngüsel hareket olmaz.
9. **Gemini'ye giden veri en aza iner:** tarih, haftanın günü, ad, aktivite, gün gün değer gitmez. İstek `store:false` ile gider. Ayarlar'daki "Yapay zekâ yorumu" kapalıyken hiç istek gitmez. Günlük istek sınırı 24'tür ve bütün Gemini çağrıları bunu paylaşır.
10. **Bağımlılık yok:** çerçeve, derleyici, yeni kütüphane ya da CDN eklenmez. Tek geliştirme bağımlılığı `wrangler`.
11. **Test:** her değişiklik `npm test` yeşilken biter. Önce başarısız test, sonra kod. Doğrulamalar koşulsuz olur (`if` içinde `assert` yok).
12. **Marka adı:** "Garmin" tescilli bir markadır. Uygulama kişisel kullanımda; mağazada yayın düşünülürse ad değişmeli (bkz. bölüm 6).

## 3. Şu anki durum

### Canlıda olanlar (`main`)

- Saatlik Garmin eşitlemesi, 347 günlük geçmiş, kişisel bantlar, enerji puanı, hüküm ve gerekçe.
- Gemini ile bugünün hüküm ve gerekçesi (şablon yedekli, yön ve sayı denetimli).
- PWA: iPhone ana ekranı, çevrimdışı son veri, sürümlü önbellek, "Örnek veri" ve "Çevrimdışı" şeritleri.
- Bugün (altı kart) ve Trend (dokuz ölçüm, gün ayrıntısı satırı) ekranları, telefon düzeninde.

### 16 Kasım 2026'da yayınlananlar

Kullanıcının isteğiyle `masaustu` dalı `main`'e birleştirilip yayınlandı (`npm test`: 365 geçiyor). Aşağıdaki tablodaki her şey artık `main`'de; arayüzle ilgili olanlar canlı sitede. **Worker güncellenmedi:** eğilim yorumu kodu depoda duruyor ama canlı Worker'da yok. Yayın öncesi telefon görünümü (Trend'de kaydırma, Bugün'e dönüş) ve masaüstü çarkı (fare gezdirince gün değişmiyor, bir çentik bir gün, dokunmatik yüzey, sayfa kaymıyor) tarayıcıda yapay olaylarla doğrulandı.

| Commit | Ne | Durum |
| --- | --- | --- |
| `de8dccc`, `1332f9e` | Masaüstü (geniş ekran) düzeni: pencere ≥ 1000×620 iken solda Bugün, sağda 28 günlük Trend | Yayında; denetlendi, bulgular düzeltildi |
| `23e0771` | Çark gezinmesi: tekerlek, tıklama, ok tuşları; fareyi gezdirmek günü değiştirmez | Yayında; tarayıcıda doğrulandı, **bağımsız denetimden geçmedi** |
| `2d8f1a3` | Worker: Gemini ile ölçüm eğilim yorumları (`worker/src/yorum/egilim.js`), `/api/gunler` yanıtında `egilim` alanı | Kod `main`'de; **denetlenmedi**, canlı Worker'a yüklenmedi, gerçek Gemini ile denenmedi |
| `fbf1f80` | Dokuz canlı ölçüm simgesi ve önizleme sayfası (`prototip-eski/simge/`) | Yazıldı, kullanıcı onayladı, **uygulamaya henüz yerleştirilmedi** |
| `3962ddd` | "Faz" uygulama simgesi ve marka rehberi | Yayında |

Depoda izlenmeyen dosyalar: `prototip-eski/simge/ornek-01…05*.html`. Bunlar kullanıcının başka bir oturumda yaptığı simge denemeleri; kullanılmayacaklar. Silmek ya da tutmak kullanıcının kararı; commit etme.

### Kullanıcının verdiği kararlar

- Ölçüm simgeleri: `prototip-eski/simge/simgeler.js` içindekiler kullanılacak.
- Uygulama simgesi: `marka/faz/` içindeki "Faz".
- Bilgisayarda gezinme: çark (tekerlek ve tıklama); fareyi izleyen imleç istenmiyor.
- Eğilim yorumu için Gemini'ye yalnızca özet gider (ortalama, normal dışı gün sayısı, son 7 günün önceki 21 güne göre yönü).
- Telefonda Trend: yapay zekâ yorumu başlığın altındaki özet cümlesinin yerine gelir; ölçüm açıklaması başlıktaki simgeye dokununca açılır.
- Eşitleme saatte bir; Gemini günlük sınırı 24.
- Depo adı GarminAnalizer kalıyor; depodaki anonimleştirilmiş örnek dosyalar olduğu gibi kalıyor.

## 4. Sıradaki işler

Ayrıntılı plan: `docs/superpowers/plans/2026-11-16-trend-cark-aciklama-simge-yorum.md`. Tasarım: spec bölüm 9.2 ve 9.3. Aşağıdaki sırayla ilerle.

### İş 1 — Yazılmış üç işin denetimi

Çark (`23e0771`) ve eğilim yorumu (`2d8f1a3`) bağımsız bir gözle okunmadı. Yayından önce:

- **Çark:** `uygulama/uygulama.js` içindeki Trend etkileşimini oku. Kontrol et: telefon sürüklemesi çalışıyor; tekerlek yalnızca grafik bölgesinde yakalanıyor ve sayfayı kaydırmıyor; `ctrlKey` (yakınlaştırma) ve Ayarlar açıkken yok sayılıyor; dokunmatik yüzeyin küçük olayları tek tek gün atlatmıyor; hızlı çentikler hedefi biriktiriyor ve geri sıçrama olmuyor. Gerçek fare ve dokunmatik yüzeyle elle dene (ajan yalnızca yapay olaylarla denedi).
- **Eğilim yorumu:** `worker/src/yorum/egilim.js` ve `worker/test/egilim.test.mjs`. Kontrol et: Gemini'ye giden metinde tarih, gün adı ya da gün gün değer yok; günlük sayaç bugünün hükmüyle ortak ve istekten önce artıyor; günde en çok 2 başarılı yazım; dünkü kayıt gösterilmiyor; `egilimOku` hata verse de `/api/gunler` 200 dönüyor; yasak kelimeler ve girdide olmayan sayı reddediliyor.
- **Simge modülü:** `prototip-eski/simge/simgeler.js`. Kontrol et: `yokEt` her şeyi temizliyor, kimlikler örnekler arasında çakışmıyor, `null` ve `NaN` değerlerde hata yok.

Bitti sayılır: bulunan önemli sorunlar düzeltildi, `npm test` yeşil.

### İş 2 — Ölçüm açıklamaları ve simgelerin Trend'e yerleştirilmesi (plan: Task 2)

- `uygulama/aciklama.js`: dokuz ölçüm için sabit Türkçe metin (`soru`, `metin`, `yon`). Ne ölçtüğünü ve yüksek mi düşük mü iyi olduğunu söyler. Tıbbi teşhis ya da tavsiye içermez. Ölçüm kimlikleri: `uyku`, `bb`, `hrv`, `nabiz`, `stres`, `yuk`, `derin`, `spo2`, `solunum`.
- `prototip-eski/simge/simgeler.js` → `uygulama/simgeler.js` olarak taşınır, `KABUK` listesine eklenir, testi yazılır.
- `uygulama/duzen.js`: `simgeOrani(olcumId, deger, bant)` — değeri simgenin 0–1 değişkenine çevirir. SpO₂ dar bir aralığa (yaklaşık 88–100) eşlenmeli, yoksa halka neredeyse hiç kıpırdamaz.
- Trend başlığının solunda simge (bir `<button>` içinde). Ölçüm ya da gün değişince `guncelle({oran, durum, ham})`. Veri olmayan günde simge "boş" durumuna geçer.
- Telefonda simgeye dokununca açıklama kartı açılır (Esc, dışına dokunma ve yeniden dokunma kapatır; odak düğmeye döner). Masaüstünde açıklama grafiğin yanında açık durur.
- Simge boyutu: önizlemede 44 piksel başlığın yanında küçük kaldı; 48–52 piksel dene.

Bilinen zayıf simgeler (istenirse iyileştir): solunum (nefes egzersizi gibi okunuyor), stres (en yüksek değerde buruşuk görünüyor), yük (düşük değerde 28 pikselde silik), HRV (durağan karede az şey söylüyor).

Bitti sayılır: 390×664 ve 1440×900'de simge doğru günü gösteriyor, kart hiçbir şeyin üstüne taşmıyor, az hareket modunda durağan, `npm test` yeşil.

### İş 3 — Eğilim yorumunun arayüzde gösterilmesi (plan: Task 4)

- `uygulama/veri-canli.js` `veriCevir`: `VERI.meta.egilim = {[olcumId]: metin}` (yalnızca bilinen kimlikler ve dizgi değerler; alan yoksa `{}`).
- Trend'de seçili ölçümün yorumu varsa başlığın altındaki "Son 28 günde … gün normal aralığının dışında" cümlesinin yerine gelir ve altında "Yapay zekâ yorumu" etiketi durur. Yoksa mevcut cümle kalır. Masaüstünde ikisi birlikte gösterilebilir.
- Uzun yorum grafikle çakışmamalı; başlık yüksekliği ölçümü (`yerlesimT`) yoruma göre yeniden yapılır.

Bitti sayılır: sahte yanıtla yorumlu ve yorumsuz ölçüm, uzun yorum ve ölçüm değiştirme denenmiş; çakışma yok.

### İş 4 — Son denetim ve yayın (plan: Task 5)

Sıra önemli, her adım kullanıcı onayı ister:

1. Bütün dalın son denetimi: telefon görünümünde gerileme yok, herkese açık depoya uygun (gizli değer, adres, kişisel bilgi yok), CSP ve `KABUK` tam.
2. `README.md` ve spec bölüm 11'e Gemini'ye giden eğilim özetini ekle.
3. Worker'ı güncelle: `cd worker && npx wrangler deploy`. Sonraki eşitlemeden sonra logda `egilim: yazildi` görülmeli (`npx wrangler tail`). Gemini'nin dokuz yorumluk yanıtı hiç denenmedi; çıktı sınırı (2400 belirteç) ve zaman aşımı (20 sn) tahmindir. Logda `gemini: bicim` ya da `gemini: zaman` görürsen bunları ayarla.
4. Çalıştığın dalı `main`'e birleştir ve gönder. İş akışı bitince canlı sitede sürüm satırını (Ayarlar'ın altı), telefon görünümünü ve masaüstü düzenini kontrol et.
5. iPhone'da: uygulamayı iki kez aç (ilkinde eski sürüm görünüp bir kez kendiliğinden yenilenir), Trend'de kaydırmayı, yeni simgeleri ve yorumu dene. Ana ekran simgesinin "Faz" olarak değişmesi için uygulamayı ana ekrandan silip yeniden eklemek gerekebilir.

## 5. Sonraki planlar (henüz başlanmadı)

### 5.1 Telefona bildirim

Kullanıcı "önce yayın, sonra bildirim" dedi; yayın tamam, bildirim sıradaki büyük iş. Tasarım spec bölüm 7 (brifing) ve 8'de (uyarılar). Gerekenler: Worker'da VAPID anahtarları ve web push gönderimi, abonelik uç noktası ve saklama (D1), sabah brifingi zamanlaması (saat ayarı, veri gelmediyse bekleme), uyarı kuralları (ör. iki gün üst üste sapma), uygulamada izin isteme ve Ayarlar'da saat seçimi, `sw.js` içinde `push` ve `notificationclick` olayları. iPhone'da bildirim yalnızca ana ekrana eklenmiş uygulamada çalışır.

### 5.2 Ek Garmin verileri

Yazılı plan yok; önerilen sıra:

1. **Aktiviteler ekranı.** Veri zaten her saat `activities` tablosuna yazılıyor ama hiçbir yerde gösterilmiyor: tür, süre, mesafe, ortalama ve en yüksek nabız, antrenman yükü, aerobik/anaerobik etki, nabız bölgeleri; koşuda kadans, adım boyu, yer temas süresi, güç; kuvvette set ve tekrar. Gereken: yeni API uç noktası ve arayüz. "Dünkü yük neden yüksek" sorusunu cevaplar.
2. **Gösterilmeyen günlük alanlar.** `daily` tablosunda duruyor: adım, kat, kalori, yoğun dakika, gün içi en yüksek nabız, en düşük SpO₂, uykudaki stres, şekerleme süresi.
3. **Gün içi eğriler.** Garmin dakika dakika nabız, stres, Body Battery ve adım serilerini veriyor (keşifte açık oldukları görüldü) ama hiç çekilmiyor. Gereken: yeni çekim, saklama biçimi (boyuta dikkat) ve Trend'de bir güne girince o günün eğrisi. En büyük iş bu.
4. **Yeni keşif.** Kilo, VO₂ max, antrenman durumu gibi uç noktalar hiç denenmedi. `tools/kesif.mjs` genişletilip neyin geldiği görülmeli.

### 5.3 Ertelenen cilalar

- Ses efektlerinin iyileştirilmesi (kullanıcı düğme sesini beğenmemişti; gerekirse ElevenLabs).
- Arayüzün bütün olarak tasarım eleştirisi ve cilası.
- App Store / yerel uygulama: kullanıcı Apple geliştirici üyesi, "belki yayınlarız" dedi. Bu durumda Garmin'in kişisel API'si yetmez (iş ortağı programı gerekir) ve ad değişmelidir.

## 6. Bilinen eksikler ve küçük sorunlar

Hiçbiri yayına engel değil; fırsat oldukça düzeltilebilir.

**Worker**
- Aktivite çekiminde sayfa sınırı 100; geçmiş doldurmada bir parçada 100'den fazla aktivite olursa sessizce kesilir.
- Bir uç nokta kalıcı olarak hata verirse eşitleme hep "kısmi" sayılır ve `son_esitleme` ilerlemez; arayüz 12 saat sonra "eski" uyarısı gösterir, oysa diğer veriler geliyordur.
- Geçersiz Garmin anahtarı düzeltildikten sonra bir sonraki deneme 24 saate kadar gecikir; elle tetikleme yok. (Çözüm: D1'de `sync_state` tablosundan `key_durum` ve `son_deneme` satırlarını silmek.)
- `settings` tablosu ve `GET /api/durum` kullanılmıyor.
- Dünkü yük ölçümünün bandı kendi değerini de içeriyor.
- `IZINLI_ORIGIN` içinde `http://localhost:4173` duruyor (yerel deneme için; zararsız).

**Uygulama**
- `localStorage`, `enescvsdg.github.io` altındaki bütün sitelerle ortaktır; aynı hesaptan yayınlanan başka bir site cihaz anahtarını okuyabilir. README'de yazıyor; tam ayrım için ayrı alan adı gerekir.
- Trend ekranında "Örnek veri" ya da "Çevrimdışı" işareti yok; yalnızca Bugün'de var.
- Zayıf ağda önbellekteki veri 6 saniyelik beklemeden sonra geliyor.
- Uygulama açıkken güncelleme gelirse sayfa yenilenir; Ayarlar'da yarım yazılmış bir anahtar silinebilir.
- Masaüstü: pencere tam eşikte (1000×620) gidip gelirse her seferinde yeniden yüklenir; iPad'de hedefler 40 piksel (44 olmalı); `duzen.js` statik `import` olduğu için yüklenemezse uygulama açılmaz.
- Şerit metinleri ve öncelikleri saf işleve çıkarılıp test edilmedi.
- GitHub Actions "Node 20 deprecated" uyarısı veriyor; eylem sürümleri yükseltilmeli.

**Belgeler**
- Eski plan dosyalarında `prototip/` yolu ve eski önbellek öneki geçiyor; tarihsel, dokunmaya gerek yok.

## 7. Yeni oturuma başlarken

1. `git status` ve `git log --oneline -10` ile dalı ve son commit'leri gör. Yeni iş için `main`'den yeni bir dal aç; `main`'e doğrudan commit etme (her gönderim yayınlanır).
2. `npm test` çalıştır; 365 geçmeli.
3. Bölüm 4'teki İş 1'den başla.
4. Her dışa açık adımda (Worker'ı güncellemek, `main`'e göndermek) önce kullanıcıya ne yapacağını söyle ve onayını al. Kullanıcı Türkçe konuşuyor ve her iş adımından önce kısa bir plan görmek istiyor.
