/* Endeksly hesap çekirdeği: uygulamadaki lib/services/hesaplar.dart ve
 * ek_hesaplar.dart dosyalarının birebir karşılığı. Biri değişirse öteki de
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

  const Endeks = {
    AYLAR, ay, coz, anahtar, ad, ayAdi, yilOf, ayNo, Veri, Seri, MEMUR_TS,
    kira, maas, zamDonemi, emekliZammi, paraDegeri, ENDEKS_TURLERI, endeksOrani, endeksSonAy,
    yenidenDegerleme, dovizAltin, tarihMetni, GunlukSeri, sayi, tl, yuzde, degisimMetni, tutarCoz, tutarBicimle,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Endeks;
  else kok.Endeks = Endeks;
})(typeof window !== 'undefined' ? window : globalThis);
