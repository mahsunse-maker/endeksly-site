import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import endeks_verisi as ev  # noqa: E402


class Testler(unittest.TestCase):
    def test_gunluk_ayiklama(self):
        satirlar = [
            {"Tarih": "05-11-2026", "TP_DK_USD_S_YTL": "50.026", "TP_ALTINPIYASA_AGORT02": "6624846.9"},
            {"Tarih": "29-10-2026", "TP_DK_USD_S_YTL": None, "TP_ALTINPIYASA_AGORT02": None},
        ]
        g = ev.gunlukleri_ayikla(satirlar)
        self.assertEqual(g["usd"], {"2026-11-05": 50.026})
        self.assertEqual(g["altin"], {"2026-11-05": 6624.85})
        self.assertEqual(g["eur"], {})

    def test_gunluk_denetim(self):
        bugun = dt.date(2026, 11, 8)
        gunler = [bugun - dt.timedelta(days=i) for i in range(200, 0, -1)]
        iyi = {a: {g.isoformat(): 50.0 for g in gunler} for a in ("usd", "eur", "gbp", "altin")}
        ev.gunluk_denetle(iyi, bugun)
        eski = {a: dict(s) for a, s in iyi.items()}
        eski["usd"] = {g: d for g, d in eski["usd"].items() if g < "2026-10-01"}
        with self.assertRaises(SystemExit):
            ev.gunluk_denetle(eski, bugun)
        sicrama = {a: dict(s) for a, s in iyi.items()}
        sicrama["altin"][gunler[-1].isoformat()] = 80.0
        with self.assertRaises(SystemExit):
            ev.gunluk_denetle(sicrama, bugun)

    def test_ay_anahtari(self):
        self.assertEqual(ev.ay_anahtari("2024-1"), "2024-01")
        self.assertEqual(ev.ay_anahtari("16-10-2024"), "2024-10")
        self.assertEqual(ev.ay_anahtari("2024-10-16"), "2024-10")

    def test_ayikla_bos_degerleri_atlar(self):
        satirlar = [
            {"Tarih": "2024-1", "TP_FG_J0": "100.5"},
            {"Tarih": "2024-2", "TP_FG_J0": None},
            {"Tarih": "2024-3", "TP_FG_J0": "102"},
        ]
        self.assertEqual(ev.seriyi_ayikla(satirlar, "TP.FG.J0"), {"2024-01": 100.5, "2024-03": 102.0})

    def test_zincirleme(self):
        yeni = {"2025-01": 100.0, "2025-02": 102.0}
        eski = {"2024-12": 2000.0, "2025-01": 2050.0}
        z = ev.zincirle([yeni, eski])
        self.assertEqual(z["2025-01"], 100.0)
        self.assertAlmostEqual(z["2024-12"], 2000 * 100 / 2050, places=3)
        self.assertEqual(list(z), ["2024-12", "2025-01", "2025-02"])

    def test_ortak_ay_yoksa_durur(self):
        with self.assertRaises(SystemExit):
            ev.zincirle([{"2025-01": 1.0}, {"2020-01": 1.0}])

    def test_uyum_denetimi(self):
        def seri(aylik, ay=48):
            s, d = {}, 100.0
            for i in range(ay):
                s[f"{2020 + i // 12:04d}-{i % 12 + 1:02d}"] = d
                d *= 1 + aylik
            return s

        # Farklı bazlı ama aynı değişimli seriler uyumlu.
        a = seri(0.02)
        b = {k: v * 31.7 for k, v in a.items()}
        ev.uyum_denetle(("A", a), ("B", b))
        # Farklı değişimli (yanlış) seri yakalanır.
        with self.assertRaises(SystemExit):
            ev.uyum_denetle(("A", a), ("C", seri(0.015)))

    def test_denetim_sicramayi_yakalar(self):
        aylar = {f"2020-{m:02d}": 100.0 for m in range(1, 13)}
        aylar.update({f"2021-{m:02d}": 100.0 for m in range(1, 13)})
        aylar.update({f"2022-{m:02d}": 100.0 for m in range(1, 13)})
        cikti = {"tufe": {"aylar": dict(aylar)}, "mevduat_3ay": {"aylar": {"2022-01": 20.0}}}
        ev.denetle(cikti)
        cikti["tufe"]["aylar"]["2022-12"] = 300.0
        with self.assertRaises(SystemExit):
            ev.denetle(cikti)


if __name__ == "__main__":
    unittest.main()
