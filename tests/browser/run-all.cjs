// Runs every browser script in sequence against dist/; stops at the first failure.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const only = process.argv.slice(2);
const scripts = fs
  .readdirSync(__dirname)
  .filter(name => name.endsWith('.cjs') && name !== 'run-all.cjs')
  .filter(name => !only.length || only.includes(path.basename(name, '.cjs')))
  .sort();
for (const name of scripts) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(__dirname, name)], { stdio: 'inherit' });
  if (run.status !== 0) {
    console.error(`FAIL ${name}`);
    process.exit(run.status || 1);
  }
  console.log(`PASS ${name} (${Date.now() - started} ms)`);
}
console.log(`${scripts.length} browser scripts passed`);
