// Inspect binary/ASCII STL files: triangle count + bounding box (assembly coordinates)
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'STL Files', 'Assembly-STL');
const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.stl'));

function inspect(file) {
  const buf = fs.readFileSync(file);
  let triCount = 0, isBinary = true;
  // Heuristic: binary STL has 80-byte header + uint32 count + 50*n bytes
  if (buf.length > 84) {
    const n = buf.readUInt32LE(80);
    if (84 + n * 50 === buf.length) triCount = n;
    else {
      // maybe ASCII
      const head = buf.slice(0, 200).toString('latin1').toLowerCase();
      if (head.startsWith('solid') && head.includes('facet')) { isBinary = false; }
    }
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  if (isBinary && triCount > 0) {
    let off = 84;
    const stride = 50; // 12 floats (48 bytes) + 2 byte attr
    // sample all triangles for accuracy on small files, subsample big ones
    const step = triCount > 400000 ? Math.ceil(triCount / 400000) : 1;
    for (let t = 0; t < triCount; t += step) {
      const base = off + t * stride + 12; // skip normal
      for (let v = 0; v < 3; v++) {
        for (let c = 0; c < 3; c++) {
          const val = buf.readFloatLE(base + v * 12 + c * 4);
          if (val < min[c]) min[c] = val;
          if (val > max[c]) max[c] = val;
        }
      }
    }
  }
  const size = max.map((m, i) => (m - min[i]));
  return { name: path.basename(file), MB: (buf.length / 1048576).toFixed(2), isBinary, triCount, min: min.map(v => v.toFixed(0)), max: max.map(v => v.toFixed(0)), size: size.map(v => v.toFixed(0)) };
}

const results = files.map(f => inspect(path.join(dir, f)));
for (const r of results) {
  console.log('=== ' + r.name);
  console.log('   ' + r.MB + ' MB | ' + (r.isBinary ? 'binary' : 'ascii') + ' | triangles: ' + r.triCount.toLocaleString());
  console.log('   bbox min: [' + r.min.join(', ') + ']  max: [' + r.max.join(', ') + ']');
  console.log('   size    : [' + r.size.join(', ') + ']');
}
