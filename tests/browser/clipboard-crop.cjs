const { chromium } = require('playwright'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await b.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
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
  assert.equal(await p.title(), '電極 EDS 空間分析');
  assert.equal(await p.locator('[data-paste]').count(), 5);
  await p.locator('#language').selectOption('en');
  async function copyImage(color = 'magenta') {
    await p.evaluate(async color => {
      const c = document.createElement('canvas');
      c.width = 100;
      c.height = 90;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#eee';
      ctx.fillRect(0, 0, 100, 90);
      ctx.fillStyle = 'black';
      ctx.fillRect(10, 15, 60, 60);
      ctx.fillStyle = color;
      ctx.fillRect(20, 25, 20, 20);
      const blob = await new Promise(r => c.toBlob(r));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }, color);
  }
  async function paste(key, color = 'magenta') {
    await copyImage(color);
    await p.locator(`[data-paste="${key}"]`).click();
    await p.keyboard.press('ControlOrMeta+V');
    await p.locator('#cropSource').waitFor();
    assert.equal(await p.locator('#cropApply').isEnabled(), false);
  }
  async function setCrop(x = 10, y = 15, w = 60, h = 60) {
    // Free-form cropping: release the grid-size lock that later channels start with.
    const lock = p.locator('#cropLockSize');
    if ((await lock.count()) && (await lock.isChecked()) && (await lock.isEnabled()))
      await lock.uncheck();
    for (const [k, v] of Object.entries({ x, y, w, h })) {
      await p.locator('#crop-' + k).fill(String(v));
    }
  }
  async function apply(key) {
    await p.locator('#cropReviewed').check();
    await p.locator('#cropApply').click();
    await p.waitForFunction(
      k => !!state.channels[k] && !document.querySelector('#dialog').open && !busy,
      key,
    );
  }
  await paste('nmc');
  await setCrop();
  const notImported = await p.evaluate(() => state.channels.nmc);
  assert.equal(notImported, undefined);
  await apply('nmc');
  assert.deepEqual(
    await p.evaluate(() => ({
      w: state.channels.nmc.w,
      h: state.channels.nmc.h,
      pixel: Array.from(state.channels.nmc.rgba.slice((10 * 60 + 10) * 4, (10 * 60 + 10) * 4 + 4)),
      kind: state.channels.nmc.importInfo.kind,
      crop: state.channels.nmc.importInfo.crop,
    })),
    {
      w: 60,
      h: 60,
      pixel: [255, 0, 255, 255],
      kind: 'clipboard',
      crop: { x: 10, y: 15, w: 60, h: 60 },
    },
  );
  // Cancel and Escape never replace a loaded channel.
  const before = await p.evaluate(() => JSON.stringify(snapshot()));
  await paste('nmc', 'cyan');
  await p.locator('#cropCancel').click();
  assert.equal(await p.evaluate(() => JSON.stringify(snapshot())), before);
  await paste('nmc', 'cyan');
  await p.keyboard.press('Escape');
  await p.locator('#dialog').waitFor({ state: 'hidden' });
  assert.equal(await p.evaluate(() => JSON.stringify(snapshot())), before);
  await paste('secondary', 'orange');
  // The pasted report is cropped to its map automatically and held to the grid size.
  assert.deepEqual(
    await p.evaluate(() => [imageImport.rect, imageImport.target, imageImport.detected]),
    [{ x: 10, y: 15, w: 60, h: 60 }, { w: 60, h: 60 }, true],
  );
  assert.equal(await p.locator('#cropLockSize').isChecked(), true);
  assert.equal(await p.locator('#crop-w').isDisabled(), true);
  assert.ok((await p.locator('#cropSizeStatus').innerText()).includes('Equal dimensions'));
  await setCrop(10, 15, 59, 60);
  assert.ok((await p.locator('#cropSizeStatus').innerText()).includes('Dimensions differ'));
  await p.locator('#cropMatch').click();
  assert.equal(await p.locator('#crop-w').inputValue(), '60');
  assert.ok((await p.locator('#cropSizeStatus').innerText()).includes('Equal dimensions'));
  await p.locator('#cropBlend').fill('0.2');
  await p.locator('#cropReviewed').check();
  await p.locator('#crop-x').fill('11');
  assert.equal(await p.locator('#cropReviewed').isChecked(), false);
  await p.locator('#crop-x').fill('10');
  await p.locator('#crop-h').fill('999');
  assert.equal(await p.locator('#cropApply').isEnabled(), false);
  await p.locator('#crop-h').fill('60');
  await apply('secondary');
  // Cropping the same source image again invalidates results and the ROI and preserves the exact
  // crop origin when reopened. The scale stays: analysis pixels are never resampled, so μm per
  // pixel of an unchanged source cannot have changed.
  await p.evaluate(() => {
    state.rois = [{ type: 'rect', x: 0, y: 0, w: 60, h: 60 }];
    state.settings.calibration = 0.5;
  });
  await p.locator('[data-crop="nmc"]').click();
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.locator('#crop-x').inputValue(), '10');
  await p.locator('#cropReviewed').check();
  await p.locator('#cropApply').click();
  await p.waitForFunction(() => !busy && !document.querySelector('#dialog').open);
  assert.equal(await p.evaluate(() => state.settings.calibration), 0.5);
  assert.equal(await p.evaluate(() => state.rois.length), 0);
  assert.match(await p.locator('#status').textContent(), /limits cleared; the scale is unchanged/);
  await p.locator('[data-step="analyze"]').click();
  await p.locator('#analyze').click();
  await p.waitForFunction(() => state.results !== null && !busy);
  assert.equal(
    await p.evaluate(() => state.results.trace.images.nmc.importInfo.pixelResampling),
    'none',
  );
  const download = p.waitForEvent('download');
  await p.locator('#save').click();
  fs.mkdirSync('qa', { recursive: true });
  await (await download).saveAs(path.resolve('qa/clipboard-session.json'));
  const session = JSON.parse(fs.readFileSync('qa/clipboard-session.json'));
  assert.equal(session.channels.nmc.importInfo.kind, 'clipboard');
  assert.ok(session.channels.nmc.sourceImage.startsWith('data:image/png;base64,'));
  await p.locator('#sessionFile').setInputFiles(path.resolve('qa/clipboard-session.json'));
  await p.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Session loaded'),
  );
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-crop="nmc"]').click();
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.locator('#crop-x').inputValue(), '10');
  await p.locator('#closeDialog').click();
  // Actual Ctrl+V into text input must remain normal text editing.
  await p.locator('#sample').focus();
  await p.evaluate(() => navigator.clipboard.writeText('typed sample'));
  await p.keyboard.press('ControlOrMeta+V');
  assert.ok((await p.locator('#sample').inputValue()).includes('typed sample'));
  assert.equal(await p.locator('#dialog').isVisible(), false);
  await p.locator('[data-paste="f"]').click();
  await p.keyboard.press('ControlOrMeta+V');
  assert.ok((await p.locator('#status').innerText()).includes('No image in clipboard'));
  await p.locator('#closeDialog').click();
  // Direct paste uses the selected card, with no proactive clipboard read.
  await copyImage('cyan');
  await p.locator('[data-drop="f"] strong').click();
  await p.keyboard.press('ControlOrMeta+V');
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.evaluate(() => imageImport.key), 'f');
  await setCrop();
  await apply('f');
  // Pointer selection, reverse dragging and bilingual responsive editor.
  await p.locator('[data-crop="f"]').click();
  await p.locator('#cropSource').waitFor();
  // Size-locked, dragging only moves the box; it follows the pointer by its centre.
  let box = await p.locator('#cropSource').boundingBox();
  await p.mouse.move(box.x + (50 / 100) * box.width, box.y + (40 / 90) * box.height);
  await p.mouse.down();
  await p.mouse.move(box.x + (60 / 100) * box.width, box.y + (45 / 90) * box.height);
  await p.mouse.up();
  assert.deepEqual(await p.evaluate(() => imageImport.rect), { x: 30, y: 15, w: 60, h: 60 });
  await p.mouse.move(box.x + (99 / 100) * box.width, box.y + (89 / 90) * box.height);
  await p.mouse.down();
  await p.mouse.up();
  assert.deepEqual(await p.evaluate(() => imageImport.rect), { x: 40, y: 30, w: 60, h: 60 });
  await p.locator('#cropLockSize').uncheck();
  box = await p.locator('#cropSource').boundingBox();
  await p.mouse.move(box.x + (80 / 100) * box.width, box.y + (75 / 90) * box.height);
  await p.mouse.down();
  await p.mouse.move(box.x + (10 / 100) * box.width, box.y + (15 / 90) * box.height);
  await p.mouse.up();
  assert.equal(await p.locator('#crop-w').inputValue(), '70');
  assert.equal(await p.locator('#crop-h').inputValue(), '60');
  await p.locator('#cropCancel').click();
  await p.locator('#language').selectOption('zh-Hant');
  await p.locator('[data-crop="f"]').click();
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.locator('#dialogtitle').innerText(), '裁切與對位確認');
  for (const width of [1440, 390]) {
    await p.setViewportSize({ width, height: 900 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(
      await p.evaluate(
        () =>
          document.querySelector('#dialog').scrollWidth <=
          document.querySelector('#dialog').clientWidth,
      ),
      true,
    );
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.screenshot({ path: 'qa/clipboard-crop-proof.png' });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await b.close();
  console.log(
    'Real Ctrl+V, channel targeting, crop/overlay review, cancel, invalid crops, exact pixels, ROI reset with the scale kept, session and responsive layouts passed',
  );
})().catch(e => {
  console.error(e);
  process.exit(1);
});
