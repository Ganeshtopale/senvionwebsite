/* measure2.js — locate the rotor spin axis precisely:
   axis = centroid of the 3 blade root-cap centres (blades are 120° apart),
   cross-checked against the spinner dome (surface of revolution).        */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'STL Files', 'Assembly-STL');

function parseSTL(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(80);
  const soup = new Float32Array(n * 9);
  let o = 84;
  for (let t = 0; t < n; t++) {
    o += 12;
    for (let v = 0; v < 9; v++) { soup[t * 9 + v] = buf.readFloatLE(o); o += 4; }
    o += 2;
  }
  return soup;
}
function bbox(p) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let c = 0; c < 3; c++) {
    if (p[i + c] < min[c]) min[c] = p[i + c];
    if (p[i + c] > max[c]) max[c] = p[i + c];
  }
  return { min, max };
}
function bandCentroid(p, axis, atMin, band) {
  const b = bbox(p);
  const edge = atMin ? b.min[axis] + band : b.max[axis] - band;
  let s = [0, 0, 0], n = 0;
  for (let i = 0; i < p.length; i += 3) {
    const v = p[i + axis];
    if (atMin ? v < edge : v > edge) { s[0] += p[i]; s[1] += p[i + 1]; s[2] += p[i + 2]; n++; }
  }
  return { c: s.map(x => x / n), n };
}

const blades = [
  { f: '4XM WTG - Blade_4XM-ParaSolid-Ready for STL-Combined PS-1.STL', axis: 1, atMin: true },
  { f: '4XM WTG - Blade_4XM-ParaSolid-Ready for STL-Combined PS-2.STL', axis: 0, atMin: false },
  { f: '4XM WTG - Blade_4XM-ParaSolid-Ready for STL-Combined PS-3.STL', axis: 0, atMin: true }
];
const caps = [];
for (const b of blades) {
  const p = parseSTL(path.join(SRC, b.f));
  const r = bandCentroid(p, b.axis, b.atMin, 600);
  caps.push(r.c);
  console.log(`${b.f.slice(-6)} root cap centroid = ${r.c.map(v => v.toFixed(0)).join(', ')}  (${r.n} verts)`);
}
const axis = [0, 1, 2].map(i => (caps[0][i] + caps[1][i] + caps[2][i]) / 3);
console.log('spin axis (3-cap centroid) = ' + axis.map(v => v.toFixed(0)).join(', '));
const R = Math.hypot(caps[0][0] - axis[0], caps[0][1] - axis[1]);
console.log('root offset radius = ' + R.toFixed(0) + ' mm');
console.log('cap1−axis = ' + [caps[0][0] - axis[0], caps[0][1] - axis[1], caps[0][2] - axis[2]].map(v => v.toFixed(0)).join(', '));
console.log('cap2−axis = ' + [caps[1][0] - axis[0], caps[1][1] - axis[1], caps[1][2] - axis[2]].map(v => v.toFixed(0)).join(', '));
console.log('cap3−axis = ' + [caps[2][0] - axis[0], caps[2][1] - axis[1], caps[2][2] - axis[2]].map(v => v.toFixed(0)).join(', '));

// spinner cross-check: centre of slices that contain no blade-socket cut (front cone)
const sp = parseSTL(path.join(SRC, '4XM WTG - Spinner Cover_29-07-2025-ParaSolid-From NSP-1.STL'));
const zb = bbox(sp);
for (const frac of [0.9, 0.75, 0.6, 0.4, 0.2]) {
  const z0 = zb.min[2] + (zb.max[2] - zb.min[2]) * (1 - frac);
  let mn = [Infinity, Infinity], mx = [-Infinity, -Infinity], n = 0;
  for (let i = 0; i < sp.length; i += 3) {
    if (sp[i + 2] < z0) continue;
    n++;
    for (let a = 0; a < 2; a++) {
      if (sp[i + a] < mn[a]) mn[a] = sp[i + a];
      if (sp[i + a] > mx[a]) mx[a] = sp[i + a];
    }
  }
  console.log(`spinner Z>${z0.toFixed(0)} (${(frac * 100).toFixed(0)}% of depth, ${n} verts): centre X=${((mn[0] + mx[0]) / 2).toFixed(0)} Y=${((mn[1] + mx[1]) / 2).toFixed(0)}  sizes X=${(mx[0] - mn[0]).toFixed(0)} Y=${(mx[1] - mn[1]).toFixed(0)}`);
}
