# GarminAnalizer marka ve simge rehberi

GarminAnalizer için seçilen simge **Faz**: koyu mürdüm zemin üzerinde nane yeşili ve şeftali yansımalı cam dalga. [Önizleme](marka/faz/Onizleme.png) iOS, Android ve yatay logonun birlikte nasıl görünmesi gerektiğini gösterir.

## Doğru dosyayı seç

| Kullanım | Kaynak |
| --- | --- |
| Onaylanan özgün görsel | [Faz-orijinal.png](marka/faz/Logo/Faz-orijinal.png) |
| Şeffaf zeminde tek başına dalga | [Faz-seffaf.png](marka/faz/Logo/Faz-seffaf.png) |
| Uygulama adıyla yatay logo | [Koyu zeminde](marka/faz/Logo/GarminAnalizer-koyu-zemin.svg) veya [açık zeminde](marka/faz/Logo/GarminAnalizer-acik-zemin.svg) |
| Vektör yollarını düzenleme | [Dalga](marka/faz/Logo/Faz-vektor.svg) ve [yatay logolar](marka/faz/Logo/Vektor/) |
| iOS uygulama simgesi | [AppIcon.appiconset](marka/faz/iOS/Assets.xcassets/AppIcon.appiconset/) — Xcode kataloğu, 1024 × 1024 opak PNG |
| Android başlatıcı simgesi | [Android/res](marka/faz/Android/res/) — klasik, uyarlanabilir ve tek renkli simge kaynakları |
| Google Play mağaza simgesi | [512 × 512 PNG](marka/faz/Google-Play/garminanalizer-512.png) |

Renkli uygulama simgelerinde camın özgün dokusu ve ışık yansımaları korunur. Yatay logoların ana SVG sürümlerinde dalga gömülü PNG, yazı vektör yollarıdır. Tam vektör çizim ayrı bir uyarlamadır.

## Web uygulaması ve yayın

Web simgelerinin kaynakları [marka/faz/Web/simge](marka/faz/Web/simge/) içinde, uygulamanın kullandığı kopyalar [uygulama/simge](uygulama/simge/) içindedir. Tasarım güncellendiğinde kaynak PNG’leri değiştirip proje kökünde `npm run simge` çalıştır. Bu komut dört dosyayı aynı adlarla uygulamaya kopyalar. `git diff -- uygulama/simge` ile değişiklikleri görebilirsin.

- [index.html](uygulama/index.html) iOS ana ekranı için `simge-180.png` kullanır.
- [Web manifesti](uygulama/manifest.webmanifest) standart 192 ve 512 piksel simgeler ile Android maskeleri için ayrı `simge-maske-512.png` dosyasını kullanır. Maskeli sürümde dalganın çevresindeki boşluk tasarımın parçasıdır.
- [Service worker](uygulama/sw.js) dört dosyayı da önbelleğe alır. Yeni yayında önbellek sürümü commit kimliğinden gelir. Yerel yayın kontrolü için `npm run yayin-hazirla -- _site yerel-faz` çalıştırıp `_site/simge/` içeriğini inceleyebilirsin.

Yerel mobil projeye aktarırken iOS'ta mevcut varlık kataloğuna yalnızca `AppIcon.appiconset` klasörünü ekle. Android'de paket içindeki `res/` alt klasörlerini uygulamanın kaynaklarıyla birleştir, manifestte `android:icon` için `@mipmap/ic_launcher` kullan. Projede `android:roundIcon` varsa aynı kaynağa yönlendir.
