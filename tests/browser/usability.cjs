// The everyday path with report-style images (title, label, scale bar): automatic crop, one grid
// size for every channel, a visible way out of a size mismatch, and step guidance.
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

  // Fixtures drawn in the page and written to disk so they go through the real file inputs.
  const fixtures = await p.evaluate(() => {
    const PAGE = [238, 242, 248],
      MAP = { w: 100, h: 50 };
    const draw = (w, h, colour) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d'),
        image = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) image.data.set([...colour(x, y), 255], (y * w + x) * 4);
      ctx.putImageData(image, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    };
    const patterns = {
      nmc: (x, y) => (Math.hypot((x % 25) - 12, (y % 25) - 12) < 8 ? [200, 0, 200] : [0, 0, 0]),
      secondary: (x, y) => (x % 25 < 4 && y % 25 < 5 ? [255, 140, 0] : [0, 0, 0]),
      f: (x, y) => (x % 25 < 6 && y % 25 < 7 ? [0, 120, 255] : [0, 0, 0]),
    };
    // Element report: title strokes, a grey label above the map, the map, a scale bar.
    const report = (w, h, at, pattern) =>
      draw(w, h, (x, y) => {
        if (y === 6 && x > 30 && x < 70 && x % 2) return [20, 20, 20];
        if (y === at.y - 3 && x >= at.x && x < at.x + 30) return [150, 150, 150];
        if (y === h - 9 && x > 6 && x < 34) return [0, 0, 0];
        const inMap = x >= at.x && x < at.x + MAP.w && y >= at.y && y < at.y + MAP.h;
        return inMap ? pattern(x - at.x, y - at.y) : PAGE;
      });
    // Micrograph at about twice the map magnification, with the bright mapped-area frame.
    const frame = { left: 4, right: 206, top: 50, bottom: 152 };
    const sem = draw(230, 190, (x, y) => {
      if (x < 1 || x > 227 || y > 170) return PAGE;
      const onFrame =
        ((y === frame.top || y === frame.bottom) && x >= frame.left && x <= frame.right) ||
        ((x === frame.left || x === frame.right) && y >= frame.top && y <= frame.bottom);
      return onFrame ? [235, 235, 235] : Array(3).fill(95 + ((x * 7 + y * 13) % 30));
    });
    return {
      'report-ni.png': report(140, 120, { x: 12, y: 40 }, patterns.nmc),
      'report-fe.png': report(138, 126, { x: 9, y: 45 }, patterns.secondary),
      'report-f.png': report(150, 118, { x: 20, y: 42 }, patterns.f),
      'report-sem.png': sem,
    };
  });
  for (const [name, base64] of Object.entries(fixtures))
    fs.writeFileSync(path.join('qa', name), Buffer.from(base64, 'base64'));

  const statusText = () => p.locator('#status').textContent();
  const notice = () => p.locator('#notice');
  const dialogClosed = () =>
    p.waitForFunction(() => !document.querySelector('#dialog').open && !busy);
  const rect = () => p.evaluate(() => ({ ...imageImport.rect }));
  async function choose(key, name) {
    await p.locator('[data-step="data"]').click();
    await p.locator(`[data-file="${key}"]`).setInputFiles(path.resolve('qa', name));
    await p.locator('#cropSource').waitFor();
  }
  async function confirm() {
    await p.locator('#cropReviewed').check();
    await p.locator('#cropApply').click();
    await dialogClosed();
  }
  const pixel = (x, y) =>
    p.evaluate(
      ([x, y]) =>
        Array.from(
          document.querySelector('#canvas').getContext('2d').getImageData(x, y, 1, 1).data,
        ),
      [x, y],
    );

  // 1. The first report opens the review with its map already selected; nothing is imported yet.
  assert.match(
    await p.locator('.hint').first().textContent(),
    /map area and the scale bar are found/,
  );
  await choose('nmc', 'report-ni.png');
  assert.equal(await p.evaluate(() => Object.keys(state.channels).length), 0);
  assert.deepEqual(await rect(), { x: 12, y: 40, w: 100, h: 50 });
  assert.equal(await p.locator('#cropLockSize').count(), 0);
  assert.match(await p.locator('#cropSizeStatus').textContent(), /Region suggested automatically/);
  assert.equal(await statusText(), 'Review the crop · NMC / Ni');
  // The scale bar is still on the source image: it is found, and typing its printed length
  // gives the scale. Nothing has to be measured by hand.
  assert.match(
    await p.locator('#cropScaleStatus').textContent(),
    /^Scale bar: 27 px · enter the length printed next to it\.$/,
  );
  await p.locator('#cropScaleUm').fill('13.5');
  assert.match(await p.locator('#cropScaleStatus').textContent(), /27 px → 0\.5000 μm \/ pixel$/);
  await confirm();
  assert.equal(await p.evaluate(() => state.settings.calibration), 0.5);
  assert.deepEqual(await p.evaluate(() => state.channels.nmc.importInfo.scaleBar), {
    x0: 6.5,
    y0: 111,
    x1: 33.5,
    y1: 111,
    um: 13.5,
  });
  assert.match(await statusText(), /0\.5000 μm \/ pixel/);
  assert.deepEqual(await p.evaluate(() => [state.channels.nmc.w, state.channels.nmc.h]), [100, 50]);
  assert.equal(await p.evaluate(() => state.channels.nmc.importInfo.kind), 'file');
  assert.equal(await p.evaluate(() => state.channels.nmc.name), 'report-ni.png');

  // 2. Later reports are found the same way and held to the grid size: two clicks per channel.
  await choose('secondary', 'report-fe.png');
  assert.deepEqual(await rect(), { x: 9, y: 45, w: 100, h: 50 });
  assert.equal(await p.locator('#cropLockSize').isChecked(), true);
  assert.match(
    await p.locator('.crop-fit').textContent(),
    /Keep the analysis grid size \(100 × 50\)/,
  );
  await confirm();
  // A later image only reports what its bar comes to at the scale already set.
  assert.equal(await p.evaluate(() => state.settings.calibration), 0.5);
  await choose('f', 'report-f.png');
  assert.deepEqual(await rect(), { x: 20, y: 42, w: 100, h: 50 });
  assert.match(
    await p.locator('#cropScaleStatus').textContent(),
    /^Scale bar: 27 px ≈ 13\.5 μm · at the scale already set/,
  );
  // The ends can be clicked instead; a length that contradicts the current scale is flagged.
  const clickImage = async (x, y) => {
    const box = await p.locator('#cropSource').boundingBox();
    await p.mouse.click(
      box.x + ((x + 0.5) * box.width) / 150,
      box.y + ((y + 0.5) * box.height) / 118,
    );
  };
  await p.locator('#cropScalePick').click();
  assert.match(await p.locator('#cropScaleStatus').textContent(), /Click one end/);
  await clickImage(20, 100);
  assert.match(await p.locator('#cropScaleStatus').textContent(), /other end/);
  await clickImage(60, 100);
  assert.deepEqual(await rect(), { x: 20, y: 42, w: 100, h: 50 });
  assert.match(await p.locator('#cropScaleStatus').textContent(), /^Scale bar: 40 px ≈ 20\.0 μm/);
  await p.locator('#cropScaleUm').fill('40');
  assert.match(
    await p.locator('#cropScaleStatus').textContent(),
    /1\.000 μm \/ pixel · differs from the scale already set \(0\.5000\)/,
  );
  assert.equal(
    await p.locator('#cropScaleStatus').evaluate(e => e.classList.contains('warning')),
    true,
  );
  await p.locator('#cropScaleUm').fill('');
  // "Detect" brings the selection back after it has been moved.
  await p.locator('[data-nudge="1,0"]').click({ modifiers: ['Shift'] });
  assert.deepEqual(await rect(), { x: 30, y: 42, w: 100, h: 50 });
  await p.locator('#cropDetect').click();
  assert.deepEqual(await rect(), { x: 20, y: 42, w: 100, h: 50 });
  await confirm();
  assert.equal(await p.evaluate(() => sizeError()), false);
  assert.equal(await notice().isVisible(), false);

  // The scale mark sits under the image, in round micrometres, and matches the scale.
  assert.equal(await p.evaluate(() => state.settings.calibration), 0.5);
  assert.equal(await p.locator('#scaleMark').isVisible(), true);
  const markText = await p.locator('#scaleMark').textContent(),
    markWidth = (await p.locator('#scaleMark .bar').boundingBox()).width;
  assert.match(markText, /^(1|2|5)0* μm$/);
  assert.ok(
    Math.abs(markWidth - (parseFloat(markText) / 0.5) * (await p.evaluate(() => zoom))) < 1,
  );
  // The scale bar and the averaging radius survive a save and reload; bad values are refused.
  const roundTrip = await p.evaluate(() => {
    const saved = JSON.parse(JSON.stringify(snapshot())),
      loaded = normalizeSession(saved),
      refuses = change => {
        const copy = JSON.parse(JSON.stringify(saved));
        change(copy);
        try {
          normalizeSession(copy);
          return false;
        } catch (_) {
          return true;
        }
      };
    return {
      bar: loaded.channels.nmc.importInfo.scaleBar,
      denoise: loaded.seg.nmc.denoise,
      badRadius: refuses(c => (c.seg.nmc.denoise = 9)),
      badBar: refuses(c => (c.channels.nmc.importInfo.scaleBar.um = 0)),
    };
  });
  assert.deepEqual(roundTrip, {
    bar: { x0: 6.5, y0: 111, x1: 33.5, y1: 111, um: 13.5 },
    denoise: 2,
    badRadius: true,
    badBar: true,
  });

  // 3. The micrograph opens on the frame's inside, scaled to the grid whatever the reference is.
  await choose('sem', 'report-sem.png');
  assert.equal(await p.locator('#cropFit').isChecked(), true);
  assert.deepEqual(await rect(), { x: 5, y: 51, w: 201, h: 101 });
  assert.match(await p.locator('#cropSizeStatus').textContent(), /201 × 101 → 100 × 50 px/);
  await p.locator('#cropReference').selectOption('f');
  assert.match(await p.locator('#cropSizeStatus').textContent(), /201 × 101 → 100 × 50 px/);
  await confirm();
  assert.equal(await p.evaluate(() => sizeError()), false);
  assert.deepEqual(await p.evaluate(() => [state.channels.sem.w, state.channels.sem.h]), [100, 50]);

  // 4. The main view shows the element maps in their own colours over the grey micrograph.
  assert.equal(await p.evaluate(() => display), 'elements');
  assert.equal(await p.locator('#channel').inputValue(), 'sem');
  assert.equal(await p.locator('[data-display="elements"]').textContent(), 'Elements');
  // Only the phase under study is laid over the micrograph to begin with.
  const chips = p.locator('#elementChips');
  assert.equal(await chips.isVisible(), true);
  const ticked = () =>
    chips.locator('input:checked').evaluateAll(boxes => boxes.map(b => b.dataset.element));
  assert.deepEqual(await ticked(), ['secondary']);
  const bare = await pixel(22, 20), // no element here
    iron = await pixel(1, 1), // inside a secondary-phase block
    hidden = await pixel(12, 12); // centre of a Ni disc, not shown yet
  const isGrey = c => c[0] === c[1] && c[1] === c[2];
  assert.ok(isGrey(bare) && bare[0] > 60, `grey ${bare}`);
  assert.ok(iron[0] > iron[2] + 60, `orange ${iron}`);
  assert.ok(isGrey(hidden), `grey ${hidden}`);
  // Ticking another element adds it; with nothing ticked only the micrograph remains.
  await chips.locator('[data-element="nmc"]').check();
  const nickel = await pixel(12, 12);
  assert.ok(nickel[0] > nickel[1] + 60 && nickel[2] > nickel[1] + 60, `magenta ${nickel}`);
  await chips.locator('[data-element="nmc"]').uncheck();
  await chips.locator('[data-element="secondary"]').uncheck();
  assert.deepEqual(await ticked(), []);
  assert.ok(isGrey(await pixel(1, 1)) && isGrey(await pixel(12, 12)));
  await chips.locator('[data-element="secondary"]').check();
  assert.deepEqual(await pixel(1, 1), iron);
  // The other views do not show the element choices.
  await p.locator('[data-display="original"]').click();
  assert.equal(await chips.isVisible(), false);
  await p.locator('[data-display="elements"]').click();
  await p.locator('#channel').selectOption('sem');
  await p.screenshot({ path: 'qa/usability-elements.png' });

  // 4b. Micrograph first, maps second: confirming the first map leads straight into scaling SEM.
  // Re-cropping keeps the scale, whichever channel it is: the length typed for one image is
  // remembered there, and an image cropped again from the same source cannot change μm / pixel.
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-crop="nmc"]').click();
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.locator('#cropScaleUm').inputValue(), '13.5');
  await p.locator('[data-nudge="1,0"]').click();
  await confirm();
  assert.equal(await p.evaluate(() => state.settings.calibration), 0.5);
  await p.locator('[data-crop="secondary"]').click();
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.locator('#cropScaleUm').inputValue(), '');
  await p.locator('[data-nudge="0,1"]').click();
  await confirm();
  assert.equal(await p.evaluate(() => state.settings.calibration), 0.5);
  assert.equal(await p.locator('#scaleMark').isVisible(), true);
  // A different image put in the same channel is new evidence: without its own bar length the
  // scale is dropped rather than assumed.
  await choose('secondary', 'report-f.png');
  assert.match(
    await p.locator('#cropScaleStatus').textContent(),
    /≈ 13\.5 μm .* Replacing this image clears the scale; type the length to keep it\.$/,
  );
  assert.equal(
    await p.locator('#cropScaleStatus').evaluate(e => e.classList.contains('warning')),
    true,
  );
  await confirm();
  assert.equal(await p.evaluate(() => state.settings.calibration), null);
  // Typing the length keeps it.
  await choose('secondary', 'report-fe.png');
  await p.locator('#cropScaleUm').fill('13.5');
  await confirm();
  assert.equal(await p.evaluate(() => state.settings.calibration), 0.5);
  // The micrograph is resampled, so its own bar says nothing about the grid: not offered there.
  await p.locator('[data-crop="sem"]').click();
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.locator('#cropScaleUm').count(), 0);
  await p.locator('#cropCancel').click();
  await p.locator('#more').click();
  await p.locator('#settings').click();
  p.once('dialog', d => d.accept());
  await p.locator('#clearData').click();
  await choose('sem', 'report-sem.png');
  assert.equal(await p.locator('#cropFit').count(), 0);
  assert.match(await p.locator('#cropSizeStatus').textContent(), /First channel/);
  await confirm();
  assert.deepEqual(
    await p.evaluate(() => [state.channels.sem.w, state.channels.sem.h]),
    [201, 101],
  );
  await choose('secondary', 'report-fe.png');
  assert.equal(await p.locator('#cropLockSize').count(), 0);
  assert.match(await p.locator('#cropSizeStatus').textContent(), /First channel/);
  await p.locator('#cropReviewed').check();
  await p.locator('#cropApply').click();
  await p.waitForFunction(() => imageImport?.key === 'sem');
  assert.equal(await p.locator('#cropFit').isChecked(), true);
  assert.deepEqual(await rect(), { x: 5, y: 51, w: 201, h: 101 });
  assert.match(await p.locator('#cropSizeStatus').textContent(), /201 × 101 → 100 × 50 px/);
  await confirm();
  assert.equal(await p.evaluate(() => sizeError()), false);
  await choose('nmc', 'report-ni.png');
  await confirm();
  await choose('f', 'report-f.png');
  await confirm();
  assert.equal(await p.evaluate(() => sizeError()), false);
  await p.locator('#channel').selectOption('sem');

  // 5. Three steps, each with one hint and a way forward: data, check masks, analyse.
  assert.deepEqual(await p.locator('nav [data-step] .label').allTextContents(), [
    'Data',
    'Check masks',
    'Analyze',
  ]);
  await p.locator('#nextStep').click();
  await p.waitForFunction(() => !busy);
  assert.deepEqual(await p.evaluate(() => [step, display]), ['segment', 'overlay']);
  assert.match(await p.locator('.hint').first().textContent(), /where each element is counted/);
  // Every mask is shown at once, in its channel colour, with the share of the area it covers.
  const ALL_MASKS = 'Ni2nd phaseF';
  assert.equal(await p.locator('#maskLabel').textContent(), ALL_MASKS);
  assert.equal(await p.locator('#maskLabel .swatch').count(), 3);
  assert.equal(await p.locator('.legend [data-coverage]').count(), 3);
  for (const key of ['nmc', 'secondary', 'f'])
    assert.match(
      await p.locator(`[data-coverage="${key}"]`).textContent(),
      /^Auto · \d+\.\d\d%$/,
      key,
    );
  // New work averages the count map before its threshold.
  assert.deepEqual(
    await p.evaluate(() => ANALYSIS_KEYS.map(k => state.seg[k].denoise)),
    [2, 2, 2, 2],
  );
  // Nothing has to be adjusted: the controls are folded away. Opened, they show one mask alone.
  assert.equal(await p.locator('#thresholdNumber').isVisible(), false);
  assert.equal(await p.locator('#segAdjust > summary').textContent(), 'Adjust a mask');
  await p.locator('#segAdjust > summary').click();
  assert.equal(await p.locator('#thresholdNumber').isVisible(), true);
  await p.locator('#segChannel').selectOption('nmc');
  assert.equal(await p.locator('#maskLabel').textContent(), 'Ni');
  assert.equal(await p.locator('#denoise').inputValue(), '2');
  assert.equal(await p.locator('#segAdvanced summary').textContent(), 'Advanced');
  for (const id of ['invert', 'fill', 'smooth', 'minObject'])
    assert.equal(await p.locator('#' + id).isVisible(), false, id);
  assert.equal(await p.locator('#ratio').count(), 0);
  await p.locator('#segAdvanced summary').click();
  await p.locator('#smooth').check();
  await p.waitForFunction(() => !busy);
  // An option in use keeps its section open and says so, also after coming back to the step.
  assert.equal(await p.locator('#segAdvanced summary').textContent(), 'Advanced (in use)');
  assert.equal(await p.locator('#segAdjust > summary').textContent(), 'Adjust a mask (in use)');
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-step="segment"]').click();
  assert.equal(await p.locator('#smooth').isVisible(), true);
  await p.locator('#smooth').uncheck();
  await p.waitForFunction(() => !busy);
  await p.locator('#segAdvanced summary').click();
  assert.equal(await p.locator('#smooth').isVisible(), false);
  await p.locator('#segAdjust > summary').click();
  assert.equal(await p.locator('#segAdjust > summary').textContent(), 'Adjust a mask');
  assert.equal(await p.locator('#maskLabel').textContent(), ALL_MASKS);

  // 5b. Arriving at the analysis runs it: the grid is on the image, each cell labelled with its
  //     local share of the secondary phase, and the panel shows the whole region.
  await p.locator('#nextStep').click();
  await p.waitForFunction(() => state.results && !busy);
  assert.equal(await p.evaluate(() => step), 'analyze');
  assert.equal(await p.locator('#nextStep').count(), 0);
  assert.equal(await p.locator('#analysisWarnings').textContent(), '');
  const tiles = p.locator('#gridOverlay .tile'),
    resultTiles = () => p.evaluate(() => state.results.tiles);
  assert.equal(await tiles.count(), 25);
  const computed = await resultTiles();
  assert.deepEqual(
    await tiles.allTextContents(),
    computed.map(t => (t.fraction * 100).toFixed(1)),
  );
  assert.deepEqual(
    computed.slice(0, 2).map(t => [t.x0, t.y0, t.x1, t.y1]),
    [
      [0, 0, 20, 10],
      [20, 0, 40, 10],
    ],
  );
  // The cells sit exactly on the pixels they were computed from.
  const canvasBox = await p.locator('#canvas').boundingBox(),
    lastBox = await tiles.nth(24).boundingBox();
  assert.ok(Math.abs(lastBox.x + lastBox.width - (canvasBox.x + canvasBox.width)) < 0.6);
  assert.ok(Math.abs(lastBox.y + lastBox.height - (canvasBox.y + canvasBox.height)) < 0.6);
  const panel = () => p.locator('#results').textContent(),
    headline = () => p.locator('#results .kpi-value').first().textContent();
  assert.match(await panel(), /Whole region/);
  assert.match(await panel(), /Uniformity CV/);
  assert.match(await panel(), /Share of the analysed area\./);
  assert.equal(await p.locator('#hist').count(), 1);
  const whole = await p.evaluate(() => state.results.secondaryAreaFraction);
  assert.equal((await headline()).trim(), (whole * 100).toFixed(2) + '%');
  // Clicking a cell shows that cell's values; clicking it again returns to the whole region.
  const clickTile = async n => {
    const box = await tiles.nth(n).boundingBox();
    await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  await clickTile(7);
  assert.equal(await p.evaluate(() => regionTile), 7);
  assert.match(await p.locator('#results .scope').textContent(), /Row 2 · column 3/);
  assert.equal((await headline()).trim(), (computed[7].fraction * 100).toFixed(2) + '%');
  assert.match(await panel(), /Spread figures exist for the whole region only/);
  assert.equal(await p.locator('#hist').count(), 0);
  assert.equal(await tiles.nth(7).evaluate(e => e.classList.contains('selected')), true);
  assert.ok(
    ['interparticleOccupancy', 'targetingEfficiency', 'distanceMedian', 'binderCoverage'].every(
      k => k in computed[7],
    ),
  );
  await clickTile(7);
  assert.equal(await p.evaluate(() => regionTile), null);
  assert.equal(await p.locator('#hist').count(), 1);
  await clickTile(12);
  await p.locator('#regionAll').click();
  assert.equal(await p.evaluate(() => regionTile), null);
  assert.equal(await p.locator('#gridOverlay .tile.selected').count(), 0);
  // Changing the grid analyses again; the optional area tool stays folded away.
  await p.locator('#grid').selectOption('3');
  await p.waitForFunction(() => state.results && !busy);
  assert.equal(await tiles.count(), 9);
  await p.locator('#grid').selectOption('5');
  await p.waitForFunction(() => state.results && !busy);
  assert.equal(await p.locator('#drawROI').isVisible(), false);
  assert.equal(
    await p.locator('#roiTools > summary').textContent(),
    'Limit the analysed area (optional)',
  );
  // The grid belongs to the analysis step only.
  await p.locator('[data-step="segment"]').click();
  assert.equal(await p.locator('#gridOverlay').isVisible(), false);
  // This workspace was started again without typing a scale-bar length: no scale, no mark.
  assert.equal(await p.evaluate(() => state.settings.calibration), null);
  assert.equal(await p.locator('#scaleMark').isVisible(), false);

  // 6. The reported failure: one channel a pixel larger than the rest. Everything stops, and the
  //    notice above the image names that channel and leads to the fix.
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-crop="nmc"]').click();
  await p.locator('#cropSource').waitFor();
  await p.locator('#cropLockSize').uncheck();
  for (const [k, v] of Object.entries({ w: 101, h: 51 }))
    await p.locator('#crop-' + k).fill(String(v));
  assert.match(await p.locator('#cropSizeStatus').textContent(), /Dimensions differ/);
  await confirm();
  assert.equal(await p.evaluate(() => sizeError()), true);
  assert.equal(await notice().isVisible(), true);
  assert.match(await notice().textContent(), /Calculation is paused: channel sizes differ\./);
  assert.match(await notice().textContent(), /Analysis grid 100 × 50 px/);
  assert.deepEqual(await notice().locator('[data-fix]').allTextContents(), [
    'Fix NMC / Ni 101 × 51',
  ]);
  assert.deepEqual(await p.evaluate(() => Object.keys(masks)), []);
  await p.locator('[data-step="analyze"]').click();
  assert.match(await p.locator('#analysisWarnings').textContent(), /Channel sizes differ/);
  await p.screenshot({ path: 'qa/usability-mismatch.png' });
  await notice().locator('[data-fix="nmc"]').click();
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.evaluate(() => imageImport.key), 'nmc');
  assert.equal(await p.locator('#cropLockSize').isChecked(), true);
  assert.deepEqual(await rect(), { x: 12, y: 40, w: 100, h: 50 });
  await confirm();
  assert.equal(await p.evaluate(() => sizeError()), false);
  assert.equal(await notice().isVisible(), false);
  assert.deepEqual(await p.evaluate(() => Object.keys(masks).sort()), ['f', 'nmc', 'secondary']);

  // 7. With sizes equal the rest of the workflow runs, here as a cross-section with LFP.
  await p.locator('[data-step="data"]').click();
  await p.locator('#view').selectOption('cross');
  await p.locator('#material').selectOption('LFP');
  await p.locator('[data-step="analyze"]').click();
  assert.equal(await p.locator('#analysisWarnings').textContent(), '');
  await p.locator('#analyze').click();
  await p.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Analysis complete'),
  );
  const result = await p.evaluate(() => ({
    zones: state.results.depth.zones.length,
    occupancy: state.results.interparticleOccupancy,
    binder: state.results.binderCoverage,
  }));
  assert.equal(result.zones, 3);
  assert.ok(result.occupancy > 0 && result.binder > 0);

  // 8. A micrograph that is the odd one out is fixed the same way, re-scaled to the current grid.
  await p.evaluate(() => {
    const sem = state.channels.sem;
    state.channels.sem = {
      ...sem,
      w: 50,
      h: 50,
      data: sem.data.slice(0, 2500),
      rgba: sem.rgba.slice(0, 10000),
    };
    renderChannels();
  });
  assert.deepEqual(await notice().locator('[data-fix]').allTextContents(), [
    'Fix SEM / BSE 50 × 50',
  ]);
  await notice().locator('[data-fix="sem"]').click();
  await p.locator('#cropSource').waitFor();
  assert.equal(await p.locator('#cropFit').isChecked(), true);
  assert.deepEqual(await rect(), { x: 5, y: 51, w: 201, h: 101 });
  await confirm();
  assert.equal(await notice().isVisible(), false);

  // 9. Other errors also appear above the image, and clear once things work again.
  fs.writeFileSync('qa/usability-bad.csv', '1,2\n3');
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-file="other"]').setInputFiles(path.resolve('qa/usability-bad.csv'));
  await p.waitForFunction(() => document.querySelector('#status').classList.contains('error'));
  assert.equal(await notice().isVisible(), true);
  assert.equal(await notice().textContent(), await statusText());
  assert.equal(await notice().locator('[data-fix]').count(), 0);
  await p.evaluate(() => preview());
  await p.waitForFunction(() => document.querySelector('#status').textContent === 'Mask updated');
  assert.equal(await notice().isVisible(), false);

  // A clean map already on the grid is still imported directly, without a dialog.
  await p.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 100;
    c.height = 50;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, 100, 50);
    ctx.fillStyle = 'yellow';
    ctx.fillRect(10, 10, 5, 5);
    const blob = await new Promise(resolve => c.toBlob(resolve));
    await loadFile(new File([blob], 'clean.png', { type: 'image/png' }), 'other');
  });
  assert.equal(await p.evaluate(() => document.querySelector('#dialog').open), false);
  assert.equal(await p.evaluate(() => state.channels.other.name), 'clean.png');

  // Traditional Chinese wording and narrow layout.
  await p.locator('#language').selectOption('zh-Hant');
  assert.equal(await p.locator('[data-display="elements"]').textContent(), '元素疊圖');
  assert.equal(await p.locator('[data-display="overlay"]').textContent(), '遮罩疊圖');
  await p.locator('[data-step="data"]').click();
  assert.match(await p.locator('.hint').textContent(), /自動找出有效區域與比例尺/);
  assert.equal(await p.locator('#nextStep').textContent(), '下一步：確認遮罩');
  await p.setViewportSize({ width: 390, height: 844 });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await browser.close();
  console.log(
    'Automatic crop and scale bar, grid-size lock, mismatch notice, coloured masks, grid cells and step guidance passed',
  );
})().catch(e => {
  console.error(e);
  process.exit(1);
});
