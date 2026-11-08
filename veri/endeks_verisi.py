"""TCMB EVDS'den Endeksly'nin kullandığı aylık serileri alır ve uygulamanın
okuduğu endeksly.json dosyasını yazar.

Kullanım:
    EVDS_API_KEY=... python3 veri/endeks_verisi.py endeksly.json
    (ya da anahtar ~/.config/endeksly/evds_anahtari dosyasında)

Seriler:
  * TÜFE genel endeksi (aylık). TÜİK baz yılı değiştiğinde (2003=100 → 2025=100)
    eski seri yenisinin ilk ortak ayındaki oranla yeni baza zincirlenir; böylece
    uygulama tek ve kesintisiz bir endeks görür.
  * 3 aya kadar vadeli TL mevduat faizi (haftalık akım, ağırlıklı ortalama),
    EVDS'de aylık ortalamaya çevrilmiş olarak.

Hata olursa betik ne bulduğunu yazarak durur; eski endeksly.json bozulmaz.
"""

import datetime as dt
import json
import os
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

TABAN = "https://evds3.tcmb.gov.tr/igmevdsms-dis/"
ANAHTAR_DOSYASI = os.path.expanduser("~/.config/endeksly/evds_anahtari")

# TÜFE genel endeksi: esas seri yeni baz (2025=100, EVDS'de 2005'e kadar
# geriye hesaplı), denetim serisi 2003=100 (bie_tukfiy2003). İkisi de TÜİK
# kaynaklı; yıllık değişimleri birbirini tutmazsa betik durur.
# (TP.FG.J0, eski 2003=100 arşiv serisi, Ocak 2026'da kesildi.)
TUFE_KODLARI = ["TP.TUKFIY2025.GENEL", "TP.GENENDEKS.T1"]
UYUM_SINIRI = 0.1  # yıllık değişimde en fazla 0,1 puan fark
MEVDUAT_KODU = "TP.TRY.MT02"  # 3 aya kadar vadeli TL mevduat (akım, %)
UFE_KODU = "TP.TUFE1YI.T1"  # Yurt içi üretici fiyat endeksi (2003=100)
USD_KODU = "TP.DK.USD.S.YTL"  # ABD doları döviz satış kuru (günlük → aylık ortalama)
# Altın (TL/gram): 2018'den beri Borsa İstanbul ağırlıklı ortalama (TL/kg),
# öncesi Ankara Kuyumcular Odası külçe altın satış fiyatı (Mayıs 2026'da kesildi).
ALTIN_BIST_KODU = "TP.ALTINPIYASA.AGORT02"
ALTIN_ESKI_KODU = "TP.MK.KUL.YTL"
# BIST 100 getiri endeksi (temettüler dahil, XU100-CFNNTLTL), iş günü → aylık ortalama.
BIST_KODU = "TP.MK.G.BILESIK"

BASLANGIC = "01-01-2005"

# Günlük fiyatlar (son GUNLUK_GUN gün, iş günleri): TCMB gösterge döviz satış
# kurları ve Borsa İstanbul gram altın ağırlıklı ortalaması (TL/kg → TL/gram).
EUR_KODU = "TP.DK.EUR.S.YTL"
GBP_KODU = "TP.DK.GBP.S.YTL"
GUNLUK = [  # (anahtar, ad, seri, bölen)
    ("usd", "ABD doları", USD_KODU, 1),
    ("eur", "Euro", EUR_KODU, 1),
    ("gbp", "İngiliz sterlini", GBP_KODU, 1),
    ("altin", "Gram altın", ALTIN_BIST_KODU, 1000),
]
GUNLUK_GUN = 400
GUNLUK_GECIKME = 16  # son veri bugünden en fazla bu kadar gün eski olabilir (bayram tatilleri)


def sade(metin):
    m = (metin or "").replace("İ", "i").replace("I", "ı").lower()
    m = m.translate(str.maketrans("ıçğöşü", "icgosu"))
    m = unicodedata.normalize("NFKD", m)
    return " ".join("".join(k if k.isalnum() else " " for k in m).split())


def anahtar_oku():
    anahtar = os.environ.get("EVDS_API_KEY", "").strip()
    if not anahtar and os.path.exists(ANAHTAR_DOSYASI):
        with open(ANAHTAR_DOSYASI, encoding="utf-8") as f:
            anahtar = f.read().strip()
    if not anahtar:
        raise SystemExit(
            f"EVDS anahtarı yok: EVDS_API_KEY tanımlayın ya da {ANAHTAR_DOSYASI} dosyasına yazın."
        )
    return anahtar


def istek(yol, parametreler, anahtar):
    adres = TABAN + yol + "&".join(
        f"{k}={urllib.parse.quote(str(v), safe='.-_')}" for k, v in parametreler.items()
    )
    talep = urllib.request.Request(adres, headers={"key": anahtar})
    try:
        with urllib.request.urlopen(talep, timeout=60) as yanit:
            return json.loads(yanit.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        govde = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"EVDS {e.code}: {govde}")


def ay_anahtari(tarih):
    """EVDS tarihini 'YYYY-MM' yapar. Aylıkta '2024-1', günlükte '16-10-2024' gelir."""
    t = str(tarih).strip()
    parca = t.split("-")
    if len(parca) == 2:
        return f"{int(parca[0]):04d}-{int(parca[1]):02d}"
    if len(parca) == 3:
        if len(parca[0]) == 4:
            return f"{int(parca[0]):04d}-{int(parca[1]):02d}"
        return f"{int(parca[2]):04d}-{int(parca[1]):02d}"
    raise ValueError(f"Tanınmayan tarih: {tarih}")


def aylik_seri(kod, anahtar, bugun, ortalama=False):
    """{'YYYY-MM': değer} döndürür; boş aylar atlanır."""
    parametreler = {
        "series": kod,
        "startDate": BASLANGIC,
        "endDate": bugun.strftime("%d-%m-%Y"),
        "type": "json",
        "frequency": 5,  # aylık
    }
    if ortalama:
        parametreler["aggregationTypes"] = "avg"
    satirlar = istek("", parametreler, anahtar).get("items", [])
    return seriyi_ayikla(satirlar, kod)


def seriyi_ayikla(satirlar, kod):
    alan = kod.replace(".", "_")
    sonuc = {}
    for s in satirlar:
        deger = s.get(alan)
        if deger in (None, "", "null"):
            continue
        sonuc[ay_anahtari(s.get("Tarih"))] = float(deger)
    return dict(sorted(sonuc.items()))


def gun_anahtari(tarih):
    """EVDS günlük tarihi 'DD-MM-YYYY' → 'YYYY-MM-DD'."""
    g, a, y = str(tarih).strip().split("-")
    return f"{int(y):04d}-{int(a):02d}-{int(g):02d}"


def gunluk_seriler(anahtar, bugun):
    """{anahtar: {'YYYY-MM-DD': değer}}; tatil ve boş günler atlanır."""
    bas = bugun - dt.timedelta(days=GUNLUK_GUN)
    kodlar = "-".join(k for _, _, k, _ in GUNLUK)
    satirlar = istek("", {
        "series": kodlar,
        "startDate": bas.strftime("%d-%m-%Y"),
        "endDate": bugun.strftime("%d-%m-%Y"),
        "type": "json",
        "frequency": 1,  # günlük
    }, anahtar).get("items", [])
    return gunlukleri_ayikla(satirlar)


def gunlukleri_ayikla(satirlar):
    sonuc = {a: {} for a, _, _, _ in GUNLUK}
    for s in satirlar:
        gun = gun_anahtari(s.get("Tarih"))
        for a, _, kod, bolen in GUNLUK:
            d = s.get(kod.replace(".", "_"))
            if d in (None, "", "null"):
                continue
            sonuc[a][gun] = round(float(d) / bolen, 4 if bolen == 1 else 2)
    return {a: dict(sorted(g.items())) for a, g in sonuc.items()}


def gunluk_denetle(gunluk, bugun):
    for a, g in gunluk.items():
        if len(g) < 150:
            raise SystemExit(f"Günlük {a} çok kısa: {len(g)} gün")
        son = dt.date.fromisoformat(max(g))
        if (bugun - son).days > GUNLUK_GECIKME:
            raise SystemExit(f"Günlük {a} son günü {son}; seri güncel değil")
        gunler = list(g)
        for once, sonra in zip(gunler, gunler[1:]):
            if not g[sonra] > 0 or abs(g[sonra] / g[once] - 1) > 0.25:
                raise SystemExit(f"Günlük {a} {once}→{sonra} değişim makul değil")


def zincirle(seriler):
    """seriler: yeniden eskiye [{ay: değer}]. İlk seri esastır; her eski seri,
    esas seriyle ortak ilk ayındaki oranla ölçeklenip başa eklenir."""
    esas = dict(seriler[0])
    for eski in seriler[1:]:
        ortak = sorted(set(esas) & set(eski))
        if not ortak:
            raise SystemExit("TÜFE serileri arasında ortak ay yok; zincirlenemedi.")
        ay = ortak[0]
        oran = esas[ay] / eski[ay]
        for a, d in eski.items():
            if a < ay:
                esas[a] = d * oran
    return {a: round(d, 4) for a, d in sorted(esas.items())}


def tufe_al(anahtar, bugun):
    bulunan, denenen = [], []
    for kod in TUFE_KODLARI:
        try:
            seri = aylik_seri(kod, anahtar, bugun)
        except RuntimeError as e:
            denenen.append(f"{kod}: {e}")
            continue
        if len(seri) >= 12:
            bulunan.append((kod, seri))
        else:
            denenen.append(f"{kod}: {len(seri)} ay")
    if not bulunan:
        raise SystemExit("TÜFE serisi bulunamadı. " + " | ".join(denenen) + "\n" + tufe_adaylari(anahtar))
    # Listede önce gelen ve en güncel ayı en ileride olan seri esastır.
    bulunan.sort(key=lambda ks: max(ks[1]), reverse=True)
    for kod, seri in bulunan[1:]:
        uyum_denetle(bulunan[0], (kod, seri))
    return [k for k, _ in bulunan], zincirle([s for _, s in bulunan])


def yillik_degisimler(seri):
    sonuc = {}
    for a, d in seri.items():
        y, m = map(int, a.split("-"))
        once = f"{y - 1:04d}-{m:02d}"
        if once in seri:
            sonuc[a] = (d / seri[once] - 1) * 100
    return sonuc


def uyum_denetle(esas, diger):
    """İki TÜFE serisinin ortak son 36 ayda yıllık değişimleri aynı olmalı;
    değilse kodlardan biri yanlış seriyi gösteriyordur."""
    (k1, s1), (k2, s2) = esas, diger
    y1, y2 = yillik_degisimler(s1), yillik_degisimler(s2)
    ortak = sorted(set(y1) & set(y2))[-36:]
    if len(ortak) < 12:
        raise SystemExit(f"{k1} ile {k2} karşılaştırılamadı: {len(ortak)} ortak ay")
    for a in ortak:
        if abs(y1[a] - y2[a]) > UYUM_SINIRI:
            raise SystemExit(
                f"{k1} ile {k2} uyuşmuyor: {a} yıllık %{y1[a]:.2f} / %{y2[a]:.2f}. Seri kodlarını kontrol edin."
            )


def tufe_adaylari(anahtar):
    """Kodlar tutmazsa EVDS'deki TÜFE gruplarını listeler (betiği düzeltmek için)."""
    try:
        gruplar = istek("datagroups/", {"mode": 0, "code": "", "type": "json"}, anahtar)
    except RuntimeError as e:
        return f"Grup listesi alınamadı: {e}"
    satirlar = []
    for g in gruplar:
        if "tuketici fiyat" in sade(g.get("DATAGROUP_NAME")):
            satirlar.append(f"{g.get('DATAGROUP_CODE')} = {g.get('DATAGROUP_NAME')}")
    return "TÜFE grupları: " + "; ".join(satirlar)


def denetle(cikti):
    tufe = cikti["tufe"]["aylar"]
    if len(tufe) < 36:
        raise SystemExit(f"TÜFE çok kısa: {len(tufe)} ay")
    for a, d in tufe.items():
        if not d > 0:
            raise SystemExit(f"TÜFE {a} geçersiz: {d}")
    aylar = list(tufe)
    for once, sonra in zip(aylar, aylar[1:]):
        if abs(tufe[sonra] / tufe[once] - 1) > 0.5:
            raise SystemExit(f"TÜFE {once}→{sonra} aylık değişim makul değil")
    for a, d in cikti["mevduat_3ay"]["aylar"].items():
        if not 0 < d < 500:
            raise SystemExit(f"Mevduat {a} makul değil: {d}")
    son_tufe = max(tufe)
    for anahtar in ("ufe", "usd", "eur", "gbp", "altin", "bist"):
        if anahtar not in cikti:
            continue
        seri = cikti[anahtar]["aylar"]
        if len(seri) < 36:
            raise SystemExit(f"{anahtar} çok kısa: {len(seri)} ay")
        if max(seri) < son_tufe:
            raise SystemExit(f"{anahtar} son ayı {max(seri)}, TÜFE {son_tufe}; seri güncel değil")
        for a, d in seri.items():
            if not d > 0:
                raise SystemExit(f"{anahtar} {a} geçersiz: {d}")


def altin_al(anahtar, bugun):
    bist = {a: d / 1000 for a, d in aylik_seri(ALTIN_BIST_KODU, anahtar, bugun, ortalama=True).items()}
    eski = aylik_seri(ALTIN_ESKI_KODU, anahtar, bugun, ortalama=True)
    return {a: round(d, 2) for a, d in zincirle([bist, eski]).items()}


def olustur(anahtar, bugun):
    tufe_kodlari, tufe = tufe_al(anahtar, bugun)
    mevduat = aylik_seri(MEVDUAT_KODU, anahtar, bugun, ortalama=True)
    ufe = aylik_seri(UFE_KODU, anahtar, bugun)
    usd = aylik_seri(USD_KODU, anahtar, bugun, ortalama=True)
    eur = aylik_seri(EUR_KODU, anahtar, bugun, ortalama=True)
    gbp = aylik_seri(GBP_KODU, anahtar, bugun, ortalama=True)
    altin = altin_al(anahtar, bugun)
    bist = aylik_seri(BIST_KODU, anahtar, bugun, ortalama=True)
    # Kur ve altında bitmemiş ay da gelir; karşılaştırma tutarlı olsun diye
    # TÜFE'nin son ayından sonrası atılır.
    son = max(tufe)
    usd = {a: d for a, d in usd.items() if a <= son}
    eur = {a: d for a, d in eur.items() if a <= son}
    gbp = {a: d for a, d in gbp.items() if a <= son}
    gunluk = gunluk_seriler(anahtar, bugun)
    gunluk_denetle(gunluk, bugun)
    altin = {a: d for a, d in altin.items() if a <= son}
    bist = {a: round(d, 2) for a, d in bist.items() if a <= son}
    cikti = {
        "surum": 1,
        "guncelleme": bugun.isoformat(),
        "kaynak": "TCMB Elektronik Veri Dağıtım Sistemi (EVDS); TÜFE verisi TÜİK kaynaklıdır.",
        "tufe": {
            "ad": "Tüketici fiyat endeksi, genel",
            "seriler": tufe_kodlari,
            "not": "Farklı baz yıllı seriler ortak ilk aydaki oranla zincirlenmiştir.",
            "aylar": tufe,
        },
        "mevduat_3ay": {
            "ad": "3 aya kadar vadeli TL mevduata uygulanan ağırlıklı ortalama faiz (akım, yıllık bileşik %, aylık ortalama)",
            "seri": MEVDUAT_KODU,
            "aylar": {a: round(d, 2) for a, d in mevduat.items()},
        },
        "ufe": {
            "ad": "Yurt içi üretici fiyat endeksi (Yİ-ÜFE), genel",
            "seri": UFE_KODU,
            "aylar": {a: round(d, 4) for a, d in ufe.items()},
        },
        "usd": {
            "ad": "ABD doları döviz satış kuru, aylık ortalama (TL)",
            "seri": USD_KODU,
            "aylar": {a: round(d, 4) for a, d in usd.items()},
        },
        "eur": {
            "ad": "Euro döviz satış kuru, aylık ortalama (TL)",
            "seri": EUR_KODU,
            "aylar": {a: round(d, 4) for a, d in eur.items()},
        },
        "gbp": {
            "ad": "İngiliz sterlini döviz satış kuru, aylık ortalama (TL)",
            "seri": GBP_KODU,
            "aylar": {a: round(d, 4) for a, d in gbp.items()},
        },
        "altin": {
            "ad": "Altın, TL/gram, aylık ortalama",
            "seriler": [ALTIN_BIST_KODU, ALTIN_ESKI_KODU],
            "not": "2018 öncesi kuyumcular odası külçe fiyatı, Borsa İstanbul fiyatına ortak ilk aydaki oranla zincirlenmiştir.",
            "aylar": altin,
        },
        "bist": {
            "ad": "BIST 100 getiri endeksi (temettüler dahil), aylık ortalama",
            "seri": BIST_KODU,
            "aylar": bist,
        },
        "gunluk": {
            "ad": "Günlük fiyatlar (iş günleri)",
            "not": "Döviz: TCMB gösterge niteliğindeki döviz satış kuru. Altın: Borsa İstanbul ağırlıklı ortalama fiyatı, TL/gram. Anlık piyasa fiyatı değildir.",
            "seriler": {
                a: {"ad": ad, "seri": kod, "gunler": gunluk[a]} for a, ad, kod, _ in GUNLUK
            },
        },
    }
    denetle(cikti)
    return cikti


def main():
    hedef = sys.argv[1] if len(sys.argv) > 1 else "endeksly.json"
    cikti = olustur(anahtar_oku(), dt.date.today())
    with open(hedef, "w", encoding="utf-8") as f:
        json.dump(cikti, f, ensure_ascii=False, separators=(",", ":"))
    t = cikti["tufe"]["aylar"]
    m = cikti["mevduat_3ay"]["aylar"]
    print(f"TÜFE {min(t)}…{max(t)} ({len(t)} ay), mevduat {min(m)}…{max(m)} ({len(m)} ay) → {hedef}")
    for k in ("ufe", "usd", "eur", "gbp", "altin", "bist"):
        a = cikti[k]["aylar"]
        print(f"{k} {min(a)}…{max(a)} ({len(a)} ay), son {a[max(a)]}")
    for k, g in cikti["gunluk"]["seriler"].items():
        print(f"günlük {k} {min(g['gunler'])}…{max(g['gunler'])} ({len(g['gunler'])} gün), son {g['gunler'][max(g['gunler'])]}")


if __name__ == "__main__":
    main()
