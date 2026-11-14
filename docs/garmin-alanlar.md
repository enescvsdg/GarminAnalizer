# Garmin Connect Personal API: alan haritası

Kaynak: 2026-11-13 keşif çalıştırması (`tools/kesif.mjs`), yapı doğrulaması `kesif/ornek/*.json` anonim örnekleriyle yapıldı, limitler `kesif/rapor.json`'dan alındı.

## Uç noktalar

Senkronizasyonun kullandığı üç uç nokta ve etkinlikler; her yol `kesif/ornek/` içinde doğrulandı.

### dailysummaries (kullanılıyor)
- Biçim: nesne `{ data: [...] }`; gün anahtarı `data[].calendarDate` (`YYYY-MM-DD`).
- Kullanılan alanlar: `heartRate.restingValue`, `stress.avgLevel`, `bodyBattery.maxValue`, `bodyBattery.minValue`, `movement.steps.value`, `intensityMinutes.moderate`, `intensityMinutes.vigorous`, `calories.burnedTotal`.

### sleep (kullanılıyor)
- Biçim: dizi; gün anahtarı `[].calendarDate`.
- Kullanılan alanlar: `[].sleepScores.overall.value`, `[].sleepTimeSeconds`.

### hrv (kullanılıyor)
- Biçim: nesne `{ hrvSummaries: [...] }`; gün anahtarı `hrvSummaries[].calendarDate`.
- Kullanılan alan: `hrvSummaries[].lastNightAvg`.

### activities (kullanılıyor)
- Biçim: dizi (arama sonucu); her öğe bir etkinlik.
- Kullanılan alanlar: `activityId`, `startTimeLocal`, `activityType.typeKey`, `beginTimestamp`, `duration`, `distance`, `averageHR`.

### bodybattery, stress, steps (kullanılmıyor, yedek kaynak)
Verileri zaten `dailysummaries` içinde var; senkronizasyon bunları çağırmaz ve bunların anonim örnekleri `kesif/ornek/` içinde tutulmaz.
- bodybattery: dizi, gün `[].date`.
- stress: dizi, gün `[].calendarDate`, değer `[].values.overallStressLevel`.
- steps: dizi, gün `[].calendarDate`, değer `[].totalSteps`.

## Hedef alan eşlemesi (sonraki görevin uygulayacağı)

| hedef | kaynak |
|---|---|
| sleep_score | sleep `[].sleepScores.overall.value` |
| sleep_seconds | sleep `[].sleepTimeSeconds` |
| hrv_avg | hrv `hrvSummaries[].lastNightAvg` |
| resting_hr | dailysummaries `data[].heartRate.restingValue` |
| stress_avg | dailysummaries `data[].stress.avgLevel` |
| bb_high | dailysummaries `data[].bodyBattery.maxValue` |
| bb_low | dailysummaries `data[].bodyBattery.minValue` |
| steps | dailysummaries `data[].movement.steps.value` |
| intensity_minutes | dailysummaries `data[].intensityMinutes.moderate + 2 × data[].intensityMinutes.vigorous` (Garmin Connect'in gösterdiği toplam) |
| calories | dailysummaries `data[].calories.burnedTotal` |

Etkinlikler (tablo `activities`):

| hedef | kaynak |
|---|---|
| id | `activityId` |
| date | `startTimeLocal` değerinin tarih kısmı |
| type | `activityType.typeKey` |
| start_ts | `beginTimestamp` |
| duration_s | `duration` |
| distance_m | `distance` |
| avg_hr | `averageHR` |

## Ölçülen limitler (2026-11-13)

- Tüm uç noktalar HTTP 200 döndü.
- Token ömrü: 24 saat.
- dailysummaries aralık isteği: 7, 28 ve 90 gün için HTTP 200; sırasıyla 7, 28 ve 90 öğe döndü.
- Geçmiş derinliği: 90 ve 180 gün öncesi dolu, 365 gün öncesi boş (HTTP 200, boş sonuç).
- Keşif yaklaşık 14 istek gönderdi; 429 görülmedi.

## Varsayımlar (henüz doğrulanmadı)

- sleep `calendarDate` uyanma gününü gösterir.
- Veri yok anlamında negatif veya `-1` değerler kullanılıyor olabilir.
- Saatin takılmadığı günlerde bir alan yok veya `null` olabilir.
- `hrvSummaries` bazı günleri tamamen atlayabilir.

## Anonim örnekler (`kesif/ornek/`)

`tools/ornek-yenile.mjs`, gerçek yanıtlardan (`kesif/ham/`, git dışı) bu örnekleri ağsız üretir. Kural seti `tools/anonim.mjs` içindedir.

- Korunan: JSON yapısı, anahtar adları, tarih (`YYYY-MM-DD`) ve tarih-saat biçimi, tam sayı/ondalık ayrımı, `null` ve `boolean`.
- Maskelenen: tarih olmayan her metin yalnız `x` karakterlerine döner (ad, görünen ad, görsel adresi, cihaz/üretici, geri bildirim anahtarları, serbest metin); tarih-saat değerlerinde saat 00:00:00 olur; kimlik benzeri sayılar (id, pk, uuid) ve enlem/boylam, saat dilimi/ofset sayıları 0 olur.
- Sınırlama: diğer sayılar gerçek değerlerin en çok ±%15 kaydırılmış halidir (epoch zaman damgaları dahil) ve takvim tarihleri gerçektir. Örnekler yapı ve tür doğrulaması içindir, ölçüm doğruluğu için kullanılmaz.

## Canlıda ölçülenler (2026-11-14)

- Worker yayında; zamanlayıcı her 15 dakikada tetiklenir, eşitleme **saatte bir** çalışır (kullanıcı kararı). Bir eşitleme dört istek atar (dailysummaries, sleep, hrv, activities): günde yaklaşık 100 istek. 429 görülmedi.
- Geçmiş doldurma 28 günlük parçalarla yaklaşık 3 saatte bitti: 347 gün, en eski gün 2025-12-02. Daha eskisi boş döndü (ardışık iki boş parça → bitti).
- Yeni yayınlanan zamanlayıcı ilk çeyrek saati atladı; ilk tetikleme yayından ~20 dakika sonra geldi.
- Token uç noktası yanlış anahtarda reddediyor; Worker bunu `key_durum = gecersiz` olarak kaydeder ve 24 saatte bir yeniden dener. Reddin HTTP kodu loga yazılır. Cloudflare çıkış adresleri Garmin tarafından engellenmiyor.
- Bugün (devam eden gün) için dailysummaries dolu gelir: adım, dinlenme nabzı, en yüksek nabız, Body Battery, stres gün içinde güncellenir. Tazelik saatin Garmin Connect'e eşitlenmesine bağlıdır.
- Uyku ve HRV saat takılmayan gecelerde boş gelir (ilk 31 günde 24 gece dolu).
- Uygulamadaki uyku skoru, dinlenme nabzı ve Body Battery, Garmin Connect ile karşılaştırıldı: aynı (kullanıcı doğruladı).

## Gemini (2026-11-14)

- Uç nokta: `POST https://generativelanguage.googleapis.com/v1beta/interactions` (Google'ın "Interactions API"si; eski `generateContent` hâlâ çalışıyor ama "eski" sayılıyor). Başlık `x-goog-api-key`. Gövde: `model`, `input`, `system_instruction`, `store: false`, `generation_config.thinking_level`, `response_format` (JSON şeması).
- Model `GEMINI_MODEL` değişkeni: `gemini-3.5-flash-lite`.
- Yanıt metni `worker/src/yorum/gemini.js` içindeki `metniCikar` ile çıkarılır; canlıda ilk denemede çalıştı.
- Günde en çok 24 istek (kendi sınırımız); aynı girdi için ikinci istek atılmaz. Ücretsiz katmanın gerçek sınırı AI Studio'daki hesap sayfasında görünür.
