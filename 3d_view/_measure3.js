/* measure3.js — exact spin axis:
   (a) find each blade's root CAP disk by face normal → area-weighted centre
   (b) axis = centroid of the 3 cap centres (120° apart)
   (c) cross-check: least-squares circle fit on uncut spinner dome slices     */
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

// area-weighted centre + area of triangles whose normal aligns with `dir`
function capCentre(soup, dir, band) {
  const L = Math.hypot(dir[0], dir[1], dir[2]);
  const d = dir.map(v => v / L);
  let cx = 0, cy = 0, cz = 0, A = 0, nSel = 0;
  for (let i = 0; i < soup.length; i += 9) {
    if (band && !band([soup[i], soup[i + 1], soup[i + 2]])) continue;
    const ux = soup[i + 3] - soup[i], uy = soup[i + 4] - soup[i + 1], uz = soup[i + 5] - soup[i + 2];
    const vx = soup[i + 6] - soup[i], vy = soup[i + 7] - soup[i + 1], vz = soup[i + 8] - soup[i + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    if (nx * d[0] + ny * d[1] + nz * d[2] < 0.985) continue;
    const a = l / 2;
    cx += (soup[i] + soup[i + 3] + soup[i + 6]) / 3 * a;
    cy += (soup[i + 1] + soup[i + 4] + soup[i + 7]) / 3 * a;
    cz += (soup[i + 2] + soup[i + 5] + soup[i + 8]) / 3 * a;
    A += a; nSel++;
  }
  return A ? { c: [cx / A, cy / A, cz / A], A, nSel } : null;
}

// Kåsa least-squares circle fit on 2D points
function fitCircle(pts) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, n = pts.length;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * x; syz += y * y; }
  const C = n * sxx - sx * sx, D = n * sxy - sx * sy, E = n * sxz + n * syy - (sx * sx + sy * sy);
  const G = n * syy - sy * sy, H = n * syz - sx * sy;
  const den = 2 * (C * G - D * D);
  if (Math.abs(den) < 1e-12) return null;
  const cx = (E * G - D * H) / den, cy = (C * H - D * E) / den;
  let r = 0;
  for (const [x, y] of pts) r += Math.hypot(x - cx, y - cy);
  return { cx, cy, r: r / n };
}

const blades = [
  { f: '4XM WTG - Blade_4XM-ParaSolid-Ready for STL-Combined PS-1.STL', dir: [0, -1, 0],  label: 'blade1', band: p => p[1] < 144000 },  // points up → cap faces -Y, near root
  { f: '4XM WTG - Blade_4XM-ParaSolid-Ready for STL-Combined PS-2.STL', dir: [0.87, 0.5, 0], label: 'blade2', band: p => p[0] > 68500 }, // at 210° → cap faces 30°
  { f: '4XM WTG - Blade_4XM-ParaSolid-Ready for STL-Combined PS-3.STL', dir: [-0.87, 0.5, 0], label: 'blade3', band: p => p[0] < 73100 }  // at 330° → cap faces 150°
];
const caps = [];
for (const b of blades) {
  const soup = parseSTL(path.join(SRC, b.f));
  const r = capCentre(soup, b.dir, b.band);
  if (!r) { console.log(b.label + ': NO CAP FOUND'); continue; }
  caps.push(r.c);
  console.log(`${b.label}: root cap centre = ${r.c.map(v => v.toFixed(1)).join(', ')}  (area ${r.A.toFixed(0)} mm², ${r.nSel} tris)`);
}
if (caps.length === 3) {
  const axis = [0, 1, 2].map(i => (caps[0][i] + caps[1][i] + caps[2][i]) / 3);
  console.log('SPIN AXIS (3-cap centroid) = ' + axis.map(v => v.toFixed(1)).join(', '));
  for (let i = 0; i < 3; i++) {
    const dx = caps[i][0] - axis[0], dy = caps[i][1] - axis[1];
    console.log(`  cap${i + 1} offset r=${Math.hypot(dx, dy).toFixed(0)} mm  angle=${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)}°  z=${caps[i][2].toFixed(0)}`);
  }
}

// spinner dome circle fit on slices beyond the blade sockets
const sp = parseSTL(path.join(SRC, '4XM WTG - Spinner Cover_29-07-2025-ParaSolid-From NSP-1.STL'));
let zmax = -Infinity, zmin = Infinity;
for (let i = 2; i < sp.length; i += 3) { if (sp[i] > zmax) zmax = sp[i]; if (sp[i] < zmin) zmin = sp[i]; }
for (const z0 of [0.85, 0.92].map(f => zmin + (zmax - zmin) * f)) {
  const all = [];
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (let i = 0; i < sp.length; i += 3) {
    if (sp[i + 2] < z0) continue;
    all.push([sp[i], sp[i + 1]]);
    if (sp[i] < mnx) mnx = sp[i]; if (sp[i] > mxx) mxx = sp[i];
    if (sp[i + 1] < mny) mny = sp[i + 1]; if (sp[i + 1] > mxy) mxy = sp[i + 1];
  }
  // keep only OUTER RIM points (near the slice's max radius, per-axis), fit circle
  const ccx = (mnx + mxx) / 2, ccy = (mny + mxy) / 2;
  const rx = (mxx - mnx) / 2, ry = (mxy - mny) / 2;
  const rim = all.filter(([x, y]) => Math.hypot((x - ccx) / rx, (y - ccy) / ry) > 0.97);
  const f = fitCircle(rim);
  console.log(`spinner slice Z>${z0.toFixed(0)}: RIM circle fit centre = ${f ? f.cx.toFixed(0) + ', ' + f.cy.toFixed(0) : 'FAILED'}  r=${f ? f.r.toFixed(0) : '-'}  (${rim.length}/${all.length} rim pts)`);
}
