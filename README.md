# Blume Yapı web sitesi

Türkçe, mobil uyumlu ürün ve iletişim sitesi. Seramik, fayans, banyo ve duşakabin sayfaları içerir.

## Çalıştırma

1. `index.html` dosyasını çift tıklayarak tarayıcıda açın.
2. Tüm HTML dosyalarını `images` klasörü ve `style.css` / `script.js` dosyalarıyla aynı klasörde tutun.
3. Siteyi internete açtığınızda Google Fonts, harita ve WhatsApp bağlantıları çalışır. Bunlar dışında derleme veya paket kurulumu gerekmez.

İletişim formu gönderildiğinde mesaj, ziyaretçinin WhatsApp uygulaması/Web WhatsApp'ında Blume Yapı'nın numarasına hazır olarak açılır. Ziyaretçi mesajı WhatsApp'tan kendisi gönderir.

Showroom fotoğrafları images klasöründedir. showroom.html sayfasından seramik, fayans, banyo dolabı, armatür ve duşakabin galerisine ulaşılır.

## Arayüz testleri

Site statik HTML olarak çalışmaya devam eder. Footer ve mobil menü Playwright testlerini çalıştırmak için Node.js kurulu ortamda `npm install`, ardından ilk kurulumda `npx playwright install chromium` ve sonrasında `npm run test:e2e` komutlarını çalıştırın.
