const fs = require('fs');
const pages = ['index.html','about.html','products.html','lab.html','services.html',
               'manufacturing.html','sustainability.html','news.html','connect.html'];
for (const p of pages) {
  const h = fs.readFileSync(p, 'utf8');
  const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map(x => x[1]);
  const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  const h3 = (h.match(/<h3/g) || []).length;
  console.log(p.padEnd(20), 'ids=' + ids.length, dup.length ? 'DUPLICATE: ' + dup.join(',') : 'no dup ids',
              '| bytes=' + h.length, '| h3=' + h3);
}
