const test = require('node:test'),
  assert = require('node:assert/strict'),
  C = require('../../src/analysis/core.js');

test('default binder radius follows the distance unit', () => {
  assert.deepEqual(C.BINDER_DEFAULT, { px: 3, um: 0.5 });
  assert.equal(C.rescaleBinderRadius(3, false, null, 0.2), 0.5);
  assert.equal(C.rescaleBinderRadius(0.5, false, 0.2, null), 3);
  assert.equal(C.rescaleBinderRadius(0.5, false, 0.2, 0.4), 0.5);
  assert.equal(C.rescaleBinderRadius(3, false, null, null), 3);
});
test('a custom binder radius keeps its physical size across calibration changes', () => {
  assert.equal(C.rescaleBinderRadius(5, true, null, 0.2), 1);
  assert.equal(C.rescaleBinderRadius(1, true, 0.2, 0.4), 1);
  assert.equal(C.rescaleBinderRadius(1, true, 0.4, null), 2.5);
  assert.equal(C.rescaleBinderRadius(5, true, null, null), 5);
  // Conversion noise is rounded away so the field shows a clean number.
  assert.equal(C.rescaleBinderRadius(7, true, null, 0.1), 0.7);
});
