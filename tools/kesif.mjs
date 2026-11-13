// Garmin Connect Personal API keşfi: alan adları, aralık sınırı, geçmiş derinliği.
// Key hiçbir yere yazdırılmaz/kaydedilmez. Ham yanıtlar kesif/ham/ (git-ignored).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { anonimlestir } from './anonim.mjs';
import { yapiOzeti, ozetle } from './yapi.mjs';
import { istanbulGunu } from './tarih.mjs';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const TABAN = 'https://personal.connectapi.garmin.com';
const BEKLEME_MS = 400;

function keyOku() {
  if (process.env.GARMIN_PERSONAL_API_KEY) return process.env.GARMIN_PERSONAL_API_KEY.trim();
  const dosya = `${KOK}worker/.dev.vars`;
  if (!existsSync(dosya)) return null;
  const satir = readFileSync(dosya, 'utf8').split('\n').find((s) => s.startsWith('GARMIN_PERSONAL_API_KEY='));
  if (!satir) return null;
  return satir.slice('GARMIN_PERSONAL_API_KEY='.length).trim().replace(/^["']|["']$/g, '') || null;
}

const key = keyOku();
if (!key) {
  console.error('Hata: GARMIN_PERSONAL_API_KEY bulunamadı. worker/.dev.vars dosyasına ekle veya ortam değişkeni olarak ver.');
  process.exit(1);
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const gun = (geri) => istanbulGunu(new Date(Date.now() - geri * 864e5));

let jwt;
let durduruldu = false;
const rapor = { token: null, uclar: {}, aralik: [], derinlik: [], durdurulduSebep: null };

async function al(yol) {
  const res = await fetch(TABAN + yol, { headers: { Authorization: `Bearer ${jwt}` } });
  await bekle(BEKLEME_MS);
  if (res.status === 429) {
    durduruldu = true;
    rapor.durdurulduSebep = `429 (${yol.split('?')[0]})`;
    console.log('429 alındı, keşif durduruluyor.');
  }
  return { status: res.status, metin: await res.text() };
}

const ayristir = (m) => { try { return JSON.parse(m); } catch { return undefined; } };

const uclar = (b, s) => ({
  dailysummaries: `/usersummary-service/v2/dailysummaries?startDate=${b}&endDate=${s}`,
  sleep: `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${b}&endDate=${s}`,
  bodybattery: `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${b}&endDate=${s}`,
  hrv: `/hrv-service/hrv/daily/${b}/${s}`,
  stress: `/usersummary-service/stats/stress/daily/${b}/${s}`,
  steps: `/usersummary-service/stats/steps/daily/${b}/${s}`,
  activities: `/activitylist-service/activities/search/activities?start=0&limit=20&startDate=${b}&endDate=${s}`,
});

async function main() {
  // 1. Token
  const t = await fetch(`${TABAN}/personalapitoken-service/personal-api/personal-api-key/token`, {
    method: 'POST',
    headers: { Authorization: `ApiKey ${key}` },
  });
  const jwtMetin = (await t.text()).trim();
  rapor.token = { status: t.status };
  if (!t.ok) {
    console.log(`Token HTTP ${t.status}`);
    return;
  }
  jwt = jwtMetin;
  try {
    const exp = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).exp;
    rapor.token.kalanSaat = Math.round(((exp * 1000 - Date.now()) / 36e5) * 10) / 10;
  } catch { rapor.token.kalanSaat = null; }
  console.log(`Token HTTP ${t.status}, kalan süre: ${rapor.token.kalanSaat} saat`);

  mkdirSync(`${KOK}kesif/ham`, { recursive: true });
  mkdirSync(`${KOK}kesif/ornek`, { recursive: true });

  // 2. Yedi uç nokta, son 7 gün
  for (const [ad, yol] of Object.entries(uclar(gun(6), gun(0)))) {
    if (durduruldu) break;
    const { status, metin } = await al(yol);
    rapor.uclar[ad] = { status };
    console.log(`\n== ${ad} (HTTP ${status})`);
    const veri = ayristir(metin);
    if (status >= 200 && status < 300) {
      writeFileSync(`${KOK}kesif/ham/${ad}.json`, metin);
      if (veri !== undefined) {
        writeFileSync(`${KOK}kesif/ornek/${ad}.json`, JSON.stringify(anonimlestir(veri), null, 2));
        console.log(yapiOzeti(veri).join('\n'));
      } else console.log('(JSON değil)');
    }
  }

  // 3. dailysummaries aralık sınırı
  for (const n of [7, 28, 90]) {
    if (durduruldu) break;
    const { status, metin } = await al(uclar(gun(n - 1), gun(0)).dailysummaries);
    const oz = status === 200 ? ozetle(ayristir(metin)) : null;
    rapor.aralik.push({ gun: n, status, ogeSayisi: oz?.sayi ?? null, anahtarlar: oz?.anahtarlar ?? null });
    console.log(`Aralık ${n} gün: HTTP ${status}, öğe ${oz?.sayi ?? null}`);
  }

  // 4. Geçmiş derinliği (tek gün, dailysummaries)
  for (const n of [90, 180, 365]) {
    if (durduruldu) break;
    const { status, metin } = await al(uclar(gun(n), gun(n)).dailysummaries);
    const oz = status === 200 ? ozetle(ayristir(metin)) : null;
    const bos = oz ? oz.bos : null;
    rapor.derinlik.push({ gunOnce: n, status, bos, anahtarlar: oz?.anahtarlar ?? null });
    console.log(`Geçmiş ${n} gün önce: HTTP ${status}, boş: ${bos}`);
  }
}

try {
  await main();
} catch (e) {
  // Hata ayrıntısı (istek başlıkları) basılmaz; yalnızca mesaj.
  console.error(`Hata: ${String(e?.message ?? e).replace(key, '***')}`);
  rapor.durdurulduSebep = 'istisna';
  process.exitCode = 1;
} finally {
  mkdirSync(`${KOK}kesif`, { recursive: true });
  writeFileSync(`${KOK}kesif/rapor.json`, JSON.stringify(rapor, null, 2));
  console.log('\nRapor: kesif/rapor.json');
}
