// Service worker kaydı, güncelleme akışı ve Ayarlar'daki sürüm satırı.
(() => {
  'use strict';
  const sw = navigator.serviceWorker;
  if (!sw) return;

  const BAYRAK = 'gk-yenilendi';
  const depo = {
    al() { try { return sessionStorage.getItem(BAYRAK); } catch (e) { return null; } },
    koy() { try { sessionStorage.setItem(BAYRAK, '1'); } catch (e) { /* depo yok */ } },
    sil() { try { sessionStorage.removeItem(BAYRAK); } catch (e) { /* depo yok */ } },
  };

  // Sayfa açılırken zaten bir denetleyici varsa bu bir güncellemedir; ilk kurulumda yenileme olmaz.
  const guncellemeMi = !!sw.controller;
  let yenileniyor = false;
  sw.addEventListener('controllerchange', () => {
    if (!guncellemeMi || yenileniyor || depo.al()) return;
    yenileniyor = true;
    depo.koy();
    location.reload();
  });

  // Yenilenen sayfa sorunsuz yüklendiyse bayrak silinir: sonraki güncelleme yeniden yenileyebilir.
  const bayragiTemizle = () => { setTimeout(depo.sil, 1500); };

  function surumuYaz() {
    const satir = document.getElementById('surum');
    if (!satir) return;
    sw.ready.then((kayit) => {
      const etkin = kayit && kayit.active;
      if (!etkin) return;
      const kanal = new MessageChannel();
      const zamanAsimi = setTimeout(() => { kanal.port1.close(); }, 3000);
      kanal.port1.onmessage = (olay) => {
        clearTimeout(zamanAsimi);
        kanal.port1.close();
        if (olay.data && typeof olay.data.surum === 'string') {
          satir.textContent = 'Sürüm: ' + olay.data.surum;
          satir.hidden = false;
        }
      };
      etkin.postMessage({ tur: 'surum' }, [kanal.port2]);
    }).catch(() => {});
  }

  function kaydet() {
    sw.register('./sw.js', { scope: './' }).catch((hata) => {
      console.warn('Service worker kaydı başarısız:', hata);
    });
    surumuYaz();
  }

  if (document.readyState === 'complete') { bayragiTemizle(); kaydet(); } else {
    addEventListener('load', () => { bayragiTemizle(); kaydet(); });
  }
})();
