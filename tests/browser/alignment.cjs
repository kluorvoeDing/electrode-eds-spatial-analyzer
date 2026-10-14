// Manual alignment: whole-pixel nudging for analysis channels and SEM-only scaling to the map grid.
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
  await p.goto('file://' + path.resolve('dist/Electrode_EDS_Analyzer.html'));
  await p.locator('#language').selectOption('en');
  const statusText = () => p.locator('#status').textContent();
  const waitIdle = () => p.waitForFunction(() => !busy);

  // 60 × 40 maps; the SEM shows the same field at twice the magnification inside a larger frame.
  await p.evaluate(async () => {
    const W = 60,
      H = 40;
    const patterns = {
      nmc: (x, y) => (Math.hypot((x % 20) - 10, (y % 20) - 10) < 6 ? [200, 0, 200] : [0, 0, 0]),
      secondary: (x, y) => (x % 20 < 4 && y % 20 < 5 ? [255, 140, 0] : [0, 0, 0]),
      f: (x, y) => (x % 20 < 6 && y % 20 < 7 ? [0, 120, 255] : [0, 0, 0]),
    };
    const draw = (w, h, colour) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d'),
        image = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) image.data.set([...colour(x, y), 255], (y * w + x) * 4);
      ctx.putImageData(image, 0, 0);
      return c;
    };
    const file = async (canvas, name) =>
      new File([await new Promise(resolve => canvas.toBlob(resolve))], name, { type: 'image/png' });
    for (const [key, colour] of Object.entries(patterns))
      await loadFile(await file(draw(W, H, colour), key + '.png'), key);
    const inMap = (x, y) => x >= 15 && x < 15 + 2 * W && y >= 10 && y < 10 + 2 * H;
    window.semFile = await file(
      draw(150, 120, (x, y) =>
        inMap(x, y) ? patterns.nmc((x - 15) >> 1, (y - 10) >> 1) : [40, 40, 40],
      ),
      'sem.png',
    );
  });
  await waitIdle();
  await p.evaluate(() => {
    state.rois = [{ type: 'rect', x: 2, y: 2, w: 56, h: 36, exclude: false }];
    setCalibration(0.25);
  });
  const gridState = () =>
    p.evaluate(() => ({ rois: state.rois.length, calibration: state.settings.calibration }));
  async function analyze() {
    await p.locator('[data-step="analyze"]').click();
    await p.locator('#analyze').click();
    await p.waitForFunction(() =>
      document.querySelector('#status').textContent.startsWith('Analysis complete'),
    );
    return p.evaluate(() => {
      const { elapsedMs, analyzedAt, trace, ...metrics } = state.results;
      return JSON.parse(JSON.stringify(metrics));
    });
  }
  const baseline = await analyze();
  assert.ok(baseline.secondaryPixels > 0 && baseline.distance.unit === 'μm');

  // An SEM at its own magnification goes straight to the review dialog, set up to scale it onto
  // the analysis grid. Nothing is imported, and the grid state is untouched, until it is confirmed.
  await p.evaluate(() => loadFile(window.semFile, 'sem'));
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.evaluate(() => 'sem' in state.channels), false);
  assert.deepEqual(await gridState(), { rois: 1, calibration: 0.25 });
  assert.deepEqual(await p.evaluate(() => imageImport.target), { w: 60, h: 40 });
  assert.equal(await p.locator('#cropFit').isChecked(), true);
  assert.equal(await p.locator('#cropLock').isChecked(), true);
  assert.equal(await p.locator('#cropReference').inputValue(), 'nmc');
  const rect = () => p.evaluate(() => ({ ...imageImport.rect }));
  const previewInfo = () =>
    p.evaluate(() => {
      const c = document.querySelector('#cropPreview'),
        d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let max = 0,
        sum = 0;
      for (let i = 0; i < d.length; i++)
        if (i % 4 !== 3) {
          max = Math.max(max, d[i]);
          sum += d[i];
        }
      return { w: c.width, h: c.height, max, sum };
    });
  async function setField(key, value) {
    await p.locator('#crop-' + key).fill(String(value));
    await p.locator('#crop-' + key).press('Tab');
  }
  await setField('x', 15);
  await setField('y', 10);
  await setField('w', 120);
  // The locked aspect ratio derives the height from the reference shape.
  assert.deepEqual(await rect(), { x: 15, y: 10, w: 120, h: 80 });
  assert.equal(await p.locator('#crop-h').inputValue(), '80');
  const label = () => p.locator('#cropSizeStatus').textContent();
  assert.match(await label(), /120 × 80 → 60 × 40 px · Scale ×0\.500 \/ ×0\.500/);
  assert.match(await label(), /SEM is display-only/);

  // Difference view: an aligned selection cancels the reference exactly.
  await p.locator('#cropView').selectOption('difference');
  assert.deepEqual(await previewInfo(), { w: 60, h: 40, max: 0, sum: 0 });
  await p.locator('#cropReviewed').check();
  await p.locator('[data-nudge="1,0"]').click();
  assert.deepEqual(await rect(), { x: 16, y: 10, w: 120, h: 80 });
  assert.equal(await p.locator('#cropReviewed').isChecked(), false);
  assert.equal(await p.locator('#cropApply').isEnabled(), false);
  assert.ok((await previewInfo()).max > 0);
  await p.locator('#cropSource').focus();
  await p.keyboard.press('ArrowLeft');
  assert.deepEqual(await rect(), { x: 15, y: 10, w: 120, h: 80 });
  assert.equal((await previewInfo()).max, 0);
  await p.keyboard.press('Shift+ArrowDown');
  assert.deepEqual(await rect(), { x: 15, y: 20, w: 120, h: 80 });
  await p.keyboard.press('Shift+ArrowUp');
  await p.keyboard.press('Shift+ArrowUp');
  assert.deepEqual(await rect(), { x: 15, y: 0, w: 120, h: 80 });
  await p.locator('[data-nudge="0,1"]').click({ modifiers: ['Shift'] });
  assert.deepEqual(await rect(), { x: 15, y: 10, w: 120, h: 80 });

  // Holding the button shows the reference alone; releasing restores the comparison.
  const referenceSum = await p.evaluate(() => {
    let sum = 0;
    const d = state.channels.nmc.rgba;
    for (let i = 0; i < d.length; i++) if (i % 4 !== 3) sum += d[i];
    return sum;
  });
  await p.locator('#cropFlip').dispatchEvent('pointerdown');
  assert.equal((await previewInfo()).sum, referenceSum);
  await p.locator('#cropFlip').dispatchEvent('pointerup');
  assert.equal((await previewInfo()).sum, 0);
  await p.locator('#cropView').selectOption('blend');
  assert.equal((await previewInfo()).sum, referenceSum);

  // Unlocked, an anisotropic selection is allowed but flagged.
  await p.locator('#cropLock').uncheck();
  await setField('h', 100);
  assert.deepEqual(await rect(), { x: 15, y: 10, w: 120, h: 100 });
  assert.match(await label(), /Scale ×0\.500 \/ ×0\.400 · Horizontal and vertical scale differ/);
  assert.equal(
    await p.locator('#cropSizeStatus').evaluate(el => el.classList.contains('warning')),
    true,
  );
  await p.locator('#cropLock').check();
  assert.deepEqual(await rect(), { x: 15, y: 10, w: 120, h: 80 });

  // Dragging a resampled selection ends with the exact resampler, not the canvas scaler.
  let box = await p.locator('#cropSource').boundingBox();
  const at = (x, y) => [box.x + (x / 150) * box.width, box.y + (y / 120) * box.height];
  await p.mouse.move(...at(15, 10));
  await p.mouse.down();
  await p.mouse.move(...at(100, 60), { steps: 4 });
  await p.mouse.move(...at(135, 60), { steps: 4 });
  await p.mouse.up();
  assert.deepEqual(await rect(), { x: 15, y: 10, w: 120, h: 80 });
  await p.locator('#cropView').selectOption('difference');
  assert.equal((await previewInfo()).max, 0);

  await p.locator('#cropReviewed').check();
  await p.locator('#cropApply').click();
  await p.waitForFunction(() => !document.querySelector('#dialog').open && !busy);
  assert.match(await statusText(), /Image applied · SEM \/ BSE · 60×40 · Display only, resampled/);
  const fitted = await p.evaluate(() => ({
    size: [state.channels.sem.w, state.channels.sem.h],
    info: { ...state.channels.sem.importInfo, reviewedAt: null },
    sameAsNi: state.channels.sem.rgba.every((v, i) => v === state.channels.nmc.rgba[i]),
    sizeError: sizeError(),
    hasSource: /^data:image\/png/.test(state.channels.sem.sourceImage),
  }));
  assert.deepEqual(fitted, {
    size: [60, 40],
    info: {
      kind: 'file',
      sourceWidth: 150,
      sourceHeight: 120,
      crop: { x: 15, y: 10, w: 120, h: 80 },
      pixelResampling: 'area-average',
      scaleX: 0.5,
      scaleY: 0.5,
      displayOnly: true,
      lockAspect: true,
      reviewed: true,
      reference: 'nmc',
      reviewedAt: null,
    },
    sameAsNi: true,
    sizeError: false,
    hasSource: true,
  });
  // Fitting the display backdrop leaves the analysis grid, and every metric, untouched.
  assert.deepEqual(await gridState(), { rois: 1, calibration: 0.25 });
  assert.deepEqual(await analyze(), baseline);
  assert.equal(
    await p.evaluate(() => state.results.trace.images.sem.importInfo.pixelResampling),
    'area-average',
  );

  // Re-opening restores the selection and mode; re-fitting still keeps ROI and calibration.
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-crop="sem"]').click();
  await p.locator('#cropSource').waitFor();
  assert.deepEqual(await rect(), { x: 15, y: 10, w: 120, h: 80 });
  assert.equal(await p.locator('#cropFit').isChecked(), true);
  assert.match(await p.locator('.crop-heading').textContent(), /150 × 120 px/);
  await p.locator('[data-nudge="1,0"]').click();
  await p.locator('#cropReviewed').check();
  await p.locator('#cropApply').click();
  await p.waitForFunction(() => !document.querySelector('#dialog').open && !busy);
  assert.deepEqual(await gridState(), { rois: 1, calibration: 0.25 });
  assert.deepEqual(await p.evaluate(() => state.channels.sem.importInfo.crop), {
    x: 16,
    y: 10,
    w: 120,
    h: 80,
  });
  assert.deepEqual(await analyze(), baseline);

  // A v0.2.0 session with a resampled SEM survives a save / load round trip.
  const saved = await p.evaluate(() => JSON.stringify(snapshot()));
  fs.writeFileSync('qa/alignment-session.json', saved);
  await p.locator('#more').click();
  await p.locator('#settings').click();
  await p.locator('#clearData').click();
  await p.locator('#sessionFile').setInputFiles(path.resolve('qa/alignment-session.json'));
  await p.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Session loaded'),
  );
  assert.deepEqual(
    await p.evaluate(() => ({
      info: state.channels.sem.importInfo,
      size: [state.channels.sem.w, state.channels.sem.rgba.length],
      ...{ rois: state.rois.length, calibration: state.settings.calibration },
    })),
    {
      info: { ...JSON.parse(saved).channels.sem.importInfo },
      size: [60, 60 * 40 * 4],
      rois: 1,
      calibration: 0.25,
    },
  );
  const { elapsedMs, analyzedAt, trace, ...reloaded } = await p.evaluate(() =>
    JSON.parse(JSON.stringify(state.results)),
  );
  assert.deepEqual(reloaded, baseline);

  // Analysis channels never offer scaling and cannot be resampled even if the flag is forced.
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-crop="f"]').click();
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.locator('#cropFit').count(), 0);
  assert.equal(await p.locator('[data-nudge]').count(), 4);
  assert.equal(
    await p.evaluate(() => {
      try {
        importPixels('f', imageImport.rgba, 60, 40, { x: 0, y: 0, w: 60, h: 40 }, { w: 30, h: 20 });
        return 'resampled';
      } catch (e) {
        return e.message;
      }
    }),
    'Only the SEM display channel can be resampled',
  );
  await p.evaluate(() => {
    imageImport.fit = true;
    imageImport.reference = 'sem';
  });
  // Analysis channels are held to the grid size: only the position can change.
  assert.equal(await p.locator('#cropLockSize').isChecked(), true);
  assert.equal(await p.locator('#crop-w').isDisabled(), true);
  assert.equal(await p.locator('#cropFull').isDisabled(), true);
  // Whole-pixel nudging of an analysis channel: unlock, crop one column narrower, shift, restore.
  await p.locator('#cropLockSize').uncheck();
  await setField('w', 59);
  await p.locator('[data-nudge="1,0"]').click();
  assert.deepEqual(await rect(), { x: 1, y: 0, w: 59, h: 40 });
  await p.locator('[data-nudge="1,0"]').click();
  assert.deepEqual(await rect(), { x: 1, y: 0, w: 59, h: 40 });
  await p.locator('#cropFull').click();
  await p.locator('#cropReviewed').check();
  await p.locator('#cropApply').click();
  await p.waitForFunction(() => !document.querySelector('#dialog').open && !busy);
  assert.deepEqual(
    await p.evaluate(() => ({
      size: [state.channels.f.w, state.channels.f.h],
      resampling: state.channels.f.importInfo.pixelResampling,
      displayOnly: 'displayOnly' in state.channels.f.importInfo,
    })),
    { size: [60, 40], resampling: 'none', displayOnly: false },
  );
  // Re-cropping an analysis channel resets the grid state.
  assert.deepEqual(await gridState(), { rois: 0, calibration: null });

  await p.locator('#language').selectOption('zh-Hant');
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-crop="sem"]').click();
  await p.locator('#cropSource').waitFor();
  assert.match(await p.locator('.crop-fit').textContent(), /將框選區縮放為參考圖尺寸（僅限 SEM）/);
  await p.screenshot({ path: 'qa/alignment-dialog.png' });
  await p.setViewportSize({ width: 390, height: 844 });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await browser.close();
  console.log(
    'Pixel nudging, comparison views, SEM-only scaling, unchanged metrics and session round trip passed',
  );
})().catch(e => {
  console.error(e);
  process.exit(1);
});
