const { chromium } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
fs.mkdirSync('qa', { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    offline: true,
    acceptDownloads: true,
  });
  const p = await context.newPage();
  const errors = [],
    external = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('request', r => {
    if (/^https?:/.test(r.url())) external.push(r.url());
  });
  await p.goto('file://' + path.resolve('dist/Electrode_EDS_Analyzer.html'));
  await p.locator('#language').selectOption('en');
  const fixtures = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 60;
    const ctx = c.getContext('2d');
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 60; x++) {
        ctx.fillStyle = x % 20 < 5 && y % 20 < 10 ? 'rgb(180,0,0)' : 'black';
        ctx.fillRect(x, y, 1, 1);
      }
    return { png: c.toDataURL('image/png'), jpg: c.toDataURL('image/jpeg', 1) };
  });
  for (const [extension, url] of Object.entries(fixtures))
    fs.writeFileSync('qa/secondary.' + extension, Buffer.from(url.split(',')[1], 'base64'));
  async function waitMask() {
    await p.waitForFunction(() => document.querySelector('#status').textContent === 'Mask updated');
  }
  for (const key of ['nmc', 'secondary', 'f']) {
    await p
      .locator(`[data-file="${key}"]`)
      .setInputFiles(path.resolve('tests/synthetic/' + key + '.csv'));
    await waitMask();
  }
  await p.getByRole('button', { name: '4 Analyze', exact: true }).click();
  await p.locator('#grid').selectOption('3');
  await p.locator('#analyze').click();
  await p.waitForFunction(() => state.results !== null);
  const baseline = await p.evaluate(() => state.results);
  assert.ok(baseline.uniformityCV < 1e-12);
  assert.equal(baseline.interparticleOccupancy, 125 / 600);
  assert.equal(baseline.targetingEfficiency, 1);
  await p.locator('#import').click();
  await p.locator('[data-file="secondary"]').setInputFiles(path.resolve('qa/secondary.png'));
  await waitMask();
  await p.locator('#channel').selectOption('secondary');
  await p.getByRole('button', { name: 'Original', exact: true }).click();
  assert.deepEqual(
    await p.evaluate(() =>
      Array.from(document.querySelector('#canvas').getContext('2d').getImageData(1, 1, 1, 1).data),
    ),
    [180, 0, 0, 255],
  );
  await p.getByRole('button', { name: '4 Analyze', exact: true }).click();
  await p.locator('#analyze').click();
  await p.waitForFunction(() => state.results !== null);
  assert.equal(
    await p.evaluate(() => state.results.interparticleOccupancy),
    baseline.interparticleOccupancy,
  );
  const wait = p.waitForEvent('download');
  await p.locator('#save').click();
  const dl = await wait;
  await dl.saveAs(path.resolve('qa/image.session.json'));
  await p.locator('#import').click();
  await p.locator('#sessionFile').setInputFiles(path.resolve('qa/image.session.json'));
  await p.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Session loaded'),
  );
  assert.deepEqual(
    await p.evaluate(() => Array.from(state.channels.secondary.rgba.slice(244, 248))),
    [180, 0, 0, 255],
  );
  await p.locator('[data-file="secondary"]').setInputFiles(path.resolve('qa/secondary.jpg'));
  await waitMask();
  assert.equal(await p.evaluate(() => state.channels.secondary.format), 'image');
  await p.getByRole('button', { name: '2 ROI', exact: true }).click();
  await p.locator('#scaleLength').fill('10');
  await p.locator('#scaleBar').click();
  const box = await p.locator('#canvas').boundingBox();
  const z = await p.evaluate(() => zoom);
  await p.mouse.click(box.x + 5 * z, box.y + 5 * z);
  await p.mouse.click(box.x + 25 * z, box.y + 5 * z);
  assert.ok(Math.abs((await p.evaluate(() => state.settings.calibration)) - 0.5) < 1e-9);
  await p.getByRole('button', { name: '3 Segment', exact: true }).click();
  await p.locator('#segChannel').selectOption('secondary');
  await p.locator('#ratio').check();
  await waitMask();
  assert.equal(await p.evaluate(() => state.settings.ratio), true);
  await p.locator('#ratio').uncheck();
  await waitMask();
  await p.locator('#fill').check();
  await waitMask();
  await p.locator('#smooth').check();
  await waitMask();
  await p.locator('#minObject').fill('2');
  await p.locator('#minObject').dispatchEvent('change');
  await waitMask();
  await p.locator('[data-help="threshold"]').focus();
  assert.equal(await p.locator('#tooltip').isVisible(), true);
  await p.locator('[data-help="threshold"]').click();
  assert.ok((await p.locator('#tooltip').innerText()).includes('Manual'));
  await p.keyboard.press('Escape');
  await p.locator('#import').click();
  await p.locator('[data-remove="f"]').click();
  await waitMask();
  await p.getByRole('button', { name: '4 Analyze', exact: true }).click();
  await p.locator('#analyze').click();
  await p.waitForFunction(() => state.results !== null);
  assert.equal(await p.evaluate(() => state.results.binderCoverage), null);
  assert.equal(await p.getByText('Binder Coverage', { exact: true }).count(), 0);
  // Al collector restriction and valid effective ROI.
  await p.locator('#import').click();
  await p.locator('#material').selectOption('Al2O3');
  await p.locator('#view').selectOption('cross');
  await p.getByRole('button', { name: '4 Analyze', exact: true }).click();
  await p.locator('#analyze').click();
  assert.ok((await p.locator('#status').innerText()).includes('collector'));
  // Empty ROI is an explicit analysis error.
  await p.locator('#import').click();
  await p.locator('#material').selectOption('TiO2');
  await p.getByRole('button', { name: '2 ROI', exact: true }).click();
  await p.locator('#roiInvert').check();
  await waitMask();
  await p.getByRole('button', { name: '4 Analyze', exact: true }).click();
  await p.locator('#analyze').click();
  await p.waitForFunction(() =>
    document.querySelector('#status').textContent.includes('ROI is empty'),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  fs.writeFileSync(
    'qa/import-result.json',
    JSON.stringify(
      {
        passed: true,
        tests: [
          'actual CSV imports',
          'PNG color and exact metrics',
          'JPG decoding',
          'image session roundtrip',
          'scale bar click calibration',
          'ratio preview',
          'fill smoothing small object controls',
          'hover focus click popover',
          'missing F',
          'Al collector block',
          'empty ROI',
        ],
        baseline,
      },
      null,
      2,
    ),
  );
  await browser.close();
  console.log('PNG/JPG/CSV import, scale bar and guardrails passed');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
