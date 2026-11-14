// Gemini Interactions API istemcisi. Yalnız HTTP; asla fırlatmaz.
// Anahtar yalnız başlıkta gider; URL'ye, hata iletisine ve loga girmez.
const URL_TABAN = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const bos = (s) => typeof s !== 'string' || s === '';

export function metniCikar(yanit) {
  if (!yanit || typeof yanit !== 'object') return null;
  if (!bos(yanit.output_text)) return yanit.output_text;
  if (Array.isArray(yanit.steps)) {
    const m = yanit.steps
      .filter((s) => s?.type === 'model_output' && Array.isArray(s.content))
      .flatMap((s) => s.content)
      .filter((c) => c?.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('');
    if (m !== '') return m;
  }
  if (Array.isArray(yanit.outputs)) {
    const m = yanit.outputs
      .filter((c) => c?.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('');
    if (m !== '') return m;
  }
  const parcalar = yanit.candidates?.[0]?.content?.parts;
  if (Array.isArray(parcalar)) {
    const m = parcalar.filter((p) => typeof p?.text === 'string').map((p) => p.text).join('');
    if (m !== '') return m;
  }
  return null;
}

export async function geminiYaz({ apiKey, model, fetch, sistem, girdi, sema, zamanAsimiMs = 12000, gunluk }) {
  // Günlük yalnız { asama, kod? } alır; içerik, girdi ve anahtar aktarılmaz.
  const not = (olay) => {
    try { gunluk?.(olay); } catch { /* günlük hatası sonucu etkilemez */ }
  };
  const kontrol = new AbortController();
  let zamanlayici;
  const zamanAsimi = new Promise((coz) => {
    zamanlayici = setTimeout(() => { kontrol.abort(); coz('zaman'); }, zamanAsimiMs);
  });
  try {
    const istek = (async () => {
      const govde = JSON.stringify({
        model,
        input: girdi,
        system_instruction: sistem,
        store: false,
        generation_config: { thinking_level: 'minimal', max_output_tokens: 600 },
        response_format: { type: 'text', mime_type: 'application/json', schema: sema },
      });
      const r = await fetch(URL_TABAN, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: govde,
        signal: kontrol.signal,
      });
      if (r.status !== 200) return { asama: 'http', kod: r.status };
      try {
        return { yanit: await r.json() };
      } catch (hata) {
        if (kontrol.signal.aborted) throw hata;
        return { asama: 'bicim' };
      }
    })().catch(() => ({ asama: kontrol.signal.aborted ? 'zaman' : 'ag' }));
    const s = await Promise.race([istek, zamanAsimi.then((asama) => ({ asama }))]);
    if (s.asama) {
      not(s.kod === undefined ? { asama: s.asama } : { asama: s.asama, kod: s.kod });
      return null;
    }
    const yanit = s.yanit;
    if (yanit && typeof yanit === 'object' && yanit.status !== undefined && yanit.status !== 'completed') {
      not({ asama: 'durum' });
      return null;
    }
    const metin = metniCikar(yanit);
    let nesne = null;
    try { nesne = metin === null ? null : JSON.parse(metin); } catch { nesne = null; }
    if (nesne === null || typeof nesne !== 'object' || Array.isArray(nesne)) {
      not({ asama: 'bicim' });
      return null;
    }
    return nesne;
  } catch {
    not({ asama: 'ag' });
    return null;
  } finally {
    clearTimeout(zamanlayici);
  }
}
