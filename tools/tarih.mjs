// Takvim günü Europe/Istanbul saatine göre hesaplanır (UTC değil).
const bicim = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
export const istanbulGunu = (tarih) => bicim.format(tarih);
