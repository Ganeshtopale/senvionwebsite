/* UI: nav, counters, GSAP reveals, form, HUD buttons */
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // mobile menu
  const menuBtn = $('#menuBtn'), mobileMenu = $('#mobileMenu');
  menuBtn?.addEventListener('click', () => mobileMenu.classList.toggle('open'));
  mobileMenu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileMenu.classList.remove('open')));

  // scroll progress + nav shadow
  const prog = $('#scrollProgress');
  addEventListener('scroll', () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    prog.style.width = (scrollY / h * 100) + '%';
  }, { passive: true });

  // hero counters
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target, end = +el.dataset.count, dec = +(el.dataset.dec || 0);
    const t0 = performance.now(), dur = 1600;
    (function tick(t) {
      const p = Math.min(1, (t - t0) / dur), ease = 1 - Math.pow(1 - p, 3);
      el.textContent = (end * ease).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
    io.unobserve(el);
  }), { threshold: 0.5 });
  $$('[data-count]').forEach(el => io.observe(el));

  // CO2 ticker
  let co2 = 48_200_000;
  const co2el = $('#co2count');
  setInterval(() => {
    co2 += Math.floor(20 + Math.random() * 60);
    if (co2el && co2el.getBoundingClientRect().top < innerHeight) co2el.textContent = co2.toLocaleString('en-US');
  }, 900);

  // control buttons owned by UI layer
  $('#autoRotateBtn')?.addEventListener('click', (e) => {
    const s = window.TURBINE; s.autoRotate = !s.autoRotate;
    e.target.textContent = s.autoRotate ? 'Auto-orbit ON' : 'Auto-orbit OFF';
    e.target.classList.toggle('active', s.autoRotate);
  });
  $('#dayNightBtn')?.addEventListener('click', (e) => {
    const s = window.TURBINE;
    const next = s.env === 'night' ? 'day' : 'night';
    window.__scene?.applyEnv(next);
    e.target.textContent = next === 'night' ? '☀️ Day mode' : '🌙 Night mode';
    $$('.env').forEach(x => x.classList.toggle('active', x.dataset.env === next));
  });
  $('#spinBurstBtn')?.addEventListener('click', () => window.__scene?.gust());

  // GSAP reveals
  if (window.gsap) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray('.tcard,.tech,.proj,.lab-card').forEach((el, i) => {
      gsap.from(el, {
        y: 50, opacity: 0, duration: 0.8, ease: 'power3.out', delay: (i % 3) * 0.08,
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });
    gsap.utils.toArray('.sec-head').forEach(el => {
      gsap.from(el, { y: 34, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
    });
  }

  // quote form
  $('#quoteForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = $('#fName').value.trim() || 'there';
    const msg = $('#formMsg');
    msg.textContent = '⏳ Computing layout & yield…';
    setTimeout(() => {
      const w = +($('#fWind').value || 8.5);
      const model = $('#fModel').value.split('—')[1]?.trim() || '2.7 MW';
      const rated = parseFloat(model) || 2.7;
      const p = (w >= 3 && w < 20) ? rated * Math.min(1, (w ** 3 - 27) / 1701) : 0;
      const aep = (p * 8760 * 0.42 / 1000).toFixed(1);
      msg.textContent = `✅ Thanks ${n}! Preliminary yield ≈ ${aep} GWh/yr per ${$('#fModel').value.split('—')[0].trim()}. Our engineers reply within 48h.`;
    }, 1100);
  });
})();
