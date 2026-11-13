// Tarih yardımcıları: yalnızca web standardı API'ler.
export function yerelTarih(ms, dilim = 'Europe/Istanbul') {
  // 'en-CA' biçimi YYYY-MM-DD verir
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: dilim, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ms);
}

// Saf takvim aritmetiği: UTC kullanır, saat dilimi kayması olmaz.
export function gunEkle(tarih, n) {
  const [y, m, g] = tarih.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, g + n)).toISOString().slice(0, 10);
}
