/* =========================================================================
   convert_cad.js — Senvion/REtech 4XM WTG CAD (STL, mm, assembly coords)
   → web-ready GLB files (meters, welded, decimated, sharp CAD edges).

   usage:
     node convert_cad.js --measure   ... print geometry measurements only
     node convert_cad.js             ... full conversion → web_model/*.glb
   ========================================================================= */
const fs = require('fs');
const path = require('path');
const { MeshoptSimplifier } = require('meshoptimizer');

const SRC = path.join(__dirname, 'STL Files', 'Assembly-STL');
const OUT = path.join(__dirname, 'web_model');

/* --- source parts (balanced web budget, triangles after decimation) --- */
const PARTS = {
  tower:     { file: '4XM WTG - 4XM Tower Complete-Without straicase-PART-Cleaned-1.STL', target: 70000 },
  nacelle:   { file: '4XM WTG - Nacelle_30-07-2025_Parasolid for Clean-up-1.STL',        target: 130000 },
  spinner:   { file: '4XM WTG - Spinner Cover_29-07-2025-ParaSolid-From NSP-1.STL',       target: 90000 },
  blade:     { file: '4XM WTG - Blade_4XM-ParaSolid-Ready for STL-Combined PS-1.STL',     target: 30000 },
  cooler:    { file: '4XM WTG - Passive Cooler With Structure-1.STL',                     target: 110000 },
  staircase: { file: '4XM WTG - Staircase with Cooler fan-PART File-Clean Up-1.STL',      target: 110000 }
};

/* --- assembly constants measured from the STL geometry (mm) ---------------
   Y = up.  Yaw/tower axis = X/Z centre of the tower cylinder.
   Rotor spin axis = Z-parallel line at (AXIS_X, AXIS_Y).
   AXIS_Y was measured exactly with _measure3.js: the three blade root-cap
   centres sit at 90°/210°/330° with radius 1615/1618/1619 mm → centroid
   (70752.5, 140393.5).  The spinner STL turns out to be the nose cone +
   integrated hub shell (rotates with the rotor); the nacelle STL front
   wall is static — so NO hub split is performed.                          */
const AXIS_X = 70752;    // tower bbox X centre (68274..73230) = yaw axis X
const AXIS_Z = 9105;     // tower bbox Z centre (6630..11581)  = yaw axis Z
const AXIS_Y = 140393.5; // rotor spin axis height (measured)
const Y_BASE = 1368;     // tower bottom Y → becomes ground level (y = 0)

/* ================= binary STL → triangle soup (Float32, mm) ============= */
function parseSTL(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(80);
  if (84 + n * 50 !== buf.length) throw new Error('not a binary STL: ' + file);
  const soup = new Float32Array(n * 9);
  let o = 84;
  for (let t = 0; t < n; t++) {
    o += 12;                                  // skip facet normal
    for (let v = 0; v < 9; v++) { soup[t * 9 + v] = buf.readFloatLE(o); o += 4; }
    o += 2;                                   // attribute byte count
  }
  return { soup, tris: n };
}

/* ================= weld triangle soup → indexed mesh ==================== */
function weld(soup) {
  const map = new Map();               // "gx_gy_gz" → vertex id
  const verts = [];
  const index = new Uint32Array(soup.length / 3);
  const G = 0.01;                      // 10 µm quantisation grid (mm units)
  for (let i = 0, w = 0; i < soup.length; i += 3, w++) {
    const x = soup[i], y = soup[i + 1], z = soup[i + 2];
    const key = Math.round(x / G) + '_' + Math.round(y / G) + '_' + Math.round(z / G);
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      map.set(key, id);
      verts.push(x, y, z);
    }
    index[w] = id;
  }
  return { pos: new Float32Array(verts), idx: index };
}

/* ================= transform helpers =================================== */
// frame R: assembly → metres, tower axis at x=z=0, ground at y=0
const toR = (x, y, z) => [(x - AXIS_X) / 1000, (y - Y_BASE) / 1000, (z - AXIS_Z) / 1000];

function bbox(pos) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (let c = 0; c < 3; c++) {
      if (pos[i + c] < min[c]) min[c] = pos[i + c];
      if (pos[i + c] > max[c]) max[c] = pos[i + c];
    }
  return { min, max };
}

/* ================= measure pass ========================================= */
function measure() {
  console.log('--- measurements (assembly mm, then frame-R metres) ---');
  const spin = { file: PARTS.spinner.file };
  const { soup: sp } = parseSTL(path.join(SRC, spin.file));
  const sb = bbox(sp);
  console.log('spinner bbox X centre =', ((sb.min[0] + sb.max[0]) / 2).toFixed(0),
              ' Y centre =', ((sb.min[1] + sb.max[1]) / 2).toFixed(0),
              ' size =', sb.max.map((m, i) => (m - sb.min[i]).toFixed(0)).join(' x '));

  const { soup: bl } = parseSTL(path.join(SRC, PARTS.blade.file));
  const bb = bbox(bl);
  // root band = lowest 400 mm of the (vertical) blade
  let sx = 0, sy = 0, sz = 0, n = 0;
  const bandY = bb.min[1] + 400;
  for (let i = 0; i < bl.length; i += 3)
    if (bl[i + 1] < bandY) { sx += bl[i]; sy += bl[i + 1]; sz += bl[i + 2]; n++; }
  const rc = [sx / n, sy / n, sz / n];
  console.log('blade1 root-band centroid =', rc.map(v => v.toFixed(0)).join(', '),
              ' (band verts ' + n + ')');
  console.log('blade1 length (Y) =', ((bb.max[1] - bb.min[1]) / 1000).toFixed(3), 'm');
  console.log('=> spin axis (measured constant): x =', AXIS_X, ' y =', AXIS_Y,
              '  (frame R: y =', ((AXIS_Y - Y_BASE) / 1000).toFixed(3), 'm)');

  for (const [name, p] of Object.entries(PARTS)) {
    const { tris } = parseSTL(path.join(SRC, p.file));
    const { soup } = parseSTL(path.join(SRC, p.file));
    const b = bbox(soup);
    const r = toR(b.min[0], b.min[1], b.min[2]), R = toR(b.max[0], b.max[1], b.max[2]);
    console.log(`${name.padEnd(10)} ${String(tris).padStart(9)} tris   frame-R bbox min [${r.map(v => v.toFixed(1)).join(', ')}] max [${R.map(v => v.toFixed(1)).join(', ')}]`);
  }
}
if (process.argv.includes('--measure')) { measure(); process.exit(0); }

/* ================= normals with crease splitting ======================== */
function normalsWithCrease(pos, idx, angleDeg = 38) {
  const cosT = Math.cos(angleDeg * Math.PI / 180);
  const V = pos.length / 3, T = idx.length / 3;
  const fn = new Float32Array(idx.length * 3);       // 3 floats per corner
  const area = new Float32Array(T);
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    area[f / 3] = l / 2;
    if (l > 1e-12) { nx /= l; ny /= l; nz /= l; }
    fn[f * 3] = nx; fn[f * 3 + 1] = ny; fn[f * 3 + 2] = nz;
    fn[f * 3 + 3] = nx; fn[f * 3 + 4] = ny; fn[f * 3 + 5] = nz;
    fn[f * 3 + 6] = nx; fn[f * 3 + 7] = ny; fn[f * 3 + 8] = nz;
  }
  // group corners of each vertex into normal clusters (crease splitting)
  const vertCorners = new Array(V);
  for (let f = 0; f < idx.length; f++) (vertCorners[idx[f]] ||= []).push(f);

  const outPos = [], outNrm = [], outIdx = new Uint32Array(idx.length);
  for (let v = 0; v < V; v++) {
    const corners = vertCorners[v];
    if (!corners) continue;
    const clusters = [];
    for (const f of corners) {
      const nx = fn[f * 3], ny = fn[f * 3 + 1], nz = fn[f * 3 + 2], w = area[f / 3] || 1;
      let hit = null;
      for (const cl of clusters)
        if (cl.rx * nx + cl.ry * ny + cl.rz * nz >= cosT) { hit = cl; break; }
      if (hit) {
        hit.sx += nx * w; hit.sy += ny * w; hit.sz += nz * w; hit.n++;
        const l = Math.hypot(hit.sx, hit.sy, hit.sz) || 1;
        hit.rx = hit.sx / l; hit.ry = hit.sy / l; hit.rz = hit.sz / l;
        outIdx[f] = hit.id;
      } else {
        const id = outPos.length / 3;
        outPos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        const l = Math.hypot(nx, ny, nz) || 1;
        outNrm.push(nx / l, ny / l, nz / l);
        clusters.push({ id, sx: nx * w, sy: ny * w, sz: nz * w, rx: nx / l, ry: ny / l, rz: nz / l, n: 1 });
        outIdx[f] = id;
      }
    }
  }
  return { pos: new Float32Array(outPos), nrm: new Float32Array(outNrm), idx: outIdx };
}

/* ================= decimate (meshoptimizer WASM) ======================== */
function compact(pos, idx) {
  const remap = new Int32Array(pos.length / 3).fill(-1);
  const npos = [], nidx = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i];
    if (remap[v] < 0) {
      remap[v] = npos.length / 3;
      npos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    }
    nidx[i] = remap[v];
  }
  return { pos: new Float32Array(npos), idx: nidx };
}

function decimate(pos, idx, targetTris) {
  if (idx.length / 3 <= targetTris) return { pos, idx, err: 0 };
  const [sidx, err] = MeshoptSimplifier.simplify(idx, pos, 3, targetTris * 3, 0.07, ['LockBorder']);
  const c = compact(pos, sidx);
  console.log(`    decimated ${(idx.length / 3).toLocaleString()} → ${(c.idx.length / 3).toLocaleString()} tris (error ${(err * 100).toFixed(2)}%)`);
  return { pos: c.pos, idx: c.idx, err };
}

/* ================= UV generators ======================================== */
// cylindrical wrap for the tower (u around axis, v = height 0..1)
function uvTower(pos, hTop) {
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
    uv[j] = Math.atan2(pos[i + 2], pos[i]) / (Math.PI * 2) + 0.5;
    uv[j + 1] = pos[i + 1] / hTop;
  }
  return uv;
}
// spanwise unwrap for the blade (v = 0 at root → 1 at tip, u = chordwise)
function uvBlade(pos, len, rootY = 0) {
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
    uv[j] = 0.5;
    uv[j + 1] = Math.min(1, Math.max(0, (pos[i + 1] - rootY) / len));
  }
  return uv;
}

/* ================= GLB writer (POSITION + NORMAL [+ UV] + indices) ====== */
function writeGLB(file, name, P) {
  const pad4 = n => (n + 3) & ~3;
  let bin = Buffer.alloc(0);
  const add = buf => {
    const pad = pad4(bin.length) - bin.length;
    bin = Buffer.concat([bin, Buffer.alloc(pad), buf]);
    return bin.length - buf.length - pad;
  };
  const views = [];
  const oPos = add(Buffer.from(P.pos.buffer, P.pos.byteOffset, P.pos.byteLength)); views.push({ buffer: 0, byteOffset: oPos, byteLength: P.pos.byteLength, target: 34962 });
  const oNrm = add(Buffer.from(P.nrm.buffer, P.nrm.byteOffset, P.nrm.byteLength)); views.push({ buffer: 0, byteOffset: oNrm, byteLength: P.nrm.byteLength, target: 34962 });
  let uvIdx = -1;
  if (P.uv) { const o = add(Buffer.from(P.uv.buffer, P.uv.byteOffset, P.uv.byteLength)); views.push({ buffer: 0, byteOffset: o, byteLength: P.uv.byteLength, target: 34962 }); uvIdx = views.length - 1; }
  const oIdx = add(Buffer.from(P.idx.buffer, P.idx.byteOffset, P.idx.byteLength)); views.push({ buffer: 0, byteOffset: oIdx, byteLength: P.idx.byteLength, target: 34963 });

  const b = bbox(P.pos);
  const accPos = { bufferView: 0, componentType: 5126, count: P.pos.length / 3, type: 'VEC3', min: b.min, max: b.max };
  const accNrm = { bufferView: 1, componentType: 5126, count: P.nrm.length / 3, type: 'VEC3' };
  const accessors = [accPos, accNrm];
  if (P.uv) accessors.push({ bufferView: uvIdx, componentType: 5126, count: P.uv.length / 2, type: 'VEC2' });
  accessors.push({ bufferView: views.length - 1, componentType: 5125, count: P.idx.length, type: 'SCALAR' });

  const attributes = { POSITION: 0, NORMAL: 1 };
  if (P.uv) attributes.TEXCOORD_0 = 2;
  const gltf = {
    asset: { version: '2.0', generator: 'senvion-4xm-cad-convert' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives: [{ attributes, indices: accessors.length - 1, material: 0, mode: 4 }] }],
    materials: [{ name: 'cad', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.05, roughnessFactor: 0.55 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: views,
    accessors
  };
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPadLen = pad4(json.length) - json.length;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPadLen, 0x20)]); // spec: pad with spaces
  const binPadLen = pad4(bin.length) - bin.length;
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPadLen)]);          // pad with zeros
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binChunk.length, 0); bh.writeUInt32LE(0x004E4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, jh, jsonChunk, bh, binChunk]));
  return (fs.statSync(file).size / 1048576).toFixed(2) + ' MB';
}

/* ================= main conversion ====================================== */
(async () => {
  await MeshoptSimplifier.ready;
  fs.mkdirSync(OUT, { recursive: true });

  const aY = (AXIS_Y - Y_BASE) / 1000;    // spin axis height in frame R (m)
  const bladeLen = 78.566;                // measured from blade1 bbox (78566 mm)
  const hTop = (137909 - Y_BASE) / 1000;  // tower top height (137909 mm measured)
  console.log(`spin axis (frame R): x 0.000  y ${aY.toFixed(3)}   blade length ${bladeLen.toFixed(3)} m   tower top ${hTop.toFixed(3)} m`);

  const built = {};
  for (const [name, p] of Object.entries(PARTS)) {
    console.log(`\n[${name}] ${p.file}`);
    const { soup, tris } = parseSTL(path.join(SRC, p.file));
    const w = weld(soup);
    console.log(`    ${tris.toLocaleString()} tris → welded ${w.pos.length / 3} verts`);

    // transform to frame R (blades/spinner → rotor-local: subtract spin axis height)
    const rotorLocal = name === 'blade' || name === 'spinner';
    const pos = new Float32Array(w.pos.length);
    for (let i = 0; i < w.pos.length; i += 3) {
      const [x, y, z] = toR(w.pos[i], w.pos[i + 1], w.pos[i + 2]);
      pos[i] = x; pos[i + 1] = rotorLocal ? y - aY : y; pos[i + 2] = z;
    }

    const d = decimate(pos, w.idx, p.target);
    const nrmObj = normalsWithCrease(d.pos, d.idx);
    for (const v of nrmObj.nrm) if (!Number.isFinite(v)) throw new Error(name + ': non-finite normal');
    if (nrmObj.idx.length !== d.idx.length) throw new Error(name + ': index count mismatch');
    const out = { pos: nrmObj.pos, nrm: nrmObj.nrm, idx: nrmObj.idx, uv: null };
    if (name === 'tower') out.uv = uvTower(out.pos, hTop);
    // blade: root cap sits 1.6145 m above the spin axis (measured r=1615 mm)
    if (name === 'blade') out.uv = uvBlade(out.pos, bladeLen, 1.6145);
    built[name] = out;
    console.log(`    ${name}.glb  ` + writeGLB(path.join(OUT, name + '.glb'), name, out));
  }

  let totalTris = 0, totalMB = 0;
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.glb'))) {
    const s = fs.statSync(path.join(OUT, f));
    totalMB += s.size;
  }
  for (const k of Object.keys(built)) totalTris += built[k].idx.length / 3;
  console.log(`\nDONE → ${OUT}`);
  console.log(`total ≈ ${(totalTris / 1000).toFixed(0)}K triangles, ${(totalMB / 1048576).toFixed(1)} MB`);
})();
