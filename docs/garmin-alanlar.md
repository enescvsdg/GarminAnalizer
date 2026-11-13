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
Verileri zaten `dailysummaries` içinde var; senkronizasyon bunları çağırmaz.
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
- Yaklaşık 17 istek, 400 ms aralıkla gönderildi; 429 görülmedi.

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
