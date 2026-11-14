(() => {
  const AD = { tik: 'Buton', gecis: 'Geçiş', can: 'Oturma' };
  function ozet() {
    document.getElementById('ozet').textContent = ['tik', 'gecis', 'can'].map((t) => `${AD[t]}: ${(SES.SECENEK[t][SES.ayar[t]] || {}).ad || '?'}`).join('  |  ');
  }
  for (const tur of ['tik', 'gecis', 'can']) {
    const kap = document.getElementById(tur);
    for (const [id, s] of Object.entries(SES.SECENEK[tur])) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ses';
      b.setAttribute('aria-pressed', SES.ayar[tur] === id);
      b.innerHTML = `<span><b>${s.ad}</b><span>${s.tarif}</span></span><i aria-hidden="true"></i>`;
      b.addEventListener('click', () => {
        SES.ac(); SES.ayar.acik = true; SES.ayar[tur] = id; SES.kaydet();
        kap.querySelectorAll('.ses').forEach((x) => x.setAttribute('aria-pressed', x === b));
        if (tur === 'gecis') { SES.cal(tur, id, true); setTimeout(() => SES.cal(tur, id, false), 1100); }
        else if (tur === 'can') SES.cal(tur, id, 0.6);
        else SES.cal(tur, id);
        ozet();
      });
      kap.appendChild(b);
    }
  }
  ozet();
})();
