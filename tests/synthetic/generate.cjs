const fs = require('node:fs'),
  path = require('node:path');
const w = 60,
  h = 60,
  channels = { nmc: [], secondary: [], f: [] };
for (let y = 0; y < h; y++) {
  const ni = [],
    s = [],
    f = [];
  for (let x = 0; x < w; x++) {
    ni.push(x % 20 > 11 ? 200 : 0);
    s.push(x % 20 < 5 && y % 20 < 10 ? 180 : 0);
    f.push(x % 20 < 7 && y % 20 < 12 ? 220 : 0);
  }
  channels.nmc.push(ni.join(','));
  channels.secondary.push(s.join(','));
  channels.f.push(f.join(','));
}
for (const [k, rows] of Object.entries(channels))
  fs.writeFileSync(path.join(__dirname, k + '.csv'), rows.join('\n'));
console.log('60×60 synthetic channels generated');
