/* measure4.js — dump the Y-levels of all blade1 faces whose normal ≈ (0,-1,0)
   to see whether they form one root cap or several clusters.               */
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
const AX = 70752, AY = 140457;
const soup = parseSTL(path.join(SRC, '4XM WTG - Blade_4XM-ParaSolid-Ready for STL-Combined PS-1.STL'));

const buckets = new Map(); // Y level (50mm) → {A, sx, sy, sz, n}
let minY = Infinity, maxY = -Infinity;
for (let i = 0; i < soup.length; i += 3) {
  for (let v = 0; v < 3; v++) { const y = soup[i + 3 + v * 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
}
for (let i = 0; i < soup.length; i += 9) {
  const ux = soup[i + 3] - soup[i], uy = soup[i + 4] - soup[i + 1], uz = soup[i + 5] - soup[i + 2];
  const vx = soup[i + 6] - soup[i], vy = soup[i + 7] - soup[i + 1], vz = soup[i + 8] - soup[i + 2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-9) continue;
  ny /= l;
  if (ny > -0.985) continue;
  const a = l / 2;
  const y = (soup[i + 1] + soup[i + 4] + soup[i + 7]) / 3;
  const key = Math.round(y / 500) * 500;
  const b = buckets.get(key) || { A: 0, sx: 0, sy: 0, sz: 0, n: 0 };
  b.A += a; b.n++;
  b.sx += (soup[i] + soup[i + 3] + soup[i + 6]) / 3 * a;
  b.sy += y * a;
  b.sz += (soup[i + 2] + soup[i + 5] + soup[i + 8]) / 3 * a;
  buckets.set(key, b);
}
console.log('blade1 bbox Y:', minY.toFixed(0), '..', maxY.toFixed(0));
console.log('Y-level  area(mm2)  tris  centre(X,Z)  radius-from-axis');
const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
for (const [key, b] of sorted) {
  const cx = b.sx / b.A, cz = b.sz / b.A;
  console.log(`${String(key).padStart(7)} ${b.A.toFixed(0).padStart(10)} ${String(b.n).padStart(6)}  (${cx.toFixed(0)}, ${cz.toFixed(0)})  r=${Math.hypot(cx - AX, key - AY).toFixed(0)}`);
}
