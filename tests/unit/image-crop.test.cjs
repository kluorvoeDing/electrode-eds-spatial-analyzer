const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { cropRectValid, cropRGBA } = require('../../src/ui/image-import.js');
test('integer bounded crops preserve every channel without resampling', () => {
  const a = Uint8ClampedArray.from({ length: 4 * 3 * 4 }, (_, i) => i);
  const r = { x: 1, y: 1, w: 2, h: 2 },
    crop = cropRGBA(a, 4, 3, r);
  assert.deepEqual(Array.from(crop), [...a.slice(20, 28), ...a.slice(36, 44)]);
  assert.equal(a[20], 20);
  assert.equal(cropRectValid(r, 4, 3), true);
  for (const bad of [
    { x: -1, y: 0, w: 2, h: 2 },
    { x: 0, y: 0, w: 0, h: 2 },
    { x: 1.1, y: 0, w: 2, h: 2 },
    { x: 3, y: 0, w: 2, h: 2 },
    { x: 0, y: 2, w: 1, h: 2 },
  ])
    assert.equal(cropRectValid(bad, 4, 3), false);
  assert.throws(() => cropRGBA(a, 4, 3, { x: 0, y: 0, w: 5, h: 1 }));
});
