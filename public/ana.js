/* Ana sayfa: uygulamadaki ana ekranın karşılığı.
 * Kayan kart = lib/widgets/enflasyon_karti.dart (yıllık ve aylık TÜFE,
 * Yİ-ÜFE, dolar; 6 saniyede bir kendisi geçer, kullanıcı kaydırınca ya da
 * hareket azaltma açıkken durur). Karolar = lib/screens/ana_ekran.dart. */
(function () {
  'use strict';
  const E = window.Endeks;
  const SURE = 6000;

  /** "son 6 ayda 2,6 puan düştü" (uygulamadaki egilim()). */
  function egilim(simdi, once) {
    if (simdi === null || once === null) return 'Son 12 ay';
    const fark = simdi - once;
    if (Math.abs(fark) < 0.5) return 'Son 12 ay · son 6 ayda yatay';
    const puan = E.sayi(Math.abs(fark), 1);
    return fark < 0 ? `Son 12 ay · son 6 ayda ${puan} puan düştü` : `Son 12 ay · son 6 ayda ${puan} puan yükseldi`;
  }
  const aciklanmaGunu = (veriAyi) => `3 ${E.ayAdi(veriAyi + 1)}`;
  const son12 = (f, bitis) => {
    const r = [];
    for (let i = 11; i >= 0; i--) { const d = f(bitis - i); if (d !== null) r.push(d); }
    return r;
  };

  function sayfalar(v) {
    const s = v.sonAy, liste = [];
    const yillik = v.yillikEnflasyon(s), aylik = v.aylikEnflasyon(s);
    if (yillik !== null) {
      liste.push({
        baslik: `${E.ad(s)} yıllık enflasyon`, etiket: aciklanmaGunu(s), deger: E.yuzde(yillik),
        alt: aylik === null ? 'Tüketici fiyatları, TÜFE' : `Aylık ${E.yuzde(aylik)}`,
        seri: son12((a) => v.yillikEnflasyon(a), s), not: egilim(yillik, v.yillikEnflasyon(s - 6)),
      });
    }
    if (aylik !== null) {
      const aylar = son12((a) => v.aylikEnflasyon(a), s);
      const ort = aylar.length ? aylar.reduce((a, b) => a + b, 0) / aylar.length : null;
      liste.push({
        baslik: `${E.ad(s)} aylık enflasyon`, etiket: aciklanmaGunu(s), deger: E.yuzde(aylik),
        alt: 'Bir önceki aya göre fiyat artışı', seri: aylar,
        not: ort === null ? 'Son 12 ay' : `Son 12 ayın ortalaması ${E.yuzde(ort)}`,
      });
    }
    if (!v.ufe.bos) {
      const us = v.ufe.son, u = v.ufe.yillik(us);
      if (u !== null) {
        liste.push({
          baslik: `${E.ad(us)} üretici enflasyonu`, etiket: aciklanmaGunu(us), deger: E.yuzde(u),
          alt: 'Yurt içi üretici fiyatları, Yİ-ÜFE', seri: son12((a) => v.ufe.yillik(a), us),
          not: egilim(u, v.ufe.yillik(us - 6)),
        });
      }
    }
    const kurlar = E.dovizAltin(v);
    if (kurlar.length) {
      const [, m, g] = kurlar[0].tarih.split('-').map(Number);
      liste.push({
        baslik: 'Güncel kurlar', etiket: `${g} ${E.AYLAR[m - 1]}`, kurlar,
        not: 'TCMB gösterge kuru · Borsa İstanbul ortalaması',
      });
    } else if (!v.usd.bos) {
      const ds = v.usd.son, kur = v.usd.get(ds), d = v.usd.yillik(ds);
      liste.push({
        baslik: `${E.ad(ds)} dolar kuru`, etiket: null, deger: E.tl(kur, 2),
        alt: d === null ? 'Aylık ortalama satış kuru' : `Aylık ortalama · bir yılda ${E.degisimMetni(d)}`,
        seri: son12((a) => v.usd.get(a), ds), not: 'Son 12 ay · TCMB döviz satış kuru',
      });
    }
    return liste;
  }

  function cizgi(seri) {
    if (seri.length < 2) return '';
    const mn = Math.min(...seri), mx = Math.max(...seri), ar = (mx - mn) || 1;
    const nokta = seri.map((d, i) => [i * 300 / (seri.length - 1), 6 + (1 - (d - mn) / ar) * 40]);
    const [sx, sy] = nokta[nokta.length - 1];
    return `<svg viewBox="0 0 300 52" preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" stroke="#FAC775" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"
        points="${nokta.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"/>
      <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4" fill="#FAC775" vector-effect="non-scaling-stroke"/></svg>`;
  }

  const kacis = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function kayanKart(v) {
    const iz = document.getElementById('kayan-iz');
    const noktalar = document.getElementById('kayan-noktalar');
    const liste = sayfalar(v);
    if (!liste.length) return;
    const kurSatiri = (k) => {
      const d = k.gunlukDegisim;
      const ok = d === null ? '' : d > 0 ? '▲ ' : d < 0 ? '▼ ' : '';
      return `<div class="kayan-kur"><span>${kacis(k.kisaAd)}</span><b>${kacis(E.tl(k.fiyat, 2))}</b><small>${d === null ? '' : kacis(ok + E.yuzde(Math.abs(d)))}</small></div>`;
    };
    iz.innerHTML = liste.map((p, i) => p.kurlar ? `
      <a class="kayan-sayfa kayan-kurlar" href="/doviz-altin/" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${liste.length}: güncel kurlar, döviz ve altın sayfasını açar">
        <div class="kayan-baslik"><span>${kacis(p.baslik)}</span><span class="etiket">${kacis(p.etiket)}</span></div>
        <div class="kayan-kur-liste">${p.kurlar.map(kurSatiri).join('')}</div>
        <p class="kayan-not">${kacis(p.not)}</p>
      </a>` : `
      <div class="kayan-sayfa" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${liste.length}">
        <div class="kayan-baslik"><span>${kacis(p.baslik)}</span>${p.etiket ? `<span class="etiket">${kacis(p.etiket)}</span>` : ''}</div>
        <div class="kayan-deger">${kacis(p.deger)}</div>
        <p class="kayan-alt">${kacis(p.alt)}</p>
        <div class="kayan-grafik">${cizgi(p.seri)}</div>
        <p class="kayan-not">${kacis(p.not)}</p>
      </div>`).join('');
    noktalar.innerHTML = liste.map((_, i) => `<button type="button" role="tab" aria-label="${i + 1}. sayfa" data-i="${i}"></button>`).join('');
    const dugmeler = [...noktalar.children];
    let secili = 0, durdu = false, zamanlayici = null;
    const isaretle = (i) => {
      secili = i;
      dugmeler.forEach((d, k) => { d.classList.toggle('secili', k === i); d.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    };
    const git = (i) => iz.scrollTo({ left: i * iz.clientWidth, behavior: 'smooth' });
    const durdur = () => { durdu = true; clearInterval(zamanlayici); zamanlayici = null; };
    isaretle(0);
    iz.addEventListener('scroll', () => {
      const i = Math.round(iz.scrollLeft / Math.max(1, iz.clientWidth));
      if (i !== secili && i >= 0 && i < liste.length) isaretle(i);
    }, { passive: true });
    ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach((o) => iz.addEventListener(o, durdur, { passive: true }));
    dugmeler.forEach((d) => d.addEventListener('click', () => { durdur(); git(Number(d.dataset.i)); }));
    const hareketsiz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!hareketsiz && liste.length > 1) {
      zamanlayici = setInterval(() => {
        if (durdu || document.hidden) return;
        git((secili + 1) % liste.length);
      }, SURE);
    }
  }

  function karolar(v) {
    const yaz = (id, metin) => { const e = document.getElementById(id); if (e) e.textContent = metin; };
    const k = E.kira(v, 100, v.sonAy + 1);
    if (k) yaz('kr-kira', E.yuzde(k.oran));
    const z = E.emekliZammi(v).guncel;
    if (z) {
      yaz('kr-zam-etiket', `${E.ayAdi(z.zamAyi)} emekli zammı`);
      yaz('kr-zam', E.yuzde(z.ssk));
      yaz('kr-zam-alt', z.kesin ? 'Kesinleşti · memur da var' : `Şu ana kadar · ${z.gecenAy} ay`);
      if (!z.kesin) document.getElementById('kr-zam').classList.add('kehribar');
    }
    const sonraki = v.sonAy + 1;
    yaz('kr-sonraki', `Sıradaki enflasyon açıklaması: ${aciklanmaGunu(sonraki)} (${E.ayAdi(sonraki)} verisi)`);
    const da = E.dovizAltin(v), altin = da.find((x) => x.kod === 'altin'), dolar = da.find((x) => x.kod === 'usd');
    if (altin) {
      yaz('kr-doviz', E.tl(altin.fiyat));
      yaz('kr-doviz-alt', `Gram altın${dolar ? ` · dolar ${E.sayi(dolar.fiyat, 2)}` : ''}`);
    }
  }

  fetch('/veri/endeksly.json', { cache: 'no-cache' })
    .then((y) => y.json())
    .then((j) => { const v = new E.Veri(j); kayanKart(v); karolar(v); })
    .catch(() => {
      const a = document.querySelector('.kayan-alt');
      if (a) a.textContent = 'Veri yüklenemedi.';
    });
})();
