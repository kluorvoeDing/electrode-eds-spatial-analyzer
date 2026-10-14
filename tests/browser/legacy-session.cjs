// A session written by the real v0.1.3 build (taken from the git tag) must load in the current
// build and reproduce the same metrics.
const { chromium } = require('playwright'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process'),
  fs = require('node:fs'),
  path = require('node:path');

fs.mkdirSync('qa', { recursive: true });
let legacyHTML;
try {
  legacyHTML = execFileSync('git', ['show', 'v0.1.3:dist/Electrode_EDS_Analyzer.html'], {
    maxBuffer: 16e6,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (_) {
  console.log('Skipped: git tag v0.1.3 is not available');
  process.exit(0);
}
fs.writeFileSync('qa/legacy-v0.1.3.html', legacyHTML);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    offline: true,
  });
  const errors = [];
  const open = async file => {
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(file));
    await page.locator('#language').selectOption('en');
    return page;
  };
  const metrics = page =>
    page.evaluate(() => {
      const { elapsedMs, analyzedAt, trace, ...rest } = state.results;
      return JSON.parse(JSON.stringify(rest));
    });

  // Build a representative workspace in v0.1.3: CSV channels, a re-cropped image channel, ROI,
  // calibration, a hand-set binder radius, non-default segmentation and a comparison entry.
  const old = await open('qa/legacy-v0.1.3.html');
  assert.equal(await old.evaluate(() => VERSION), '0.1.3');
  await old.locator('#demo').click();
  await old.waitForFunction(() => document.querySelector('#status').textContent === 'Mask updated');
  await old.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 260;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, 260, 260);
    ctx.fillStyle = 'black';
    ctx.fillRect(10, 12, 240, 240);
    ctx.fillStyle = 'rgb(0,120,255)';
    for (let y = 0; y < 240; y += 48)
      for (let x = 0; x < 240; x += 48) ctx.fillRect(10 + x, 12 + y, 13, 15);
    const blob = await new Promise(resolve => c.toBlob(resolve));
    await loadFile(new File([blob], 'f-report.png', { type: 'image/png' }), 'f');
  });
  await old.locator('#import').click();
  await old.locator('[data-crop="f"]').click();
  await old.locator('#cropSource').waitFor();
  for (const [k, v] of Object.entries({ x: 10, y: 12, w: 240, h: 240 }))
    await old.locator('#crop-' + k).fill(String(v));
  await old.locator('#cropReviewed').check();
  await old.locator('#cropApply').click();
  await old.waitForFunction(() => !document.querySelector('#dialog').open && !busy);
  await old.evaluate(() => {
    state.rois = [
      { type: 'rect', x: 8, y: 8, w: 200, h: 180, exclude: false },
      {
        type: 'polygon',
        points: [
          [20, 20],
          [60, 20],
          [40, 60],
        ],
        exclude: true,
      },
    ];
    state.seg.secondary = {
      ...state.seg.secondary,
      auto: false,
      threshold: 90,
      min: 2,
      fill: true,
    };
    state.sample = 'Legacy 樣品';
    setCalibration(0.5);
    state.settings.binderRadius = 2;
    state.settings.grid = 8;
  });
  await old.getByRole('button', { name: '4 Analyze', exact: true }).click();
  await old.locator('#analyze').click();
  await old.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Analysis complete'),
  );
  await old.locator('#addComparison').click();
  await old.evaluate(() => (state.comparison[0].note = 'batch A'));
  const expected = await metrics(old);
  const session = await old.evaluate(() => JSON.stringify(snapshot()));
  const saved = JSON.parse(session);
  assert.equal(saved.toolVersion, '0.1.3');
  assert.equal('binderRadiusCustom' in saved.settings, false);
  assert.equal(saved.channels.f.importInfo.pixelResampling, 'none');
  fs.writeFileSync('qa/legacy-v0.1.3.session.json', session);
  await old.close();

  const page = await open('dist/Electrode_EDS_Analyzer.html');
  await page.locator('#sessionFile').setInputFiles(path.resolve('qa/legacy-v0.1.3.session.json'));
  await page.waitForFunction(
    () =>
      document.querySelector('#status').textContent.startsWith('Session loaded') ||
      document.querySelector('#status').classList.contains('error'),
  );
  assert.equal(await page.locator('#status').textContent(), 'Session loaded · results recomputed');
  assert.deepEqual(
    await page.evaluate(() => ({
      sample: state.sample,
      channels: Object.keys(state.channels),
      rois: state.rois,
      seg: state.seg.secondary,
      calibration: state.settings.calibration,
      radius: state.settings.binderRadius,
      custom: state.settings.binderRadiusCustom,
      grid: state.settings.grid,
      comparison: state.comparison.map(c => [c.sample, c.note, c.metrics.distance.unit]),
      importInfo: state.channels.f.importInfo,
      hasSource: !!state.channels.f.sourceImage,
    })),
    {
      sample: 'Legacy 樣品',
      channels: Object.keys(saved.channels),
      rois: saved.rois,
      // Averaging did not exist then: an old session stays thresholded on the raw map.
      seg: { ...saved.seg.secondary, denoise: 0 },
      calibration: 0.5,
      radius: 2,
      custom: true,
      grid: 8,
      comparison: [['Legacy 樣品', 'batch A', 'μm']],
      importInfo: saved.channels.f.importInfo,
      hasSource: true,
    },
  );
  // Same data and settings give the same numbers in both versions.
  // Tiles have since gained their bounds and per-cell values; everything v0.1.3 reported is
  // unchanged.
  const current = await metrics(page);
  assert.ok(current.tiles.every(t => t.x1 > t.x0 && 'interparticleOccupancy' in t));
  current.tiles = current.tiles.map(({ x, y, area, fraction }) => ({ x, y, area, fraction }));
  assert.deepEqual(current, expected);
  assert.deepEqual(
    await page.evaluate(() => ANALYSIS_KEYS.map(k => state.seg[k].denoise)),
    [0, 0, 0],
  );
  // The stored crop can be reopened and the comparison table still renders and exports.
  await page.locator('#import').click();
  await page.locator('[data-crop="f"]').click();
  await page.locator('#cropSource').waitFor();
  assert.deepEqual(await page.evaluate(() => imageImport.rect), { x: 10, y: 12, w: 240, h: 240 });
  await page.locator('#cropCancel').click();
  await page.locator('[data-step="analyze"]').click();
  await page.locator('#showComparison').click();
  assert.equal(await page.locator('[data-key="note"]').inputValue(), 'batch A');

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('A real v0.1.3 session loads in the current build with identical metrics');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
