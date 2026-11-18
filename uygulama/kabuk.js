// Service worker kaydı, güncelleme akışı ve Ayarlar'daki sürüm satırı.
(() => {
  'use strict';
  // Sabit ekran: iOS Safari user-scalable=no'yu yok sayar; iki parmak yakınlaştırma gesture olaylarıyla
  // engellenir. touchmove'a dokunulmaz (Trend'de iki parmak çark/sürükleme var); çift dokunma
  // yakınlaştırmasını html/body'deki touch-action: manipulation keser.
  const yakinlastirmaYok = (olay) => { olay.preventDefault(); };
  for (const tur of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(tur, yakinlastirmaYok, { passive: false });

  const sw = navigator.serviceWorker;
  if (!sw) return;

  const BAYRAK = 'gk-yenilendi';
  const depo = {
    al() { try { return sessionStorage.getItem(BAYRAK); } catch (e) { return null; } },
    koy() { try { sessionStorage.setItem(BAYRAK, '1'); } catch (e) { /* depo yok */ } },
    sil() { try { sessionStorage.removeItem(BAYRAK); } catch (e) { /* depo yok */ } },
  };

  // Bu betik sayfadaki ilk betiktir: denetleyici eşzamanlı yakalanır. Her olayda güncellenir;
  // önceki denetleyici varsa bu bir güncellemedir, ilk kurulumda (önceki yok) yenileme olmaz
  // ama aynı sayfadaki sonraki değişim yeniler.
  let onceki = sw.controller;
  let yenileniyor = false;
  sw.addEventListener('controllerchange', () => {
    if (onceki && !yenileniyor && !depo.al()) {
      yenileniyor = true;
      depo.koy();
      location.reload();
    }
    onceki = sw.controller;
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

  // Yerel geliştirmede (localhost) sürüm yer tutucusu hiç değişmez; önbellek-önce çalışan bir worker
  // eski dosyaları sonsuza dek sunar. Bu yüzden yerelde kayıt yapılmaz ve varsa eski kayıt kaldırılır.
  // Yerelde worker'ı denemek için adrese ?sw=1 eklenir.
  const yerel = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname || '');
  const yereldeKapali = yerel && !/[?&]sw=1(&|$)/.test(location.search || '');

  function kaydet() {
    if (yereldeKapali) {
      if (sw.getRegistration) sw.getRegistration('./').then((k) => k && k.unregister()).catch(() => {});
      return;
    }
    sw.register('./sw.js', { scope: './', updateViaCache: 'none' }).catch((hata) => {
      console.warn('Service worker kaydı başarısız:', hata);
    });
  }

  // #surum betik çalışırken henüz olmayabilir: DOM hazır olunca yazılır; kayıt sayfa yüklenince.
  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', surumuYaz);
  } else {
    surumuYaz();
  }
  if (document.readyState === 'complete') { bayragiTemizle(); kaydet(); } else {
    addEventListener('load', () => { bayragiTemizle(); kaydet(); });
  }
})();
