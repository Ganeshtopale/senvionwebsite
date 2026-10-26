/* measure5.js — inspect the nacelle front region to plan hub extraction:
   frame-R coords (tower axis at x=z=0, ground y=0, spin axis y=139.026)     */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'STL Files', 'Assembly-STL');
function parseSTL(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(80);
  const soup = new Float32Array(n * 9);
  let o = 84;
  for (let t = 0; t < n; t++) { o += 12; for (let v = 0; v < 9; v++) { soup[t * 9 + v] = buf.readFloatLE(o); o += 4; } o += 2; }
  return soup;
}
const AX = 70752.5, AY = 140393.5, X0 = 70752, Y0 = 1368, Z0 = 9105;
const fileArg = process.argv[2] || '4XM WTG - Nacelle_30-07-2025_Parasolid for Clean-up-1.STL';
const soup = parseSTL(path.join(SRC, fileArg));

// z-bins (frame R) of triangles with centroid inside radius r of the spin axis
const R = 4000;
const bins = new Map();
let total = 0;
for (let i = 0; i < soup.length; i += 9) {
  const cx = (soup[i] + soup[i + 3] + soup[i + 6]) / 3;
  const cy = (soup[i + 1] + soup[i + 4] + soup[i + 7]) / 3;
  const cz = (soup[i + 2] + soup[i + 5] + soup[i + 8]) / 3;
  const r = Math.hypot(cx - AX, cy - AY);
  if (r > R) continue;
  total++;
  const zR = (cz - Z0) / 1000;
  const key = Math.round(zR * 4) / 4;          // 0.25 m bins
  const b = bins.get(key) || { n: 0, rmin: 1e9, rmax: 0 };
  b.n++; b.rmin = Math.min(b.rmin, r / 1000); b.rmax = Math.max(b.rmax, r / 1000);
  bins.set(key, b);
}
console.log(`${fileArg}\n  tris within r<${R / 1000} m of spin axis: ${total} (of ${soup.length / 9})`);
console.log('z(R)    tris   r-range (m)');
for (const [z, b] of [...bins.entries()].sort((a, b) => a[0] - b[0]))
  console.log(`${z.toFixed(2).padStart(6)} ${String(b.n).padStart(6)}   ${b.rmin.toFixed(2)} .. ${b.rmax.toFixed(2)}`);
