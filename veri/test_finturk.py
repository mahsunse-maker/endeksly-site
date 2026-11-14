import datetime as dt
import json
import os
import sys
import unittest
import urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
import finturk as ft  # noqa: E402

# FinTürk sayfasındaki il listesi (ddlSehir, "HEPSİ" hariç), 2026-11 itibarıyla.
FINTURK_SEHIRLER = (
    "ANKARA İSTANBUL ADANA ADIYAMAN AFYONKARAHİSAR AĞRI AKSARAY AMASYA ANTALYA ARDAHAN ARTVİN AYDIN "
    "BALIKESİR BARTIN BATMAN BAYBURT BİLECİK BİNGÖL BİTLİS BOLU BURDUR BURSA ÇANAKKALE ÇANKIRI ÇORUM "
    "DENİZLİ DİYARBAKIR DÜZCE EDİRNE ELAZIĞ ERZİNCAN ERZURUM ESKİŞEHİR GAZİANTEP GİRESUN GÜMÜŞHANE "
    "HAKKARİ HATAY IĞDIR ISPARTA İZMİR KAHRAMANMARAŞ KARABÜK KARAMAN KARS KASTAMONU KAYSERİ KIRIKKALE "
    "KIRKLARELİ KIRŞEHİR KİLİS KOCAELİ KONYA KÜTAHYA MALATYA MANİSA MARDİN MERSİN MUĞLA MUŞ NEVŞEHİR "
    "NİĞDE ORDU OSMANİYE RİZE SAKARYA SAMSUN SİİRT SİNOP SİVAS ŞANLIURFA ŞIRNAK TEKİRDAĞ TOKAT TRABZON "
    "TUNCELİ UŞAK VAN YALOVA YOZGAT ZONGULDAK"
).split()
SEHIRLER = FINTURK_SEHIRLER + ["YURT DIŞI"]

TARAF = {"10001": "SEKTÖR", "10002": "MEVDUAT", "10003": "KALKINMA VE YATIRIM", "10004": "KATILIM",
         "10005": "YABANCI", "10006": "KAMU", "10007": "YERLİ ÖZEL"}
DONEMLER = ["2024-6", "2024-9", "2024-12", "2025-3", "2025-6", "2025-9", "2025-12", "2026-3", "2026-6", "2026-9"]
# Gerçek tablo 1 yanıtındaki sütunlar (etiket "Eftodu" BDDK'nın yazımı).
KREDI_SUTUN = [("EftKodu", "Eftodu"), ("Yil", "Yıl"), ("Ay", "Ay"), ("Sehir", "Şehir"), ("Grup", "Grup"),
               ("ToplamNakdiKrediler", "Toplam Nakdi Krediler"), ("NakdiKrediler", "Nakdi Krediler"),
               ("TakiptekiAlacaklar", "Takipteki Alacaklar"), ("GayrinakdiKrediler", "Gayrinakdi Krediler")]
# Tablo 2'nin model adları bilinmiyor; betik etiketten bulmalı.
MEVDUAT_SUTUN = [("EftKodu", "Eftodu"), ("Yil", "Yıl"), ("Ay", "Ay"), ("Sehir", "Şehir"), ("Grup", "Grup"),
                 ("Kolon1", "Toplam Mevduat"), ("Kolon2", "Tasarruf Mevduatı")]
PAY = {"10002": 0.85, "10004": 0.10, "10003": 0.05}


def sayfa(sehirler=None, taraf=None, tablo1="Krediler (Bin TL)"):
    def sec(kimlik, ciftler):
        s = "".join(f'<option value="{d}">{m}</option>' for d, m in ciftler)
        return f'<select id="{kimlik}" class="x">{s}</select>'
    sehirler = sehirler or (["HEPSİ"] + SEHIRLER)
    return "<html>" + "".join([
        sec("ddlTablo", [("1", tablo1), ("2", "Mevduat (Bin TL)"), ("3", "Bireysel Bankacılık (Bin TL)")]),
        sec("ddlDonem", [(d, d) for d in reversed(DONEMLER)]),
        sec("ddlTaraf", list((taraf or TARAF).items())),
        # Sayfa Türkçe harfleri HTML varlığı olarak da yazabiliyor (BİNG&#214;L).
        sec("ddlSehir", [(s.replace("Ö", "&#214;"), s) for s in sehirler]),
    ]) + "</html>"


def grup_tutari(kod, n, carpan):
    return int(1_000_000 * n * carpan * PAY[kod])


def satirlar(tablo, kodlar, donem, carpan, degistir):
    y, a = (int(x) for x in donem.split("-"))
    sonuc = []
    for n, il in enumerate(SEHIRLER, start=1):
        for kod in kodlar:
            if kod == "10004" and il == "BAYBURT":
                continue  # BDDK'nın yayımlamadığı il-grup: satır gelmez
            if tablo == "2" and kod == "10003":
                continue  # kalkınma ve yatırım bankaları mevduat toplamaz
            if kod == "10001":
                gruplar = [g for g in PAY if not (tablo == "2" and g == "10003")]
                toplam = sum(grup_tutari(g, n, carpan) for g in gruplar)
            else:
                toplam = grup_tutari(kod, n, carpan)
            if tablo == "1":
                takip = int(toplam * 0.03)
                hucre = [int(kod), y, a, il, TARAF[kod], toplam, toplam - takip, takip, toplam // 4]
            else:
                hucre = [int(kod), y, a, il, TARAF[kod], toplam, toplam // 2]
            s = {"cell": hucre}
            if degistir:
                s = degistir(tablo, kod, il, s)
            if s:
                sonuc.append(s)
    return sonuc


def yanit(tablo, kodlar, donem, carpan=1.0, degistir=None):
    sutun = KREDI_SUTUN if tablo == "1" else MEVDUAT_SUTUN
    return json.dumps({"success": True, "Json": {
        "colNames": [e for _, e in sutun], "colModels": [{"name": m} for m, _ in sutun],
        "data": {"rows": satirlar(tablo, kodlar, donem, carpan, degistir)}}}, ensure_ascii=False)


class SahteAcici:
    """bddk.org.tr yerine geçer; gelen istekleri kaydeder."""

    def __init__(self, sayfa_metni=None, degistir=None):
        self.sayfa = sayfa_metni or sayfa()
        self.degistir = degistir
        self.formlar = []

    def open(self, talep, timeout=None):
        if talep.data is None:
            govde = self.sayfa
        else:
            form = urllib.parse.parse_qs(talep.data.decode("ascii"))
            self.formlar.append(form)
            kodlar = [form[k][0] for k in sorted(form) if k.startswith("tarafList")]
            donem = form["donem"][0]
            carpan = 1 + 0.05 * DONEMLER.index(donem)
            govde = yanit(form["tabloNo"][0], kodlar, donem, carpan, self.degistir)
        return _Yanit(govde)


class _Yanit:
    def __init__(self, metin):
        self.metin = metin

    def read(self):
        return self.metin.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def calistir(**k):
    return ft.olustur(dt.date(2026, 11, 12), ac=SahteAcici(**k), bekle=0)


class Testler(unittest.TestCase):
    def test_il_adlari_finturk_ile_ayni(self):
        self.assertEqual(len(ft.ILLER), 81)
        self.assertEqual(set(ft.IL_ANAHTARI), set(FINTURK_SEHIRLER))
        self.assertEqual(sorted(p for p, _, _ in ft.ILLER), list(range(1, 82)))
        bolgeler = {}
        for _, _, b in ft.ILLER:
            bolgeler[b] = bolgeler.get(b, 0) + 1
        self.assertEqual(bolgeler, {"Marmara": 11, "Ege": 8, "Akdeniz": 8, "İç Anadolu": 13,
                                    "Karadeniz": 18, "Doğu Anadolu": 14, "Güneydoğu Anadolu": 9})

    def test_donem_anahtari(self):
        self.assertEqual(ft.donem_anahtari("2026-9"), "2026-09")
        self.assertEqual(ft.donem_anahtari("2025-12"), "2025-12")
        with self.assertRaises(SystemExit):
            ft.donem_anahtari("2026-8")

    def test_olustur(self):
        ac = SahteAcici()
        c = ft.olustur(dt.date(2026, 11, 12), ac=ac, bekle=0)
        self.assertEqual(c["donem"], "2026-09")
        self.assertEqual(c["donemler"][0], "2024-09")
        self.assertEqual(len(c["donemler"]), ft.CEYREK_SAYISI)
        self.assertEqual(len(c["iller"]), 81)
        self.assertEqual(set(c["gruplar"]), {"sektor", "mevduat", "katilim", "kalkinma"})
        adana = c["iller"][0]
        self.assertEqual((adana["plaka"], adana["ad"], adana["bolge"]), (1, "Adana", "Akdeniz"))
        n, carpan = SEHIRLER.index("ADANA") + 1, 1 + 0.05 * 9
        mev, kat, kal = (grup_tutari(k, n, carpan) for k in ("10002", "10004", "10003"))
        self.assertEqual(adana["sektor"]["nakdi"][-1], mev + kat + kal)
        self.assertEqual(adana["sektor"]["mevduat"][-1], mev + kat)  # etiketten bulundu
        self.assertEqual(adana["katilim"]["nakdi"][-1], kat)
        self.assertEqual(adana["katilim"]["takipteki"][-1], int(kat * 0.03))
        self.assertEqual(adana["mevduat"]["gayrinakdi"][-1], mev // 4)
        self.assertEqual(adana["kalkinma"]["mevduat"], [None] * ft.CEYREK_SAYISI)
        for g in ("sektor", "mevduat", "katilim", "kalkinma"):
            for a in ft.ALANLAR:
                self.assertEqual(len(adana[g][a]), ft.CEYREK_SAYISI)
        bayburt = next(i for i in c["iller"] if i["ad"] == "Bayburt")
        self.assertEqual(bayburt["katilim"]["nakdi"], [None] * ft.CEYREK_SAYISI)
        self.assertIsNotNone(bayburt["sektor"]["nakdi"][-1])
        self.assertIn("nakdi", c["yurt_disi"])
        # Her çeyrekte iki tablo, dört banka türü birlikte, il listesi HEPSİ.
        self.assertEqual(len(ac.formlar), 2 * ft.CEYREK_SAYISI)
        self.assertEqual({f["tabloNo"][0] for f in ac.formlar}, {"1", "2"})
        self.assertEqual([ac.formlar[0][f"tarafList[{i}]"][0] for i in range(4)],
                         ["10001", "10002", "10004", "10003"])
        self.assertEqual(ac.formlar[-1]["donem"], ["2026-9"])
        self.assertEqual(ac.formlar[-1]["sehirList[0]"], ["HEPSİ"])
        json.dumps(c, ensure_ascii=False)

    def test_eksik_il_durdurur(self):
        sil = lambda t, kod, il, s: None if (kod == "10001" and il == "MUŞ") else s  # noqa: E731
        with self.assertRaises(SystemExit) as h:
            calistir(degistir=sil)
        self.assertIn("MUŞ", str(h.exception))

    def test_mevduat_tablosunda_eksik_il_durdurur(self):
        sil = lambda t, kod, il, s: None if (t == "2" and kod == "10001" and il == "VAN") else s  # noqa: E731
        with self.assertRaises(SystemExit) as h:
            calistir(degistir=sil)
        self.assertIn("VAN", str(h.exception))

    def test_tutarsiz_toplam_durdurur(self):
        def boz(t, kod, il, s):
            if t == "1" and kod == "10001" and il == "VAN":
                s["cell"][6] += 1000
            return s
        with self.assertRaises(SystemExit) as h:
            calistir(degistir=boz)
        self.assertIn("VAN", str(h.exception))

    def test_grup_sektoru_asamaz(self):
        def boz(t, kod, il, s):
            if kod == "10004" and il == "RİZE":
                s["cell"][5] *= 30
            return s
        with self.assertRaises(SystemExit):
            calistir(degistir=boz)

    def test_grup_adi_uyusmazsa_durur(self):
        def boz(t, kod, il, s):
            if kod == "10004":
                s["cell"][4] = "KAMU"
            return s
        with self.assertRaises(SystemExit):
            calistir(degistir=boz)

    def test_sayfa_degisirse_durur(self):
        for bozuk in (
            sayfa(tablo1="Mevduat (Bin TL)"),
            sayfa(taraf={**TARAF, "10004": "YABANCI"}),
            sayfa(sehirler=["HEPSİ"] + SEHIRLER[1:]),
            "<html>bakımda</html>",
        ):
            with self.assertRaises(SystemExit):
                calistir(sayfa_metni=bozuk)

    def test_mevduat_sutunu_yoksa_durur(self):
        metin = yanit("2", ["10001"], "2026-9").replace("Toplam Mevduat", "Başka Sütun")
        with self.assertRaises(SystemExit) as h:
            ft.yanit_coz(metin, "2", "2026-09")
        self.assertIn("Toplam Mevduat", str(h.exception))

    def test_yanit_donemi_uyusmazsa_durur(self):
        with self.assertRaises(SystemExit):
            ft.yanit_coz(yanit("1", ["10001"], "2026-6"), "1", "2026-09")
        with self.assertRaises(SystemExit):
            ft.yanit_coz('{"success": false}', "1", "2026-09")

    def test_gercek_yanit_bicimi(self):
        # BDDK'nın 2026-9 Krediler yanıtından üç satır (bin TL).
        metin = json.dumps({"success": True, "Json": {
            "colNames": [e for _, e in KREDI_SUTUN],
            "colModels": [{"name": m, "hidden": m == "EftKodu"} for m, _ in KREDI_SUTUN],
            "data": {"page": "1", "rows": [
                {"cell": [10001, 2026, 9, "ADANA", "SEKTÖR", 671124407, 640232511, 30891896, 196162081]},
                {"cell": [10001, 2026, 9, "ADIYAMAN", "SEKTÖR", 65697299, 62303534, 3393765, 12786527]},
            ]}}}, ensure_ascii=False)
        r = ft.yanit_coz(metin, "1", "2026-09")["10001"]
        self.assertEqual(r["ADANA"]["nakdi"], 671124407)
        self.assertAlmostEqual(r["ADIYAMAN"]["takipteki"] / r["ADIYAMAN"]["nakdi"] * 100, 5.17, places=2)

    def test_sayi(self):
        self.assertEqual(ft.sayi(671124407, "x"), 671124407)
        self.assertEqual(ft.sayi("671.124.407", "x"), 671124407)
        self.assertIsNone(ft.sayi("", "x"))
        with self.assertRaises(SystemExit):
            ft.sayi("yok", "x")

    def test_ayni_veri(self):
        a = {"guncelleme": "2026-11-01", "donem": "2026-09", "iller": [1]}
        self.assertTrue(ft.ayni_veri(a, {**a, "guncelleme": "2026-11-12"}))
        self.assertFalse(ft.ayni_veri(a, {**a, "donem": "2026-12"}))


if __name__ == "__main__":
    unittest.main()
