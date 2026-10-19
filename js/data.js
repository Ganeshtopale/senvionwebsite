/* =========================================================================
   Senvion platform data + engineering calculations (shared by every page)
   Nominal specifications per senvion.in product sheets.
   ========================================================================= */
(function () {
  'use strict';

  /* --- operating envelope (assumed for the demonstration power curve) --- */
  const CUT_IN = 3.0;      // m/s
  const RATED_WS = 12.0;   // m/s
  const CUT_OUT = 20.0;    // m/s
  const RHO = 1.225;       // air density, kg/m³
  const CT = 0.8;          // thrust coefficient (assumed)
  const CF_REF = 0.379;    // reference capacity factor (37.9 %)
  const HOMES_KWH = 1200;  // annual household consumption, kWh
  const REF_MEAN_WIND = 8.11; // m/s — site mean that yields CF ≈ 37.9 %
  const HOURS = 8760;

  /* --- the four platforms -------------------------------------------- */
  const MODELS = {
    m120: {
      key: 'm120', name: '2.3M120', series: '2XM', rated: 2.33,
      rotorR: 60, D: 120, swept: 11310, blade: 58.7,
      temp: 'up to 50 °C', tower: '120 m', scale: 0.8,
      price: '2330 kW · IEC S',
      blurb: 'The compact2XM workhorse for medium-wind sites. 58.7 m blades on a 120 m rotor, rated for hot-climate operation up to 50 °C.'
    },
    m130: {
      key: 'm130', name: '2.7M130', series: '2XM', rated: 2.70,
      rotorR: 65, D: 130, swept: 13273, blade: 63.7,
      temp: 'up to 49 °C', tower: '130 m', scale: 0.85,
      price: '2700 kW · DFIG',
      blurb: 'Double-fed induction generator with a frequency-converter DC link — wide speed range, separate P/Q control, tightest grid-code compliance.'
    },
    m131: {
      key: 'm131', name: '3.1M130', series: '3XM', rated: 3.10,
      rotorR: 65, D: 130, swept: 13273, blade: 63.7,
      temp: 'up to 49 °C', tower: '130 m hub', scale: 0.9,
      price: '3100 kW · 3XM',
      blurb: 'The 3XM step-up: same proven 130 m rotor, more generator. Built for Class S sites where the extra 400 kW pays back fastest.'
    },
    m160: {
      key: 'm160', name: '4.2M160', series: '4XM', rated: 4.20,
      rotorR: 80, D: 160, swept: 20106, blade: 78.5,
      temp: 'hot-climate package', tower: '160 m rotor', scale: 1.1,
      price: '3.8 / 3.99 / 4.2 / 4.4 MW',
      variants: ['3.8 MW', '3.99 MW', '4.2 MW', '4.4 MW'],
      blurb: 'The flagship 4XM. 78.5 m blades sweep 20,106 m², with four nominal power variants from 3.8 to 4.4 MW so the machine can be tuned to the site.'
    }
  };

  /* --- gamma function (Lanczos) for the Weibull mean --- */
  function gamma(z) {
    const g = 7, p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012,
      9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    let x = p[0];
    for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  /* --- power curve: cubic between cut-in and rated, flat to cut-out --- */
  function powerMW(w, model) {
    const rated = typeof model === 'number' ? model : model.rated;
    if (!(w >= CUT_IN) || w >= CUT_OUT) return 0;
    if (w >= RATED_WS) return rated;
    return Math.max(0, rated * (Math.pow(w, 3) - CUT_IN ** 3) / (RATED_WS ** 3 - CUT_IN ** 3));
  }

  const sweptArea = m => Math.PI * m.rotorR * m.rotorR;      // m²
  const tipSpeed  = (rpm, m) => 2 * Math.PI * m.rotorR * rpm / 60; // m/s
  const tipRatio  = (tip, v) => (v > 0.05 ? tip / v : 0);
  const thrustKN  = (v, m, ct) => 0.5 * RHO * sweptArea(m) * (ct == null ? CT : ct) * v * v / 1000; // kN

  /* --- capacity factor: power curve integrated over a Weibull(k=2) site --- */
  function capacityFactor(m, meanWind) {
    const k = 2, c = (meanWind || REF_MEAN_WIND) / gamma(1 + 1 / k);
    const dv = 0.05;
    let e = 0;
    for (let v = 0; v < 30; v += dv) {
      const f = (k / c) * Math.pow(v / c, k - 1) * Math.exp(-Math.pow(v / c, k));
      e += powerMW(v, m) * f * dv;
    }
    return Math.min(0.65, e / m.rated);
  }

  const annualGWh = (m, cf) => m.rated * HOURS * (cf == null ? CF_REF : cf) / 1000; // GWh/yr
  const homes     = (m, cf) => annualGWh(m, cf) * 1e6 / HOMES_KWH;                  // homes powered

  /* full snapshot used by the readouts and the product cards */
  function snapshot(m, wind, rpm, cf) {
    const p = powerMW(wind, m);
    const cap = cf == null ? capacityFactor(m) : cf;
    const tip = tipSpeed(rpm, m);
    return {
      model: m, wind: wind, rpm: rpm,
      outputMW: p, outputKW: p * 1000,
      swept: sweptArea(m),
      tip: tip, tsr: tipRatio(tip, wind),
      thrust: thrustKN(wind, m),
      cf: cap,
      aepGWh: annualGWh(m, cap),
      homes: homes(m, cap)
    };
  }

  const fmt = {
    n: (v, d) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }),
    gwh: v => v.toFixed(2) + ' GWh'
  };

  window.SENVION = {
    CUT_IN, RATED_WS, CUT_OUT, RHO, CT, CF_REF, HOMES_KWH, REF_MEAN_WIND, HOURS,
    MODELS, ORDER: ['m120', 'm130', 'm131', 'm160'],
    powerMW, sweptArea, tipSpeed, tipRatio, thrustKN, capacityFactor, annualGWh, homes, snapshot, fmt
  };
})();
