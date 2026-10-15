// Binder and carbon are reported like the secondary phase: tabs per element, grid labels and
// trend charts that follow the tab, and a reference electrode without a secondary map.
const { chromium } = require('playwright');
const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  path = require('node:path');
fs.mkdirSync('qa', { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    offline: true,
    acceptDownloads: true,
  });
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await p.goto('file://' + path.resolve('dist/Electrode_EDS_Analyzer.html'));
  await p.locator('#language').selectOption('en');

  // The empty page says where to start and offers the example, labelled as generated data.
  assert.match(await p.locator('#empty').textContent(), /Start with the first element map/);
  assert.match(await p.locator('#empty').textContent(), /not a measurement/);
  // Nothing to check before the main-phase map is in: the way on waits and says why.
  assert.equal(await p.locator('#nextStep').isDisabled(), true);
  assert.match(await p.locator('.foot-hint').textContent(), /Load the main-phase map/);
  await p.locator('#demo').click();
  await p.waitForFunction(() => !busy && Object.keys(masks).length === 4);
  assert.equal(await p.locator('#empty').isVisible(), false);
  // Once images are loaded the example sits in the menu and asks before replacing them.
  let asked = 0;
  p.once('dialog', d => {
    asked++;
    d.dismiss();
  });
  await p.locator('#more').click();
  await p.locator('#demoMenu').click();
  assert.equal(asked, 1);
  assert.equal(await p.evaluate(() => Object.keys(state.channels).length), 5);

  // On the mask step, unticking an element hides its mask so overlapping colours can be read.
  await p.locator('[data-step="segment"]').click();
  await p.waitForFunction(() => !busy);
  assert.equal(await p.locator('#maskLabel .swatch').count(), 4);
  await p.locator('[data-maskshow="c"]').uncheck();
  await p.locator('[data-maskshow="f"]').uncheck();
  assert.equal(await p.locator('#maskLabel').textContent(), 'Ni2nd phase');
  await p.locator('[data-maskshow="c"]').check();
  await p.locator('[data-maskshow="f"]').check();
  await p.locator('[data-step="data"]').click();
  // Switching views never moves the image: the toolbar keeps one height whatever it lists.
  for (const [width, lang] of [
    [1280, 'zh-Hant'],
    [1366, 'en'],
  ]) {
    await p.setViewportSize({ width, height: 768 });
    await p.locator('#language').selectOption(lang);
    const top = async view => {
      await p.locator(`[data-display="${view}"]`).click();
      return (await p.locator('#canvas').boundingBox()).y;
    };
    const y = await top('elements');
    for (const view of ['overlay', 'original', 'mask', 'elements'])
      assert.equal(await top(view), y, `${view} at ${width} ${lang}`);
  }
  await p.locator('#language').selectOption('en');
  // The results column belongs to the analysis step.
  assert.equal(await p.locator('aside.right').isVisible(), false);
  await p.locator('[data-step="analyze"]').click();
  await p.waitForFunction(() => state.results && !busy);
  assert.equal(await p.locator('aside.right').isVisible(), true);
  assert.deepEqual(await p.locator('[data-metric]').allTextContents(), [
    'Secondary phase',
    'Binder F',
    'Carbon C',
  ]);

  const tiles = p.locator('#gridOverlay .tile'),
    labels = key =>
      p.evaluate(
        key =>
          state.results.tiles.map(t =>
            (
              100 * (key === 'secondary' ? t.fraction : key === 'f' ? t.fFraction : t.cFraction)
            ).toFixed(1),
          ),
        key,
      );
  assert.deepEqual(await tiles.allTextContents(), await labels('secondary'));

  // Carbon: grid labels, figures and both trend charts switch to it.
  await p.locator('[data-metric="c"]').click();
  assert.deepEqual(await tiles.allTextContents(), await labels('c'));
  const carbon = await p.evaluate(() => state.results.elements.c);
  assert.equal(
    (await p.locator('#results .kpi-value').first().textContent()).trim(),
    (carbon.areaFraction * 100).toFixed(2) + '%',
  );
  // The demo's carbon dots grow to the right: the column trend rises, the rows stay level.
  assert.ok(carbon.columns.every((v, i, a) => !i || v >= a[i - 1]));
  assert.ok(carbon.columnCV > 0.1 && carbon.rowCV < 1e-9);
  assert.match(await p.locator('#trends').textContent(), /Carbon C: share in each column and row/);
  // Five thin lines per chart (one per row or column of cells) and the thick whole-column line.
  assert.equal(await p.locator('[data-axis="columns"] .series').count(), 5);
  assert.equal(await p.locator('[data-axis="rows"] .series').count(), 5);
  assert.equal(await p.locator('[data-axis="columns"] .mean-dot').count(), 5);
  const caption = () => p.locator('[data-axis="columns"] .val-label').textContent(),
    valueRow = () => p.locator('[data-axis="columns"] .val').allTextContents();
  assert.equal(await caption(), 'All');
  assert.deepEqual(
    await valueRow(),
    carbon.columns.map(v => (v * 100).toFixed(1)),
  );
  // Each value sits straight under its point.
  const xs = await p
    .locator('[data-axis="columns"] .val')
    .evaluateAll(t => t.map(e => +e.getAttribute('x')));
  const dots = await p
    .locator('[data-axis="columns"] .mean-dot')
    .evaluateAll(t => t.map(e => +e.getAttribute('cx')));
  assert.deepEqual(xs, dots);
  // The image thirds are shaded with their shares on top, and their CV in the caption.
  assert.deepEqual(
    await p.locator('[data-axis="columns"] .band-label').allTextContents(),
    carbon.thirds.columns.map(
      (v, i) => `${['Left', 'Middle', 'Right'][i]} ${(v * 100).toFixed(1)}%`,
    ),
  );
  assert.match(
    await p.locator('[data-axis="rows"] figcaption').textContent(),
    new RegExp(`Thirds CV ${carbon.thirds.rowCV.toFixed(3)}`),
  );
  // The image says what the numbers in its cells are.
  assert.equal(
    await p.locator('#gridCaption').textContent(),
    'Numbers in the cells: Carbon C Area fraction (%)',
  );
  // Pointing at a thin line names it, lists its values and marks its cells on the image.
  await p.locator('[data-axis="columns"] .series[data-series="2"]').dispatchEvent('mouseenter');
  assert.deepEqual(
    await p.locator('#gridOverlay .tile.hot').evaluateAll(t => t.map(e => e.dataset.row)),
    ['2', '2', '2', '2', '2'],
  );
  assert.match(await caption(), /^Row 3$/);
  await p.locator('[data-axis="columns"] .series[data-series="2"]').dispatchEvent('mouseleave');
  assert.equal(await p.locator('#gridOverlay .tile.hot').count(), 0);
  // Picking a cell marks its row and column in the charts and shows that cell's share.
  const box = await tiles.nth(7).boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(
    await p.locator('[data-axis="columns"] .series.picked').getAttribute('data-series'),
    '1',
  );
  assert.equal(
    await p.locator('[data-axis="rows"] .series.picked').getAttribute('data-series'),
    '2',
  );
  assert.equal(await caption(), 'Row 2');
  assert.match(await p.locator('#results .scope').textContent(), /Row 2 · column 3/);
  // The binder tab carries its own spread figures and its relation to the secondary phase.
  await p.locator('[data-metric="f"]').click();
  await p.locator('#regionAll').click();
  assert.match(await p.locator('#results').textContent(), /Spread by direction/);
  assert.match(await p.locator('#results').textContent(), /Thirds CV/);
  assert.match(await p.locator('#results').textContent(), /With the secondary phase/);
  // The overlay shows the main phase and the element on show.
  assert.equal(await p.locator('#maskLabel').textContent(), 'NiF');
  await p.screenshot({ path: 'qa/elements-analysis.png' });

  // The full sample goes into the comparison before the reference is analysed.
  await p.locator('#addComparison').click();
  // A reference electrode without an additive: binder and carbon are still analysed.
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-remove="secondary"]').click();
  await p.locator('[data-step="analyze"]').click();
  await p.waitForFunction(() => state.results && !busy);
  assert.equal(await p.evaluate(() => state.results.secondaryAreaFraction), null);
  assert.deepEqual(await p.locator('[data-metric]').allTextContents(), ['Binder F', 'Carbon C']);
  assert.equal(await p.locator('[data-metric].on').textContent(), 'Binder F');
  assert.doesNotMatch(await p.locator('#results').textContent(), /With the secondary phase/);
  // Renaming keeps the results; results, CSV and comparison all accept the missing secondary phase.
  await p.locator('#sample').fill('Reference');
  assert.ok(await p.evaluate(() => state.results?.trace.sample === 'Reference'));
  await p.locator('#addComparison').click();
  // The same result is not added twice.
  await p.locator('#addComparison').click();
  assert.match(await p.locator('#status').textContent(), /already in the comparison/);
  await p.locator('#showComparison').click();
  assert.equal(await p.locator('#dialog table tr').count(), 3);
  // The comparison chart: one point per sample with the figure, by sample or against a typed
  // value; a value with a unit is not guessed at.
  assert.equal(await p.locator('#compareY').inputValue(), 'f:cv');
  assert.equal(await p.locator('#compareChart circle').count(), 2);
  await p.locator('#compareY').selectOption('secondary:cv');
  assert.equal(await p.locator('#compareChart circle').count(), 1);
  assert.match(await p.locator('#compareNote').textContent(), /1 of 2 samples lack this figure/);
  await p.locator('#compareY').selectOption('c:lr');
  await p.locator('#compareX').selectOption('peel');
  await p.locator('[data-comp="0"][data-key="peel"]').fill('12.5');
  await p.locator('[data-comp="1"][data-key="peel"]').fill('12 N/m');
  assert.equal(await p.locator('#compareChart circle').count(), 1);
  assert.match(
    await p.locator('#compareNote').textContent(),
    /Not a plain number, left out: Reference/,
  );
  assert.match(await p.locator('#compareNote').textContent(), /n = 1/);
  assert.doesNotMatch(await p.locator('#compareNote').textContent(), /Pearson/);
  await p.locator('#closeDialog').click();
  // The report figure: 180 mm at 300 dpi, marked as such for office software; drawn here with
  // no secondary phase and no calibration.
  await p.locator('#export').click();
  const [report] = await Promise.all([
    p.waitForEvent('download'),
    p.locator('#exportReport').click(),
  ]);
  const png = fs.readFileSync(await report.path()),
    at = png.indexOf('pHYs');
  assert.equal(report.suggestedFilename(), 'Reference.report.zh.png');
  assert.equal(png.readUInt32BE(16), 2126);
  assert.ok(png.readUInt32BE(20) > 1000);
  assert.equal(at, 37);
  assert.deepEqual(
    [png.readUInt32BE(at + 4), png.readUInt32BE(at + 8), png[at + 12]],
    [11811, 11811, 1],
  );
  // The English version comes from the same button row whatever the interface language, and
  // leaves the interface as it was.
  await p.locator('#closeDialog').click();
  await p.locator('#language').selectOption('zh-Hant');
  await p.locator('#export').click();
  const [english] = await Promise.all([
    p.waitForEvent('download'),
    p.locator('#exportReportEn').click(),
  ]);
  assert.equal(english.suggestedFilename(), 'Reference.report.en.png');
  assert.equal(await p.evaluate(() => language), 'zh-Hant');
  assert.equal(await p.locator('#status').textContent(), '已匯出報告圖');
  await p.locator('#closeDialog').click();
  await p.locator('#language').selectOption('en');
  const csv = await p.evaluate(() => {
    const row = flatResult(state.results, state.results.trace);
    return { keys: Object.keys(row), median: row.MedianDistance, f: row.FUniformityCV };
  });
  assert.equal(csv.median, undefined);
  assert.ok(Number.isFinite(csv.f));
  // New columns come after every earlier one.
  assert.ok(csv.keys.indexOf('FAreaFraction') > csv.keys.indexOf('Warnings'));
  // Without the main phase nothing can be analysed, and the step says why.
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-remove="nmc"]').click();
  await p.locator('[data-step="analyze"]').click();
  assert.match(await p.locator('#analysisWarnings').textContent(), /Load the main-phase map/);
  assert.match(await p.locator('#results').textContent(), /Load the main-phase map/);

  // Loaded from the menu on the analysis step, the example is analysed at once.
  await p.locator('[data-step="analyze"]').click();
  p.once('dialog', d => d.accept());
  await p.locator('#more').click();
  await p.locator('#demoMenu').click();
  await p.waitForFunction(() => state.results && !busy);
  // An empty or negative binder distance is refused and the field shows the value in use.
  const radiusBefore = await p.evaluate(() => state.settings.binderRadius);
  await p.locator('#radius').fill('');
  await p.locator('#radius').dispatchEvent('change');
  assert.equal(await p.locator('#radius').inputValue(), String(radiusBefore));
  assert.equal(await p.evaluate(() => state.settings.binderRadius), radiusBefore);
  // Escape closes the menu; resetting the workspace asks first, and declining keeps everything.
  await p.locator('#more').click();
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#moreMenu').isVisible(), false);
  await p.locator('#more').click();
  await p.locator('#settings').click();
  p.once('dialog', d => d.dismiss());
  await p.locator('#clearData').click();
  assert.ok(
    await p.evaluate(() => Object.keys(state.channels).length === 5 && state.comparison.length > 0),
  );
  await p.locator('#closeDialog').click();
  // The first real image after the example replaces all of it: no example map is left behind.
  await p.locator('[data-step="data"]').click();
  p.once('dialog', d => d.accept());
  await p.locator('#more').click();
  await p.locator('#demoMenu').click();
  await p.waitForFunction(() => !busy && Object.keys(state.channels).length === 5);
  await p.evaluate(async () => {
    const csv = Array.from({ length: 20 }, () => Array(30).fill(1).join(',')).join('\n');
    await loadFile(new File([csv], 'real-ni.csv'), 'nmc');
  });
  assert.deepEqual(await p.evaluate(() => Object.keys(state.channels)), ['nmc']);
  // Small cells: 8 × 8 on a 254 × 94 map (median 384 px) is flagged, 5 × 5 (median 969) is not.
  assert.deepEqual(
    await p.evaluate(() =>
      [384, 969].map(area => cellSize({ tiles: Array(25).fill({ area }) }).small),
    ),
    [true, false],
  );
  // Typed values that cannot be held as numbers are reported, not plotted as 0 or infinity.
  assert.deepEqual(
    await p.evaluate(() => ['1e400', '1e-400', '0.0', '12.5'].map(v => parseMeasured(v))),
    [{ value: null, invalid: true }, { value: null, invalid: true }, { value: 0 }, { value: 12.5 }],
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    'Per-element figures, trend charts, example entry points and no-additive samples passed',
  );
})().catch(e => {
  console.error(e);
  process.exit(1);
});
