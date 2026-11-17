// Bugünün hüküm ve gerekçesini Gemini'ye yazdırma kararı. Gemini yalnız iki metni yazar;
// enerji, bant ve durumlar şablondan gelir ve Gemini'den etkilenmez.
import { geminiOlcumleri, gunDegerleri, bant, durum } from '../stats/baseline.js';
import { enerji, hukum } from '../stats/ozet.js';
import { durumOku, durumYaz } from '../db.js';

export const GUNLUK_SINIR = 24; // kullanıcı kararı (2026-11-14): saatlik eşitlemeyle uyumlu
const HATA_SINIRI = 2;

export const SISTEM = [
  'Bir koşucu için günlük toparlanma özeti yazıyorsun. Okuyana "sen" diye hitap et, Türkçe yaz.',
  'Yalnız şu iki alanı üret: "hukum" ve "gerekce".',
  '"hukum" en çok 4 kelime olsun ve verilen şablon hüküm kademesiyle aynı yönde olsun; kademe hafif ya da dinlenme yönündeyse "tam gaz" gibi tam tersi bir hüküm yazma.',
  '"gerekce" 1-2 cümle olsun, en çok 220 karakter, yalnız verilen sayılara dayansın; sayı uydurma, verilmeyen bir ölçümden söz etme.',
  'Tıbbi teşhis, ilaç, hastalık adı yazma. Emoji kullanma. Ölçümleri verilen Türkçe adlarıyla an.',
].join(' ');

export const SEMA = {
  type: 'object',
  properties: { hukum: { type: 'string' }, gerekce: { type: 'string' } },
  required: ['hukum', 'gerekce'],
};

const sayiMetni = (x) => String(Math.round(x * 10) / 10);
const DURUM_METNI = { lo: 'altında', ok: 'normalde', hi: 'üstünde' };
const enc = new TextEncoder();

export async function karmaHesapla(metin) {
  const ozet = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(metin)));
  return Array.from(ozet, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// Gemini'ye gidecek düz metin: yalnız bugünün özet sayıları. Tarih, ad, aktivite, ham alan yok.
export async function ozetGirdisi(satirlar, bugun) {
  const d = gunDegerleri(satirlar, bugun);
  const bantlar = Object.fromEntries(geminiOlcumleri().map((o) => [o.id, bant(satirlar, o, bugun)]));
  const e = enerji(d, bantlar);
  if (e === null) return null;
  const kademe = hukum(e);
  const satir = geminiOlcumleri().map((o) => {
    const b = bantlar[o.id];
    const v = d[o.id];
    const aralik = `${b.kisisel ? 'normal' : 'genel'} aralık ${sayiMetni(b.min)}–${sayiMetni(b.max)}`;
    const yon = o.iyi > 0 ? 'yüksek değer iyi' : o.iyi < 0 ? 'düşük değer iyi' : null;
    if (v === null || v === undefined) return `${o.ad}: veri yok; ${aralik}${yon ? `; ${yon}` : ''}.`;
    return `${o.ad}: ${sayiMetni(v)}${o.birim}; ${aralik}; ${DURUM_METNI[durum(b, v)]}${yon ? `; ${yon}` : ''}.`;
  });
  const metin = [
    'Bugünün ölçümleri:',
    ...satir,
    `Enerji: ${e.toFixed(2)} (0.00–1.00 ölçeği)`,
    `Şablon hüküm kademesi: ${kademe}`,
  ].join('\n');
  return { metin, karma: await karmaHesapla(metin), kademe, enerji: e };
}

export const YASAK = new RegExp('[<>{}]|http|[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2069\\ufeff\\u00ad]|\\p{Extended_Pictographic}', 'iu');

export function temizle(s, enFazlaKarakter, enFazlaKelime) {
  if (typeof s !== 'string' || YASAK.test(s)) return null;
  const t = s.trim().replace(/\s+/g, ' ');
  if (t === '' || t.length > enFazlaKarakter) return null;
  if (enFazlaKelime && t.split(' ').length > enFazlaKelime) return null;
  return t;
}

export function yorumGecerli(y) {
  if (!y || typeof y !== 'object') return null;
  const h = temizle(y.hukum, 40, 5);
  const g = temizle(y.gerekce, 260, 0);
  return h && g ? { hukum: h, gerekce: g } : null;
}

// Yön denetimi: metin günün enerjisine ters düşmemeli. Olumsuzlama ÖZEL İŞLENMEZ:
// "zorlama" da "zorla" ile eşleşip reddedilir; bilerek muhafazakâr (yanlış red zararsız, yanlış kabul değil).
const HIZLI = ['tam gaz', 'hızlan', 'bastır', 'zorla', 'yüklen', 'sert antrenman', 'sınırlarını zorla', 'patlat', 'yoğun antrenman', 'rekor'];
const DINLENME = ['dinlen', 'hafif tut', 'yavaşla', 'ara ver', 'mola', 'bırak'];

export function yonUyumlu({ hukum, gerekce }, enerji) {
  const h = String(hukum).toLocaleLowerCase('tr');
  const g = String(gerekce).toLocaleLowerCase('tr');
  if (enerji < 0.48) return !HIZLI.some((k) => `${h} ${g}`.includes(k));
  if (enerji >= 0.62) return !DINLENME.some((k) => h.includes(k));
  return true;
}

const sayilar = (m) => (String(m).match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => String(Number(x.replace(',', '.'))));

// Gerekçedeki her sayı girdi metninde geçmeli (hüküm denetlenmez).
export function sayilarGirdiden(gerekce, girdiMetni) {
  const izinli = new Set(sayilar(girdiMetni));
  return sayilar(gerekce).every((n) => izinli.has(n));
}

const metinUygun = (y, girdi) => yonUyumlu(y, girdi.enerji) && sayilarGirdiden(y.gerekce, girdi.metin);

// Ayar tek yerde: sync_state['ayar_yapay_zeka'] (boolean). Kayıt yoksa AÇIK sayılır.
export async function yapayZekaAcik(db) {
  return (await durumOku(db, 'ayar_yapay_zeka')) !== false;
}

export async function yapayZekaYaz(db, acik) {
  // Kapatınca kayıtlı yorum SİLİNMEZ: yorumOku kapalıyken null döndürdüğü için gösterilmez,
  // yeniden açılınca (veri değişmediyse) hemen geri gelir. Kapalıyken Gemini'ye istek gitmez.
  await durumYaz(db, 'ayar_yapay_zeka', acik === true);
}

// Tek SQL ifadesi sınırı denetleyip hakkı ayırır; eşzamanlı yorumlar aynı hakkı kullanamaz.
export async function gunlukHakAl(db, bugun) {
  const r = await db.prepare(`INSERT INTO sync_state (key, value) VALUES ('yorum_sayac', json_object('tarih', ?, 'n', 1))
    ON CONFLICT(key) DO UPDATE SET value = json_object('tarih', ?, 'n',
      CASE WHEN json_extract(value, '$.tarih') = ? THEN json_extract(value, '$.n') + 1 ELSE 1 END)
    WHERE COALESCE(json_extract(value, '$.tarih'), '') < ?
      OR (json_extract(value, '$.tarih') = ? AND json_extract(value, '$.n') < ?)
    RETURNING value`).bind(bugun, bugun, bugun, bugun, bugun, GUNLUK_SINIR).first();
  return r !== null;
}

export async function yorumGuncelle({ db, satirlar, bugun, simdiMs, yaz }) {
  if (!(await yapayZekaAcik(db))) return { durum: 'kapali' };
  const girdi = await ozetGirdisi(satirlar, bugun);
  if (!girdi) return { durum: 'veri-yok' };

  const kayit = await durumOku(db, 'yorum');
  if (kayit?.tarih === bugun && kayit.karma === girdi.karma) return { durum: 'ayni' };

  const hata = await durumOku(db, 'yorum_hata');
  const hataSayisi = hata?.tarih === bugun && hata.karma === girdi.karma ? hata.n : 0;
  if (hataSayisi >= HATA_SINIRI) return { durum: 'hata' };

  if (!(await gunlukHakAl(db, bugun))) return { durum: 'sinir' }; // istekten ÖNCE

  let ham = null;
  try {
    ham = await yaz(girdi.metin);
  } catch {
    ham = null;
  }
  const gecerli = yorumGecerli(ham);
  const y = gecerli && metinUygun(gecerli, girdi) ? gecerli : null;
  if (!y) {
    await durumYaz(db, 'yorum_hata', { tarih: bugun, karma: girdi.karma, n: hataSayisi + 1 });
    return { durum: 'hata' };
  }
  if (!(await yapayZekaAcik(db))) return { durum: 'kapali' }; // istek sürerken kapatıldı
  await durumYaz(db, 'yorum', { tarih: bugun, karma: girdi.karma, hukum: y.hukum, gerekce: y.gerekce, uretildi: simdiMs });
  return { durum: 'yazildi' };
}

// Kayıt bugüne ve güncel girdiye aitse yorum, değilse null (veri değiştiyse eski yorum gösterilmez).
export async function yorumOku(db, bugun, satirlar) {
  if (!(await yapayZekaAcik(db))) return null;
  const kayit = await durumOku(db, 'yorum');
  if (!kayit || kayit.tarih !== bugun) return null;
  const girdi = await ozetGirdisi(satirlar, bugun);
  if (!girdi || girdi.karma !== kayit.karma) return null;
  const y = yorumGecerli(kayit);
  return y && metinUygun(y, girdi) ? y : null;
}
