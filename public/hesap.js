/* Endeksly hesap çekirdeği: uygulamadaki lib/services/hesaplar.dart,
 * ek_hesaplar.dart, net_maas.dart ve emeklilik.dart dosyalarının birebir karşılığı. Biri değişirse öteki de
 * değişir; docs/site/test_hesap.mjs iki tarafın sonuçlarını karşılaştırır.
 * Tarayıcıda window.Endeks, Node'da module.exports olarak kullanılır. */
(function (kok) {
  'use strict';

  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  // Ay, 0'dan sayılan tek bir tamsayıyla tutulur: yıl * 12 + (ay - 1).
  const ay = (yil, a) => yil * 12 + (a - 1);
  const coz = (k) => { const [y, m] = k.split('-').map(Number); return ay(y, m); };
  const yilOf = (i) => Math.floor(i / 12);
  const ayNo = (i) => (i % 12) + 1;
  const anahtar = (i) => `${yilOf(i)}-${String(ayNo(i)).padStart(2, '0')}`;
  const ad = (i) => `${AYLAR[i % 12]} ${yilOf(i)}`;
  const ayAdi = (i) => AYLAR[i % 12];

  /** Memur toplu sözleşme zamları (%), uygulandığı ay. */
  const MEMUR_TS = {
    '2024-01': 15, '2024-07': 10, '2025-01': 6, '2025-07': 5,
    '2026-01': 11, '2026-07': 7, '2027-01': 5, '2027-07': 4,
  };

  class Seri {
    constructor(bolum) {
      this.m = new Map();
      const aylar = (bolum && bolum.aylar) || {};
      for (const [k, v] of Object.entries(aylar)) this.m.set(coz(k), Number(v));
    }
    get bos() { return this.m.size === 0; }
    get(i) { return this.m.has(i) ? this.m.get(i) : null; }
    get son() { let s = null; for (const k of this.m.keys()) if (s === null || k > s) s = k; return s; }
    get ilk() { let s = null; for (const k of this.m.keys()) if (s === null || k < s) s = k; return s; }
    degisim(once, sonra) {
      const a = this.get(once), b = this.get(sonra);
      if (a === null || b === null || a === 0) return null;
      return (b / a - 1) * 100;
    }
    yillik(i) { return this.degisim(i - 12, i); }
    onIkiAylikOrtalama(i) {
      const ort = (son) => {
        let t = 0;
        for (let k = 0; k < 12; k++) { const d = this.get(son - k); if (d === null) return null; t += d; }
        return t / 12;
      };
      const yeni = ort(i), eski = ort(i - 12);
      if (yeni === null || eski === null) return null;
      return (yeni / eski - 1) * 100;
    }
  }

  /** Günlük fiyatlar (iş günleri): [['YYYY-MM-DD', değer], ...] eskiden yeniye. */
  class GunlukSeri {
    constructor(bolum) {
      this.ad = (bolum && bolum.ad) || '';
      this.gunler = Object.entries((bolum && bolum.gunler) || {})
        .map(([g, d]) => [g, Number(d)]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    }
    get bos() { return this.gunler.length === 0; }
    get son() { return this.gunler[this.gunler.length - 1]; }
    get onceki() { return this.gunler.length < 2 ? null : this.gunler[this.gunler.length - 2]; }
    tarihte(g) { let b = null; for (const x of this.gunler) { if (x[0] > g) break; b = x; } return b; }
  }

  class Veri {
    constructor(j) {
      this.ornek = j.ornek === true;
      this.guncelleme = j.guncelleme || '';
      this.kaynak = j.kaynak || '';
      this.tufe = new Seri(j.tufe);
      this.ufe = new Seri(j.ufe);
      this.usd = new Seri(j.usd);
      this.eur = new Seri(j.eur);
      this.gumus = new Seri(j.gumus);
      this.altin = new Seri(j.altin);
      this.bist = new Seri(j.bist);
      this.gunluk = {};
      const gs = (j.gunluk && j.gunluk.seriler) || {};
      for (const [k, b] of Object.entries(gs)) this.gunluk[k] = new GunlukSeri(b);
      if (this.tufe.m.size < 25) throw new Error('TÜFE verisi çok kısa');
    }
    get ilkAy() { return this.tufe.ilk; }
    get sonAy() { return this.tufe.son; }
    yillikEnflasyon(i) { return this.tufe.yillik(i); }
    aylikEnflasyon(i) { return this.tufe.degisim(i - 1, i); }
  }

  /** Konut kira artışı üst sınırı (TBK m.344). */
  function kira(v, eskiKira, yenileme) {
    const hedef = yenileme - 1;
    const a = hedef > v.sonAy ? v.sonAy : hedef;
    const oran = v.tufe.onIkiAylikOrtalama(a);
    if (oran === null) return null;
    const yeni = eskiKira * (1 + oran / 100);
    return { oranAyi: a, oran, eskiKira, yeniKiraUstSiniri: yeni, artisTutari: yeni - eskiKira, tahmini: a !== hedef };
  }

  /** Maaşın reel değeri. */
  function maas(v, ilkTutar, ilkAy, sonTutar, sonAy) {
    const a = v.tufe.get(ilkAy), b = v.tufe.get(sonAy);
    if (a === null || b === null || !(ilkTutar > 0)) return null;
    const esdeger = ilkTutar * b / a;
    return {
      ilkAy, sonAy, ilkTutar, sonTutar, esdegerTutar: esdeger,
      enflasyon: (b / a - 1) * 100,
      nominalDegisim: (sonTutar / ilkTutar - 1) * 100,
      reelDegisim: (sonTutar / esdeger - 1) * 100,
    };
  }

  /** Emekli (SSK/Bağ-Kur) ve memur zammı. */
  function zamDonemi(v, baz) {
    const son = v.sonAy, bitis = baz + 6;
    const kullanilan = bitis > son ? son : bitis;
    const gecen = kullanilan - baz;
    if (gecen <= 0) return null;
    const enf = v.tufe.degisim(baz, kullanilan);
    if (enf === null) return null;
    const buDonem = MEMUR_TS[anahtar(baz + 1)];
    const sonraki = MEMUR_TS[anahtar(baz + 7)];
    let memur = null, fark = null;
    if (buDonem !== undefined && sonraki !== undefined) {
      fark = Math.max(0, ((1 + enf / 100) / (1 + buDonem / 100) - 1) * 100);
      memur = ((1 + sonraki / 100) * (1 + fark / 100) - 1) * 100;
    }
    return {
      baz, gecenAy: gecen, enflasyon: enf, ssk: enf, memur,
      memurTopluSozlesmeOrani: sonraki === undefined ? null : sonraki,
      memurEnflasyonFarki: fark, zamAyi: baz + 7, bitis: baz + 6, kesin: gecen >= 6,
    };
  }
  function guncelBaz(v) {
    const s = v.sonAy, m = ayNo(s);
    if (m === 12 || m === 6) return s - 6;
    return m < 6 ? ay(yilOf(s) - 1, 12) : ay(yilOf(s), 6);
  }
  function emekliZammi(v) {
    const b = guncelBaz(v);
    return { guncel: zamDonemi(v, b), onceki: zamDonemi(v, b - 6) };
  }

  /** Paranın değeri: TÜFE, dolar, gram altın ve BIST 100. */
  function paraDegeri(v, tutar, i) {
    const son = v.sonAy;
    const a = v.tufe.get(i), b = v.tufe.get(son);
    if (a === null || b === null || !(tutar > 0) || !(son > i)) return null;
    const kurO = v.usd.get(i), kurS = v.usd.get(son);
    const altO = v.altin.get(i), altS = v.altin.get(son);
    const bistO = v.bist.get(i), bistS = v.bist.get(son);
    const dolar = kurO === null ? null : tutar / kurO;
    const gram = altO === null ? null : tutar / altO;
    const tufeKarsiligi = tutar * b / a;
    const r = {
      ay: i, son, tutar, tufeKarsiligi, dolar, gram,
      dolarBugunTl: dolar === null || kurS === null ? null : dolar * kurS,
      altinBugunTl: gram === null || altS === null ? null : gram * altS,
      borsaBugunTl: bistO === null || bistS === null ? null : tutar * bistS / bistO,
      enflasyon: (tufeKarsiligi / tutar - 1) * 100,
    };
    const artis = (x) => (x === null ? null : (x / tutar - 1) * 100);
    r.dolarArtisi = artis(r.dolarBugunTl);
    r.altinArtisi = artis(r.altinBugunTl);
    r.borsaArtisi = artis(r.borsaBugunTl);
    return r;
  }

  /** Endekse bağlı artış türleri. */
  const ENDEKS_TURLERI = [
    { kod: 'tufeOrtalama', ad: 'TÜFE 12 aylık ortalama', aciklama: 'Kira artışında kullanılan oran', seri: 'tufe', yontem: 'onIkiAylikOrtalama' },
    { kod: 'tufeYillik', ad: 'TÜFE yıllık', aciklama: 'Bir yıl önceki aya göre değişim', seri: 'tufe', yontem: 'yillik' },
    { kod: 'ufeOrtalama', ad: 'Yİ-ÜFE 12 aylık ortalama', aciklama: 'Ekim ayınınki yeniden değerleme oranıdır', seri: 'ufe', yontem: 'onIkiAylikOrtalama' },
    { kod: 'ufeYillik', ad: 'Yİ-ÜFE yıllık', aciklama: 'Bir yıl önceki aya göre değişim', seri: 'ufe', yontem: 'yillik' },
  ];
  const endeksOrani = (v, tur, i) => v[tur.seri][tur.yontem](i);
  const endeksSonAy = (v, tur) => (v[tur.seri].bos ? null : v[tur.seri].son);

  /** Döviz ve altın (uygulamadaki DovizAltin). */
  const VARLIK_SIRA = ['usd', 'eur', 'altin', 'gumus'];
  const VARLIK_AD = { usd: 'Dolar', eur: 'Euro', altin: 'Gram altın', gumus: 'Gram gümüş' };
  const VARLIK_KISA = { usd: 'Dolar', eur: 'Euro', altin: 'Altın', gumus: 'Gümüş' };
  const VARLIK_BIRIM = { usd: '$', eur: '€', altin: 'gram\u00A0altın', gumus: 'gram\u00A0gümüş' };
  const VARLIK_SIMGE = { usd: '$', eur: '€', altin: 'gr', gumus: 'gr' };
  const tarihMetni = (g) => { const [y, m, d] = g.split('-').map(Number); return `${d} ${AYLAR[m - 1]} ${y}`; };
  function dovizAltin(v) {
    const r = [];
    for (const k of VARLIK_SIRA) {
      const g = v.gunluk[k];
      if (!g || g.bos) continue;
      const [tarih, fiyat] = g.son;
      const once = g.onceki;
      const [y, m, d] = tarih.split('-');
      const yilBasi = `${Number(y) - 1}-${m}-${d}`;
      const yilOnce = g.tarihte(yilBasi);
      const aylik = v[k];
      r.push({
        kod: k, ad: VARLIK_AD[k], kisaAd: VARLIK_KISA[k], birimAdi: VARLIK_BIRIM[k], simge: VARLIK_SIMGE[k],
        altin: k === 'altin', gram: k === 'altin' || k === 'gumus',
        kaynak: k === 'altin' || k === 'gumus' ? 'Borsa İstanbul ortalaması, TL/gram' : 'TCMB gösterge satış kuru',
        tarih, fiyat,
        gunlukDegisim: once ? (fiyat / once[1] - 1) * 100 : null,
        yillikDegisim: yilOnce ? (fiyat / yilOnce[1] - 1) * 100 : null,
        grafik: g.gunler.filter((x) => x[0] >= yilBasi).map((x) => x[1]),
        aylikOrtalamaDegisim: aylik.degisim(v.sonAy - 12, v.sonAy),
      });
    }
    return r;
  }

  /** Yeniden değerleme oranı: son Ekim itibarıyla Yİ-ÜFE 12 aylık ortalama. */
  function yenidenDegerleme(v) {
    if (v.ufe.bos) return null;
    const s = v.ufe.son;
    const ekim = ayNo(s) >= 10 ? ay(yilOf(s), 10) : ay(yilOf(s) - 1, 10);
    const oran = v.ufe.onIkiAylikOrtalama(ekim);
    return oran === null ? null : { yil: yilOf(ekim), oran };
  }

  /** Brütten nete: lib/services/net_maas.dart ile aynı tablo ve yöntem. Tutarlar
   * kuruş; her kalem bordro gibi ayrı ayrı kuruşa yuvarlanır. [üst sınır, %]. */
  const BORDRO_YILLARI = {
    2025: {
      yil: 2025, asgariBrutKurus: 2600550, sgkTavanKurus: 19504140,
      dilimler: [[15800000, 15], [33000000, 20], [120000000, 27], [430000000, 35], [null, 40]],
      kaynak: 'GİB Gelir Vergisi Genel Tebliği Seri No 329; ÇSGB asgari ücret tablosu; SGK Genelgesi 2025/2. Doğrulama: 9 Kasım 2026.',
    },
    2026: {
      yil: 2026, asgariBrutKurus: 3303000, sgkTavanKurus: 29727000,
      dilimler: [[19000000, 15], [40000000, 20], [150000000, 27], [530000000, 35], [null, 40]],
      kaynak: 'GİB Gelir Vergisi Genel Tebliği Seri No 332 (Resmî Gazete 31.12.2025, sayı 33124, 5. Mükerrer); ÇSGB asgari ücret tablosu; SGK prime esas kazanç tablosu. Doğrulama: 9 Kasım 2026.',
    },
  };
  const SGK_ISCI = 14, ISSIZLIK_ISCI = 1, DAMGA_YUZBINDE = 759;
  const yuvarla = (pay, payda) => Math.floor((pay + Math.floor(payda / 2)) / payda);
  function kumulatifVergi(matrah, dilimler) {
    let toplam = 0, alt = 0;
    for (const [ust, oran] of dilimler) {
      const ici = (ust === null || matrah < ust ? matrah : ust) - alt;
      if (ici <= 0) break;
      toplam += ici * oran;
      if (ust === null) break;
      alt = ust;
    }
    return toplam;
  }
  const donemVergisi = (eski, yeni, d) => yuvarla(kumulatifVergi(yeni, d) - kumulatifVergi(eski, d), 100);
  function ustDilim(matrah, dilimler) {
    for (const [ust, oran] of dilimler) if (ust === null || matrah <= ust) return oran;
    return dilimler[dilimler.length - 1][1];
  }
  /** [yil] için aylık sabit brüt ve {ay: brüt prim} ile on iki aylık bordro. */
  function netMaas(yil, brutTl, primler = {}) {
    const p = BORDRO_YILLARI[yil];
    if (!p || !(brutTl > 0)) return null;
    const maasK = Math.round(brutTl * 100), tavan = p.sgkTavanKurus;
    const sonrasi = (k) => k - yuvarla(k * SGK_ISCI, 100) - yuvarla(k * ISSIZLIK_ISCI, 100);
    const asgariMatrah = sonrasi(p.asgariBrutKurus);
    const damgaAsgari = yuvarla(p.asgariBrutKurus * DAMGA_YUZBINDE, 100000);
    const aylar = [];
    let devirler = [], kum = 0, asgariKum = 0, tavanAsildi = false;
    for (let a = 1; a <= 12; a++) {
      const g = primler[a];
      const prim = g > 0 ? Math.round(g * 100) : 0;
      const brut = maasK + prim;
      if (brut > tavan) tavanAsildi = true;
      const maasSpek = Math.min(maasK, tavan);
      let bosluk = tavan - maasSpek;
      const primSpek = Math.min(prim, bosluk);
      bosluk -= primSpek;
      let devreden = 0;
      for (const d of devirler) {
        if (bosluk === 0) break;
        const e = Math.min(d.kalan, bosluk);
        d.kalan -= e; bosluk -= e; devreden += e;
      }
      for (const d of devirler) d.hak--;
      devirler = devirler.filter((d) => d.kalan !== 0 && d.hak !== 0);
      if (prim > primSpek) devirler.push({ kalan: prim - primSpek, hak: 2 });
      const spek = maasSpek + primSpek + devreden;
      const sgk = yuvarla(spek * SGK_ISCI, 100), issizlik = yuvarla(spek * ISSIZLIK_ISCI, 100);
      const matrah = brut - sgk - issizlik;
      const damga = yuvarla(brut * DAMGA_YUZBINDE, 100000);
      const yeni = kum + matrah;
      const hesaplanan = donemVergisi(kum, yeni, p.dilimler);
      const asgariYeni = asgariKum + asgariMatrah;
      const istisna = Math.min(hesaplanan, donemVergisi(asgariKum, asgariYeni, p.dilimler));
      const damgaIst = Math.min(damga, damgaAsgari);
      const odenecek = hesaplanan - istisna, odenecekDamga = damga - damgaIst;
      aylar.push({
        ay: a, brut: brut / 100, prim: prim / 100, sgkMatrahi: spek / 100, devredenSgk: devreden / 100,
        sgkPrimi: sgk / 100, issizlikPrimi: issizlik / 100, gvMatrahi: matrah / 100, kumulatifMatrah: yeni / 100,
        dilimYuzde: ustDilim(yeni, p.dilimler), hesaplananGv: hesaplanan / 100, gvIstisnasi: istisna / 100,
        odenecekGv: odenecek / 100, hesaplananDamga: damga / 100, damgaIstisnasi: damgaIst / 100,
        odenecekDamga: odenecekDamga / 100, net: (brut - sgk - issizlik - odenecek - odenecekDamga) / 100,
      });
      kum = yeni; asgariKum = asgariYeni;
    }
    const top = (f) => aylar.reduce((t, a) => t + Math.round(f(a) * 100), 0) / 100;
    const yillikNet = top((a) => a.net);
    return {
      parametre: p, aylar, tavanAsildi, asgariAltinda: maasK < p.asgariBrutKurus,
      yillikBrut: top((a) => a.brut), yillikNet, yillikSgk: top((a) => a.sgkPrimi + a.issizlikPrimi),
      yillikGv: top((a) => a.odenecekGv), yillikDamga: top((a) => a.odenecekDamga),
      yillikGvIstisnasi: top((a) => a.gvIstisnasi), ortalamaNet: yillikNet / 12,
      enYuksek: aylar.reduce((x, y) => (y.net > x.net ? y : x)),
      enDusuk: aylar.reduce((x, y) => (y.net < x.net ? y : x)),
    };
  }

  // Biçim: uygulamadaki lib/services/bicim.dart ile aynı.
  function grupla(tam) {
    let b = '';
    for (let i = 0; i < tam.length; i++) {
      if (i > 0 && (tam.length - i) % 3 === 0) b += '.';
      b += tam[i];
    }
    return b;
  }
  function sayi(d, basamak = 0) {
    const [tam, kesir] = Math.abs(d).toFixed(basamak).split('.');
    return `${d < 0 ? '-' : ''}${grupla(tam)}${kesir ? `,${kesir}` : ''}`;
  }
  const tl = (d, basamak = 0) => `${sayi(d, basamak)} TL`;
  const yuzde = (d, basamak = 2) => `${d < 0 ? '-' : ''}%${sayi(Math.abs(d), basamak)}`;
  const degisimMetni = (d) => (d >= 0 ? `+${yuzde(d)}` : yuzde(d));
  /** "1.234,56", "1234,56" ya da "1234.56" girdisini çözer. */
  function tutarCoz(metin) {
    let m = String(metin || '').trim().replace(/ /g, '').replace(/TL/g, '');
    if (m.endsWith(',')) m = m.slice(0, -1);
    if (!m) return null;
    if (m.includes(',')) m = m.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(m)) m = m.replace(/\./g, '');
    if (!/^\d*\.?\d+$/.test(m)) return null;
    return Number(m);
  }
  /** Yazarken binlik ayırıcı: "400000" → "400.000", "1234,5" → "1.234,5". */
  function tutarBicimle(eski, yeni) {
    let m = yeni.replace(/[^0-9.,]/g, '');
    if (m.endsWith('.') && !m.includes(',') && m.length > eski.length) m = `${m.slice(0, -1)},`;
    m = m.replace(/\./g, '');
    const v = m.indexOf(',');
    let tam = v < 0 ? m : m.slice(0, v);
    let kurus = v < 0 ? null : m.slice(v + 1).replace(/,/g, '');
    if (kurus !== null && kurus.length > 2) kurus = kurus.slice(0, 2);
    tam = tam.replace(/^0+(?=\d)/, '');
    if (!tam && kurus !== null) tam = '0';
    if (tam.length > 13) tam = tam.slice(0, 13);
    return kurus === null ? grupla(tam) : `${grupla(tam)},${kurus}`;
  }

  // ---- emeklilik tarihi (lib/services/emeklilik.dart) ---------------------
  const gunTarihi = (y, a, g) => new Date(y, a - 1, g);
  const gunuAl = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sonra = (a, b) => a.getTime() > b.getTime();
  const yilEkle = (d, yil) => new Date(d.getFullYear() + yil, d.getMonth(), d.getDate());
  /** [tarih] itibarıyla doldurulmuş yaş. */
  function tamYas(dogum, tarih) {
    let y = tarih.getFullYear() - dogum.getFullYear();
    if (tarih.getMonth() < dogum.getMonth()
      || (tarih.getMonth() === dogum.getMonth() && tarih.getDate() < dogum.getDate())) y--;
    return y;
  }
  /** Kesintisiz çalışmada gün şartının dolduğu tarih: ayda 30 gün. */
  const primGunuSonrasi = (b, gun) => new Date(b.getFullYear(), b.getMonth() + Math.floor(gun / 30), b.getDate() + (gun % 30));
  /** 5510 m.28: gün şartının dolduğu tarihteki yaş [kadın, erkek]. */
  function tamAylikYas(t) {
    const y = t.getFullYear();
    if (y < 2036) return [58, 60];
    if (y < 2038) return [59, 61];
    if (y < 2040) return [60, 62];
    if (y < 2042) return [61, 63];
    if (y < 2044) return [62, 64];
    if (y < 2046) return [63, 65];
    if (y < 2048) return [64, 65];
    return [65, 65];
  }
  /** 5510 m.28/3: 5400 günlük yolda yaşa üç yıl eklenir, 65'i geçmez. */
  const kismiYas = (t) => tamAylikYas(t).map((y) => Math.min(y + 3, 65));
  const KADEME_KADIN = [[1985, 5, 23, 5000], [1986, 5, 23, 5075], [1987, 5, 23, 5150], [1988, 5, 23, 5225],
    [1989, 5, 23, 5300], [1990, 5, 23, 5375], [1991, 5, 23, 5450], [1992, 5, 23, 5525], [1993, 5, 23, 5600],
    [1994, 5, 23, 5675], [1995, 5, 23, 5750], [1996, 5, 23, 5825], [1997, 5, 23, 5900], [1999, 9, 8, 5975]];
  const KADEME_ERKEK = [[1980, 11, 23, 5000], [1982, 5, 23, 5075], [1983, 11, 23, 5150], [1985, 5, 23, 5225],
    [1986, 11, 23, 5300], [1988, 5, 23, 5375], [1989, 11, 23, 5450], [1991, 5, 23, 5525], [1992, 11, 23, 5600],
    [1994, 5, 23, 5675], [1995, 11, 23, 5750], [1997, 5, 23, 5825], [1998, 11, 23, 5900], [1999, 9, 8, 5975]];
  function kademeliGun(giris, cinsiyet) {
    for (const [y, a, g, gun] of cinsiyet === 'kadin' ? KADEME_KADIN : KADEME_ERKEK) {
      if (!sonra(giris, gunTarihi(y, a, g))) return gun;
    }
    return 5975;
  }
  function kademeli5400(giris) {
    const y = giris.getFullYear();
    if (y <= 2008) return 4600;
    if (y >= 2016) return 5400;
    return 4600 + (y - 2008) * 100;
  }
  /** statu: 'a'|'b'|'c', cinsiyet: 'kadin'|'erkek'. Girdiler tutarsızsa null. */
  function emeklilikHesapla({ statu, cinsiyet, dogum, giris, primGun, bugun }) {
    const b = gunuAl(bugun), d = gunuAl(dogum), g = gunuAl(giris);
    if (sonra(d, b) || sonra(g, b) || !sonra(g, d) || primGun < 0) return null;
    const kadin = cinsiyet === 'kadin';
    const r = (ad, gerekenGun, { kismi = false, sureYil = null, yasSabit = null, yasTablosu = null } = {}) => {
      const kalanGun = gerekenGun > primGun ? gerekenGun - primGun : 0;
      const gunT = primGunuSonrasi(b, kalanGun);
      const cift = yasTablosu ? yasTablosu(gunT) : yasSabit;
      const yas = cift === null ? null : (kadin ? cift[0] : cift[1]);
      let tarih = gunT;
      let belirleyici = kalanGun > 0 ? 'gun' : 'yok';
      if (yas !== null) {
        const t = yilEkle(d, yas);
        if (sonra(t, tarih)) { tarih = t; belirleyici = 'yas'; }
      }
      if (sureYil !== null) {
        const t = yilEkle(g, sureYil);
        if (sonra(t, tarih)) { tarih = t; belirleyici = 'sure'; }
      }
      return { ad, kismi, gerekenGun, kalanGun, yas, sureYil, tarih, belirleyici };
    };
    const yas5860 = [58, 60];
    let grup, rotalar;
    if (!sonra(g, gunTarihi(1999, 9, 8))) {
      grup = '8 Eylül 1999 ve öncesi giriş';
      if (statu === 'a') rotalar = [r('Yaş şartı olmadan', kademeliGun(g, cinsiyet), { sureYil: kadin ? 20 : 25 })];
      else if (statu === 'b') rotalar = [r('Yaş şartı olmadan', kadin ? 7200 : 9000)];
      else rotalar = [r('Yaş şartı olmadan', kadin ? 7200 : 9000), r('61 yaş ve 15 yıl', 5400, { kismi: true, yasSabit: [61, 61] })];
    } else if (g.getTime() < gunTarihi(2008, 5, 1).getTime()) {
      grup = '9 Eylül 1999 – 30 Nisan 2008 giriş';
      if (statu === 'a') {
        rotalar = [r('Yaş ve 7000 gün', 7000, { yasSabit: yas5860 }),
          r('Yaş, 25 yıl ve 4500 gün', 4500, { sureYil: 25, yasSabit: yas5860 })];
      } else if (statu === 'b') {
        rotalar = [r('Yaş ve 25 tam yıl', 9000, { yasSabit: yas5860 }),
          r('Yaş ve 15 tam yıl', 5400, { kismi: true, yasSabit: [60, 62] })];
      } else {
        rotalar = [r('Yaş ve 25 tam yıl', 9000, { yasSabit: yas5860 }),
          r('61 yaş ve 15 yıl', 5400, { kismi: true, yasSabit: [61, 61] })];
      }
    } else {
      grup = '1 Mayıs 2008 ve sonrası giriş';
      const tam = statu === 'a' ? 7200 : 9000;
      const kismiGun = statu === 'a' ? kademeli5400(g) : 5400;
      rotalar = [r(`${tam} gün`, tam, { yasTablosu: tamAylikYas }),
        r(`${kismiGun} gün`, kismiGun, { kismi: true, yasTablosu: kismiYas })];
    }
    rotalar.sort((x, y) => x.tarih.getTime() - y.tarih.getTime());
    const enErken = rotalar[0];
    return { grup, rotalar, dogum: d, bugun: b, enErken, sartlarTamam: !sonra(enErken.tarih, b), enErkenYas: tamYas(d, enErken.tarih) };
  }
  /** "12 Mart 2043" */
  const gunMetni = (t) => `${t.getDate()} ${AYLAR[t.getMonth()]} ${t.getFullYear()}`;
  /** "05.03.1985" metnini çözer; geçersiz tarihte null. */
  function tarihCoz(metin) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(metin || '').trim());
    if (!m) return null;
    const g = Number(m[1]), a = Number(m[2]), y = Number(m[3]);
    const d = new Date(y, a - 1, g);
    return d.getFullYear() === y && d.getMonth() === a - 1 && d.getDate() === g ? d : null;
  }
  /** Yazarken "gg.aa.yyyy" biçimi: yalnız rakam alır, noktaları kendisi koyar. */
  function tarihBicimle(metin) {
    const r = String(metin || '').replace(/\D/g, '').slice(0, 8);
    let m = '';
    for (let i = 0; i < r.length; i++) m += ((i === 2 || i === 4) ? '.' : '') + r[i];
    return m;
  }

  const Endeks = {
    AYLAR, ay, coz, anahtar, ad, ayAdi, yilOf, ayNo, Veri, Seri, MEMUR_TS,
    kira, maas, zamDonemi, emekliZammi, paraDegeri, ENDEKS_TURLERI, endeksOrani, endeksSonAy,
    BORDRO_YILLARI, netMaas, yenidenDegerleme, dovizAltin, tarihMetni, emeklilikHesapla, gunMetni, tarihCoz, tarihBicimle, GunlukSeri, sayi, tl, yuzde, degisimMetni, tutarCoz, tutarBicimle,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Endeks;
  else kok.Endeks = Endeks;
})(typeof window !== 'undefined' ? window : globalThis);
