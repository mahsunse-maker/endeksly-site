/* Endeksly web hesaplayıcıları: uygulamadaki ekranların karşılığı.
 * Hesaplar hesap.js'te; burada yalnızca form ve sonuç kartları var.
 * Girilen tutarlar tarayıcıdan çıkmaz; yalnızca /veri/endeksly.json indirilir. */
(function () {
  'use strict';
  const E = window.Endeks;
  const { tl, yuzde, ad, degisimMetni } = E;

  // ---- küçük DOM yardımcıları ------------------------------------------
  function el(etiket, ozellik, ...cocuklar) {
    const d = document.createElement(etiket);
    for (const [k, v] of Object.entries(ozellik || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'sinif') d.className = v;
      else if (k.startsWith('on')) d.addEventListener(k.slice(2), v);
      else if (k === 'stil') d.setAttribute('style', v);
      else d.setAttribute(k, v === true ? '' : v);
    }
    for (const c of cocuklar.flat()) {
      if (c === null || c === undefined || c === false) continue;
      d.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return d;
  }
  let sayac = 0;
  const kimlik = () => `alan${++sayac}`;

  function tutarAlani(etiket, degisti) {
    const id = kimlik();
    const girdi = el('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0' });
    let eski = '';
    girdi.addEventListener('input', () => {
      const yeni = E.tutarBicimle(eski, girdi.value);
      girdi.value = yeni;
      eski = yeni;
      degisti();
    });
    const kap = el('div', { sinif: 'alan' },
      el('label', { for: id }, etiket),
      el('div', { sinif: 'tutar' }, girdi, el('span', {}, 'TL')));
    return {
      kap, girdi,
      get deger() { return E.tutarCoz(girdi.value); },
      yaz(metin) { girdi.value = metin; eski = metin; },
      etiket(m) { kap.querySelector('label').textContent = m; },
      birim(m) { kap.querySelector('.tutar span').textContent = m; },
    };
  }

  function tarihAlani(etiket, degisti) {
    const id = kimlik();
    const girdi = el('input', { id, type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'gg.aa.yyyy', maxlength: 10 });
    girdi.addEventListener('input', () => { girdi.value = E.tarihBicimle(girdi.value); degisti(); });
    return {
      kap: el('div', { sinif: 'alan' }, el('label', { for: id }, etiket), el('div', { sinif: 'tutar' }, girdi)),
      get deger() { return E.tarihCoz(girdi.value); },
      yaz(metin) { girdi.value = metin; },
    };
  }

  function aySecici(etiket, ilk, son, secili, degisti) {
    const id = kimlik();
    const s = el('select', { id, onchange: () => degisti(Number(s.value)) });
    const doldur = (a, b, sec) => {
      s.textContent = '';
      for (let i = b; i >= a; i--) s.append(el('option', { value: i, selected: i === sec }, ad(i)));
    };
    doldur(ilk, son, secili);
    return { kap: el('div', { sinif: 'alan' }, el('label', { for: id }, etiket), s), doldur, get deger() { return Number(s.value); } };
  }

  function cipler(secenekler, secili, degisti) {
    const kap = el('div', { sinif: 'cipler', role: 'radiogroup' });
    const ciz = (sec) => {
      kap.textContent = '';
      for (const [deger, metin] of secenekler) {
        kap.append(el('button', {
          type: 'button', sinif: deger === sec ? 'cip secili' : 'cip', role: 'radio',
          'aria-checked': deger === sec ? 'true' : 'false',
          onclick: () => { ciz(deger); degisti(deger); },
        }, metin));
      }
    };
    ciz(secili);
    return kap;
  }

  function sonucKarti({ baslik, deger, renk, alt, ek, etiket }) {
    return el('div', { sinif: 'sonuc', 'aria-live': 'polite' },
      el('div', { sinif: 'baslik' }, el('span', {}, baslik), etiket ? el('span', { sinif: 'etiket' }, etiket) : null),
      el('div', { sinif: 'buyuk', stil: renk ? `color:${renk}` : null }, deger),
      alt ? el('p', { sinif: 'alt' }, ...String(alt).split('\n').flatMap((s, i) => (i ? [el('br'), s] : [s]))) : null,
      ek || null);
  }

  /** TL tutar çubukları ve aynı alım gücü eşiği (uygulamadaki TutarCubuklari). */
  function tutarCubuklari(satirlar, esik, aciklama) {
    const enBuyuk = Math.max(esik, ...satirlar.map((s) => s[1])) || 1;
    const esikOran = Math.min(1, esik / enBuyuk) * 100;
    return el('div', { sinif: 'cubuklar' },
      satirlar.map(([etiket, deger, renk]) => el('div', { sinif: 'cubuk' },
        el('div', { sinif: 'cubuk-ust' }, el('span', {}, etiket), el('b', {}, tl(deger))),
        el('div', { sinif: 'iz' },
          el('div', { sinif: 'dolu', stil: `width:${Math.max(0, Math.min(1, deger / enBuyuk)) * 100}%;background:${renk}` }),
          el('div', { sinif: 'esik', stil: `left:calc(${esikOran}% - 1px)` })))),
      el('p', { sinif: 'esik-aciklama' }, aciklama));
  }

  function satirKarti(satirlar) {
    return el('div', { sinif: 'satirlar-karti' },
      satirlar.map(([sol, sag, sinif]) => el('div', { sinif: 'satir' }, el('span', {}, sol), el('b', { sinif: sinif || null }, sag))));
  }

  function ornekKarti(metin, dene) {
    return el('div', { sinif: 'ornek-karti' },
      el('div', { sinif: 'ornek-baslik' }, '💡 Örnek hesap'),
      el('p', {}, metin),
      el('button', { type: 'button', sinif: 'metin-dugme', onclick: dene }, 'Örneği göster'));
  }

  function paylasDugmesi(metin) {
    if (!navigator.share && !navigator.clipboard) return null;
    const d = el('button', {
      type: 'button', sinif: 'cerceve-dugme',
      onclick: async () => {
        const tam = `${metin}\n${location.origin}${location.pathname}`;
        try {
          if (navigator.share) await navigator.share({ text: tam });
          else { await navigator.clipboard.writeText(tam); d.textContent = 'Kopyalandı'; }
        } catch (_) { /* vazgeçildi */ }
      },
    }, navigator.share ? 'Sonucu paylaş' : 'Sonucu kopyala');
    return d;
  }

  const NANE = '#9FE1CB', LAVANTA = '#CECBF6', KEHRIBAR = '#FAC775', ACIK = 'rgba(238,237,254,0.55)';
  const NET_ANAHTAR = 'endeksly-net';

  // ---- hesaplayıcılar ----------------------------------------------------
  const HESAPLAR = {
    emeklilik(v, kok) {
      const STATU = { a: '4/a SSK', b: '4/b Bağ-Kur', c: '4/c Memur' };
      const NEDEN = { gun: 'Tarihi prim günü belirliyor.', yas: 'Tarihi yaş şartı belirliyor.', sure: 'Tarihi sigortalılık süresi belirliyor.', yok: 'Şartlar tamam.' };
      const bugun = new Date();
      let statu = 'a', cinsiyet = 'erkek';
      const sayi = (n) => E.sayi(n);
      const dogum = tarihAlani('Doğum tarihi', ciz);
      const giris = tarihAlani('İlk sigorta girişi', ciz);
      const gun = tutarAlani('Şu anki prim günü', ciz);
      gun.birim('gün');
      const sonuc = el('div', { sinif: 'sonuc-alani' });
      let statuKap = cipler(Object.entries(STATU), statu, (x) => { statu = x; ciz(); });
      let cinsiyetKap = cipler([['kadin', 'Kadın'], ['erkek', 'Erkek']], cinsiyet, (x) => { cinsiyet = x; ciz(); });
      statuKap.classList.add('esit');
      cinsiyetKap.classList.add('esit');
      kok.append(statuKap, cinsiyetKap, el('div', { sinif: 'form iki' }, dogum.kap, giris.kap),
        el('div', { sinif: 'form' }, gun.kap), el('p', { sinif: 'ipucu' }, 'Girilen bilgiler yalnızca tarayıcıda işlenir.'), sonuc);
      function ornekGoster() {
        statu = 'a'; cinsiyet = 'erkek';
        const s = cipler(Object.entries(STATU), statu, (x) => { statu = x; ciz(); });
        const c = cipler([['kadin', 'Kadın'], ['erkek', 'Erkek']], cinsiyet, (x) => { cinsiyet = x; ciz(); });
        s.classList.add('esit'); c.classList.add('esit');
        statuKap.replaceWith(s); cinsiyetKap.replaceWith(c);
        statuKap = s; cinsiyetKap = c;
        dogum.yaz('01.06.1985'); giris.yaz('01.09.2010'); gun.yaz('4.500');
        ciz();
      }
      function ciz() {
        sonuc.textContent = '';
        const d = dogum.deger, g = giris.deger, p = gun.deger;
        const s = d === null || g === null || p === null ? null
          : E.emeklilikHesapla({ statu, cinsiyet, dogum: d, giris: g, primGun: Math.floor(p), bugun });
        if (d !== null && g !== null && p !== null && s === null) {
          sonuc.append(el('p', { sinif: 'uyari' }, 'Tarihler tutarsız görünüyor: tarihler bugünden ileri olamaz, ilk sigorta girişi doğumdan sonra olmalı.'));
          return;
        }
        if (s === null) {
          const o = E.emeklilikHesapla({ statu: 'a', cinsiyet: 'erkek', dogum: new Date(1985, 5, 1), giris: new Date(2010, 8, 1), primGun: 4500, bugun });
          sonuc.append(ornekKarti(`1 Haziran 1985 doğumlu, 1 Eylül 2010’da sigortalı olan ve 4.500 günü bulunan 4/a sigortalısı bir erkek, kesintisiz çalışırsa en erken ${E.gunMetni(o.enErken.tarih)} tarihinde emekli olabilir.`, ornekGoster));
          return;
        }
        const r = s.enErken;
        sonuc.append(sonucKarti({
          baslik: s.sartlarTamam ? 'Şartlar bugün sağlanıyor' : 'En erken emeklilik',
          deger: s.sartlarTamam ? 'Bugün' : E.gunMetni(r.tarih),
          etiket: STATU[statu],
          alt: [`${s.enErkenYas} yaşında · ${r.ad}${r.kismi ? ' (kısmi aylık)' : ''}.`,
            r.kalanGun > 0 ? `Kalan prim: ${sayi(r.kalanGun)} gün.` : null,
            s.sartlarTamam ? null : NEDEN[r.belirleyici]].filter(Boolean).join(' '),
        }));
        for (const x of s.rotalar) {
          sonuc.append(satirKarti([
            [x.kismi ? `${x.ad} · kısmi aylık` : x.ad, x.tarih.getTime() > s.bugun.getTime() ? E.gunMetni(x.tarih) : 'Bugün'],
            ['Gereken prim günü', x.kalanGun > 0 ? `${sayi(x.gerekenGun)} · ${sayi(x.kalanGun)} kaldı` : `${sayi(x.gerekenGun)} · tamam`],
            ['Aranan yaş', x.yas === null ? 'Yok' : String(x.yas)],
            x.sureYil !== null ? ['Sigortalılık süresi', `${x.sureYil} yıl`] : null,
          ].filter(Boolean)));
        }
        sonuc.append(el('p', { sinif: 'ipucu' }, `${s.grup}. Kesin sonuç SGK kayıtlarına göre belirlenir; e-Devlet’te “Ne Zaman Emekli Olabilirim?” hizmeti vardır.`));
      }
      ciz();
    },
    net(v, kok) {
      const yillar = Object.keys(E.BORDRO_YILLARI).map(Number);
      const veriYili = E.yilOf(v.sonAy);
      let yil = yillar.includes(veriYili) ? veriYili : yillar[yillar.length - 1];
      const ORNEK = 50000;
      const ayAd = (a) => E.AYLAR[a - 1];
      const para = (d) => tl(d, 2);
      const eksi = (d) => (d === 0 ? para(0) : `-${para(d)}`);
      const satirlar = [];
      const asgari = el('p', { sinif: 'ipucu' });
      const brut = tutarAlani('Aylık brüt maaş', ciz);
      const primKap = el('div', { sinif: 'prim-listesi' });
      const ekle = el('button', { type: 'button', sinif: 'metin-dugme', stil: 'margin-left:0', onclick: primEkle }, '+ Prim ekle');
      const sonuc = el('div', { sinif: 'sonuc-alani' });
      const secici = cipler(yillar.map((y) => [y, String(y)]), yil, (y) => { yil = y; ciz(); });
      secici.classList.add('esit');
      kok.append(secici, el('div', { sinif: 'form' }, brut.kap), asgari, primKap, ekle, sonuc);

      const primler = () => {
        const m = {};
        for (const s of satirlar) if (s.tutar.deger > 0) m[s.ay] = (m[s.ay] || 0) + s.tutar.deger;
        return m;
      };
      function primEkle() {
        const dolu = new Set(satirlar.map((s) => s.ay));
        let ay = 1;
        while (ay < 12 && dolu.has(ay)) ay++;
        const id = kimlik();
        const s = { ay, tutar: tutarAlani('Brüt prim', ciz), kap: null };
        const sec = el('select', { id, onchange: () => { s.ay = Number(sec.value); ciz(); } },
          E.AYLAR.map((a, i) => el('option', { value: i + 1, selected: i + 1 === ay }, a)));
        s.kap = el('div', { sinif: 'prim-satir' },
          el('div', { sinif: 'alan' }, el('label', { for: id }, 'Prim ayı'), sec), s.tutar.kap,
          el('button', {
            type: 'button', sinif: 'prim-sil', 'aria-label': 'Primi kaldır',
            onclick: () => { satirlar.splice(satirlar.indexOf(s), 1); s.kap.remove(); ciz(); },
          }, '×'));
        satirlar.push(s);
        primKap.append(s.kap);
        ciz();
      }
      function reelBaglanti(sade) {
        const son = v.sonAy;
        if (yil !== E.yilOf(son) && yil !== E.yilOf(son) - 1) return null;
        const bilgi = { alan: yil === E.yilOf(son) ? 'son' : 'ilk', net: sade.aylar[E.ayNo(son) - 1].net };
        return el('a', {
          sinif: 'cerceve-dugme', href: '/maas-enflasyon-hesaplama/',
          onclick: () => { try { sessionStorage.setItem(NET_ANAHTAR, JSON.stringify(bilgi)); } catch (_) { /* depolama kapalı */ } },
        }, 'Bu net ile reel değer hesabı');
      }
      function ayKarti(a) {
        const satir = [];
        if (a.prim > 0) satir.push(['Maaş', para(a.brut - a.prim)], ['Prim', para(a.prim)]);
        satir.push([a.prim > 0 ? 'Toplam brüt' : 'Brüt', para(a.brut)]);
        if (a.sgkMatrahi !== a.brut) satir.push(['SGK matrahı', para(a.sgkMatrahi)]);
        if (a.devredenSgk > 0) satir.push(['Önceki primden devreden', para(a.devredenSgk)]);
        satir.push(
          ['SGK işçi payı (%14)', eksi(a.sgkPrimi)], ['İşsizlik işçi payı (%1)', eksi(a.issizlikPrimi)],
          ['Gelir vergisi matrahı', para(a.gvMatrahi)], ['Kümülatif matrah', para(a.kumulatifMatrah)],
          ['Hesaplanan gelir vergisi', para(a.hesaplananGv)], ['Asgari ücret istisnası', eksi(a.gvIstisnasi)],
          ['Kesilen gelir vergisi', eksi(a.odenecekGv)], ['Hesaplanan damga vergisi', para(a.hesaplananDamga)],
          ['Asgari ücret istisnası', eksi(a.damgaIstisnasi)], ['Kesilen damga vergisi', eksi(a.odenecekDamga)],
          ['Net ele geçen', para(a.net), 'olumlu']);
        const dilim = a.prim > 0 ? `Primli · %${a.dilimYuzde}` : a.odenecekGv === 0 ? '' : `%${a.dilimYuzde} dilimi`;
        return el('details', {},
          el('summary', {}, el('span', { sinif: 'ay-ad' }, ayAd(a.ay)), el('span', { sinif: 'ay-dilim' }, dilim), el('b', {}, para(a.net))),
          satirKarti(satir));
      }
      function ciz() {
        const p = E.BORDRO_YILLARI[yil];
        asgari.textContent = `${yil} asgari ücreti ${tl(p.asgariBrutKurus / 100, 2)} brüt.`;
        sonuc.textContent = '';
        const b = brut.deger, pr = primler(), primVar = Object.keys(pr).length > 0;
        const s = b > 0 ? E.netMaas(yil, b, pr) : null;
        if (!s) {
          const o = E.netMaas(yil, ORNEK);
          sonuc.append(ornekKarti(
            `${yil} yılında aylık brüt ${tl(ORNEK)} alan birinin neti ${ayAd(o.enYuksek.ay)} ayında ${tl(o.enYuksek.net)}, ${ayAd(o.enDusuk.ay)} ayında ${tl(o.enDusuk.net)}. Yıllık ortalama ${tl(o.ortalamaNet)}.`,
            () => { brut.yaz('50.000'); ciz(); }));
          return;
        }
        const sabit = s.enYuksek.net === s.enDusuk.net;
        sonuc.append(sonucKarti({
          baslik: `${yil} yıllık ortalama net${primVar ? ' (prim dahil)' : ''}`,
          deger: tl(s.ortalamaNet),
          alt: sabit ? 'Net maaş yıl boyunca aynı kalır.'
            : `En yüksek ${ayAd(s.enYuksek.ay)}: ${tl(s.enYuksek.net)} · En düşük ${ayAd(s.enDusuk.ay)}: ${tl(s.enDusuk.net)}. ${primVar ? 'Prim ayları ve vergi dilimi geçişleri neti değiştirir.' : 'Kümülatif matrah vergi dilimini yükselttikçe net azalır.'}`,
        }));
        if (s.tavanAsildi) sonuc.append(el('p', { sinif: 'not' }, `Brütün ${tl(p.sgkTavanKurus / 100, 2)} üzerindeki kısmından SGK ve işsizlik primi kesilmez (${yil} SGK tavanı).`));
        if (s.asgariAltinda) sonuc.append(el('p', { sinif: 'not' }, `Brüt, ${yil} asgari ücretinin altında. Tam zamanlı çalışmada SGK tabanı asgari ücrettir; kısmi süreli çalışmada bordro bu sonuçtan farklı olabilir.`));
        sonuc.append(
          el('div', { sinif: 'ay-listesi' },
            el('p', { sinif: 'ipucu' }, 'Ay ay net maaş · aya tıklayınca döküm açılır'),
            s.aylar.map(ayKarti)),
          satirKarti([
            ['Yıllık brüt', tl(s.yillikBrut)], ['SGK ve işsizlik primi', tl(s.yillikSgk)],
            ['Kesilen gelir vergisi', tl(s.yillikGv)], ['Kesilen damga vergisi', tl(s.yillikDamga)],
            ['Yıllık net', tl(s.yillikNet), 'olumlu'],
          ]),
          reelBaglanti(E.netMaas(yil, b)));
      }
      ciz();
    },

    kira(v, kok) {
      let yenileme = v.sonAy + 1;
      const tutar = tutarAlani('Şu anki aylık kira', ciz);
      const ay = aySecici('Sözleşmenin yenilendiği ay', v.ilkAy + 25, v.sonAy + 2, yenileme, (a) => { yenileme = a; ciz(); });
      const sonuc = el('div', { sinif: 'sonuc-alani' });
      kok.append(el('div', { sinif: 'form' }, tutar.kap, ay.kap), sonuc);
      function ciz() {
        sonuc.textContent = '';
        const t = tutar.deger;
        const oran = E.kira(v, 100, yenileme);
        if (!oran) return;
        const s = t > 0 ? E.kira(v, t, yenileme) : null;
        sonuc.append(sonucKarti({
          baslik: s ? 'Yeni kira en fazla' : 'Yasal üst sınır',
          deger: s ? tl(s.yeniKiraUstSiniri) : yuzde(oran.oran),
          etiket: `${ad(oran.oranAyi)} oranı`,
          alt: s
            ? `${tl(s.eskiKira)} → ${tl(s.yeniKiraUstSiniri)}\nArtış en fazla ${yuzde(s.oran)}, yani ${tl(s.artisTutari)}.`
            : 'Kira tutarını yazınca yeni kiranın üst sınırı burada görünür.',
        }));
        if (!s) {
          sonuc.append(ornekKarti(
            `20.000 TL kira, ${ad(yenileme)} yenilemesinde en fazla ${tl(20000 * (1 + oran.oran / 100))} olabilir. Artış en fazla ${yuzde(oran.oran)}, yani ${tl(20000 * oran.oran / 100)}.`,
            () => { tutar.yaz('20.000'); ciz(); }));
        }
        if (oran.tahmini) {
          sonuc.append(el('p', { sinif: 'not' }, `${ad(yenileme - 1)} oranı henüz açıklanmadı. Şimdilik açıklanmış son ay olan ${ad(oran.oranAyi)} kullanıldı; yeni oran açıklanınca değişebilir.`));
        }
        if (yenileme < E.ay(2024, 7)) {
          sonuc.append(el('p', { sinif: 'not' }, '1 Temmuz 2024’ten önceki konut kira yenilemelerinde ayrıca %25 sınırı uygulanıyordu.'));
        }
        if (s) sonuc.append(paylasDugmesi(`${ad(yenileme)} kira yenilemesinde yasal artış sınırı ${yuzde(s.oran)}.`));
      }
      ciz();
    },

    maas(v, kok) {
      let donem = 12, ozelIlk = v.sonAy - 12, ozelSon = v.sonAy;
      const ilkAy = () => (donem === null ? ozelIlk : v.sonAy - donem);
      const sonAy = () => (donem === null ? ozelSon : v.sonAy);
      const ozel = el('div', { sinif: 'form iki', hidden: true });
      const secIlk = aySecici('Önceki ay', v.ilkAy, v.sonAy - 1, ozelIlk, (a) => {
        ozelIlk = a;
        if (!(ozelSon > ozelIlk)) ozelSon = ozelIlk + 1;
        secSon.doldur(ozelIlk + 1, v.sonAy, ozelSon);
        ciz();
      });
      const secSon = aySecici('Karşılaştırılan ay', ozelIlk + 1, v.sonAy, ozelSon, (a) => { ozelSon = a; ciz(); });
      ozel.append(secIlk.kap, secSon.kap);
      const ilk = tutarAlani('', ciz), son = tutarAlani('', ciz);
      const sonuc = el('div', { sinif: 'sonuc-alani' });
      // Brütten nete sayfasından gelen net; adrese yazılmaz, tarayıcıdan çıkmaz.
      let aktarilan = null;
      try {
        aktarilan = JSON.parse(sessionStorage.getItem(NET_ANAHTAR));
        sessionStorage.removeItem(NET_ANAHTAR);
      } catch (_) { /* depolama kapalı olabilir */ }
      if (aktarilan) (aktarilan.alan === 'son' ? son : ilk).yaz(E.sayi(aktarilan.net, 2));
      kok.append(
        cipler([[12, '1 yıl'], [24, '2 yıl'], [60, '5 yıl'], [null, 'Özel']], donem, (d) => { donem = d; ozel.hidden = d !== null; ciz(); }),
        ozel,
        el('div', { sinif: 'form iki' }, ilk.kap, son.kap),
        el('p', { sinif: 'ipucu' }, !aktarilan
          ? 'O ayki ve bu ayki net maaşınızı yazın. İkincisi isteğe bağlı.'
          : aktarilan.alan === 'son'
            ? `${ad(sonAy())} neti brütten nete hesabından geldi. Önceki ayın neti yazılınca reel değişim çıkar.`
            : `${ad(ilkAy())} neti brütten nete hesabından geldi. ${ad(sonAy())} neti isteğe bağlı.`),
        sonuc);
      function ciz() {
        ilk.etiket(ad(ilkAy()));
        son.etiket(ad(sonAy()));
        sonuc.textContent = '';
        const a = ilk.deger, b = son.deger;
        if (!(a > 0)) {
          const o = E.maas(v, 40000, ilkAy(), 50000, sonAy());
          if (o) {
            const fark = o.sonTutar - o.esdegerTutar;
            sonuc.append(ornekKarti(
              `${ad(ilkAy())} maaşı 40.000 TL olan birinin aynı alım gücü için ${ad(sonAy())} itibarıyla ${tl(o.esdegerTutar)} alması gerekir. Maaş 50.000 TL olduysa aylık alım gücü farkı ${fark >= 0 ? '+' : ''}${tl(fark)}.`,
              () => { ilk.yaz('40.000'); son.yaz('50.000'); ciz(); }));
          }
          return;
        }
        const sonVar = b > 0;
        const s = E.maas(v, a, ilkAy(), sonVar ? b : a, sonAy());
        if (!s) return;
        if (!sonVar) {
          sonuc.append(sonucKarti({
            baslik: `${ad(ilkAy())} maaşının ${ad(sonAy())} karşılığı`,
            deger: tl(s.esdegerTutar),
            alt: `Aynı alım gücü için gereken tutar. Dönemdeki enflasyon ${yuzde(s.enflasyon)}.`,
          }));
          return;
        }
        const ileride = s.reelDegisim >= 0;
        sonuc.append(
          sonucKarti({
            baslik: 'Aylık alım gücü farkı',
            deger: `${s.sonTutar >= s.esdegerTutar ? '+' : ''}${tl(s.sonTutar - s.esdegerTutar)}`,
            renk: ileride ? NANE : KEHRIBAR,
            alt: ileride ? `Maaşınız enflasyonun ${yuzde(s.reelDegisim)} önünde.` : `Maaşınız enflasyonun ${yuzde(-s.reelDegisim)} gerisinde.`,
            ek: tutarCubuklari([
              [`${ad(ilkAy())} maaşınız`, s.ilkTutar, ACIK],
              [`${ad(sonAy())} maaşınız`, s.sonTutar, NANE],
            ], s.esdegerTutar, `Çizgi: ${ad(sonAy())} için aynı alım gücü, ${tl(s.esdegerTutar)}`),
          }),
          satirKarti([
            ['Dönemdeki enflasyon', degisimMetni(s.enflasyon)],
            ['Maaştaki artış', degisimMetni(s.nominalDegisim)],
            ['Reel değişim', degisimMetni(s.reelDegisim), ileride ? 'olumlu' : 'olumsuz'],
          ]),
          paylasDugmesi(ileride
            ? `${ad(ilkAy())} ile ${ad(sonAy())} arasında maaşım enflasyonun ${yuzde(s.reelDegisim)} önünde.`
            : `${ad(ilkAy())} ile ${ad(sonAy())} arasında maaşım enflasyonun ${yuzde(-s.reelDegisim)} gerisinde kaldı.`));
      }
      ciz();
    },

    zam(v, kok) {
      let tur = 'ssk';
      const { guncel, onceki } = E.emekliZammi(v);
      const aciklama = el('p', { sinif: 'ipucu' });
      const tutar = tutarAlani('Şu anki net aylığınız (isteğe bağlı)', ciz);
      const sonuc = el('div', { sinif: 'sonuc-alani' });
      kok.append(
        cipler([['ssk', 'SSK · Bağ-Kur'], ['memur', 'Memur']], tur, (t) => { tur = t; ciz(); }),
        aciklama, el('div', { sinif: 'form' }, tutar.kap), sonuc);
      const oranOf = (d) => (tur === 'ssk' ? d.ssk : d.memur);
      function kart(d, ana) {
        const oran = oranOf(d);
        if (oran === null) return null;
        const t = tutar.deger;
        const alt = [];
        if (!d.kesin) alt.push(`Şu ana kadarki ${d.gecenAy} aylık enflasyona göre. Kesin oran ${E.ayAdi(d.bitis)} enflasyonu açıklanınca (3 ${E.ayAdi(d.bitis + 1)}) belli olur.`);
        if (t > 0) alt.push(`Aylığınız ${tl(t)} → ${tl(t * (1 + oran / 100))}`);
        return sonucKarti({
          baslik: d.kesin ? `${ad(d.zamAyi)} zammı · kesinleşti` : `${ad(d.zamAyi)} zammı · ${d.gecenAy} aylık veri`,
          deger: yuzde(oran),
          renk: d.kesin ? '#fff' : KEHRIBAR,
          alt: alt.length ? alt.join('\n') : null,
          etiket: ana ? null : 'Önceki dönem',
        });
      }
      function ciz() {
        aciklama.textContent = tur === 'ssk' ? 'SSK ve Bağ-Kur emeklileri' : 'Memurlar ve memur emeklileri (Emekli Sandığı)';
        sonuc.textContent = '';
        const g = guncel && kart(guncel, true);
        if (!g) { sonuc.append(el('p', {}, 'Bu dönem için hesap yapılamadı.')); return; }
        sonuc.append(g);
        if (tur === 'memur' && guncel.memur !== null) {
          sonuc.append(satirKarti([
            [`${ad(guncel.zamAyi)} toplu sözleşme zammı`, yuzde(guncel.memurTopluSozlesmeOrani)],
            [`Enflasyon farkı${guncel.kesin ? '' : ' (şu ana kadar)'}`, yuzde(guncel.memurEnflasyonFarki)],
          ]));
        }
        if (!(tutar.deger > 0)) {
          const ssk = tur === 'ssk', m = ssk ? 20000 : 60000, oran = oranOf(guncel);
          const kim = ssk ? 'emekli aylığı' : 'memur maaşı', yeni = tl(m * (1 + oran / 100));
          sonuc.append(ornekKarti(guncel.kesin
            ? `${tl(m)} ${kim}, ${ad(guncel.zamAyi)} zammıyla ${yeni} olur.`
            : `${tl(m)} ${kim}, ${ad(guncel.zamAyi)} zammının şu ana kadarki ${guncel.gecenAy} aylık oranına göre ${yeni} oluyor. Kesin tutar dönem sonunda belli olur.`,
          () => { tutar.yaz(ssk ? '20.000' : '60.000'); ciz(); }));
        }
        const o = onceki && kart(onceki, false);
        if (o) sonuc.append(o);
        const kimler = tur === 'ssk' ? 'SSK ve Bağ-Kur emekli' : 'memur';
        const oz = yuzde(oranOf(guncel));
        sonuc.append(paylasDugmesi(guncel.kesin
          ? `${ad(guncel.zamAyi)} ${kimler} zammı: ${oz}`
          : `${ad(guncel.zamAyi)} ${kimler} zammı, ${guncel.gecenAy} aylık enflasyona göre şu ana kadar ${oz}`));
      }
      ciz();
    },

    para(v, kok) {
      let donem = 60, ozel = v.sonAy - 60;
      const ayOf = () => (donem === null ? ozel : v.sonAy - donem);
      const ozelKap = el('div', { sinif: 'form', hidden: true });
      const sec = aySecici('Hangi ay?', v.ilkAy, v.sonAy - 1, ozel, (a) => { ozel = a; ciz(); });
      ozelKap.append(sec.kap);
      const tutar = tutarAlani('', ciz);
      const sonuc = el('div', { sinif: 'sonuc-alani' });
      const secenekler = [[12, '1 yıl'], [60, '5 yıl'], [120, '10 yıl'], [null, 'Özel']]
        .filter(([d]) => d === null || d <= v.sonAy - v.ilkAy);
      kok.append(
        cipler(secenekler, donem, (d) => { donem = d; ozelKap.hidden = d !== null; ciz(); }),
        ozelKap, el('div', { sinif: 'form' }, tutar.kap), sonuc);
      function ciz() {
        tutar.etiket(`${ad(ayOf())} tutarı`);
        sonuc.textContent = '';
        const t = tutar.deger;
        const s = t > 0 ? E.paraDegeri(v, t, ayOf()) : null;
        if (!s) {
          const o = E.paraDegeri(v, 100000, ayOf());
          if (o) {
            const ekler = [];
            if (o.dolarBugunTl !== null) ekler.push(`dolar olarak tutulsaydı ${tl(o.dolarBugunTl)}`);
            if (o.altinBugunTl !== null) ekler.push(`altın olarak tutulsaydı ${tl(o.altinBugunTl)}`);
            sonuc.append(ornekKarti(
              `${ad(o.ay)} tarihindeki 100.000 TL, aynı alım gücü için ${ad(o.son)} itibarıyla ${tl(o.tufeKarsiligi)} ediyor.${ekler.length ? ` Aynı para ${ekler.join(', ')}.` : ''}`,
              () => { tutar.yaz('100.000'); ciz(); }));
          }
          return;
        }
        const satirlar = [];
        if (s.dolarBugunTl !== null) satirlar.push(['Dolar olarak tutulsaydı', s.dolarBugunTl, LAVANTA]);
        if (s.altinBugunTl !== null) satirlar.push(['Altın olarak tutulsaydı', s.altinBugunTl, '#fff']);
        if (s.borsaBugunTl !== null) satirlar.push(['Borsada (BIST 100) tutulsaydı', s.borsaBugunTl, '#85B7EB']);
        const tablo = [['Aradaki enflasyon', degisimMetni(s.enflasyon)]];
        if (s.dolar !== null) tablo.push([`Dolar · o gün ${E.sayi(s.dolar)} $`, degisimMetni(s.dolarArtisi)]);
        if (s.gram !== null) tablo.push([`Altın · o gün ${E.sayi(s.gram, 1)} gram`, degisimMetni(s.altinArtisi)]);
        if (s.borsaArtisi !== null) tablo.push(['Borsa (BIST 100)', degisimMetni(s.borsaArtisi)]);
        sonuc.append(
          sonucKarti({
            baslik: `${ad(s.ay)} · ${tl(s.tutar)} bugünün parasıyla`,
            deger: tl(s.tufeKarsiligi),
            alt: `Aynı alım gücü için ${ad(s.son)} itibarıyla gereken tutar. Aradaki enflasyon ${yuzde(s.enflasyon)}.`,
            ek: satirlar.length ? tutarCubuklari(satirlar, s.tufeKarsiligi, 'Çizgi: aynı alım gücü için gereken tutar') : null,
          }),
          satirKarti(tablo),
          paylasDugmesi(`${ad(s.ay)} ile ${ad(s.son)} arasında fiyatlar ${yuzde(s.enflasyon)} arttı`
            + (s.dolarArtisi === null ? '' : `, dolar ${yuzde(s.dolarArtisi)}`)
            + (s.altinArtisi === null ? '' : `, gram altın ${yuzde(s.altinArtisi)}`)
            + (s.borsaArtisi === null ? '' : `, BIST 100 ${yuzde(s.borsaArtisi)}`) + ' değerlendi.'));
      }
      ciz();
    },

    endeksli(v, kok) {
      const turler = E.ENDEKS_TURLERI.filter((t) => E.endeksSonAy(v, t) !== null);
      let tur = turler[0], secAy = null;
      const tutar = tutarAlani('Şu anki tutar', ciz);
      const liste = el('div', { sinif: 'turler', role: 'radiogroup' });
      const ayKap = el('div', { sinif: 'form' });
      const sonuc = el('div', { sinif: 'sonuc-alani' });
      kok.append(el('div', { sinif: 'form' }, tutar.kap), liste, ayKap, sonuc);
      function cizListe() {
        liste.textContent = '';
        for (const t of turler) {
          liste.append(el('button', {
            type: 'button', role: 'radio', 'aria-checked': t === tur ? 'true' : 'false',
            sinif: t === tur ? 'tur secili' : 'tur',
            onclick: () => { tur = t; cizListe(); ciz(); },
          }, el('b', {}, t.ad), el('span', {}, t.aciklama)));
        }
      }
      function ciz() {
        const son = E.endeksSonAy(v, tur) || v.sonAy;
        const a = secAy === null || secAy > son ? son : secAy;
        ayKap.textContent = '';
        ayKap.append(aySecici('Oranın ayı', v.ilkAy + 24, son, a, (x) => { secAy = x; ciz(); }).kap);
        sonuc.textContent = '';
        const oran = E.endeksOrani(v, tur, a);
        const t = tutar.deger;
        if (oran !== null) {
          const var_ = t > 0;
          sonuc.append(sonucKarti({
            baslik: `${ad(a)} · ${tur.ad}`,
            deger: var_ ? tl(t * (1 + oran / 100)) : yuzde(oran),
            alt: var_
              ? `${tl(t)} → ${tl(t * (1 + oran / 100))}\nArtış ${yuzde(oran)}, yani ${tl(t * oran / 100)}.`
              : 'Tutarı yazınca artmış tutar burada görünür.',
          }));
          if (!var_) {
            sonuc.append(ornekKarti(
              `10.000 TL'lik bir nafaka ya da aidat, ${ad(a)} · ${tur.ad} oranıyla ${tl(10000 * (1 + oran / 100))} olur. Artış ${yuzde(oran)}, yani ${tl(10000 * oran / 100)}.`,
              () => { tutar.yaz('10.000'); ciz(); }));
          }
        }
        const ydo = E.yenidenDegerleme(v);
        if (ydo) sonuc.append(satirKarti([[`${ydo.yil} yeniden değerleme oranı`, yuzde(ydo.oran)]]));
      }
      cizListe();
      ciz();
    },
    doviz(v, kok) {
      const hepsi = E.dovizAltin(v);
      if (!hepsi.length) { kok.append(el('p', { sinif: 'not' }, 'Günlük fiyat verisi henüz yüklenmedi.')); return; }
      let secili = (new URLSearchParams(location.search).get('v')) || 'altin';
      if (!hepsi.some((h) => h.kod === secili)) secili = hepsi[0].kod;
      const kart = el('div', { sinif: 'sonuc-alani' });
      const tutar = tutarAlani('TL tutarı', ciz);
      const cevir = el('div', { sinif: 'sonuc-alani' });
      const enf = v.yillikEnflasyon(v.sonAy);
      const miktar = (h, t) => `${E.sayi(t / h.fiyat, 2)}\u00A0${h.birimAdi}`;
      const grafik = (seri) => {
        if (seri.length < 2) return null;
        const mn = Math.min(...seri), mx = Math.max(...seri), ar = (mx - mn) || 1;
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 300 56'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'mini-grafik');
        const pl = document.createElementNS(ns, 'polyline');
        pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#FAC775'); pl.setAttribute('stroke-width', '2.5');
        pl.setAttribute('stroke-linejoin', 'round'); pl.setAttribute('vector-effect', 'non-scaling-stroke');
        pl.setAttribute('points', seri.map((d, i) => `${(i * 300 / (seri.length - 1)).toFixed(1)},${(4 + (1 - (d - mn) / ar) * 48).toFixed(1)}`).join(' '));
        svg.append(pl);
        return el('div', { sinif: 'grafik-kap' }, svg, el('p', { sinif: 'esik-aciklama yalin' }, 'Son 12 ay · iş günleri'));
      };
      const yeniCipler = () => {
        const c = cipler(hepsi.map((h) => [h.kod, h.kisaAd]), secili, (k) => { secili = k; cizKart(); });
        c.classList.add('esit');
        return c;
      };
      let ciplerKap = yeniCipler();
      const kurlar = el('div', { sinif: 'kur-listesi' });
      function cizKurlar() {
        kurlar.textContent = '';
        for (const h of hepsi) {
          const d = h.gunlukDegisim;
          const ok = d === null ? '' : d > 0 ? '▲ ' : d < 0 ? '▼ ' : '';
          kurlar.append(el('button', {
            type: 'button', sinif: h.kod === secili ? 'kur secili' : 'kur', 'aria-pressed': h.kod === secili ? 'true' : 'false',
            onclick: () => {
              secili = h.kod;
              const c = yeniCipler(); ciplerKap.replaceWith(c); ciplerKap = c;
              cizKart();
              kart.scrollIntoView({ behavior: 'smooth', block: 'center' });
            },
          }, el('span', { sinif: 'kur-ad' }, h.gram ? `${h.kisaAd} (gram)` : h.ad),
          el('span', { sinif: 'kur-sag' }, el('b', {}, tl(h.fiyat, 2)), d === null ? null : el('small', {}, `${ok}${yuzde(Math.abs(d))}`))));
        }
      }
      kok.append(ciplerKap, kart,
        el('h3', { sinif: 'ara-baslik' }, `Güncel kurlar · ${E.tarihMetni(hepsi[0].tarih)}`), kurlar,
        el('p', { sinif: 'ipucu', stil: 'margin-top:6px' }, 'Döviz: TCMB gösterge satış kuru. Altın ve gümüş: Borsa İstanbul ortalaması, TL/gram. Değişim önceki iş gününe göre.'));
      let kaynak = 'tl';
      const ondalik = (m) => (m % 1 === 0 ? 0 : 2);
      const birimMetni = (k, m) => (!k ? tl(m, ondalik(m)) : `${E.sayi(m, ondalik(m))}\u00A0${k.birimAdi}`);
      const ornek = (k) => (k === 'tl' ? [100000, '100.000'] : k === 'altin' ? [10, '10'] : k === 'gumus' ? [100, '100'] : [1000, '1.000']);
      const donustur = (k, m) => {
        const tlTutar = k ? m * k.fiyat : m;
        return [...(k ? [['Türk lirası', tl(tlTutar, 2)]] : []),
          ...hepsi.filter((x) => !k || x.kod !== k.kod).map((x) => [x.ad, miktar(x, tlTutar)])];
      };
      const kaynakCip = cipler([['tl', 'TL'], ...hepsi.map((h) => [h.kod, h.kisaAd])], kaynak, (k) => { kaynak = k; birimiYaz(); ciz(); });
      kaynakCip.classList.add('esit');
      function birimiYaz() {
        const k = hepsi.find((x) => x.kod === kaynak);
        tutar.etiket(!k ? 'TL tutarı' : k.gram ? `${k.ad} miktarı` : `${k.ad} tutarı`);
        tutar.birim(!k ? 'TL' : k.gram ? 'gram' : k.simge);
      }
      kok.append(el('h3', { sinif: 'ara-baslik' }, 'Çevirici'), kaynakCip, el('div', { sinif: 'form', stil: 'margin-top:4px' }, tutar.kap), cevir);
      if (enf !== null) {
        const satirlar = [['Enflasyon (TÜFE)', degisimMetni(enf)]];
        for (const h of hepsi) if (h.aylikOrtalamaDegisim !== null) satirlar.push([h.ad, degisimMetni(h.aylikOrtalamaDegisim), h.aylikOrtalamaDegisim >= enf ? 'olumlu' : 'olumsuz']);
        kok.append(
          el('h3', { sinif: 'ara-baslik', stil: 'margin-top:24px' }, `Enflasyonla karşılaştırma · ${ad(v.sonAy - 12)} → ${ad(v.sonAy)}`),
          satirKarti(satirlar),
          el('p', { sinif: 'ipucu', stil: 'margin-top:6px' }, 'Aylık ortalama fiyatlarla. Yeşil: enflasyonun üstünde, kırmızı: altında kaldı.'));
      }
      function cizKart() {
        const h = hepsi.find((x) => x.kod === secili);
        const alt = [`${h.kaynak} · ${E.tarihMetni(h.tarih)}`];
        if (h.gunlukDegisim !== null) alt.push(`Önceki iş gününe göre ${degisimMetni(h.gunlukDegisim)}`);
        if (h.yillikDegisim !== null) alt.push(`Bir yılda ${degisimMetni(h.yillikDegisim)}`);
        kart.textContent = '';
        kart.append(sonucKarti({ baslik: h.gram ? h.ad : `1 ${h.ad}`, deger: tl(h.fiyat, 2), alt: alt.join('\n'), ek: grafik(h.grafik) }));
        cizKurlar();
        ciz();
      }
      function ciz() {
        cevir.textContent = '';
        const t = tutar.deger;
        const h = hepsi.find((x) => x.kod === secili);
        const k = hepsi.find((x) => x.kod === kaynak);
        if (t > 0) {
          cevir.append(satirKarti(donustur(k, t)));
          cevir.append(paylasDugmesi(`${ad(v.sonAy - 12)} ile ${ad(v.sonAy)} arasında enflasyon ${yuzde(enf || 0)}`
            + hepsi.filter((x) => x.aylikOrtalamaDegisim !== null).map((x) => `, ${x.ad.toLocaleLowerCase('tr')} ${yuzde(x.aylikOrtalamaDegisim)}`).join('') + '.'));
        } else {
          const [om, oy] = ornek(kaynak);
          cevir.append(ornekKarti(`${birimMetni(k, om)}, ${E.tarihMetni(h.tarih)} fiyatlarıyla ${donustur(k, om).map((e) => e[1]).join(', ')} ediyor.`,
            () => { tutar.yaz(oy); ciz(); }));
        }
      }
      cizKart();
    },
  };

  // ---- veri ve başlatma ---------------------------------------------------
  let veriSozu = null;
  function veriAl() {
    veriSozu = veriSozu || fetch('/veri/endeksly.json', { cache: 'no-cache' })
      .then((y) => { if (!y.ok) throw new Error(y.status); return y.json(); })
      .then((j) => new E.Veri(j));
    return veriSozu;
  }
  window.EndeksVeri = veriAl;

  document.addEventListener('DOMContentLoaded', () => {
    const kok = document.querySelector('[data-hesap]');
    if (!kok) return;
    // Emeklilik hesabı veri dosyasına bağlı değil; dosya inmese de çalışır.
    if (kok.dataset.hesap === 'emeklilik') {
      kok.textContent = '';
      HESAPLAR.emeklilik(null, kok);
      return;
    }
    veriAl().then((v) => {
      kok.textContent = '';
      HESAPLAR[kok.dataset.hesap](v, kok);
      const g = document.querySelector('[data-guncelleme]');
      if (g) g.textContent = `Veri: ${v.kaynak} Son açıklanan ay: ${ad(v.sonAy)}.`;
    }).catch(() => {
      kok.textContent = '';
      kok.append(el('p', { sinif: 'not' }, 'Veri yüklenemedi. Sayfayı yenileyerek yeniden deneyebilirsiniz.'));
    });
  });
})();
