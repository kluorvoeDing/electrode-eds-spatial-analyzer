// Regenerates the screenshots used by README.md into docs/images/. Every image on screen is drawn
// here from a seeded synthetic electrode; no experimental data is involved. Run after a UI change:
//   npm run docs:shots
const { chromium } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path');

const VIEW = { width: 1120, height: 720 },
  OUT = path.resolve('docs/images'),
  TMP = path.resolve('qa/readme');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1.25,
    offline: true,
  });
  const p = await context.newPage();
  p.on('pageerror', e => {
    throw e;
  });
  await p.goto('file://' + path.resolve('dist/Electrode_EDS_Analyzer.html'));

  // Report-style element maps and a micrograph at twice the map magnification, all of the same
  // synthetic field: round active-material particles, small additive clusters in the gaps and a
  // binder film on the particle surfaces.
  const fixtures = await p.evaluate(() => {
    const PAGE = '#eef2f8',
      MAP = { w: 320, h: 120 },
      FIELD = { w: 336, h: 200 },
      WINDOW = { x: 8, y: 40 };
    let seed = 20261014;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let v = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
      return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
    };
    const particles = [],
      clusters = [];
    for (let tries = 0; tries < 6000 && particles.length < 70; tries++) {
      const q = { x: random() * FIELD.w, y: random() * FIELD.h, r: 7 + random() * 10 };
      if (particles.every(o => Math.hypot(o.x - q.x, o.y - q.y) > o.r + q.r + 1.5))
        particles.push(q);
    }
    for (let tries = 0; tries < 9000 && clusters.length < 130; tries++) {
      const q = { x: random() * FIELD.w, y: random() * FIELD.h, r: 1.5 + random() * 3 };
      if (particles.every(o => Math.hypot(o.x - q.x, o.y - q.y) > o.r + q.r * 0.5))
        clusters.push(q);
    }
    // Signed distance to the nearest particle surface (negative inside a particle).
    const surface = (x, y) =>
        particles.reduce((d, o) => Math.min(d, Math.hypot(o.x - x, o.y - y) - o.r), Infinity),
      inCluster = (x, y) => clusters.some(o => Math.hypot(o.x - x, o.y - y) <= o.r);
    const counts = (signal, colour) => (x, y) => {
      const lit = random() < (signal(x + WINDOW.x, y + WINDOW.y) ? 0.82 : 0.035),
        level = lit ? 0.5 + 0.5 * random() : 0;
      return colour.map(c => Math.round(c * level));
    };
    const elements = {
      Ni: counts((x, y) => surface(x, y) < 0, [230, 0, 230]),
      Fe: counts(inCluster, [255, 140, 0]),
      F: counts(
        (x, y) => {
          const d = surface(x, y);
          return (d >= 0 && d < 2.2) || (inCluster(x, y) && random() < 0.4);
        },
        [0, 130, 255],
      ),
    };
    const canvas = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = PAGE;
      ctx.fillRect(0, 0, w, h);
      return [c, ctx];
    };
    const paint = (ctx, at, w, h, colour) => {
      const image = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) image.data.set([...colour(x, y), 255], (y * w + x) * 4);
      ctx.putImageData(image, at.x, at.y);
    };
    const png = c => c.toDataURL('image/png').split(',')[1];
    // Element report: title, label, the map, and a scale bar (50 px = 10 µm, so 0.2 µm / pixel).
    const report = (name, w, h, at) => {
      const [c, ctx] = canvas(w, h);
      ctx.fillStyle = '#222';
      ctx.font = '15px sans-serif';
      ctx.fillText(`${name} Kα1 (synthetic)`, at.x, 26);
      ctx.fillStyle = '#777';
      ctx.font = '10px sans-serif';
      ctx.fillText('Synthetic demo · not measured data', at.x, at.y - 8);
      paint(ctx, at, MAP.w, MAP.h, elements[name]);
      ctx.fillStyle = '#000';
      ctx.fillRect(at.x, at.y + MAP.h + 12, 50, 3);
      ctx.font = '10px sans-serif';
      ctx.fillText('10µm', at.x + 56, at.y + MAP.h + 17);
      return png(c);
    };
    const sem = () => {
      const w = FIELD.w * 2,
        h = FIELD.h * 2,
        frame = {
          left: WINDOW.x * 2 - 1,
          top: WINDOW.y * 2 - 1,
          right: (WINDOW.x + MAP.w) * 2,
          bottom: (WINDOW.y + MAP.h) * 2,
        },
        [c, ctx] = canvas(w, h + 30);
      paint(ctx, { x: 0, y: 0 }, w, h, (x, y) => {
        const onFrame =
          ((y === frame.top || y === frame.bottom) && x >= frame.left && x <= frame.right) ||
          ((x === frame.left || x === frame.right) && y >= frame.top && y <= frame.bottom);
        if (onFrame) return [245, 245, 245];
        const fx = x / 2,
          fy = y / 2,
          d = surface(fx, fy),
          grain = Math.round((random() - 0.5) * 18),
          grey =
            d < 0 ? 132 + 45 * Math.min(1, -d / 6) + grain : (inCluster(fx, fy) ? 92 : 42) + grain;
        return [grey, grey, grey];
      });
      ctx.fillStyle = '#222';
      ctx.font = '12px sans-serif';
      ctx.fillText('Synthetic micrograph · white frame = mapped area', 8, h + 20);
      return png(c);
    };
    return {
      'ni.png': report('Ni', 352, 216, { x: 16, y: 60 }),
      'fe.png': report('Fe', 350, 222, { x: 14, y: 66 }),
      'f.png': report('F', 362, 218, { x: 22, y: 62 }),
      'sem.png': sem(),
    };
  });
  for (const [name, base64] of Object.entries(fixtures))
    fs.writeFileSync(path.join(TMP, name), Buffer.from(base64, 'base64'));

  const idle = () => p.waitForFunction(() => !document.querySelector('#dialog').open && !busy);
  const shot = async (name, target = p, options = {}) => {
    await p.evaluate(() => {
      document.activeElement?.blur();
      document.querySelector('#controls').scrollTop = 0;
      return new Promise(resolve => requestAnimationFrame(() => resolve()));
    });
    await target.screenshot({ path: path.join(OUT, name), ...options });
    console.log(name);
  };
  const choose = async (key, name) => {
    await p.locator('[data-step="data"]').click();
    await p.locator(`[data-file="${key}"]`).setInputFiles(path.join(TMP, name));
    await p.locator('#cropSource').waitFor();
  };
  const confirm = async () => {
    await p.locator('#cropReviewed').check();
    await p.locator('#cropApply').click();
    await idle();
  };
  const dialog = p.locator('#dialog');

  await p.locator('#sample').fill('合成示範');
  await p.locator('#material').selectOption('LFP');
  await shot('01-start.png');

  await choose('nmc', 'ni.png');
  await p.locator('#cropReviewed').check();
  await shot('02-crop.png', dialog);
  await p.locator('#cropApply').click();
  await idle();

  await choose('secondary', 'fe.png');
  await shot('03-crop-locked.png', dialog);
  await confirm();
  await choose('f', 'f.png');
  await confirm();

  // The micrograph dialog is taller than the others; give it room so nothing is scrolled away.
  await choose('sem', 'sem.png');
  await p.setViewportSize({ ...VIEW, height: 1100 });
  await shot('04-sem-fit.png', dialog);
  await p.setViewportSize(VIEW);
  await confirm();
  await p.locator('#channel').selectOption('sem');
  await shot('05-elements.png');

  // Region and calibration.
  await p.locator('#nextStep').click();
  await p.locator('#drawROI').click();
  const box = await p.locator('#canvas').boundingBox();
  await p.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.1);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.92, box.y + box.height * 0.9, { steps: 6 });
  await p.mouse.up();
  await p.locator('#calibration').fill('0.2');
  await p.locator('#calibration').press('Tab');
  await p.waitForFunction(() => !busy);
  await p.setViewportSize({ ...VIEW, height: 860 });
  await shot('06-roi.png');
  await p.setViewportSize(VIEW);

  await p.locator('#nextStep').click();
  await p.locator('#segChannel').selectOption('secondary');
  await p.waitForFunction(() => !busy);
  await shot('07-segment.png');

  await p.locator('#nextStep').click();
  await p.locator('#analyze').click();
  await p.waitForFunction(() => state.results && !busy);
  await shot('08-results.png');

  await p.locator('#export').click();
  await shot('09-export.png', dialog);
  await p.locator('#closeDialog').click();

  // One channel a pixel larger than the others: the notice above the image and its fix button.
  await p.locator('[data-step="data"]').click();
  await p.locator('[data-crop="nmc"]').click();
  await p.locator('#cropSource').waitFor();
  await p.locator('#cropLockSize').uncheck();
  await p.locator('#crop-w').fill('321');
  await p.locator('#crop-h').fill('121');
  await confirm();
  await p.locator('#notice').waitFor();
  await p.locator('#channel').selectOption('sem');
  await shot('10-notice.png', p, { clip: { x: 0, y: 0, width: VIEW.width, height: 470 } });

  await browser.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
