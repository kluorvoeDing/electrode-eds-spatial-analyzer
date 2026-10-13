const test = require('node:test'),
  assert = require('node:assert/strict'),
  C = require('../../src/analysis/core.js');

const seg = threshold => ({
  auto: false,
  threshold,
  invert: false,
  min: 0,
  fill: false,
  smooth: false,
});
function payload(overrides = {}) {
  return {
    w: 4,
    h: 2,
    channels: {
      nmc: { data: new Float64Array([9, 9, 0, 0, 9, 9, 0, 0]) },
      secondary: { data: new Float64Array([0, 0, 8, 0, 0, 0, 8, 2]) },
      f: { data: new Float64Array([0, 0, 7, 7, 0, 0, 0, 0]) },
    },
    rois: [],
    roiInvert: false,
    seg: { nmc: seg(5), secondary: seg(5), f: seg(5) },
    settings: { ratio: false, epsilon: 1, grid: 3, binderRadius: 1 },
    analyze: false,
    ...overrides,
  };
}
const withoutChannels = p => ({ ...p, channels: null });

test('pipeline matches a fresh one-shot run and reuses cached work', () => {
  const run = C.createPipeline(),
    first = run(payload({ analyze: true })),
    second = run(withoutChannels(payload({ analyze: true })));
  assert.deepEqual(second.results, C.process(payload({ analyze: true })).results);
  assert.deepEqual(second.results, first.results);
  assert.equal(second.roi, first.roi);
  for (const key of C.ANALYSIS_KEYS) assert.equal(second.masks[key], first.masks[key]);
});
test('changing one segmentation recomputes only that channel', () => {
  const run = C.createPipeline(),
    first = run(payload()),
    next = payload();
  next.seg.secondary = seg(1);
  const second = run(withoutChannels(next));
  assert.equal(second.masks.nmc, first.masks.nmc);
  assert.equal(second.masks.f, first.masks.f);
  assert.notEqual(second.masks.secondary, first.masks.secondary);
  assert.equal(second.masks.secondary.join(''), '00100011');
  assert.equal(second.roi, first.roi);
});
test('changing the ROI invalidates every cached mask', () => {
  const run = C.createPipeline(),
    first = run(payload()),
    second = run(
      withoutChannels(
        payload({ rois: [{ type: 'rect', x: 0, y: 0, w: 4, h: 1, exclude: false }] }),
      ),
    );
  assert.notEqual(second.roi, first.roi);
  assert.equal(Array.from(second.roi).join(''), '11110000');
  for (const key of C.ANALYSIS_KEYS) assert.notEqual(second.masks[key], first.masks[key]);
  assert.equal(second.masks.secondary.join(''), '00100000');
  const inverted = run(
    withoutChannels(
      payload({
        rois: [{ type: 'rect', x: 0, y: 0, w: 4, h: 1, exclude: false }],
        roiInvert: true,
      }),
    ),
  );
  assert.equal(Array.from(inverted.roi).join(''), '00001111');
});
test('new channel data replaces the cache; omitted channels stay cached', () => {
  const run = C.createPipeline(),
    first = run(payload()),
    replaced = payload();
  replaced.channels.secondary = { data: new Float64Array(8).fill(9) };
  const second = run(replaced);
  assert.notEqual(second.masks.nmc, first.masks.nmc);
  assert.equal(second.masks.secondary.join(''), '11111111');
  const removed = payload();
  delete removed.channels.f;
  assert.equal(run(removed).masks.f, undefined);
});
test('ratio and epsilon only affect the secondary channel signature', () => {
  const run = C.createPipeline(),
    first = run(payload()),
    ratio = payload({ settings: { ratio: true, epsilon: 1, grid: 3, binderRadius: 1 } });
  ratio.seg.secondary = seg(1);
  const second = run(withoutChannels(ratio));
  assert.equal(second.masks.nmc, first.masks.nmc);
  assert.equal(second.masks.f, first.masks.f);
  // 8 / (0 + 1) = 8 and 2 / (0 + 1) = 2 exceed 1; pixels on Ni-rich columns stay 0.
  assert.equal(second.masks.secondary.join(''), '00100011');
  const epsilon = payload({ settings: { ratio: true, epsilon: 4, grid: 3, binderRadius: 1 } });
  epsilon.seg.secondary = seg(1);
  const third = run(withoutChannels(epsilon));
  assert.notEqual(third.masks.secondary, second.masks.secondary);
  // 8 / 4 = 2 stays above 1; 2 / 4 = 0.5 drops out.
  assert.equal(third.masks.secondary.join(''), '00100010');
  assert.equal(third.masks.nmc, first.masks.nmc);
});
test('shared constants are exported once', () => {
  assert.deepEqual(C.ANALYSIS_KEYS, ['nmc', 'secondary', 'f']);
  assert.equal(C.MAX_PIXELS, 16e6);
  assert.deepEqual(C.GRID_OPTIONS, [3, 5, 8]);
});
