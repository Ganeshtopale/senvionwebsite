/* 3D Lab — split mode (product content left / live machine right).
   Works with or without the scene: always fills the left product panel. */
(function () {
  'use strict';
  const S = window.SENVION;
  if (!S) return;
  const $ = s => document.querySelector(s);
  const n = v => S.fmt.n(v);

  const q = new URLSearchParams(location.search);
  const requested = q.get('model');
  const startKey = S.MODELS[requested] ? requested : 'm130';

  /* ---- split layout only when a platform was handed over from Products ---- */
  if (requested && S.MODELS[requested]) document.body.classList.add('split');

  /* ---- build the platform chips (lab page + split panel) ---- */
  document.querySelectorAll('[data-chips]').forEach(box => {
    box.innerHTML = S.ORDER.map(k =>
      '<button class="modelchip' + (k === startKey ? ' active' : '') + '" data-model="' + k + '">' +
      S.MODELS[k].name + '</button>').join('');
  });

  /* ---- fill the left-hand product content panel ---- */
  function fill(key) {
    const m = S.MODELS[key];
    if (!m) return;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    set('lpSeries', m.series + ' series');
    set('lpName', m.name);
    set('lpBlurb', m.blurb);
    set('lpRating', n(Math.round(m.rated * 1000)) + ' kW');
    set('lpRotor', m.D + ' m');
    set('lpSwept', n(m.swept) + ' m²');
    set('lpBlade', m.blade.toFixed(1) + ' m');
    set('lpTemp', m.temp);
    set('lpVariant', m.variants ? m.variants.join(' · ') : '—');

    const specs = $('#lpSpecs');
    if (specs) {
      specs.innerHTML = [
        ['Nominal rating', n(Math.round(m.rated * 1000)) + ' kW'],
        ['Rotor diameter', m.D + ' m'],
        ['Swept area', n(m.swept) + ' m²'],
        ['Blade length', m.blade.toFixed(1) + ' m'],
        ['Reference temp.', m.temp],
        ['Nominal variants', m.variants ? m.variants.join(' · ') : '—']
      ].map(r => '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
    }

    /* live engineering figures for this platform at the current wind speed */
    const calc = $('#lpCalc');
    if (calc) {
      const ws = S.snapshot(m, 8.2, 0);
      calc.innerHTML = [
        ['Output @ 8.2 m/s', n(Math.round(ws.outputKW)) + ' kW'],
        ['Capacity factor', (S.capacityFactor(m) * 100).toFixed(1) + ' %'],
        ['Annual energy', S.annualGWh(m).toFixed(2) + ' GWh'],
        ['Homes powered', n(Math.round(S.homes(m)))]
      ].map(r => '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
    }

    document.querySelectorAll('.modelchip').forEach(c =>
      c.classList.toggle('active', c.dataset.model === key));
    document.querySelectorAll('#calcTable td[data-k]').forEach(td =>
      td.classList.toggle('on', td.dataset.k === key));
    const link = $('#lpOpen');
    if (link) link.href = 'lab.html?model=' + key;
  }

  /* the scene tells us when the platform changed (model chips, .view3d, setModel) */
  window.addEventListener('senvion:model', e => fill(e.detail && e.detail.key));

  /* scene may not be loaded (or may not exist) — keep the panel in step anyway */
  document.addEventListener('click', e => {
    const chip = e.target.closest('.modelchip');
    if (chip) fill(chip.dataset.model);
  });

  fill(startKey);

  /* chips on the lab page (no split panel) still need to drive the machine */
  if (!document.body.classList.contains('split')) {
    document.querySelectorAll('.modelchip').forEach(b => b.addEventListener('click', () => {
      if (window.__scene) window.__scene.setModel(b.dataset.model);
      fill(b.dataset.model);
    }));
  }
})();
