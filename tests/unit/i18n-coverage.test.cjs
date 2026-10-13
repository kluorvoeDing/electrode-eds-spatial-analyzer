const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { UI_ZH, HELP_ZH, HELP_EN } = require('../../src/ui/i18n.js');

// Keys that read the same in Traditional Chinese: formulae, symbols and established abbreviations.
const SAME_IN_ZH = new Set(['TiO2', 'ZrO2', 'MnO2', 'Al2O3', 'LFP', 'ROI', 'CV', 'P90']);

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.js$/.test(entry.name) && entry.name !== 'i18n.js' ? [full] : [];
  });
}
const files = sources(path.join(__dirname, '../../src'));

test('every literal passed to t() has a Traditional Chinese entry', () => {
  const missing = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g)) {
      const key = match[2].replace(/\\u03bc/g, 'μ').replace(/\\(['"])/g, '$1');
      if (!(key in UI_ZH) && !SAME_IN_ZH.has(key)) missing.add(`${path.basename(file)}: ${key}`);
    }
  }
  assert.deepEqual([...missing], []);
});
test('every help topic used by info() exists in both languages', () => {
  const missing = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\binfo\(\s*'([^']+)'\s*\)/g))
      for (const [name, table] of [
        ['zh', HELP_ZH],
        ['en', HELP_EN],
      ])
        if (!(match[1] in table)) missing.add(`${name}: ${match[1]}`);
  }
  assert.deepEqual([...missing], []);
});
