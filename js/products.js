/* Products page — live platform comparison, spec strip and "View in 3D" */
(function () {
  'use strict';
  const S = window.SENVION;
  if (!S) return;
  const $ = s => document.querySelector(s);
  const REF_WIND = 8.2;
  const n = v => S.fmt.n(v);

  const ROWS = [
    ['Series',                 m => m.series + ' series'],
    ['Nominal rating',         m => n(m.rated * 1000) + ' kW'],
    ['Rotor diameter',         m => m.D.toFixed(1) + ' m'],
    ['Swept area  π·(D/2)²',   m => n(m.swept) + ' m²'],
    ['Blade length',           m => m.blade.toFixed(1) + ' m'],
    ['Output at ' + REF_WIND + ' m/s', m => n(Math.round(S.powerMW(REF_WIND, m) * 1000)) + ' kW'],
    ['Capacity factor',        m => (S.capacityFactor(m) * 100).toFixed(1) + ' %'],
    ['Annual energy',          m => S.annualGWh(m).toFixed(2) + ' GWh'],
    ['Homes powered',          m => n(Math.round(S.homes(m)))],
    ['Reference temperature',  m => m.temp],
    ['Nominal variants',       m => (m.variants || '—')]
  ];

  const table = $('#calcTable');
  if (table) {
    const keys = S.ORDER;
    let h = '<thead><tr><th>Parameter</th>' +
      keys.map(k => '<th>' + S.MODELS[k].name + '</th>').join('') + '</tr></thead><tbody>';
    h += ROWS.map(r =>
      '<tr><th>' + r[0] + '</th>' +
      keys.map(k => '<td data-k="' + k + '">' + r[1](S.MODELS[k]) + '</td>').join('') +
      '</tr>'
    ).join('');
    table.innerHTML = h + '</tbody>';
  }

  /* per-card live calculations (output @ 8.2 m/s, annual energy, homes powered) */
  document.querySelectorAll('[data-calc]').forEach(box => {
    const m = S.MODELS[box.dataset.calc];
    if (!m) return;
    box.innerHTML = [
      ['Output @ 8.2 m/s', n(Math.round(S.powerMW(8.2, m) * 1000)) + ' kW'],
      ['Annual energy', S.annualGWh(m).toFixed(2) + ' GWh'],
      ['Homes powered', n(Math.round(S.homes(m)))]
    ].map(r => '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
  });

  /* spec strip follows the card the visitor is looking at */
  function select(key) {
    const m = S.MODELS[key];
    if (!m) return;
    document.querySelectorAll('.tcard').forEach(c => c.classList.toggle('featured', c.dataset.model === key));
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('specRated', m.rated.toFixed(2) + ' MW');
    set('specRotor', m.D + ' m');
    set('specSeries', m.series + ' series');
    set('specBlade', m.blade.toFixed(1) + ' m');
    set('specSwept', n(m.swept) + ' m²');
    set('specTemp', m.temp);
    document.querySelectorAll('#calcTable td[data-k]').forEach(td =>
      td.classList.toggle('on', td.dataset.k === key));
  }

  document.querySelectorAll('.tcard').forEach(c => {
    c.addEventListener('click', () => select(c.dataset.model));
  });
  document.querySelectorAll('.view3d').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      select(b.dataset.model);
      /* hand the platform over to the 3D Lab — content left, live machine right */
      location.href = 'lab.html?model=' + b.dataset.model;
    });
  });

  select('m130');
})();
