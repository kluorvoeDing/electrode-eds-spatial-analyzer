const test = require('node:test'),
  assert = require('node:assert/strict'),
  C = require('../../src/analysis/core.js');

// A 6 × 6 field on a 3 × 3 grid: every tile is 2 × 2. The main phase fills the left column of
// tiles; binder fills the top row of pixels; carbon lies in the right-hand column of tiles.
const w = 6,
  h = 6,
  roi = C.roiMask(w, h),
  mask = test =>
    Uint8Array.from({ length: w * h }, (_, i) => (test(i % w, Math.floor(i / w)) ? 1 : 0)),
  nmc = mask(x => x < 2),
  f = mask((x, y) => y === 0),
  c = mask((x, y) => x >= 4 && y < 4),
  secondary = mask((x, y) => x === 3 && y === 3);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);

test('each element reports its area share, evenness and row / column profiles', () => {
  const r = C.analyze({
    w,
    h,
    roi,
    nmc,
    secondary,
    f,
    c,
    secondaryIntensity: Float64Array.from(secondary),
    fIntensity: Float64Array.from(f),
    grid: 3,
  });
  near(r.elements.f.areaFraction, 6 / 36);
  near(r.elements.c.areaFraction, 8 / 36);
  // Binder sits only in the top row of tiles: half of each top tile, nothing below.
  assert.deepEqual(r.elements.f.rows, [0.5, 0, 0]);
  assert.deepEqual(r.elements.f.columns, [2 / 12, 2 / 12, 2 / 12]);
  near(r.elements.f.columnCV, 0);
  near(r.elements.f.rowCV, Math.SQRT2);
  assert.deepEqual(r.elements.c.columns, [0, 0, 8 / 12]);
  assert.deepEqual(r.elements.c.rows, [4 / 12, 4 / 12, 0]);
  // Two of the six binder pixels lie on the main phase.
  near(r.elements.f.betweenParticles, 4 / 6);
  near(r.elements.c.betweenParticles, 1);
  // Per-tile shares behind the grid labels.
  assert.deepEqual(
    r.tiles.map(t => t.cFraction),
    [0, 0, 1, 0, 0, 1, 0, 0, 0],
  );
  assert.equal(r.tiles[0].fFraction, 0.5);
  // The secondary phase keeps its established measures alongside the new block.
  near(r.secondaryAreaFraction, 1 / 36);
  near(r.elements.secondary.areaFraction, r.secondaryAreaFraction);
  near(r.elements.secondary.uniformityCV, r.uniformityCV);
  near(r.elements.secondary.betweenParticles, r.targetingEfficiency);
});

test('an empty column of the analysed area is a gap in the profile, not zero', () => {
  const left = Uint8Array.from({ length: w * h }, (_, i) => (i % w < 4 ? 1 : 0)),
    r = C.analyze({ w, h, roi: left, nmc: mask(x => x === 0), f, grid: 3 });
  // The analysed area is four pixels wide, so the grid spans those four columns only.
  assert.equal(r.elements.f.columns.length, 3);
  assert.ok(r.elements.f.columns.every(v => v != null));
  const holed = Uint8Array.from(roi);
  for (let y = 0; y < h; y++) holed[y * w + 2] = holed[y * w + 3] = 0;
  const g = C.analyze({ w, h, roi: holed, nmc, f, grid: 3 });
  assert.equal(g.elements.f.columns[1], null);
  near(g.elements.f.columnCV, 0);
});

test('without a secondary map, binder and carbon are still analysed', () => {
  const r = C.analyze({ w, h, roi, nmc, f, c, grid: 3 });
  assert.equal(r.secondaryAreaFraction, null);
  assert.equal(r.uniformityCV, null);
  assert.equal(r.distance, null);
  assert.equal(r.binderCoverage, null);
  assert.equal(r.pearson, null);
  assert.equal(r.elements.secondary, null);
  near(r.elements.c.areaFraction, 8 / 36);
  assert.ok(r.tiles.every(t => t.fraction === null && t.secondaryPixels === null));
  assert.throws(() => C.analyze({ w, h, roi, nmc, grid: 3 }), /至少/);
});

test('the pipeline segments and analyses a carbon map', () => {
  const toData = m => ({ data: Float64Array.from(m, v => v * 100) }),
    seg = () => ({
      auto: false,
      threshold: 50,
      denoise: 0,
      invert: false,
      min: 0,
      fill: false,
      smooth: false,
    }),
    out = C.process({
      w,
      h,
      channels: { nmc: toData(nmc), f: toData(f), c: toData(c) },
      seg: { nmc: seg(), secondary: seg(), f: seg(), c: seg() },
      rois: [],
      roiInvert: false,
      settings: { grid: 3, binderRadius: 1, epsilon: 1, ratio: false },
      analyze: true,
    });
  assert.deepEqual(Array.from(out.masks.c), Array.from(c));
  near(out.results.elements.c.areaFraction, 8 / 36);
});

test('cross sections report the carbon share by depth', () => {
  const r = C.analyze({ w, h, roi, nmc, f, c, grid: 3, view: 'cross' });
  assert.deepEqual(
    r.depth.zones.map(z => z.cFraction),
    [4 / 12, 4 / 12, 0],
  );
  assert.equal(r.depth.cv, null);
  assert.ok(r.depth.cCV > 0);
});

test('image thirds use the depth bands, along both axes', () => {
  // Width 7 does not split evenly: the bands must still match the depth zones pixel for pixel.
  const W = 7,
    H = 9,
    area = C.roiMask(W, H),
    mk = t => Uint8Array.from({ length: W * H }, (_, i) => (t(i % W, Math.floor(i / W)) ? 1 : 0)),
    main = mk(x => x === 0),
    binder = mk((x, y) => (x * 3 + y * 5) % 4 === 0),
    carbon = mk((x, y) => y < 2 || x > 4),
    along = axis =>
      C.analyze({
        w: W,
        h: H,
        roi: area,
        nmc: main,
        f: binder,
        c: carbon,
        grid: 3,
        view: 'cross',
        depthAxis: axis,
      });
  const vertical = along('y'),
    horizontal = along('x');
  for (const key of ['f', 'c']) {
    const field = key + 'Fraction';
    assert.deepEqual(
      vertical.elements[key].thirds.rows,
      vertical.depth.zones.map(z => z[field]),
    );
    assert.deepEqual(
      vertical.elements[key].thirds.columns,
      horizontal.depth.zones.map(z => z[field]),
    );
  }
  near(vertical.elements.c.thirds.rowCV, vertical.depth.cCV);
  near(horizontal.elements.f.thirds.columnCV, horizontal.depth.fCV);
});
