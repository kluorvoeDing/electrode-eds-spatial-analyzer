const test = require('node:test'),
  assert = require('node:assert/strict');
const { detectMapRegion, detectFrame, placeLocked } = require('../../src/ui/image-import.js');

const PAGE = [238, 242, 248];
function canvas(w, h, colour) {
  const rgba = new Uint8ClampedArray(w * h * 4),
    set = (x, y, c) => rgba.set([...c, 255], (y * w + x) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, colour(x, y));
  return { rgba, set };
}
// An element-map report: title, "Map Data" label, dark map with coloured counts, scale bar.
function report(w, h, map, dot = [255, 140, 0]) {
  const image = canvas(w, h, () => PAGE);
  for (let x = 20; x < 44; x += 2) image.set(x, 5, [20, 20, 20]);
  for (let x = map.x; x < map.x + 30; x++) image.set(x, map.y - 3, [150, 150, 150]);
  for (let y = map.y; y < map.y + map.h; y++)
    for (let x = map.x; x < map.x + map.w; x++)
      image.set(x, y, (x * 7 + y * 13) % 5 === 0 ? dot : [0, 0, 0]);
  for (let x = 5; x < 31; x++) image.set(x, h - 8, [0, 0, 0]);
  return image.rgba;
}

test('the map is found on a report image regardless of where it sits', () => {
  for (const map of [
    { x: 7, y: 30, w: 80, h: 40 },
    { x: 3, y: 41, w: 80, h: 40 },
    { x: 60, y: 25, w: 120, h: 50 },
  ])
    assert.deepEqual(detectMapRegion(report(240, 110, map), 240, 110), map);
  // Sparse counts in another colour still read as map.
  const map = { x: 10, y: 28, w: 90, h: 44 };
  assert.deepEqual(detectMapRegion(report(120, 100, map, [0, 120, 255]), 120, 100), map);
});
test('images with nothing to crop are left alone', () => {
  const tight = canvas(60, 40, (x, y) => ((x + y) % 4 ? [0, 0, 0] : [200, 0, 200])).rgba;
  assert.equal(detectMapRegion(tight, 60, 40), null);
  const photo = canvas(80, 60, (x, y) => Array(3).fill(100 + ((x * 7 + y * 13) % 40))).rgba;
  assert.equal(detectMapRegion(photo, 80, 60), null);
  const blank = canvas(80, 60, () => PAGE).rgba;
  assert.equal(detectMapRegion(blank, 80, 60), null);
  // A few dark specks are not a map.
  const specks = canvas(200, 150, (x, y) => (x % 50 < 6 && y % 50 < 6 ? [0, 0, 0] : PAGE)).rgba;
  assert.equal(detectMapRegion(specks, 200, 150), null);
});

// A micrograph on a page with the bright frame that marks the mapped area.
function micrograph(w, h, frame) {
  const image = canvas(w, h, (x, y) =>
    x < 1 || x > w - 3 || y > h - 20 ? PAGE : Array(3).fill(95 + ((x * 7 + y * 13) % 30)),
  );
  if (frame) {
    const { left, right, top, bottom } = frame;
    for (let x = left; x <= right; x++)
      for (const y of [top, bottom]) image.set(x, y, [235, 235, 235]);
    for (let y = top; y <= bottom; y++)
      for (const x of [left, right]) image.set(x, y, [210, 210, 210]);
  }
  return image.rgba;
}
test('the mapped-area frame on a micrograph is found; its inside is returned', () => {
  const frame = { left: 2, right: 196, top: 40, bottom: 110 };
  assert.deepEqual(detectFrame(micrograph(200, 160, frame), 200, 160), {
    x: 3,
    y: 41,
    w: 193,
    h: 69,
  });
  const inner = { left: 30, right: 150, top: 25, bottom: 95 };
  assert.deepEqual(detectFrame(micrograph(200, 160, inner), 200, 160), {
    x: 31,
    y: 26,
    w: 119,
    h: 69,
  });
});
test('a micrograph without a frame yields nothing', () => {
  assert.equal(detectFrame(micrograph(200, 160, null), 200, 160), null);
  // A brightness step (dark resin above bright electrode) is not a thin line.
  const step = canvas(200, 160, (x, y) => Array(3).fill(y < 70 ? 60 : 170)).rgba;
  assert.equal(detectFrame(step, 200, 160), null);
  assert.equal(detectFrame(canvas(10, 10, () => PAGE).rgba, 10, 10), null);
});
test('a locked box keeps the grid size and is centred on the detected region', () => {
  const target = { w: 80, h: 40 };
  assert.deepEqual(placeLocked({ x: 7, y: 30, w: 80, h: 40 }, target, 240, 110), {
    x: 7,
    y: 30,
    w: 80,
    h: 40,
  });
  // Detected one pixel larger each way: same centre, grid size.
  assert.deepEqual(placeLocked({ x: 6, y: 29, w: 82, h: 42 }, target, 240, 110), {
    x: 7,
    y: 30,
    w: 80,
    h: 40,
  });
  assert.deepEqual(placeLocked({ x: 0, y: 0, w: 20, h: 10 }, target, 240, 110), {
    x: 0,
    y: 0,
    w: 80,
    h: 40,
  });
  assert.deepEqual(placeLocked({ x: 230, y: 100, w: 10, h: 10 }, target, 240, 110), {
    x: 160,
    y: 70,
    w: 80,
    h: 40,
  });
  // Nothing detected: centred on the image.
  assert.deepEqual(placeLocked(null, target, 240, 110), { x: 80, y: 35, w: 80, h: 40 });
  // The grid does not fit inside this image.
  assert.equal(placeLocked(null, target, 60, 110), null);
});
