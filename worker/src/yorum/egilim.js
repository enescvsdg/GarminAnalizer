// Ölçüm eğilim yorumları: son 28 günün ölçüm başına ÖZET sayıları Gemini'ye gider, her ölçüm için
// 1-2 cümle gelir. Tarih, gün adı, gün gün değer ve aktivite GİTMEZ. Bugünkü hüküm yorumuyla aynı
// ayar, aynı günlük istek sayacı ve aynı doğrulama kuralları geçerlidir (yorum.js).
import { OLCUMLER, gunDegerleri, bant, durum, dolu } from '../stats/baseline.js';
import { gunEkle } from '../zaman.js';
import { durumOku, durumYaz } from '../db.js';
import {
  temizle, karmaHesapla, sayilarGirdiden, yapayZekaAcik, gunlukHakAl,
} from './yorum.js';

const PENCERE = 28;
const SON_GUN = 7;
const EN_AZ_VERI = 10; // bundan az günü dolu ölçüm özete girmez
const EN_AZ_PENCERE = 3; // son 7 ya da önceki 21 günde bundan az değer varsa yön cümlesi yok
const YON_ESIGI = 0.1; // bant genişliğinin %10'u
const HATA_SINIRI = 2;
const GUNLUK_YAZIM = 2; // günde en çok bu kadar başarılı eğilim yazımı
const EN_FAZLA_KARAKTER = 240;

export const EGILIM_SISTEM = [
  'Bir koşucu için ölçüm eğilimi özeti yazıyorsun. Okuyana "sen" diye hitap et, Türkçe yaz.',
  'Verilen her ölçüm satırı için, satırın başındaki köşeli parantezli kimliği "id" olarak kullanıp 1-2 cümlelik "metin" yaz; en çok 200 karakter olsun.',
  'Yalnız satırdaki sayılara dayan; sayı uydurma, verilmeyen bir ölçümden söz etme, ölçümlerin nedenini uydurma.',
  'Tıbbi teşhis, ilaç, hastalık adı yazma, doktora yönlendirme. Emoji kullanma. Ölçümleri verilen Türkçe adlarıyla an.',
  'Öneri verirsen yalnız genel yaşam düzeyinde olsun (örneğin "uyku saatini erkene almayı dene").',
].join(' ');

export const EGILIM_SEMA = {
  type: 'object',
  properties: {
    yorumlar: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, metin: { type: 'string' } }, required: ['id', 'metin'] },
    },
  },
  required: ['yorumlar'],
};

const sayiMetni = (x) => String(Math.round(x * 10) / 10);
const ortalama = (a) => a.reduce((t, v) => t + v, 0) / a.length;

function olcumSatiri(o, degerler, b) {
  const var_ = degerler.filter(dolu);
  const aralik = `${b.kisisel ? 'normal' : 'genel'} aralık ${sayiMetni(b.min)}–${sayiMetni(b.max)}`;
  let alt = 0;
  let ust = 0;
  for (const v of var_) {
    const d = durum(b, v);
    if (d === 'lo') alt += 1;
    if (d === 'hi') ust += 1;
  }
  const parcalar = [
    `${o.ad}: ${PENCERE} günde ${var_.length} gün veri`,
    `ortalama ${sayiMetni(ortalama(var_))}${o.birim}`,
    aralik,
    `${alt} gün altında, ${ust} gün üstünde`,
  ];
  const son = degerler.slice(PENCERE - SON_GUN).filter(dolu);
  const onceki = degerler.slice(0, PENCERE - SON_GUN).filter(dolu);
  if (son.length >= EN_AZ_PENCERE && onceki.length >= EN_AZ_PENCERE) {
    const s = ortalama(son);
    const e = ortalama(onceki);
    const fark = s - e;
    const yon = Math.abs(fark) < YON_ESIGI * (b.max - b.min) ? 'aynı' : fark > 0 ? 'yükseldi' : 'düştü';
    parcalar.push(`son ${SON_GUN} gün ortalaması ${sayiMetni(s)}, önceki ${PENCERE - SON_GUN} gün ${sayiMetni(e)}, ${yon}`);
  }
  parcalar.push(o.iyi > 0 ? 'yüksek değer iyi' : 'düşük değer iyi');
  return `[${o.id}] ${parcalar.join('; ')}.`;
}

// Gemini'ye gidecek düz metin: ölçüm başına tek satır, yalnız özet sayılar.
export async function egilimOzeti(satirlar, bugun) {
  const gunler = [];
  for (let i = PENCERE - 1; i >= 0; i -= 1) gunler.push(gunDegerleri(satirlar, gunEkle(bugun, -i)));
  const satir = [];
  const olcumler = [];
  for (const o of OLCUMLER) {
    const degerler = gunler.map((d) => d[o.id]);
    if (degerler.filter(dolu).length < EN_AZ_VERI) continue;
    satir.push(olcumSatiri(o, degerler, bant(satirlar, o, bugun)));
    olcumler.push(o.id);
  }
  if (!satir.length) return null;
  const metin = [`Son ${PENCERE} günün ölçüm özeti (bugün dahil); satır başındaki köşeli parantez kimliktir:`, ...satir].join('\n');
  return { metin, karma: await karmaHesapla(metin), olcumler };
}

const YASAK_KELIME = new RegExp(
  ['teşhis', 'ilaç', 'hastalık', 'tedavi', 'doktor', 'hekim', 'kanser', 'enfeksiyon', '(?<![\\p{L}])tanı(?![\\p{L}])'].join('|'),
  'u',
);

// Yalnız özetteki kimlikler; her metin hüküm yorumuyla aynı karakter kuralından, girdideki sayı kuralından,
// uzunluk sınırından ve yasak kelimelerden geçer. Geçmeyen ölçüm atılır.
export function egilimGecerli(ham, ozet) {
  const sonuc = {};
  if (!ham || typeof ham !== 'object' || !Array.isArray(ham.yorumlar) || !ozet) return sonuc;
  for (const y of ham.yorumlar) {
    if (!y || typeof y !== 'object' || typeof y.id !== 'string') continue;
    if (!ozet.olcumler.includes(y.id) || Object.hasOwn(sonuc, y.id)) continue;
    const t = temizle(y.metin, EN_FAZLA_KARAKTER, 0);
    const satir = ozet.metin.split('\n').find((s) => s.startsWith(`[${y.id}] `));
    if (!t || !satir || YASAK_KELIME.test(t.toLocaleLowerCase('tr')) || !sayilarGirdiden(t, satir)) continue;
    sonuc[y.id] = t;
  }
  return sonuc;
}

const bos = (o) => Object.keys(o).length === 0;

export async function egilimGuncelle({ db, satirlar, bugun, simdiMs, yaz }) {
  if (!(await yapayZekaAcik(db))) return { durum: 'kapali' };
  const ozet = await egilimOzeti(satirlar, bugun);
  if (!ozet) return { durum: 'veri-yok' };

  const kayit = await durumOku(db, 'egilim');
  if (kayit?.tarih === bugun && kayit.karma === ozet.karma) return { durum: 'ayni' };

  const hata = await durumOku(db, 'egilim_hata');
  const hataSayisi = hata?.tarih === bugun && hata.karma === ozet.karma ? hata.n : 0;
  if (hataSayisi >= HATA_SINIRI) return { durum: 'hata' };

  const gun = await durumOku(db, 'egilim_gun');
  const yazim = gun?.tarih === bugun ? gun.n : 0;
  if (yazim >= GUNLUK_YAZIM) return { durum: 'sinir' };

  if (!(await gunlukHakAl(db, bugun))) return { durum: 'sinir' }; // istekten ÖNCE; sayaç hüküm yorumuyla ortak

  let ham = null;
  try {
    ham = await yaz(ozet.metin);
  } catch {
    ham = null;
  }
  const yorumlar = egilimGecerli(ham, ozet);
  if (bos(yorumlar)) {
    await durumYaz(db, 'egilim_hata', { tarih: bugun, karma: ozet.karma, n: hataSayisi + 1 });
    return { durum: 'hata' };
  }
  if (!(await yapayZekaAcik(db))) return { durum: 'kapali' }; // istek sürerken kapatıldı
  // metin: gün içinde karma kayarsa kayıt, GÖNDERİLEN metne karşı yeniden doğrulanabilsin diye saklanır.
  const kayitJson = JSON.stringify({ tarih: bugun, karma: ozet.karma, yorumlar, uretildi: simdiMs, metin: ozet.metin });
  const [sayac] = await db.batch([
    db.prepare(`INSERT INTO sync_state (key, value) VALUES ('egilim_gun', json_object('tarih', ?, 'n', 1))
      ON CONFLICT(key) DO UPDATE SET value = json_object('tarih', ?, 'n',
        CASE WHEN json_extract(value, '$.tarih') = ? THEN json_extract(value, '$.n') + 1 ELSE 1 END)
      WHERE COALESCE(json_extract(value, '$.tarih'), '') < ?
        OR (json_extract(value, '$.tarih') = ? AND json_extract(value, '$.n') < ?)`)
      .bind(bugun, bugun, bugun, bugun, bugun, GUNLUK_YAZIM),
    db.prepare(`INSERT INTO sync_state (key, value) SELECT 'egilim', ? WHERE changes() = 1
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(kayitJson),
  ]);
  if (sayac.meta.changes === 0) return { durum: 'sinir' };
  return { durum: 'yazildi' };
}

// Bugünün kaydı (karma gün içinde kaysa da) gösterilir; dünkü kayıt asla. Kayıt her okumada yeniden doğrulanır.
export async function egilimOku(db, bugun, satirlar) {
  if (!(await yapayZekaAcik(db))) return null;
  const kayit = await durumOku(db, 'egilim');
  if (!kayit || typeof kayit !== 'object' || kayit.tarih !== bugun) return null;
  const ozet = await egilimOzeti(satirlar, bugun);
  if (!ozet) return null;
  if (ozet.karma !== kayit.karma && typeof kayit.metin === 'string'
      && await karmaHesapla(kayit.metin) !== kayit.karma) return null;
  const girdi = ozet.karma === kayit.karma || typeof kayit.metin !== 'string' ? ozet : { olcumler: ozet.olcumler, metin: kayit.metin };
  const yorumlar = egilimGecerli({ yorumlar: Object.entries(kayit.yorumlar ?? {}).map(([id, metin]) => ({ id, metin })) }, girdi);
  return bos(yorumlar) ? null : yorumlar;
}
