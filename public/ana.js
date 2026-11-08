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

  /** Uygulamadaki kayan kartla aynı: enflasyon, kira, emekli zammı, maaş
   *  (örnek hesap) ve güncel kurlar; her sayfa kendi hesap sayfasına gider. */
  function sayfalar(v) {
    const s = v.sonAy, liste = [];
    const yillik = v.yillikEnflasyon(s), aylik = v.aylikEnflasyon(s);
    if (yillik !== null) {
      liste.push({
        baslik: `${E.ad(s)} yıllık enflasyon`, etiket: aciklanmaGunu(s), deger: E.yuzde(yillik),
        alt: aylik === null ? 'Tüketici fiyatları, TÜFE' : `Aylık ${E.yuzde(aylik)}`,
        seri: son12((a) => v.yillikEnflasyon(a), s), not: egilim(yillik, v.yillikEnflasyon(s - 6)),
        href: '/enflasyon-hesaplama/',
      });
    }
    const k = E.kira(v, 20000, s + 1);
    if (k) {
      liste.push({
        baslik: 'Kira artış sınırı', etiket: `${E.ayAdi(s + 1)} yenilemesi`, deger: E.yuzde(k.oran),
        alt: `20.000 TL kira en fazla ${E.tl(k.yeniKiraUstSiniri)}`,
        seri: son12((a) => v.tufe.onIkiAylikOrtalama(a), s), not: 'Son 12 ay · TÜFE 12 aylık ortalama değişim',
        href: '/kira-artis-hesaplama/',
      });
    }
    const z = E.emekliZammi(v).guncel;
    if (z) {
      const seri = [];
      for (let i = 1; i <= z.gecenAy; i++) { const d = v.tufe.degisim(z.baz, z.baz + i); if (d !== null) seri.push(d); }
      liste.push({
        baslik: `${E.ad(z.zamAyi)} emekli zammı`, etiket: z.kesin ? 'Kesinleşti' : `${z.gecenAy} aylık veri`,
        deger: E.yuzde(z.ssk), alt: `20.000 TL aylık → ${E.tl(20000 * (1 + z.ssk / 100))}`,
        seri: seri.length < 2 ? [0, ...seri] : seri,
        not: z.memur === null ? 'SSK ve Bağ-Kur · altı aylık TÜFE' : `SSK ve Bağ-Kur · memur ${E.yuzde(z.memur)}`,
        href: '/emekli-memur-zammi-hesaplama/',
      });
    }
    const m = E.maas(v, 40000, s - 12, 40000, s);
    if (m) {
      liste.push({
        baslik: 'Maaşın reel değeri', etiket: 'Örnek', deger: E.tl(m.esdegerTutar),
        alt: `${E.ad(s - 12)} maaşı 40.000 TL ise bugünkü karşılığı`,
        seri: son12((a) => v.tufe.get(a), s), not: 'Aynı alım gücü için gereken tutar · TÜFE',
        href: '/maas-enflasyon-hesaplama/',
      });
    }
    const kurlar = E.dovizAltin(v);
    if (kurlar.length) {
      const [, ay, g] = kurlar[0].tarih.split('-').map(Number);
      liste.push({
        baslik: 'Güncel kurlar', etiket: `${g} ${E.AYLAR[ay - 1]}`, kurlar,
        not: 'TCMB gösterge kuru · Borsa İstanbul ortalaması', href: '/doviz-altin/',
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
    const not = (p) => `<p class="kayan-not"><span>${kacis(p.not)}</span><span class="ok" aria-hidden="true">›</span></p>`;
    iz.innerHTML = liste.map((p, i) => `
      <a class="kayan-sayfa${p.kurlar ? ' kayan-kurlar' : ''}" href="${p.href}" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${liste.length}: ${kacis(p.baslik)}">
        <div class="kayan-baslik"><span>${kacis(p.baslik)}</span>${p.etiket ? `<span class="etiket">${kacis(p.etiket)}</span>` : ''}</div>
        ${p.kurlar ? `<div class="kayan-kur-liste">${p.kurlar.map(kurSatiri).join('')}</div>` : `
        <div class="kayan-deger">${kacis(p.deger)}</div>
        <p class="kayan-alt">${kacis(p.alt)}</p>
        <div class="kayan-grafik">${cizgi(p.seri)}</div>`}
        ${not(p)}
      </a>`).join('');
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
