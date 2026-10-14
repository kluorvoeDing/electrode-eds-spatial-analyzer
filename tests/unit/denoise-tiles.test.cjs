const test = require('node:test'),
  assert = require('node:assert/strict'),
  C = require('../../src/analysis/core.js');

// Deterministic pseudo-random numbers, so the sparse-count fixtures are the same on every run.
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let v = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}
const seg = (overrides = {}) => ({
  auto: true,
  threshold: 0,
  denoise: 0,
  invert: false,
  min: 0,
  fill: false,
  smooth: false,
  ...overrides,
});

test('averaging leaves a flat map alone and is off at radius 0', () => {
  const flat = new Float64Array(12 * 9).fill(7);
  assert.equal(C.denoise(flat, 12, 9, 0), flat);
  assert.ok(C.denoise(flat, 12, 9, 2).every(v => Math.abs(v - 7) < 1e-12));
});
test('averaging spreads a count symmetrically and keeps the total away from the border', () => {
  const w = 21,
    h = 21,
    a = new Float64Array(w * h);
  a[10 * w + 10] = 100;
  const out = C.denoise(a, w, h, 2),
    at = (x, y) => out[y * w + x];
  assert.ok(Math.abs(out.reduce((s, v) => s + v, 0) - 100) < 1e-9);
  assert.ok(at(10, 10) > at(11, 10) && at(11, 10) > at(12, 10) && at(12, 10) > 0);
  assert.ok(Math.abs(at(8, 10) - at(12, 10)) < 1e-12 && Math.abs(at(10, 8) - at(12, 10)) < 1e-12);
  // Two passes of a radius-2 box reach four pixels and no further.
  assert.ok(at(14, 10) > 0);
  assert.equal(at(15, 10), 0);
});
test('a sparse count map needs averaging before its threshold finds the region', () => {
  // A disc where four pixels in ten carry a count, on a background where three in a hundred do.
  const w = 80,
    h = 60,
    next = random(7),
    inside = i => Math.hypot((i % w) - 40, Math.floor(i / w) - 30) < 18,
    data = Float64Array.from({ length: w * h }, (_, i) =>
      next() < (inside(i) ? 0.4 : 0.03) ? 120 + 135 * next() : 0,
    ),
    roi = C.roiMask(w, h),
    cover = radius => {
      const { mask } = C.segment(C.denoise(data, w, h, radius), w, h, roi, seg());
      let hit = 0,
        area = 0,
        stray = 0,
        rest = 0;
      for (let i = 0; i < w * h; i++)
        if (inside(i)) {
          area++;
          hit += mask[i];
        } else {
          rest++;
          stray += mask[i];
        }
      return { region: hit / area, background: stray / rest };
    };
  // Raw: only the lit pixels, so well under half of the disc.
  assert.ok(cover(0).region < 0.5);
  // Averaged: the disc as a whole, and next to nothing outside it.
  const averaged = cover(C.DENOISE_DEFAULT);
  assert.ok(averaged.region > 0.9, `region ${averaged.region}`);
  assert.ok(averaged.background < 0.06, `background ${averaged.background}`);
});
test('the pipeline averages per channel, reports the thresholded range and recomputes on change', () => {
  const w = 30,
    h = 20,
    next = random(3),
    counts = p => Float64Array.from({ length: w * h }, () => (next() < p ? 200 : 0)),
    channels = { nmc: { data: counts(0.5) }, secondary: { data: counts(0.2) } },
    payload = radius => ({
      w,
      h,
      channels,
      rois: [],
      roiInvert: false,
      seg: { nmc: seg({ denoise: radius }), secondary: seg(), f: seg() },
      settings: { ratio: false, epsilon: 1, grid: 3, binderRadius: 1 },
      analyze: false,
    }),
    run = C.createPipeline(),
    raw = run(payload(0)),
    again = run({ ...payload(0), channels: null }),
    averaged = run({ ...payload(2), channels: null });
  assert.equal(again.masks.nmc, raw.masks.nmc);
  assert.notEqual(averaged.masks.nmc, raw.masks.nmc);
  assert.equal(averaged.masks.secondary, raw.masks.secondary);
  assert.deepEqual(raw.ranges.nmc, { min: 0, max: 200 });
  assert.ok(averaged.ranges.nmc.max < 200 && averaged.ranges.nmc.min >= 0);
  // A session from before averaging existed has no radius at all.
  const legacy = payload(0);
  delete legacy.seg.nmc.denoise;
  assert.deepEqual(C.process(legacy).masks.nmc, raw.masks.nmc);
});

// A 12 × 8 field: main-phase block on the left, secondary phase on the right, binder beside it.
function field() {
  const w = 12,
    h = 8,
    roi = new Uint8Array(w * h).fill(1),
    nmc = new Uint8Array(w * h),
    secondary = new Uint8Array(w * h),
    f = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < 4) nmc[i] = 1;
      if (x >= 6 && x < 8 && y < 4) secondary[i] = 1;
      if (x === 8 && y < 4) f[i] = 1;
    }
  return { w, h, roi, nmc, secondary, f, secondaryIntensity: secondary, fIntensity: f };
}
test('tiles carry their pixel bounds and tile the bounding box of the region exactly', () => {
  const r = C.analyze({ ...field(), grid: 3 });
  assert.deepEqual(r.tiles.map(t => [t.x0, t.x1]).slice(0, 3), [
    [0, 4],
    [4, 8],
    [8, 12],
  ]);
  assert.deepEqual([r.tiles[0].y0, r.tiles[3].y0, r.tiles[6].y0, r.tiles[8].y1], [0, 2, 5, 8]);
  const covered = r.tiles.reduce((n, t) => n + (t.x1 - t.x0) * (t.y1 - t.y0), 0);
  assert.equal(covered, 12 * 8);
  assert.equal(
    r.tiles.reduce((n, t) => n + t.area, 0),
    r.roiPixels,
  );
});
test('per-tile values are the whole-region measures restricted to the tile', () => {
  const r = C.analyze({ ...field(), grid: 3, binderRadius: 1 }),
    tile = (x, y) => r.tiles.find(t => t.x === x && t.y === y);
  // Top-middle tile, columns 4-7 and rows 0-1: 8 pixels, none main phase, 4 secondary.
  const middle = tile(1, 0);
  assert.equal(middle.fraction, 0.5);
  assert.equal(middle.secondaryPixels, 4);
  assert.equal(middle.interparticleOccupancy, 0.5);
  assert.equal(middle.targetingEfficiency, 1);
  // Columns 6 and 7 are 3 and 4 pixels from the main-phase edge at column 3.
  assert.equal(middle.distanceMedian, 3.5);
  assert.equal(middle.distanceMean, 3.5);
  // Only the outline pixels in column 7 touch the binder in column 8.
  assert.equal(middle.binderCoverage, 0.5);
  // A tile of main phase only: no gap, no secondary phase, nothing to report.
  const left = tile(0, 0);
  assert.equal(left.fraction, 0);
  assert.equal(left.interparticleOccupancy, null);
  assert.equal(left.targetingEfficiency, null);
  assert.equal(left.distanceMedian, null);
  assert.equal(left.binderCoverage, null);
  // The tiles add up to the whole-region figures.
  assert.equal(
    r.tiles.reduce((n, t) => n + t.secondaryPixels, 0),
    r.secondaryPixels,
  );
  const gap = r.tiles.reduce((n, t) => n + (t.interparticleOccupancy ?? 0) * gapOf(t), 0);
  function gapOf(t) {
    let n = 0;
    const { w, roi, nmc } = field();
    for (let y = t.y0; y < t.y1; y++)
      for (let x = t.x0; x < t.x1; x++) n += roi[y * w + x] && !nmc[y * w + x] ? 1 : 0;
    return n;
  }
  assert.ok(Math.abs(gap / (12 * 8 - 32) - r.interparticleOccupancy) < 1e-12);
});
test('distances in a tile use the whole image, and are scaled by the calibration', () => {
  // The nearest main-phase edge lies outside the right-hand tiles, yet their distances count it.
  const base = C.analyze({ ...field(), grid: 3 }),
    scaled = C.analyze({ ...field(), grid: 3, calibration: 0.5 });
  assert.equal(base.tiles[1].distanceMedian, 3.5);
  assert.equal(scaled.tiles[1].distanceMedian, 1.75);
  assert.equal(scaled.distance.unit, 'μm');
});
test('adding per-tile values leaves the whole-region results as they were', () => {
  const r = C.analyze({ ...field(), grid: 3, binderRadius: 1 });
  assert.equal(r.secondaryAreaFraction, 8 / 96);
  assert.equal(r.interparticleOccupancy, 8 / 64);
  assert.equal(r.targetingEfficiency, 1);
  assert.equal(r.distance.median, 3.5);
  assert.equal(r.binderCoverage, 0.5);
});
