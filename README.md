# endeksly-site

https://endeksly.com — Endeksly tanıtım sitesi, web hesaplayıcıları ve uygulamanın okuduğu açık veri dosyası.

- `public/`: düz HTML, derleme yok. Cloudflare Pages `endeksly-site` projesi bu klasörü yayınlar; `main`'e push = yayın.
- `public/veri/endeksly.json`: TCMB EVDS'den alınan TÜFE, Yİ-ÜFE, dolar, altın ve BIST 100 aylık serileri. Uygulama ve hesaplayıcılar bunu okur.
- `veri/endeks_verisi.py` + `.github/workflows/endeks-verisi.yml`: veriyi her ayın 3–6'sı ve her cumartesi günceller. Anahtar yalnızca `EVDS_API_KEY` secret'ında durur.

Bu depo yayın kopyasıdır; kaynak özel uygulama deposunda `docs/site/`. Değişiklik orada yapılıp `sh docs/site/yayinla.sh` ile buraya kopyalanır.
