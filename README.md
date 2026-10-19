# SENVION Wind Technology — Interactive 3D Website

Immersive single-page site with a **live Three.js wind turbine** fixed behind the content.

## Run it (no build step)

Double-click `index.html`, or serve locally:

```powershell
# PowerShell — any one of these:
python -m http.server 8080
# then open http://localhost:8080
```

```powershell
& "C:\Program Files\nodejs\node.exe" -e "require('http').createServer((q,s)=>{const fs=require('fs'),p=require('path');let f=p.join(process.cwd(),q.url==='/'?'index.html':q.url.slice(1));fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end('nf')}else{s.writeHead(200);s.end(d)}})}).listen(8080)"
```

## Interactive 3D features (`js/scene.js`)

- Procedural turbine: tapered tower, nacelle, hub + spinner, 3 twisted carbon blades
- **Drag to orbit** (OrbitControls), scroll content over fixed canvas
- **Click any part** → engineering spec card (raycasting: blade / hub / nacelle / tower)
- Wind slider → rotor rpm, power curve, tip speed, thrust, CO₂ readouts, particle speed
- Exploded-view slider, blade pitch, nacelle yaw
- 3 turbine models (4.5 / 8 / 15 MW) rescale the live model
- Paint studio (6 finishes), Day / Sunset / Night / Storm environments
- Wind streak particles, drifting clouds, seabirds, background wind farm, stars
- "Gust!" button, auto-orbit toggle, live power-curve chart on canvas

## Structure

- `index.html` — all sections
- `styles.css` — glassmorphism 3D theme
- `js/scene.js` — Three.js scene (ES module, CDN import map)
- `js/ui.js` — nav, counters, GSAP reveals, quote form
