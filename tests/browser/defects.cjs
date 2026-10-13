// Regression checks for defects fixed after v0.1.3.
const { chromium } = require('playwright'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');

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
  });
  const p = await context.newPage(),
    errors = [],
    external = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('request', r => {
    if (/^https?:/.test(r.url())) external.push(r.url());
  });
  const distPath = path.resolve('dist/Electrode_EDS_Analyzer.html');
  await p.goto('file://' + distPath);
  await p.locator('#language').selectOption('en');
  const statusText = () => p.locator('#status').textContent();
  const waitIdle = () => p.waitForFunction(() => !busy);
  async function demo() {
    await p.locator('#import').click();
    await p.locator('#demo').click();
    await p.waitForFunction(() => document.querySelector('#status').textContent === 'Mask updated');
  }
  const csvFile = (w, h, value) =>
    p.evaluateHandle(
      ([w, h, value]) =>
        new File(
          [Array.from({ length: h }, () => Array(w).fill(value).join(',')).join('\n')],
          'replacement.csv',
        ),
      [w, h, value],
    );
  async function importCSV(key, w, h, value = 0) {
    const file = await csvFile(w, h, value);
    await p.evaluate(([file, key]) => loadFile(file, key), [file, key]);
    await waitIdle();
  }
  const setROIAndCalibration = () =>
    p.evaluate(() => {
      state.rois = [{ type: 'rect', x: 10, y: 10, w: 100, h: 100, exclude: false }];
      setCalibration(0.5);
    });
  const gridState = () =>
    p.evaluate(() => ({ rois: state.rois.length, calibration: state.settings.calibration }));

  // The bundle and the embedded Worker both run in strict mode.
  const html = fs.readFileSync(distPath, 'utf8');
  assert.match(html, /<script>\s*'use strict';/);
  assert.equal(
    await p.evaluate(() => {
      try {
        void renderControls.caller;
        return false;
      } catch (_) {
        return true;
      }
    }),
    true,
  );
  assert.match(html, /new Blob\(\s*\[\s*"'use strict';/);

  // A Worker-level failure settles pending requests instead of leaving the UI busy forever.
  await demo();
  const recovered = await p.evaluate(async () => {
    const original = worker.postMessage.bind(worker);
    worker.postMessage = () => {};
    const pending = compute(false);
    const busyDuring = busy;
    worker.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    const settled = await Promise.race([
      pending.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 2000)),
    ]);
    worker.postMessage = original;
    return {
      busyDuring,
      settled,
      busy,
      progressHidden: document.querySelector('#progress').classList.contains('hidden'),
      status: document.querySelector('#status').textContent,
      error: document.querySelector('#status').classList.contains('error'),
    };
  });
  assert.deepEqual(recovered, {
    busyDuring: true,
    settled: true,
    busy: false,
    progressHidden: true,
    status: 'Background calculation failed: boom',
    error: true,
  });
  // The next request works and resends channel data.
  await p.evaluate(() => preview());
  await waitIdle();
  assert.equal(await statusText(), 'Mask updated');

  // ROI and calibration follow the analysis grid: one rule for every import path.
  await demo();
  await setROIAndCalibration();
  await importCSV('other', 240, 240); // new display channel, same grid
  assert.deepEqual(await gridState(), { rois: 1, calibration: 0.5 });
  await importCSV('sem', 240, 240, 5); // replaced display channel, same grid
  assert.deepEqual(await gridState(), { rois: 1, calibration: 0.5 });
  await importCSV('nmc', 240, 240, 9); // replaced analysis channel
  assert.deepEqual(await gridState(), { rois: 0, calibration: null });
  await demo();
  await setROIAndCalibration();
  await importCSV('sem', 120, 240); // grid size changed
  assert.deepEqual(await gridState(), { rois: 0, calibration: null });
  assert.match(await statusText(), /Channel dimensions differ/);

  // Calibration changes keep a user-chosen binder neighbourhood.
  await demo();
  const radius = () => p.evaluate(() => state.settings.binderRadius);
  assert.equal(await radius(), 3);
  await p.evaluate(() => setCalibration(0.2));
  assert.equal(await radius(), 0.5);
  await p.evaluate(() => setCalibration(0));
  assert.equal(await radius(), 3);
  await p.getByRole('button', { name: '4 Analyze', exact: true }).click();
  await p.locator('#radius').fill('5');
  await p.locator('#radius').press('Tab');
  assert.equal(await p.evaluate(() => state.settings.binderRadiusCustom), true);
  // Calibration is entered on the ROI step, as a user would.
  async function calibrate(value) {
    await p.getByRole('button', { name: '2 ROI', exact: true }).click();
    await p.locator('#calibration').fill(String(value));
    await p.locator('#calibration').press('Tab');
  }
  await calibrate(0.2);
  assert.equal(await radius(), 1);
  assert.equal(await statusText(), 'Calibration updated · Binder neighborhood 1 μm');
  await calibrate(0.4);
  assert.equal(await radius(), 1);
  await calibrate('');
  assert.equal(await radius(), 2.5);
  assert.equal(await statusText(), 'Calibration cleared · Binder neighborhood 2.5 px');

  // Session loading rejects inconsistent files and leaves the current workspace untouched.
  await demo();
  const pngChannel = await p.evaluate(async () => {
    const make = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgb(200,0,0)';
      ctx.fillRect(4, 4, 10, 10);
      return c;
    };
    const blob = await new Promise(resolve => make(240, 240).toBlob(resolve));
    await loadFile(new File([blob], 'sem.png', { type: 'image/png' }), 'sem');
    return { session: snapshot(), wrongSize: make(30, 30).toDataURL('image/png') };
  });
  await waitIdle();
  const base = pngChannel.session;
  assert.equal(base.channels.sem.format, 'image');
  await p.evaluate(() => {
    state.sample = 'Keep me';
    document.querySelector('#sample').value = 'Keep me';
  });
  const clone = () => structuredClone(base);
  const variants = {
    'png-size': s => (s.channels.sem.image = pngChannel.wrongSize),
    material: s => (s.material = '<img src=x>'),
    comparison: s => (s.comparison = [{ sample: 'x' }]),
    'roi-invert': s => (s.roiInvert = 'yes'),
    'depth-axis': s => (s.settings.depthAxis = 'z'),
    format: s => (s.channels.nmc.format = 'tiff'),
  };
  for (const [name, mutate] of Object.entries(variants)) {
    const s = clone();
    mutate(s);
    const file = path.resolve(`qa/bad-session-${name}.json`);
    fs.writeFileSync(file, JSON.stringify(s));
    await p.locator('#sessionFile').setInputFiles(file);
    await p.waitForFunction(() =>
      document.querySelector('#status').textContent.startsWith('Session could not be loaded'),
    );
    assert.deepEqual(
      await p.evaluate(() => ({
        sample: state.sample,
        channels: Object.keys(state.channels).length,
      })),
      { sample: 'Keep me', channels: 4 },
      name,
    );
    await p.evaluate(() => status('Ready'));
  }
  // Unknown fields are dropped; a pre-0.2.0 session without the custom-radius flag infers it.
  const extra = clone();
  extra.settings.unexpected = 'x';
  extra.seg.nmc.unexpected = 'x';
  extra.unexpected = 'x';
  extra.settings.binderRadius = 7;
  delete extra.settings.binderRadiusCustom;
  fs.writeFileSync('qa/extra-session.json', JSON.stringify(extra));
  await p.locator('#sessionFile').setInputFiles(path.resolve('qa/extra-session.json'));
  await p.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Session loaded'),
  );
  assert.deepEqual(
    await p.evaluate(() => ({
      settings: 'unexpected' in state.settings,
      seg: 'unexpected' in state.seg.nmc,
      root: 'unexpected' in state,
      radius: state.settings.binderRadius,
      custom: state.settings.binderRadiusCustom,
      sem: [state.channels.sem.w, state.channels.sem.rgba.length],
    })),
    {
      settings: false,
      seg: false,
      root: false,
      radius: 7,
      custom: true,
      sem: [240, 240 * 240 * 4],
    },
  );

  // The reset control says what it does: nothing is stored on the machine.
  await p.locator('#settings').click();
  assert.equal(await p.locator('#clearData').textContent(), 'Reset workspace');
  await p.locator('#clearData').click();
  assert.equal(await statusText(), 'Workspace reset');
  assert.deepEqual(
    await p.evaluate(() => [Object.keys(state.channels).length, state.settings.binderRadiusCustom]),
    [0, false],
  );
  await p.locator('#language').selectOption('zh-Hant');
  await p.locator('#settings').click();
  assert.equal(await p.locator('#clearData').textContent(), '重設工作區');

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await browser.close();
  console.log(
    'Strict mode, Worker failure recovery, grid reset rule, binder radius and session validation passed',
  );
})().catch(e => {
  console.error(e);
  process.exit(1);
});
