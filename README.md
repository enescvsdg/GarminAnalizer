# GarminAnalizer

Kişisel, tek kullanıcılı bir proje. Sahibinin kendi Garmin verisini kişisel API anahtarıyla okur ve her gün için bir toparlanma görünümü gösterir: uyku, HRV, dinlenme nabzı ve benzeri ölçümlerin kişinin kendi ortalamasına göre nerede durduğu.

Bu proje Garmin ile bağlantılı değildir ve Garmin tarafından onaylanmamıştır. Garmin, Garmin Ltd.'nin ya da bağlı kuruluşlarının markasıdır.

## Mimari

- **Worker:** `worker/` altındaki Cloudflare Worker, zamanlanmış tetikleyiciyle Garmin verisini çeker ve bir D1 veritabanına yazar. Uygulamaya yalnız cihaz anahtarıyla erişilebilen küçük bir API sunar.
- **Uygulama:** `uygulama/` altındaki statik PWA (çerçeve ve derleme adımı yok) GitHub Pages'ten yayınlanır. Veriyi Worker'dan alır; son gerçek veriyi cihazda saklar, bağlantı yokken onu "çevrimdışı" etiketiyle gösterir.
- **Yapay zekâ yorumu (isteğe bağlı):** Gemini bugünün hüküm ve gerekçe metnini yazar. Anahtar tanımlı değilse bu kısım hiç çalışmaz.

## Kendi kopyanı kurmak

1. Depoyu kendi hesabına kopyala (fork ya da yeni depo) ve GitHub Pages'i "GitHub Actions" kaynağıyla aç. Her `main` gönderimi testleri çalıştırır ve `uygulama/` klasörünü yayınlar.
2. Cloudflare'de bir D1 veritabanı oluştur ve şemayı uygula:
   `npx wrangler d1 create garmin-analizer`, sonra `npx wrangler d1 execute garmin-analizer --remote --file worker/schema.sql`.
3. Çıkan veritabanı kimliğini `worker/wrangler.toml` içindeki `database_id` alanına yaz.
4. Gizli değerleri `worker/` klasöründe `wrangler secret put` ile ekle:
   - `GARMIN_PERSONAL_API_KEY`: Garmin kişisel API anahtarın.
   - `DEVICE_KEY`: uygulamanın Worker'a kimliğidir. `openssl rand -hex 32` ile üret.
   - `GEMINI_API_KEY`: isteğe bağlı. Eklemezsen yorum kısmı kapalı kalır.
5. `wrangler.toml` içindeki `IZINLI_ORIGIN` değerini kendi Pages kökenin yap (örneğin `https://KULLANICI.github.io`). Yerel deneme için `http://localhost:4173` kalabilir.
6. `npx wrangler deploy` ile Worker'ı yayınla.
7. Uygulamayı aç, Ayarlar bölümünde Worker adresini ve cihaz anahtarını gir.

iPhone'da: Safari'de aç, Paylaş, Ana Ekrana Ekle. Ana ekrandaki uygulamanın depolama alanı Safari'ninkinden ayrıdır; bağlantıyı kurulu uygulamanın içinde bir kez daha girmen gerekir.

## Gizlilik

- Garmin verisi yalnız kendi Cloudflare D1 veritabanında durur. Depoda ham sağlık verisi, anahtar ya da Worker adresi yoktur.
- Cihaz anahtarı, Worker adresi ve son görülen veri tarayıcının `localStorage` alanında tutulur. Ayarlar'daki "Bağlantıyı kaldır" üçünü de siler.
- Gemini'ye yalnız bugünün özet sayıları ve ölçüm adları gider: tarih, ad, aktivite ya da ham kayıt gönderilmez. `GEMINI_API_KEY` tanımlı değilse hiçbir şey gönderilmez. Uygulamada Ayarlar'daki "Yapay zekâ yorumu" anahtarı yorumu kapatır; kalıcı kapatmak için secret'ı silmen yeter.

## Güvenlik notları

- **Ortak köken:** `localStorage` aynı kökene bağlıdır ve `KULLANICI.github.io` altındaki bütün siteler aynı kökeni paylaşır. Aynı hesapta güvenmediğin bir kod barındırırsan cihaz anahtarını ve önbellekteki veriyi okuyabilir. Aynı hesaptan başka bir şey yayınlama ya da kendi alan adını kullan.
- **Worker adresi sınırı:** Sayfanın içerik güvenlik politikası yalnız `*.workers.dev` ve localhost adreslerine bağlantıya izin verir. Worker'ı başka bir alan adına koyarsan `uygulama/index.html` içindeki `connect-src` değerini de güncellemelisin.

## Geliştirme

```
npm test
python3 -m http.server 4173 --directory uygulama
```

İkinci komut uygulamayı `http://localhost:4173/` adresinde açar. Testler yalnız Node'un yerleşik modüllerini kullanır, bağımlılık kurmak gerekmez (yalnız `wrangler` için `npm install` gerekir). Yayın klasörünü elle hazırlamak için: `node tools/yayin-hazirla.mjs <hedef> <surum>`.
