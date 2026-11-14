"""BDDK FinTürk'ten (Finansal Türkiye Haritası, İllere Göre) il bazında kredi ve
mevduat verisini alır, uygulamanın okuduğu finturk.json dosyasını yazar.

Kullanım:
    python3 veri/finturk.py finturk.json

Anahtar gerekmez: FinTürk sayfasının kendi arayüzünün kullandığı herkese açık
adresler kullanılır (resmî, belgelenmiş bir API değildir; BDDK değiştirirse
betik ne bulduğunu yazarak durur ve eski dosya bozulmaz).

    sayfa  GET  https://www.bddk.org.tr/BultenFinturk/tr
           (tablo, dönem, grup ve il seçenek listeleri buradan okunur)
    veri   POST https://www.bddk.org.tr/BultenFinturk/tr/Home/VeriGetir
           tabloNo=1&donem=2026-9&tarafList[0]=10001&...&sehirList[0]=HEPSİ
           → jqGrid biçimli JSON: Json.colNames + Json.colModels + Json.data.rows[].cell

Tablo 1 "Krediler (Bin TL)": Toplam Nakdi Krediler (= Nakdi Krediler +
Takipteki Alacaklar), Nakdi Krediler, Takipteki Alacaklar, Gayrinakdi Krediler.
Tablo 2 "Mevduat (Bin TL)": Toplam Mevduat (katılım bankalarında katılım fonu).
Gruplar banka türüne göre: sektör = mevduat + katılım + kalkınma ve yatırım
bankaları (kalkınma ve yatırım bankaları mevduat toplamaz). Veri çeyreklik;
BDDK dönem sonundan yaklaşık bir ay sonra yayımlar.
"""

import datetime as dt
import html
import http.cookiejar
import json
import os
import re
import ssl
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

SAYFA = "https://www.bddk.org.tr/BultenFinturk/tr"
VERI = "https://www.bddk.org.tr/BultenFinturk/tr/Home/VeriGetir"
# bddk.org.tr ara sertifikayı göndermiyor; GlobalSign GCC R46 OV TLS CA 2025
# (GlobalSign Root R46 imzalı, 2029'a kadar geçerli) burada duruyor.
ARA_SERTIFIKA = os.path.join(os.path.dirname(__file__), "sertifika", "globalsign_gcc_r46_ov_tls_ca_2025.pem")
BASLIKLAR = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept-Language": "tr-TR,tr;q=0.9",
}
BEKLEME = 1.0  # iki istek arası saniye (sunucuyu yormamak için)

# Banka türü grupları: (FinTürk kodu, JSON anahtarı, FinTürk adı). İlki sektör.
GRUPLAR = [
    ("10001", "sektor", "SEKTÖR"),
    ("10002", "mevduat", "MEVDUAT"),
    ("10004", "katilim", "KATILIM"),
    ("10003", "kalkinma", "KALKINMA VE YATIRIM"),
]
SEKTOR = GRUPLAR[0][0]
# Tablo no → (başlığın başı, {JSON alanı: sütun}). Sütun, colModels adı ya da
# colNames etiketiyle bulunur (ikisinden biri tutması yeter).
TABLOLAR = {
    "1": ("Krediler", {
        "nakdi": ("ToplamNakdiKrediler", "Toplam Nakdi Krediler"),
        "takipteki": ("TakiptekiAlacaklar", "Takipteki Alacaklar"),
        "gayrinakdi": ("GayrinakdiKrediler", "Gayrinakdi Krediler"),
        "_nakdi_net": ("NakdiKrediler", "Nakdi Krediler"),
    }),
    "2": ("Mevduat", {
        "mevduat": ("ToplamMevduat", "Toplam Mevduat"),
    }),
}
ALANLAR = ("nakdi", "takipteki", "gayrinakdi", "mevduat")
KIMLIK = {"EftKodu": ("EftKodu", "Eftodu"), "Yil": ("Yil", "Yıl"), "Ay": ("Ay", "Ay"),
          "Sehir": ("Sehir", "Şehir"), "Grup": ("Grup", "Grup")}
CEYREK_SAYISI = 9  # son iki yıl ve geçen yılın aynı çeyreği
YURT_DISI = "YURT DIŞI"
GRUP_TOPLAM_PAYI = 0.03  # Türkiye toplamında gruplar sektörden %3'ten fazla saparsa uyarı

# (plaka, ad, coğrafi bölge)
ILLER = [
    (1, "Adana", "Akdeniz"), (2, "Adıyaman", "Güneydoğu Anadolu"), (3, "Afyonkarahisar", "Ege"),
    (4, "Ağrı", "Doğu Anadolu"), (5, "Amasya", "Karadeniz"), (6, "Ankara", "İç Anadolu"),
    (7, "Antalya", "Akdeniz"), (8, "Artvin", "Karadeniz"), (9, "Aydın", "Ege"),
    (10, "Balıkesir", "Marmara"), (11, "Bilecik", "Marmara"), (12, "Bingöl", "Doğu Anadolu"),
    (13, "Bitlis", "Doğu Anadolu"), (14, "Bolu", "Karadeniz"), (15, "Burdur", "Akdeniz"),
    (16, "Bursa", "Marmara"), (17, "Çanakkale", "Marmara"), (18, "Çankırı", "İç Anadolu"),
    (19, "Çorum", "Karadeniz"), (20, "Denizli", "Ege"), (21, "Diyarbakır", "Güneydoğu Anadolu"),
    (22, "Edirne", "Marmara"), (23, "Elazığ", "Doğu Anadolu"), (24, "Erzincan", "Doğu Anadolu"),
    (25, "Erzurum", "Doğu Anadolu"), (26, "Eskişehir", "İç Anadolu"), (27, "Gaziantep", "Güneydoğu Anadolu"),
    (28, "Giresun", "Karadeniz"), (29, "Gümüşhane", "Karadeniz"), (30, "Hakkari", "Doğu Anadolu"),
    (31, "Hatay", "Akdeniz"), (32, "Isparta", "Akdeniz"), (33, "Mersin", "Akdeniz"),
    (34, "İstanbul", "Marmara"), (35, "İzmir", "Ege"), (36, "Kars", "Doğu Anadolu"),
    (37, "Kastamonu", "Karadeniz"), (38, "Kayseri", "İç Anadolu"), (39, "Kırklareli", "Marmara"),
    (40, "Kırşehir", "İç Anadolu"), (41, "Kocaeli", "Marmara"), (42, "Konya", "İç Anadolu"),
    (43, "Kütahya", "Ege"), (44, "Malatya", "Doğu Anadolu"), (45, "Manisa", "Ege"),
    (46, "Kahramanmaraş", "Akdeniz"), (47, "Mardin", "Güneydoğu Anadolu"), (48, "Muğla", "Ege"),
    (49, "Muş", "Doğu Anadolu"), (50, "Nevşehir", "İç Anadolu"), (51, "Niğde", "İç Anadolu"),
    (52, "Ordu", "Karadeniz"), (53, "Rize", "Karadeniz"), (54, "Sakarya", "Marmara"),
    (55, "Samsun", "Karadeniz"), (56, "Siirt", "Güneydoğu Anadolu"), (57, "Sinop", "Karadeniz"),
    (58, "Sivas", "İç Anadolu"), (59, "Tekirdağ", "Marmara"), (60, "Tokat", "Karadeniz"),
    (61, "Trabzon", "Karadeniz"), (62, "Tunceli", "Doğu Anadolu"), (63, "Şanlıurfa", "Güneydoğu Anadolu"),
    (64, "Uşak", "Ege"), (65, "Van", "Doğu Anadolu"), (66, "Yozgat", "İç Anadolu"),
    (67, "Zonguldak", "Karadeniz"), (68, "Aksaray", "İç Anadolu"), (69, "Bayburt", "Karadeniz"),
    (70, "Karaman", "İç Anadolu"), (71, "Kırıkkale", "İç Anadolu"), (72, "Batman", "Güneydoğu Anadolu"),
    (73, "Şırnak", "Güneydoğu Anadolu"), (74, "Bartın", "Karadeniz"), (75, "Ardahan", "Doğu Anadolu"),
    (76, "Iğdır", "Doğu Anadolu"), (77, "Yalova", "Marmara"), (78, "Karabük", "Karadeniz"),
    (79, "Kilis", "Güneydoğu Anadolu"), (80, "Osmaniye", "Akdeniz"), (81, "Düzce", "Karadeniz"),
]


def nfc(s):
    return unicodedata.normalize("NFC", str(s)).strip()


def buyuk(ad):
    """Türkçe büyük harf: 'Iğdır' → 'IĞDIR', 'İzmir' → 'İZMİR'."""
    return nfc(ad.replace("i", "İ").replace("ı", "I").upper())


IL_ANAHTARI = {buyuk(ad): (plaka, ad, bolge) for plaka, ad, bolge in ILLER}


def donem_anahtari(donem):
    """'2026-9' → '2026-09'."""
    m = re.fullmatch(r"\s*(\d{4})-(\d{1,2})\s*", str(donem))
    if not m or int(m.group(2)) not in (3, 6, 9, 12):
        raise SystemExit(f"Tanınmayan FinTürk dönemi: {donem!r}")
    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}"


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

def acici():
    ctx = ssl.create_default_context()
    if os.path.exists(ARA_SERTIFIKA):
        ctx.load_verify_locations(cafile=ARA_SERTIFIKA)
    return urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ctx),
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
    )


def getir(ac, adres, form=None):
    govde = None
    basliklar = dict(BASLIKLAR)
    if form is not None:
        govde = urllib.parse.urlencode(form, encoding="utf-8").encode("ascii")
        basliklar.update({
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": SAYFA,
        })
    talep = urllib.request.Request(adres, data=govde, headers=basliklar)
    for deneme in range(2):
        try:
            with ac.open(talep, timeout=60) as yanit:
                return yanit.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            ozet = e.read().decode("utf-8", "replace")[:300]
            raise SystemExit(f"BDDK {e.code} ({adres}): {ozet}")
        except (urllib.error.URLError, TimeoutError) as e:
            if deneme == 1:
                raise SystemExit(f"BDDK'ya ulaşılamadı ({adres}): {e}")
            time.sleep(5)


# --------------------------------------------------------------------------
# Ayrıştırma
# --------------------------------------------------------------------------

def secenekler(sayfa, kimlik):
    m = re.search(r'<select[^>]*id="' + re.escape(kimlik) + r'"[^>]*>(.*?)</select>', sayfa, re.S)
    if not m:
        raise SystemExit(f"FinTürk sayfasında '{kimlik}' listesi yok; sayfa yapısı değişmiş olabilir.")
    return [
        (nfc(html.unescape(d)), nfc(html.unescape(re.sub(r"<[^>]+>", "", m2))))
        for d, m2 in re.findall(r'<option[^>]*value="([^"]*)"[^>]*>(.*?)</option>', m.group(1), re.S)
    ]


def sayfa_coz(sayfa):
    """Seçenek listelerini okur ve beklenenle karşılaştırır. Dönemler eskiden yeniye."""
    tablolar = dict(secenekler(sayfa, "ddlTablo"))
    for no, (bas, _) in TABLOLAR.items():
        ad = tablolar.get(no, "")
        if not ad.startswith(bas) or "Bin TL" not in ad:
            raise SystemExit(f"FinTürk tablo {no} beklenen '{bas} (Bin TL)' değil: {ad!r}")
    taraflar = dict(secenekler(sayfa, "ddlTaraf"))
    for kod, _, ad in GRUPLAR:
        if taraflar.get(kod) != ad:
            raise SystemExit(f"FinTürk grup kodu {kod} beklenen '{ad}' değil: {taraflar.get(kod)!r}")
    sehirler = {d for d, _ in secenekler(sayfa, "ddlSehir")} - {"HEPSİ"}
    eksik = set(IL_ANAHTARI) - sehirler
    fazla = sehirler - set(IL_ANAHTARI) - {YURT_DISI}
    if eksik or fazla:
        raise SystemExit(f"FinTürk il listesi uyuşmuyor. Eksik: {sorted(eksik)} Fazla: {sorted(fazla)}")
    donemler = sorted({donem_anahtari(d) for d, _ in secenekler(sayfa, "ddlDonem")})
    if len(donemler) < CEYREK_SAYISI:
        raise SystemExit(f"FinTürk'te yalnızca {len(donemler)} dönem var.")
    return donemler


def sayi(d, sutun):
    if d is None or d == "":
        return None
    if isinstance(d, bool):
        raise SystemExit(f"FinTürk '{sutun}' değeri sayı değil: {d!r}")
    if isinstance(d, (int, float)):
        return int(round(d))
    m = str(d).strip().replace(".", "").replace(",", ".")
    try:
        return int(round(float(m)))
    except ValueError:
        raise SystemExit(f"FinTürk '{sutun}' değeri sayı değil: {d!r}")


def _sutun_bul(adlar, etiketler, aranan, tablo):
    model, etiket = aranan
    if model in adlar:
        return adlar.index(model)
    ek = [nfc(e).casefold() for e in etiketler]
    if nfc(etiket).casefold() in ek:
        return ek.index(nfc(etiket).casefold())
    raise SystemExit(f"FinTürk tablo {tablo} yanıtında '{etiket}' sütunu yok; gelen adlar {adlar}, etiketler {etiketler}")


def yanit_coz(metin, tablo, donem):
    """VeriGetir yanıtı → {grup kodu: {il adı (BÜYÜK): {"_grup": ad, alan: değer}}}."""
    try:
        d = json.loads(metin)
    except json.JSONDecodeError:
        raise SystemExit(f"FinTürk tablo {tablo} {donem} yanıtı JSON değil: {metin[:200]!r}")
    if not d.get("success"):
        raise SystemExit(f"FinTürk tablo {tablo} {donem} başarısız yanıt: {str(d)[:200]}")
    j = d.get("Json") or {}
    adlar = [c.get("name") for c in j.get("colModels") or []]
    etiketler = list(j.get("colNames") or [])
    etiketler += [""] * (len(adlar) - len(etiketler))
    yer = {k: _sutun_bul(adlar, etiketler, a, tablo) for k, a in KIMLIK.items()}
    alanlar = {k: _sutun_bul(adlar, etiketler, a, tablo) for k, a in TABLOLAR[tablo][1].items()}
    yil, ay = (int(x) for x in donem.split("-"))
    sonuc = {}
    for satir in (j.get("data") or {}).get("rows") or []:
        h = satir.get("cell") or []
        if len(h) != len(adlar):
            raise SystemExit(f"FinTürk satır uzunluğu {len(h)}, sütun sayısı {len(adlar)}")
        if int(h[yer["Yil"]]) != yil or int(h[yer["Ay"]]) != ay:
            raise SystemExit(f"FinTürk yanıt dönemi {h[yer['Yil']]}-{h[yer['Ay']]}, istenen {donem}")
        grup = str(sayi(h[yer["EftKodu"]], "EftKodu"))
        il = nfc(h[yer["Sehir"]])
        kayit = {k: sayi(h[i], k) for k, i in alanlar.items()}
        kayit["_grup"] = nfc(h[yer["Grup"]])
        if il in sonuc.setdefault(grup, {}):
            raise SystemExit(f"FinTürk tablo {tablo} {donem}: {il} iki kez geldi (grup {grup})")
        sonuc[grup][il] = kayit
    return sonuc


def tablo_denetle(cevap, tablo, donem):
    """Sektör satırları tam (81 il + yurt dışı) ve tutarlı; gruplar tanınır ve sektörü aşmaz."""
    sektor = cevap.get(SEKTOR, {})
    beklenen = set(IL_ANAHTARI) | {YURT_DISI}
    if set(sektor) != beklenen:
        raise SystemExit(
            f"FinTürk tablo {tablo} {donem} sektör illeri eksik/fazla. "
            f"Eksik: {sorted(beklenen - set(sektor))} Fazla: {sorted(set(sektor) - beklenen)}")
    adlar = {kod: ad for kod, _, ad in GRUPLAR}
    for kod, satirlar in cevap.items():
        if kod not in adlar:
            raise SystemExit(f"FinTürk tablo {tablo} {donem}: istenmeyen grup {kod}")
        for il, k in satirlar.items():
            if il not in beklenen:
                raise SystemExit(f"FinTürk tablo {tablo} {donem} {adlar[kod]}: tanınmayan il {il!r}")
            if k["_grup"] != adlar[kod]:
                raise SystemExit(f"FinTürk tablo {tablo} {donem} {il}: grup adı {k['_grup']!r}, beklenen {adlar[kod]!r}")
            for alan, d in k.items():
                if alan != "_grup" and d is not None and d < 0:
                    raise SystemExit(f"FinTürk tablo {tablo} {donem} {il} {adlar[kod]}: eksi {alan} {d}")
    for il, k in sektor.items():
        if il == YURT_DISI:
            continue
        if tablo == "1":
            toplam, net, takip, gayri = k["nakdi"], k["_nakdi_net"], k["takipteki"], k["gayrinakdi"]
            if None in (toplam, net, takip, gayri) or toplam <= 0:
                raise SystemExit(f"FinTürk {donem} {il}: geçersiz kredi tutarı {k}")
            if abs(toplam - net - takip) > 2:
                raise SystemExit(f"FinTürk {donem} {il}: toplam nakdi {toplam} ≠ nakdi {net} + takipteki {takip}")
            if takip / toplam > 0.5:
                raise SystemExit(f"FinTürk {donem} {il}: takip oranı makul değil ({takip / toplam:.1%})")
        elif not (k["mevduat"] or 0) > 0:
            raise SystemExit(f"FinTürk {donem} {il}: geçersiz mevduat {k}")
    alan_listesi = [a for a in TABLOLAR[tablo][1] if not a.startswith("_")]
    for alan in alan_listesi:
        tr = sum(sektor[il][alan] for il in IL_ANAHTARI)
        gruplar = 0
        for kod, _, _ in GRUPLAR[1:]:
            for il in IL_ANAHTARI:
                d = cevap.get(kod, {}).get(il, {}).get(alan)
                gruplar += d or 0
        for il in IL_ANAHTARI:
            t = sum((cevap.get(kod, {}).get(il, {}).get(alan) or 0) for kod, _, _ in GRUPLAR[1:])
            if t > sektor[il][alan] * 1.01 + 2:
                raise SystemExit(f"FinTürk {donem} {il} {alan}: banka türlerinin toplamı ({t}) sektörü ({sektor[il][alan]}) aşıyor")
        # BDDK az bankalı il-grup değerlerini yayımlamayabilir; sektör etkilenmez, yalnızca uyarılır.
        if tr > 0 and abs(gruplar / tr - 1) > GRUP_TOPLAM_PAYI:
            print(f"Uyarı: FinTürk {donem} {alan}: banka türleri toplamı sektörden "
                  f"%{abs(gruplar / tr - 1) * 100:.1f} farklı (yayımlanmayan il-grup değerleri)", file=sys.stderr)
    if tablo == "1":
        tr = sum(sektor[il]["nakdi"] for il in IL_ANAHTARI)
        takip = sum(sektor[il]["takipteki"] for il in IL_ANAHTARI)
        if not 0.005 < takip / tr < 0.2:
            raise SystemExit(f"FinTürk {donem} Türkiye takip oranı makul değil: {takip / tr:.2%}")


def seri_denetle(seri):
    """Türkiye toplam kredi ve mevduatı bir çeyrekte %40'tan fazla değişmemeli."""
    donemler = sorted(seri)
    for alan in ("nakdi", "mevduat"):
        for once, sonra in zip(donemler, donemler[1:]):
            a = sum(seri[once][SEKTOR][il][alan] for il in IL_ANAHTARI)
            b = sum(seri[sonra][SEKTOR][il][alan] for il in IL_ANAHTARI)
            if abs(b / a - 1) > 0.4:
                raise SystemExit(f"FinTürk Türkiye {alan} {once}→{sonra} değişim makul değil ({b / a - 1:.1%})")


# --------------------------------------------------------------------------
# Çıktı
# --------------------------------------------------------------------------

def cikti_olustur(seri, bugun):
    """seri: {dönem: {grup kodu: {il: {alan: değer}}}} (iki tablo birleşik)."""
    donemler = sorted(seri)
    son = donemler[-1]

    def dizi(kod, il, alan):
        return [seri[d].get(kod, {}).get(il, {}).get(alan) for d in donemler]

    iller = []
    for plaka, ad, bolge in ILLER:
        anahtar = buyuk(ad)
        kayit = {"plaka": plaka, "ad": ad, "bolge": bolge}
        for kod, alan_adi, _ in GRUPLAR:
            kayit[alan_adi] = {alan: dizi(kod, anahtar, alan) for alan in ALANLAR}
        iller.append(kayit)
    yd = seri[son][SEKTOR][YURT_DISI]
    return {
        "surum": 1,
        "guncelleme": bugun.isoformat(),
        "donem": son,
        "donemler": donemler,
        "birim": "bin TL",
        "kaynak": "BDDK Finansal Türkiye Haritası (FinTürk), İllere Göre: Krediler ve Mevduat tabloları.",
        "gruplar": {alan_adi: ad for _, alan_adi, ad in GRUPLAR},
        "not": "Nakdi kredi takipteki alacakları içerir. Sektör = mevduat + katılım + kalkınma ve yatırım bankaları. BDDK'nın yayımlamadığı il-grup değerleri boştur (null).",
        "yurt_disi": {alan: yd.get(alan) for alan in ALANLAR},
        "iller": iller,
    }


def olustur(bugun, ac=None, bekle=BEKLEME):
    ac = ac or acici()
    donemler = sayfa_coz(getir(ac, SAYFA))[-CEYREK_SAYISI:]
    seri = {}
    for donem in donemler:
        yil, ay = donem.split("-")
        birlesik = {}
        for tablo in TABLOLAR:
            time.sleep(bekle)
            form = {"tabloNo": tablo, "donem": f"{int(yil)}-{int(ay)}", "sehirList[0]": "HEPSİ"}
            for i, (kod, _, _) in enumerate(GRUPLAR):
                form[f"tarafList[{i}]"] = kod
            cevap = yanit_coz(getir(ac, VERI, form), tablo, donem)
            tablo_denetle(cevap, tablo, donem)
            for kod, satirlar in cevap.items():
                for il, k in satirlar.items():
                    birlesik.setdefault(kod, {}).setdefault(il, {}).update(
                        {a: v for a, v in k.items() if not a.startswith("_")})
        for kod, _, _ in GRUPLAR:
            for il in birlesik.get(kod, {}).values():
                for alan in ALANLAR:
                    il.setdefault(alan, None)
        seri[donem] = birlesik
    seri_denetle(seri)
    return cikti_olustur(seri, bugun)


def ayni_veri(a, b):
    """Güncelleme tarihi dışında aynı mı (dosya boş yere değişmesin)."""
    return {k: v for k, v in a.items() if k != "guncelleme"} == {k: v for k, v in b.items() if k != "guncelleme"}


def main():
    hedef = sys.argv[1] if len(sys.argv) > 1 else "finturk.json"
    cikti = olustur(dt.date.today())
    if os.path.exists(hedef):
        try:
            with open(hedef, encoding="utf-8") as f:
                eski = json.load(f)
            if ayni_veri(eski, cikti):
                print(f"Değişiklik yok ({cikti['donem']}); {hedef} olduğu gibi bırakıldı.")
                return
        except (OSError, json.JSONDecodeError):
            pass
    with open(hedef, "w", encoding="utf-8") as f:
        json.dump(cikti, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{cikti['donemler'][0]}…{cikti['donem']} ({len(cikti['donemler'])} çeyrek), 81 il → {hedef}")
    for _, g, ad in GRUPLAR:
        t = {a: sum((i[g][a][-1] or 0) for i in cikti["iller"]) for a in ALANLAR}
        oran = f", takip oranı %{t['takipteki'] / t['nakdi'] * 100:.2f}" if t["nakdi"] else ""
        print(f"{ad:20} mevduat {t['mevduat'] / 1e6:>10,.1f}  nakdi {t['nakdi'] / 1e6:>10,.1f}  "
              f"gayrinakdi {t['gayrinakdi'] / 1e6:>9,.1f} milyar TL{oran}")


if __name__ == "__main__":
    main()
