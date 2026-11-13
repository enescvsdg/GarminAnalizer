// Garmin Connect Personal API istemcisi. Yalnızca web-standart API'ler kullanır.
const BASE = 'https://personal.connectapi.garmin.com';
const TOKEN_YOLU = '/personalapitoken-service/personal-api/personal-api-key/token';
const YENILEME_ESIGI = 3600; // saniye

export class GarminKeyHatasi extends Error {
  constructor(mesaj) {
    super(mesaj);
    this.name = 'GarminKeyHatasi';
  }
}

export class GarminGeciciHata extends Error {
  constructor(mesaj, durum) {
    super(mesaj);
    this.name = 'GarminGeciciHata';
    this.durum = durum;
  }
}

// JWT'nin exp alanı (saniye); çözülemezse 0.
export function jwtBitis(token) {
  try {
    const parca = String(token).split('.')[1];
    if (!parca) return 0;
    let b64 = parca.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const exp = JSON.parse(atob(b64)).exp;
    return Number.isFinite(exp) ? exp : 0;
  } catch {
    return 0;
  }
}

export function garminIstemci({ apiKey, fetch, tokenOku, tokenYaz, simdi }) {
  async function tokenYenile() {
    const r = await fetch(BASE + TOKEN_YOLU, {
      method: 'POST',
      headers: { Authorization: 'ApiKey ' + apiKey },
    });
    if (r.status === 401 || r.status === 403) {
      throw new GarminKeyHatasi(`Garmin token uç noktası reddetti (HTTP ${r.status})`);
    }
    if (!r.ok) {
      throw new GarminGeciciHata(`Garmin token alınamadı (HTTP ${r.status})`, r.status);
    }
    const token = (await r.text()).trim();
    if (!token) {
      throw new GarminGeciciHata(`Garmin token yanıtı boş (HTTP ${r.status})`, r.status);
    }
    const bitis = jwtBitis(token) || simdi() + 86400 - YENILEME_ESIGI;
    await tokenYaz({ access_token: token, expires_at: bitis });
    return token;
  }

  async function tokenAl(zorla) {
    if (!zorla) {
      const onbellek = await tokenOku();
      if (onbellek && onbellek.expires_at - simdi() > YENILEME_ESIGI) {
        return onbellek.access_token;
      }
    }
    return tokenYenile();
  }

  function adres(yol, params) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null) q.set(k, String(v));
    }
    const s = q.toString();
    return BASE + yol + (s ? '?' + s : '');
  }

  const istekAt = (url, token) =>
    fetch(url, { headers: { Authorization: 'Bearer ' + token } });

  async function get(yol, params) {
    const url = adres(yol, params);
    let r = await istekAt(url, await tokenAl(false));
    if (r.status === 401) {
      r = await istekAt(url, await tokenAl(true));
      if (r.status === 401) {
        throw new GarminKeyHatasi(`Garmin yenilenen token ile de reddetti: ${yol} (HTTP 401)`);
      }
    }
    if (!r.ok) {
      throw new GarminGeciciHata(`Garmin isteği başarısız: ${yol} (HTTP ${r.status})`, r.status);
    }
    return r.json();
  }

  return { get };
}
