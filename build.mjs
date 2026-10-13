// Assembles the offline single-file app. Sources are classic scripts concatenated in the order
// below and share one global scope; the Worker bundle is embedded as a string.
import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const { version } = JSON.parse(read('package.json'));

const WORKER_SOURCES = ['src/analysis/core.js', 'src/workers/worker.js'];
const APP_SOURCES = [
  'src/analysis/core.js',
  'src/ui/i18n.js',
  'src/ui/image-import.js',
  'src/app/state.js',
  'src/app/worker-client.js',
  'src/app/shell.js',
  'src/app/controls.js',
  'src/app/file-import.js',
  'src/app/canvas.js',
  'src/app/results.js',
  'src/app/session.js',
  'src/app/export.js',
  'src/app/main.js',
];

// Replacement text is supplied through a function so `$&`-style patterns in it stay literal.
function fill(text, placeholder, value) {
  if (!text.includes(placeholder)) throw Error(`Placeholder ${placeholder} not found`);
  return text.replace(placeholder, () => value);
}

// The directive must lead each bundle; a 'use strict' inside a later source file has no effect.
const bundle = sources => `'use strict';\n${sources.map(read).join('\n')}`;
const worker = bundle(WORKER_SOURCES);
let app = bundle(APP_SOURCES);
app = fill(app, '/*WORKER_SOURCE*/', JSON.stringify(worker));
app = fill(app, '/*VERSION*/', version);

let html = fill(read('src/index.html'), '/*STYLES*/', read('src/styles.css'));
html = fill(html, '/*APP*/', app.replaceAll('</script', '<\\/script'));

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/Electrode_EDS_Analyzer.html', html);
console.log(`Built v${version}: ${Buffer.byteLength(html)} bytes`);
