const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  cropRGBA,
  nudgeRect,
  resampleRGBA,
  resamplingMode,
  importPixels,
  lockAspect,
} = require('../../src/ui/image-import.js');

// Grey image whose pixel value is given by `value(x, y)`; alpha is opaque.
function image(w, h, value) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = value(x, y);
      rgba.set(Array.isArray(v) ? v : [v, v, v, 255], (y * w + x) * 4);
    }
  return rgba;
}
const reds = (rgba, count) => Array.from({ length: count }, (_, i) => rgba[i * 4]);

test('nudging translates the crop by whole pixels and stays inside the image', () => {
  const r = { x: 5, y: 5, w: 10, h: 4 };
  assert.deepEqual(nudgeRect(r, 1, 0, 20, 10), { x: 6, y: 5, w: 10, h: 4 });
  assert.deepEqual(nudgeRect(r, -10, -10, 20, 10), { x: 0, y: 0, w: 10, h: 4 });
  assert.deepEqual(nudgeRect(r, 10, 10, 20, 10), { x: 10, y: 6, w: 10, h: 4 });
  assert.deepEqual(r, { x: 5, y: 5, w: 10, h: 4 });
  // A nudged crop is still a byte-exact copy of the source pixels.
  const src = image(20, 10, (x, y) => x + y * 20),
    moved = nudgeRect(r, 3, -2, 20, 10);
  assert.deepEqual(reds(cropRGBA(src, 20, 10, moved), 3), [68, 69, 70]);
});
test('resampling to the same size is an exact crop', () => {
  const src = image(6, 4, (x, y) => x * 10 + y),
    r = { x: 1, y: 1, w: 3, h: 2 };
  assert.deepEqual(resampleRGBA(src, 6, 4, r, 3, 2), cropRGBA(src, 6, 4, r));
  assert.equal(resamplingMode(r, 3, 2), 'none');
});
test('downscaling averages the covered source area', () => {
  const src = image(4, 2, x => [0, 100, 200, 60][x]),
    full = { x: 0, y: 0, w: 4, h: 2 };
  assert.deepEqual(reds(resampleRGBA(src, 4, 2, full, 2, 1), 2), [50, 130]);
  assert.equal(resamplingMode(full, 2, 1), 'area-average');
  // 3 → 2: each output pixel covers 1.5 source pixels.
  const three = image(3, 1, x => [0, 90, 255][x]);
  assert.deepEqual(reds(resampleRGBA(three, 3, 1, { x: 0, y: 0, w: 3, h: 1 }, 2, 1), 2), [30, 200]);
  // Only the selected region contributes.
  assert.deepEqual(reds(resampleRGBA(src, 4, 2, { x: 2, y: 0, w: 2, h: 2 }, 1, 1), 1), [130]);
});
test('upscaling interpolates between pixel centres and clamps at the edges', () => {
  const src = image(2, 1, x => [0, 100][x]),
    full = { x: 0, y: 0, w: 2, h: 1 };
  assert.deepEqual(reds(resampleRGBA(src, 2, 1, full, 4, 1), 4), [0, 25, 75, 100]);
  assert.equal(resamplingMode(full, 4, 1), 'bilinear');
  const flat = image(3, 3, () => 77);
  assert.ok(
    resampleRGBA(flat, 3, 3, { x: 0, y: 0, w: 3, h: 3 }, 7, 5).every(v => v === 77 || v === 255),
  );
});
test('each axis uses its own filter; colour channels stay independent', () => {
  const src = image(
      4,
      1,
      x =>
        [
          [255, 0, 0, 255],
          [0, 255, 0, 255],
          [0, 0, 255, 255],
          [255, 255, 255, 255],
        ][x],
    ),
    full = { x: 0, y: 0, w: 4, h: 1 },
    out = resampleRGBA(src, 4, 1, full, 2, 2);
  assert.equal(resamplingMode(full, 2, 2), 'area-average+bilinear');
  assert.deepEqual(Array.from(out.slice(0, 8)), [128, 128, 0, 255, 128, 128, 255, 255]);
  assert.deepEqual(Array.from(out.slice(8, 16)), Array.from(out.slice(0, 8)));
});
test('invalid resampling requests are rejected', () => {
  const src = image(4, 4, () => 1);
  assert.throws(() => resampleRGBA(src, 4, 4, { x: 0, y: 0, w: 5, h: 4 }, 2, 2), /Invalid crop/);
  assert.throws(() => resampleRGBA(src, 4, 4, { x: 0.5, y: 0, w: 2, h: 2 }, 2, 2), /Invalid crop/);
  assert.throws(() => resampleRGBA(src, 4, 4, { x: 0, y: 0, w: 2, h: 2 }, 0, 2), /Invalid target/);
  assert.throws(
    () => resampleRGBA(src, 4, 4, { x: 0, y: 0, w: 2, h: 2 }, 2.5, 2),
    /Invalid target/,
  );
});
test('only the SEM display channel may be resampled', () => {
  const src = image(8, 4, x => x * 30),
    r = { x: 0, y: 0, w: 8, h: 4 },
    target = { w: 4, h: 2 };
  for (const key of ['nmc', 'secondary', 'f', 'other'])
    assert.throws(() => importPixels(key, src, 8, 4, r, target), /Only the SEM/);
  const fitted = importPixels('sem', src, 8, 4, r, target);
  assert.deepEqual(
    { w: fitted.w, h: fitted.h, info: fitted.info },
    {
      w: 4,
      h: 2,
      info: { pixelResampling: 'area-average', scaleX: 0.5, scaleY: 0.5, displayOnly: true },
    },
  );
  assert.deepEqual(reds(fitted.rgba, 4), [15, 75, 135, 195]);
  // Without a target every channel, SEM included, is an exact crop.
  for (const key of ['nmc', 'sem']) {
    const exact = importPixels(key, src, 8, 4, { x: 2, y: 1, w: 3, h: 2 }, null);
    assert.deepEqual(exact.info, { pixelResampling: 'none' });
    assert.deepEqual(exact.rgba, cropRGBA(src, 8, 4, { x: 2, y: 1, w: 3, h: 2 }));
  }
});
test('aspect lock derives the other side from the reference shape', () => {
  const ref = { w: 254, h: 94 };
  assert.deepEqual(lockAspect({ x: 10, y: 20, w: 432, h: 1 }, ref, 'w', 470, 408), {
    x: 10,
    y: 20,
    w: 432,
    h: 160,
  });
  assert.deepEqual(lockAspect({ x: 10, y: 20, w: 1, h: 160 }, ref, 'h', 470, 408), {
    x: 10,
    y: 20,
    w: 432,
    h: 160,
  });
  // The rectangle shrinks rather than leaving the image.
  assert.deepEqual(lockAspect({ x: 100, y: 0, w: 400, h: 1 }, ref, 'w', 470, 408), {
    x: 100,
    y: 0,
    w: 370,
    h: 137,
  });
  assert.deepEqual(lockAspect({ x: 0, y: 380, w: 300, h: 1 }, ref, 'w', 470, 408), {
    x: 0,
    y: 380,
    w: 76,
    h: 28,
  });
});
