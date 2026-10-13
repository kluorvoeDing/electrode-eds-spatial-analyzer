const { chromium } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    offline: true,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage(),
    errors = [],
    external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    if (/^https?:/.test(r.url())) external.push(r.url());
  });
  await page.goto('file://' + path.resolve('dist/Electrode_EDS_Analyzer.html'));
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-Hant');
  assert.equal(await page.locator('#import').innerText(), '匯入');
  await page.locator('#demo').click();
  await page.waitForFunction(() => !busy && Object.keys(masks).length > 0);
  await page.locator('#sample').fill('中文樣品 A');
  await page.locator('#sample').dispatchEvent('change');
  await page.locator('[data-step="analyze"]').click();
  await page.locator('#analyze').click();
  await page.locator('#language').selectOption('en');
  await page.waitForFunction(() => state.results !== null && !busy);
  await page.locator('#addComparison').click();
  await page.locator('#showComparison').click();
  await page.locator('[data-key="note"]').fill('中文備註, unchanged');
  await page.locator('#closeDialog').click();
  await page.evaluate(() => {
    state.rois = [{ type: 'rect', x: 0, y: 0, w: 240, h: 240 }];
  });
  const before = await page.evaluate(() =>
    JSON.stringify({ state, revision, selected, display, opacity, masks, roi: effectiveROI }),
  );
  for (const step of ['data', 'roi', 'segment', 'analyze']) {
    await page.locator(`[data-step="${step}"]`).click();
    for (const lang of ['zh-Hant', 'en']) {
      await page.locator('#language').selectOption(lang);
      assert.equal(
        await page.evaluate(() =>
          JSON.stringify({ state, revision, selected, display, opacity, masks, roi: effectiveROI }),
        ),
        before,
      );
      assert.equal(await page.locator('html').getAttribute('lang'), lang);
    }
  }
  await page.locator('#language').selectOption('zh-Hant');
  await page.locator('#showComparison').click();
  assert.equal(await page.locator('[data-key="note"]').inputValue(), '中文備註, unchanged');
  assert.ok((await page.locator('#dialogtitle').innerText()).includes('比較'));
  await page.locator('#closeDialog').click();
  for (const id of ['settings', 'about', 'export']) {
    await page.locator('#' + id).click();
    assert.ok((await page.locator('#dialogtitle').innerText()).length > 0);
    await page.locator('#closeDialog').click();
  }
  await page.locator('footer .info').click();
  assert.ok((await page.locator('#tooltip').innerText()).includes('2D'));
  await page.locator('#language').selectOption('en');
  await page.locator('footer .info').click();
  assert.ok((await page.locator('#tooltip').innerText()).includes('spatial'));
  fs.mkdirSync('qa', { recursive: true });
  for (const lang of ['zh-Hant', 'en']) {
    await page.locator('#language').selectOption(lang);
    const download = page.waitForEvent('download');
    await page.locator('#save').click();
    await (await download).saveAs(path.resolve(`qa/language-${lang}.json`));
    const session = JSON.parse(fs.readFileSync(`qa/language-${lang}.json`));
    assert.equal(session.uiLanguage, lang);
    await page.locator('#language').selectOption(lang === 'en' ? 'zh-Hant' : 'en');
    await page.locator('#sessionFile').setInputFiles(path.resolve(`qa/language-${lang}.json`));
    await page.waitForFunction(() => !busy && state.results !== null);
    await page.waitForFunction(l => language === l, lang);
    assert.equal(await page.evaluate(() => state.sample), '中文樣品 A');
    assert.equal(await page.evaluate(() => state.comparison[0].note), '中文備註, unchanged');
  }
  const old = JSON.parse(fs.readFileSync('qa/language-en.json'));
  delete old.uiLanguage;
  fs.writeFileSync('qa/language-legacy.json', JSON.stringify(old));
  await page.locator('#language').selectOption('zh-Hant');
  await page.locator('#sessionFile').setInputFiles(path.resolve('qa/language-legacy.json'));
  await page.waitForFunction(() => !busy && state.results !== null);
  await page.waitForFunction(
    () =>
      document.querySelector('#status').textContent.includes('重新計算') ||
      document.querySelector('#status').textContent.includes('recomputed'),
  );
  assert.equal(await page.locator('#language').inputValue(), 'zh-Hant');
  await page.evaluate(() => status('ROI 為空。', true));
  assert.equal(await page.locator('#status').innerText(), '分析區域為空。');
  await page.locator('#language').selectOption('en');
  assert.equal(await page.locator('#status').innerText(), 'ROI is empty.');
  for (const width of [1440, 1100, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const lang of ['en', 'zh-Hant']) {
      await page.locator('#language').selectOption(lang);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `${lang} overflow at ${width}`,
      );
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await browser.close();
  console.log(
    'Language switching, state preservation, bilingual sessions, legacy compatibility and responsive layouts passed',
  );
})().catch(e => {
  console.error(e);
  process.exit(1);
});
