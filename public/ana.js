/* Ana sayfa: uygulamadaki ana ekranın karşılığı (lib/screens/ana_ekran.dart).
 * Üstte FinTürk kartı (widgets/finturk_karti.dart): Türkiye takip oranı, iki
 * yıllık çizgi, mevduat/nakdi/gayrinakdi ve en yüksek il; kart FinTürk
 * sayfasına, "Pazar payı" doğrudan pazar payı bölümüne gider. */
(function () {
  'use strict';
  const E = window.Endeks;
  const yaz = (id, m) => { const e = document.getElementById(id); if (e) e.textContent = m; };

  function cizgi(seri) {
    if (seri.length < 2) return '';
    const mn = Math.min(...seri), mx = Math.max(...seri), ar = (mx - mn) || 1;
    const nokta = seri.map((d, i) => [i * 300 / (seri.length - 1), 6 + (1 - (d - mn) / ar) * 44]);
    const [sx, sy] = nokta[nokta.length - 1];
    return `<svg viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" stroke="#F2945F" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"
        points="${nokta.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"/>
      <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4" fill="#F2945F" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function finturkKarti(f) {
    const tr = f.turkiye, t = 'sektor';
    const takip = tr.deger('takip', t), yil = tr.yillikDegisim('takip', t);
    yaz('ft-donem', E.donemAdi(f.donem));
    yaz('ft-deger', takip === null ? '—' : E.yuzde(takip));
    const alt = document.getElementById('ft-alt');
    if (alt) alt.innerHTML = `Takipteki kredi oranı${yil === null ? '' : ` · bir yılda <em>${E.puan(yil)}</em>`}`;
    const g = document.getElementById('ft-grafik');
    if (g) g.innerHTML = cizgi(tr.seri('takip', t));
    const kutular = document.getElementById('ft-kutular');
    if (kutular) {
      kutular.innerHTML = [['mevduat', 'Mevduat'], ['nakdi', 'Nakdi kredi'], ['gayrinakdi', 'Gayrinakdi']].map(([k, ad]) => {
        const v = tr.tutar(k, t), d = tr.yillikDegisim(k, t);
        return `<div><span>${ad}</span><b>${v === null ? '—' : E.binTlMetni(v).replace(' TL', '')}</b>${d === null ? '' : `<small>${E.degisimMetni(d)}</small>`}</div>`;
      }).join('');
    }
    const en = f.sirali('takip', t)[0];
    yaz('ft-enyuksek', en ? `En yüksek ${en.ad} ${E.yuzde(en.deger('takip', t))}` : '');
  }

  // "Pazar payı" kartın içinde: bağlantı yerine doğrudan pazar payı bölümü.
  const pazar = document.querySelector('.ft-dugme[data-hedef="pazar"]');
  if (pazar) {
    pazar.addEventListener('click', (e) => {
      e.preventDefault();
      location.href = `${pazar.closest('a').getAttribute('href')}#pazar-payi`;
    });
  }

  const al = (u) => fetch(u, { cache: 'no-cache' }).then((y) => { if (!y.ok) throw new Error(y.status); return y.json(); });
  al('/veri/finturk.json').then((j) => finturkKarti(new E.Finturk(j))).catch(() => yaz('ft-enyuksek', 'BDDK verisi yüklenemedi.'));
  al('/veri/endeksly.json').then((j) => {
    const v = new E.Veri(j), s = v.sonAy + 1;
    yaz('kr-sonraki', `Sıradaki enflasyon açıklaması: 3 ${E.ayAdi(s + 1)} (${E.ayAdi(s)} verisi)`);
  }).catch(() => {});
})();
