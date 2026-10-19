/* One-shot builder: splits the single-page site into separate pages.
   Reads index.html (source of truth for head/nav/footer/sections) and emits
   index, about, products, lab, services, manufacturing, sustainability, news,
   connect. Delete this script once the pages are generated. */
const fs = require('fs');
const SRC = fs.readFileSync('_source.html', 'utf8');
const V = '20261001h';

/* ---------------------------------------------------------------- slice */
const headTpl = SRC.slice(0, SRC.indexOf('</head>') + 7);

const navBlock = SRC.slice(SRC.indexOf('<!-- NAV -->'),
                           SRC.indexOf('</nav>') + 6);

const hudBlock = SRC.slice(SRC.indexOf('<!-- LIVE HUD -->'),
                           SRC.indexOf('<main>'));

const mainStart = SRC.indexOf('<main>') + 6;
const mainEnd   = SRC.lastIndexOf('</main>');
const mainInner = SRC.slice(mainStart, mainEnd);
const footIdx   = mainInner.indexOf('<footer');
const sectionsRaw = mainInner.slice(0, footIdx);
const footerBlock = mainInner.slice(footIdx);

/* section marker -> html (marker preserved) */
const SEC = {};
{
  const parts = sectionsRaw.split(/<!--\s*=+\s*(.*?)\s*=+\s*-->/);
  for (let i = 1; i < parts.length; i += 2) {
    SEC[parts[i]] = '<!-- ============ ' + parts[i] + ' ============ -->' + parts[i + 1];
  }
}

const gsapBlock = SRC.slice(
  SRC.indexOf('<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap'),
  SRC.indexOf('<script type="module"'));

const selfHeal = SRC.slice(SRC.lastIndexOf('<script>', SRC.indexOf('/* Image self-heal')),
                           SRC.lastIndexOf('</body>'));

/* ------------------------------------------------------------- fragments */
const PRELOADER = `
<!-- PRELOADER -->
<div id="preloader">
  <div class="loader-turbine">
    <div class="loader-blades"><span></span><span></span><span></span></div>
    <div class="loader-tower"></div>
  </div>
  <p>WE ARE WINDSHAPERS&trade;&hellip;</p>
  <div class="loader-bar"><div id="loaderFill"></div></div>
</div>
`;

const CANVAS = `
<!-- FIXED 3D CANVAS -->
<canvas id="webgl"></canvas>
<div id="photoBg"></div>
<div id="vignette"></div>
<div id="grain"></div>
<div id="scrollProgress"></div>
`;

const DECOR = `
<div id="vignette"></div>
<div id="grain"></div>
<div id="scrollProgress"></div>
`;

/* anchor -> owning page (each anchor lives on exactly one page) */
const A2P = {
  '#hero': 'index.html',
  '#about': 'about.html', '#history': 'about.html', '#impact': 'about.html',
  '#career': 'about.html', '#clientele': 'about.html',
  '#products': 'products.html', '#calc': 'products.html',
  '#lab': 'lab.html',
  '#services': 'services.html',
  '#manufacturing': 'manufacturing.html',
  '#sustainability': 'sustainability.html',
  '#news': 'news.html',
  '#contact': 'connect.html'
};

const PRIMARY = {
  'index.html': '#hero', 'about.html': '#about', 'products.html': '#products',
  'lab.html': '#lab', 'services.html': '#services',
  'manufacturing.html': '#manufacturing', 'sustainability.html': '#sustainability',
  'news.html': '#news', 'connect.html': '#contact'
};

function links(html, cur) {
  return html.replace(/href="(#[A-Za-z][\w-]*)"/g, (m, a) => {
    const page = A2P[a.toLowerCase()];
    if (!page) return m;
    if (page === cur) return 'href="' + a + '"';
    return 'href="' + (PRIMARY[page] === a.toLowerCase() ? page : page + a) + '"';
  });
}

/* statically flag the nav item that belongs to the page being generated */
function addHomeLink(navHtml, cur) {
  const href = cur === 'index.html' ? '#hero' : 'index.html';
  return navHtml
    .replace('<div class="nav-links">',
             '<div class="nav-links">\n      <a href="' + href + '">Home</a>')
    .replace('<div id="mobileMenu">',
             '<div id="mobileMenu">\n    <a href="' + href + '">Home</a>');
}

function markActive(navHtml, cur) {
  return navHtml.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*?)>/g, (m, pre, href, post) => {
    if (/class="[^"]*logo/.test(pre + post)) return m;          // never flag the logo
    const i = href.indexOf('#');
    const file = i < 0 ? href : href.slice(0, i);
    const hash = i < 0 ? '' : href.slice(i);
    const hit = file === '' ? PRIMARY[cur] === hash
                            : (file === cur && (hash === '' || PRIMARY[cur] === hash));
    if (!hit) return m;
    const cls = (pre + post).match(/class="([^"]*)"/);
    if (cls) return m.replace('class="' + cls[1] + '"', 'class="' + cls[1] + ' is-active"');
    return '<a class="is-active" ' + pre + 'href="' + href + '"' + post + '>';
  });
}

/* ---- the "Live Turbine Control" card, lifted verbatim from the hero ---- */
const CONTROL_CARD = (() => {
  const s = SRC.indexOf('<div class="hero-control-card glass">');
  const e = SRC.indexOf('  <div class="scroll-hint">', s);
  return SRC.slice(s, e).trimEnd().replace(/\n\s*<\/div>\s*$/, '');
})();

/* the engineering-calculation block — injected straight after the model cards */
const CALC_BLOCK = `
  <div id="calc" class="calcblock">
    <div class="sec-head">
      <span class="kicker">PLATFORM CALCULATIONS &middot; REFERENCE CASE @ 8.2 M/S</span>
      <h2>Numbers that move <span class="grad">with the machine.</span></h2>
      <p>Every cell below is computed live from that platform's own rating, rotor diameter and swept area &mdash; nothing is hard-coded. The reference case assumes cut-in 3 m/s, rated 12 m/s, cut-out 20 m/s, a capacity factor of 37.9 % and an annual household consumption of 1,200 kWh.</p>
    </div>

    <div class="tablewrap glass">
      <table class="dtable" id="calcTable"><tbody></tbody></table>
    </div>

    <div class="formulas">
      <div class="glass"><b>Rotor swept area</b><code>A = &pi; &times; (D / 2)<sup>2</sup></code></div>
      <div class="glass"><b>Blade tip speed</b><code>v<sub>tip</sub> = 2&pi;R &times; RPM / 60</code></div>
      <div class="glass"><b>Tip-speed ratio</b><code>&lambda; = v<sub>tip</sub> / V</code></div>
      <div class="glass"><b>Thrust</b><code>F = &frac12; &times; &rho; &times; A &times; C<sub>t</sub> &times; V<sup>2</sup></code></div>
      <div class="glass"><b>Capacity factor</b><code>CF = E<sub>annual</sub> / (P<sub>rated</sub> &times; 8,760)</code></div>
      <div class="glass"><b>Annual energy</b><code>E = P<sub>rated</sub> &times; 8,760 &times; CF</code></div>
      <div class="glass"><b>Homes powered</b><code>H = E<sub>kWh</sub> / 1,200</code></div>
    </div>

    <p class="mini">Simplified cubic power curve between cut-in and rated wind speed; flat from rated to cut-out. Air density &rho; = 1.225 kg/m&sup3;, thrust coefficient C<sub>t</sub> = 0.8, capacity factor 37.9 %, household consumption 1,200 kWh/yr. Capacity factor is obtained by integrating the same power curve over a Weibull (k = 2) site with a mean wind of 8.11 m/s. Illustrative estimates, not OEM power-curve values.</p>
  </div>
`;

SEC['PRODUCTS'] = SEC['PRODUCTS'].replace(
  '  <h3 class="tbl-title">Technical data',
  '<!--CONTROL_CARD-->\n' + CALC_BLOCK + '\n  <h3 class="tbl-title">Technical data');

/* ---- home: news ticker (verbatim from senvion.in) ---- */
SEC['NEWSTICK'] = `
<div class="newsstrip">
  <span class="kicker">LATEST</span>
  <div class="newsitems">
    <a class="newsitem" href="news.html">Alfanar Group Announces Additional Direct Capital Funding Of USD 100 Million (~INR 950 Crore) In Senvion To Accelerate Next Phase Of Growth <b>Know More &rarr;</b></a>
    <a class="newsitem" href="news.html">Senvion India&rsquo;s 4.2M160 Wind Turbine Receives MNRE ALMM (Wind) Listing <b>Know More &rarr;</b></a>
  </div>
</div>
`;

/* ---- 3D Lab: supporting content, copy taken from senvion.in ---- */
SEC['3D LAB'] = SEC['3D LAB'].replace(
  '  <div class="lab-grid">',
  '  <div class="lab-control">\n' + CONTROL_CARD + '\n  </div>\n  <div class="lab-grid">');

SEC['LABTECH'] = `
<!-- ============ HOW IT WORKS ============ -->
<section id="howitworks" class="panel">
  <div class="sec-head photo" style="--photo:url('assets/banner-02.jpg')">
    <span class="kicker">HOW THE MACHINE WORKS &middot; 2XM / 3XM / 4XM</span>
    <h2>From invisible wind to <span class="grad">usable power.</span></h2>
    <p>At Senvion we are captivated by wind energy&rsquo;s limitless potential and inspired to create a brighter future for future generations by utilising this invisible power, wind. Six systems turn moving air into grid-compliant electricity &mdash; click any of them in the model above, or raise the exploded view, to read the engineering data behind each one.</p>
  </div>
  <div class="tech-grid">
    <div class="tech glass"><div class="tico">&#127744;</div><h3>Rotor &amp; blades</h3><p>Three GFRP blades &mdash; 58.7 m, 63.7 m or 78.5 m &mdash; sweep 11,310 m&sup2; up to 20,106 m&sup2;. Triple-row roller blade bearings cut friction at the root while the electrical pitch system feathers each blade to hold rated power or stop the machine.</p></div>
    <div class="tech glass"><div class="tico">&#9881;</div><h3>Drivetrain</h3><p>Main bearing, forged main shaft and a two-stage gearbox step roughly 10 rpm at the hub up to generator speed, with a high-speed shaft coupling and disc brake in between.</p></div>
    <div class="tech glass"><div class="tico">&#9889;</div><h3>Generator &amp; converter</h3><p>DFIG with a frequency converter and DC link on the 2XM and 3XM machines, partial-converter DFIG on the 4XM &mdash; separate P/Q control, wide speed range, full Indian grid-code compliance.</p></div>
    <div class="tech glass"><div class="tico">&#129517;</div><h3>Yaw &amp; pitch</h3><p>DC-motor pitch drives feather every blade independently while the yaw system keeps the nacelle square to the wind. Both are commanded by the condition-monitoring controller.</p></div>
    <div class="tech glass"><div class="tico">&#128330;</div><h3>Tower &amp; foundation</h3><p>Tubular steel towers from 117 m to 140 m, plus a 170 m timber or concrete-hybrid option on the 4.2M160 &mdash; hub height tuned to the site&rsquo;s wind shear.</p></div>
    <div class="tech glass"><div class="tico">&#128225;</div><h3>Control &amp; FleetPro&reg;</h3><p>On-board SCADA streams every turbine to FleetPro&reg; &mdash; state-of-the-art analytics, performance diagnostics and remote diagnostics that keep availability high across the fleet.</p></div>
  </div>
</section>
`;

SEC['LABIMPACT'] = `
<!-- ============ IMPACT ============ -->
<section id="techlead" class="panel">
  <div class="sec-head">
    <span class="kicker">IMPACT &middot; CUSTOMISED SOLUTIONS FOR INDIVIDUAL SUCCESS</span>
    <h2>Technology leadership, <span class="grad">high performance.</span></h2>
    <p>Deliver world class technology with German heritage &mdash; and back it with asset management, performance diagnostic and state-of-the-art analytics.</p>
  </div>
  <div class="tech-grid">
    <div class="tech glass"><div class="tico">&#127465;&#127466;</div><h3>German heritage</h3><p>Deliver world class technology with German heritage &mdash; platforms engineered in Germany and proven on Indian sites.</p></div>
    <div class="tech glass"><div class="tico">&#127981;</div><h3>Robust local manufacturing</h3><p>Nacelle and hub plant at Baramati, blades and towers from Indian plants, with a high level of localisation across the supply chain.</p></div>
    <div class="tech glass"><div class="tico">&#128200;</div><h3>High performance</h3><p>Asset management, performance diagnostic and state-of-the-art analytics keep every machine producing what the yield report promised.</p></div>
    <div class="tech glass"><div class="tico">&#128260;</div><h3>Continuous improvement</h3><p>Customer feedback loops and the local R&amp;O setup feed every service campaign straight back into the next turbine.</p></div>
    <div class="tech glass"><div class="tico">&#128161;</div><h3>Technology leadership</h3><p>2XM, 3XM and 4XM platforms &mdash; the same machines you are flying around in the lab above.</p></div>
    <div class="tech glass"><div class="tico">&#127758;</div><h3>High level of localisation</h3><p>Off-the-shelf parts from top suppliers, local supply chain integration and a local service organisation in every state we operate in.</p></div>
  </div>
</section>
`;

SEC['LABSERV'] = `
<!-- ============ SERVICES ============ -->
<section id="labservices" class="panel">
  <div class="sec-head photo" style="--photo:url('assets/banner-01.jpg')">
    <span class="kicker">OUR SERVICES &middot; HARNESSING THE POWER OF FLEXIBILITY</span>
    <h2>Proven in-house O&amp;M, <span class="grad">prioritising availability.</span></h2>
    <p>Senvion India has a proven in-house Operations and Maintenance (O&amp;M) team. Our services are designed to prioritise performance and machine availability, ensuring that you get the most out of your wind energy investment.</p>
  </div>
  <div class="tech-grid">
    <div class="tech glass"><div class="tico">&#128295;</div><h3>Operation and Maintenance (O&amp;M)</h3><p>In-house crews, guaranteed response times, scheduled and unscheduled maintenance, spares and warranty management across 47 sites in 5 states.</p></div>
    <div class="tech glass"><div class="tico">&#128202;</div><h3>FleetPro&reg;</h3><p>Remote monitoring, condition-based alerts and performance diagnostics for the whole fleet &mdash; one dashboard, every turbine, around the clock.</p></div>
  </div>
  <p class="mini">1,600 MW under service &middot; 629 turbines operational &middot; 47 sites across 5 states in India &middot; 300 service technicians. Source: senvion.in</p>
</section>
`;

/* the 3D Lab becomes a two-column page: product content left, machine right */
function toSplitLab(html) {
  return html
    .replace('<section id="lab" class="panel">',
             '<section id="lab" class="panel lab-split">')
    .replace('  <div class="sec-head">', `
  <div class="lab-left">
    <div class="pcard glass">
      <span class="pill" id="lpSeries">2XM series</span>
      <h2 id="lpName">2.7M130</h2>
      <p id="lpBlurb"></p>
      <div class="specgrid" id="lpSpecs"></div>
      <span class="kicker lp-kicker">REFERENCE CASE &middot; 8.2 M/S</span>
      <div class="specgrid calcgrid" id="lpCalc"></div>
      <div class="modelchips" data-chips></div>
      <div class="lp-cta">
        <a class="btn btn-sm btn-ghost" href="products.html">&larr; All turbines</a>
        <a class="btn btn-sm btn-glow" href="lab.html">Full-screen 3D Lab &rarr;</a>
      </div>
      <p class="mini">Calculated from this platform's own rating, rotor and swept area &middot; cut-in 3 m/s, rated 12 m/s, cut-out 20 m/s, CF 37.9 %, 1,200 kWh per household per year.</p>
    </div>
  </div>
  <div class="lab-right">
    <div class="sec-head">`)
    .replace(/\n<\/section>\s*$/, '\n  </div>\n</section>\n');
}

/* preloader fallback for pages that have no 3D scene to dismiss it */
const SITEBOOT = `<script>
(function () {
  if (document.getElementById('webgl')) return;
  var hide = function () { var p = document.getElementById('preloader'); if (p) p.classList.add('done'); };
  setTimeout(hide, 1400);
  addEventListener('load', function () { setTimeout(hide, 250); });
})();
</script>
`;

function head(title, desc) {
  return headTpl
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + title + '</title>')
    .replace(/<meta name="description" content="[\s\S]*?" \/>/,
             '<meta name="description" content="' + desc + '" />');
}

/* ------------------------------------------------------------------ pages */
const PAGES = [
  {
    file: 'index.html', three: true, extra: 'products',
    secs: ['HERO', 'NEWSTICK', 'ABOUT', 'SERVICES', 'PRODUCTS', 'IMPACT', 'NEWS', 'CLIENTELE', 'PHOTO BAND'],
    title: 'Senvion India \u2014 We make wind perform | Wind Turbines, O&amp;M &amp; FleetPro',
    desc: 'Senvion India \u2014 windshapers\u2122, sustainably energising neighbourhoods. 2.3M120, 2.7M130, 3.1M130 and 4.2M160 wind turbines, in-house O&amp;M, FleetPro\u00ae SCADA and manufacturing across India. Explore the interactive 3D turbine.'
  },
  {
    file: 'about.html', secs: ['ABOUT', 'HISTORY', 'IMPACT', 'CLIENTELE', 'CAREER'],
    title: 'About Senvion India \u2014 History, Impact, Clients &amp; Careers',
    desc: 'Who we are: Senvion India history since 2014, installation milestones, the clients who trust us and the careers we are hiring for.'
  },
  {
    file: 'products.html', secs: ['PRODUCTS'], extra: 'products',
    title: 'Wind Turbines \u2014 2.3M120, 2.7M130, 3.1M130 &amp; 4.2M160 | Senvion India',
    desc: 'Compare the Senvion 2XM, 3XM and 4XM platforms: rated power, rotor diameter, swept area, blade length, live output, annual energy and homes powered \u2014 then open any model in the 3D Lab.'
  },
  {
    file: 'lab.html', three: true, extra: 'labpanel',
    secs: ['3D LAB', 'LABTECH', 'LABIMPACT', 'LABSERV'],
    title: '3D Turbine Lab \u2014 Explode, Paint &amp; Stress the Machine | Senvion India',
    desc: 'Interactive 3D wind-turbine lab. Pick a platform, raise the exploded view and read the live engineering figures \u2014 tip speed, thrust, capacity factor, annual energy and homes powered.'
  },
  {
    file: 'services.html', secs: ['SERVICES'],
    title: 'Operations &amp; Maintenance and FleetPro\u00ae SCADA | Senvion India',
    desc: 'In-house O&amp;M, remote monitoring and FleetPro\u00ae SCADA keeping Senvion wind farms available, productive and warranty-compliant across India.'
  },
  {
    file: 'manufacturing.html', secs: ['MANUFACTURING'],
    title: 'Manufacturing \u2014 Baramati &amp; Trichy Facilities | Senvion India',
    desc: 'Senvion India manufacturing: blade, nacelle and tower production at Baramati (Maharashtra) and Trichy (Tamil Nadu) with a localised supply chain.'
  },
  {
    file: 'sustainability.html', secs: ['ESG'],
    title: 'Sustainability \u2014 Clean Energy, Low Carbon, Local Impact | Senvion India',
    desc: 'How Senvion India sustably energises neighbourhoods: carbon avoided, circularity, local content and community programmes.'
  },
  {
    file: 'news.html', secs: ['NEWS'],
    title: 'News &amp; Press | Senvion India',
    desc: 'Latest announcements, project commissions and milestones from Senvion India.'
  },
  {
    file: 'connect.html', secs: ['CONTACT'],
    title: 'Connect \u2014 Schedule an Appointment | Senvion India',
    desc: 'Talk to Senvion India: headquarters in Mumbai, corporate office in Hamburg, R&amp;D in Bengaluru and manufacturing at Baramati and Trichy. Five offices, one map, one form.'
  }
];

PAGES.forEach(p => {
  const withHud = p.file === 'index.html' || p.file === 'lab.html' || p.file === 'products.html';
  const bodyCls = (p.file === 'index.html' ? 'home ' : '') + (withHud ? '' : 'bgonly');
  let body = head(p.title, p.desc) +
    '\n<body class="' + bodyCls.trim() + '"' +
    (withHud ? '' : ' data-bg="1"') +
    ' data-page="' + p.file.replace(/\.html$/, '') + '">\n';
  body += PRELOADER + '\n';
  body += CANVAS + '\n';
  body += markActive(links(addHomeLink(navBlock, p.file), p.file), p.file) + '\n';
  if (withHud) body += hudBlock + '\n';
  body += '<main>\n';
  let secs = p.secs.map(s => SEC[s]).join('');
  // the hero already carries the control card on the home page
  secs = secs.replace('<!--CONTROL_CARD-->', p.file === 'products.html' ? CONTROL_CARD : '');
  if (p.file === 'lab.html') secs = toSplitLab(secs);
  body += links(secs, p.file);
  body += links(footerBlock, p.file);
  body += '\n</main>\n\n';

  body += '<script src="js/data.js?v=' + V + '"></script>\n';
  body += gsapBlock;
  body += '<script type="module" src="js/scene.js?v=' + V + '"></script>\n';
  if (p.extra) body += '<script src="js/' + p.extra + '.js?v=' + V + '"></script>\n';
  body += SITEBOOT;
  body += '<script src="js/ui.js?v=' + V + '"></script>\n';
  body += selfHeal;
  body += '</body>\n</html>\n';

  fs.writeFileSync(p.file, body);
  console.log('wrote', p.file, body.length, 'bytes');
});
