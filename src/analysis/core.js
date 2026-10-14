/* Deterministic numerical core, shared by the browser Worker and Node tests. */
const Core = (() => {
  const sum = a => a.reduce((s, x) => s + x, 0);
  const fraction = (a, b) => (b ? a / b : null);
  function cv(a) {
    const m = sum(a) / a.length;
    return m > 0 ? Math.sqrt(sum(a.map(x => (x - m) ** 2)) / a.length) / m : null;
  }
  function parseCSV(text) {
    const rows = text
      .replace(/^\uFEFF/, '')
      .trim()
      .split(/\r?\n/)
      .map(x =>
        x
          .trim()
          .split(',')
          .map(v => {
            if (!v.trim() || !Number.isFinite(Number(v))) throw Error('CSV 含空值或非數值。');
            return Number(v);
          }),
      );
    if (!rows.length || !rows[0].length || rows.some(r => r.length !== rows[0].length))
      throw Error('CSV 各列欄數不一致。');
    return { w: rows[0].length, h: rows.length, data: new Float64Array(rows.flat()) };
  }
  function range(a) {
    let min = Infinity,
      max = -Infinity;
    for (const x of a) {
      if (!Number.isFinite(x)) throw Error('Map 含非有限數值。');
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    return { min, max };
  }
  function otsu(a, roi) {
    const { min, max } = range(a);
    if (max === min) return min;
    const hist = new Float64Array(256);
    let n = 0;
    for (let i = 0; i < a.length; i++)
      if (!roi || roi[i]) {
        hist[Math.min(255, Math.floor(((a[i] - min) / (max - min)) * 255))]++;
        n++;
      }
    let total = 0;
    for (let i = 0; i < 256; i++) total += i * hist[i];
    let wb = 0,
      sb = 0,
      best = -1,
      t = 0;
    for (let i = 0; i < 255; i++) {
      wb += hist[i];
      sb += i * hist[i];
      const wf = n - wb;
      if (!wb || !wf) continue;
      const score = wb * wf * (sb / wb - (total - sb) / wf) ** 2;
      if (score > best) {
        best = score;
        t = i;
      }
    }
    return min + ((t + 0.5) / 255) * (max - min);
  }
  function polygonContains(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i],
        [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function roiMask(w, h, rois = [], invert = false) {
    const inc = rois.filter(r => !r.exclude),
      exc = rois.filter(r => r.exclude),
      out = new Uint8Array(w * h);
    const contains = (r, x, y) =>
      r.type === 'rect'
        ? x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
        : polygonContains(x, y, r.points);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let inside = !inc.length || inc.some(r => contains(r, x + 0.5, y + 0.5));
        if (invert) inside = !inside;
        out[y * w + x] = inside && !exc.some(r => contains(r, x + 0.5, y + 0.5)) ? 1 : 0;
      }
    return out;
  }
  function neighbors(i, w, h, fn) {
    const x = i % w,
      y = Math.floor(i / w);
    if (x) fn(i - 1);
    if (x < w - 1) fn(i + 1);
    if (y) fn(i - w);
    if (y < h - 1) fn(i + w);
  }
  function removeSmall(mask, w, h, min) {
    if (min <= 1) return mask;
    const seen = new Uint8Array(mask.length),
      q = new Int32Array(mask.length);
    for (let i = 0; i < mask.length; i++)
      if (mask[i] && !seen[i]) {
        let head = 0,
          tail = 1;
        q[0] = i;
        seen[i] = 1;
        while (head < tail) {
          neighbors(q[head++], w, h, j => {
            if (mask[j] && !seen[j]) {
              seen[j] = 1;
              q[tail++] = j;
            }
          });
        }
        if (tail < min) for (let j = 0; j < tail; j++) mask[q[j]] = 0;
      }
    return mask;
  }
  function fillHoles(mask, w, h, roi) {
    const seen = new Uint8Array(mask.length),
      q = new Int32Array(mask.length);
    let head = 0,
      tail = 0;
    const add = i => {
      if (!mask[i] && !seen[i]) {
        seen[i] = 1;
        q[tail++] = i;
      }
    };
    for (let i = 0; i < mask.length; i++)
      if (!roi[i] || i < w || i >= w * (h - 1) || i % w === 0 || i % w === w - 1) add(i);
    while (head < tail) neighbors(q[head++], w, h, add);
    for (let i = 0; i < mask.length; i++) if (roi[i] && !seen[i]) mask[i] = 1;
    return mask;
  }
  function smooth(mask, w, h, roi) {
    const out = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let count = 0,
          n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx >= 0 && xx < w && yy >= 0 && yy < h && roi[yy * w + xx]) {
              n++;
              count += mask[yy * w + xx];
            }
          }
        out[y * w + x] = roi[y * w + x] && count > n / 2 ? 1 : 0;
      }
    return out;
  }
  /* Local average of a count map: two passes of a (2r + 1)-wide box filter along each axis, which
     together weight neighbours like a triangle. Sparse X-ray counts become a density that a
     single threshold can separate; without it a threshold only picks out the lit pixels.
     Windows are clipped at the image border, so the edge is the mean of what exists. */
  function denoise(a, w, h, radius) {
    const r = Math.floor(radius);
    if (!(r > 0)) return a;
    const box = (src, length, stride, lines, lineStride) => {
      const out = new Float64Array(src.length);
      for (let line = 0; line < lines; line++) {
        const base = line * lineStride;
        let total = 0,
          count = 0;
        for (let i = 0; i < Math.min(r, length); i++) {
          total += src[base + i * stride];
          count++;
        }
        for (let i = 0; i < length; i++) {
          if (i + r < length) {
            total += src[base + (i + r) * stride];
            count++;
          }
          if (i - r - 1 >= 0) {
            total -= src[base + (i - r - 1) * stride];
            count--;
          }
          out[base + i * stride] = total / count;
        }
      }
      return out;
    };
    let out = a;
    for (let pass = 0; pass < 2; pass++) {
      out = box(out, w, 1, h, w);
      out = box(out, h, w, w, 1);
    }
    return out;
  }
  function segment(a, w, h, roi, p) {
    const threshold = p.auto ? otsu(a, roi) : p.threshold;
    let m = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) m[i] = roi[i] && a[i] > threshold !== !!p.invert ? 1 : 0;
    if (p.smooth) m = smooth(m, w, h, roi);
    if (p.fill) m = fillHoles(m, w, h, roi);
    m = removeSmall(m, w, h, p.min || 0);
    return { mask: m, threshold };
  }
  function perimeter(m, w, h) {
    const p = new Uint8Array(m.length);
    for (let i = 0; i < m.length; i++)
      if (m[i]) {
        if (i < w || i >= w * (h - 1) || i % w === 0 || i % w === w - 1) p[i] = 1;
        else
          neighbors(i, w, h, j => {
            if (!m[j]) p[i] = 1;
          });
      }
    return p;
  }
  /* Felzenszwalb/Huttenlocher separable lower envelope; pixel-centre Euclidean distances. */
  function edt(seed, w, h) {
    const n = Math.max(w, h),
      f = new Float64Array(n),
      d = new Float64Array(n),
      v = new Int32Array(n),
      z = new Float64Array(n + 1),
      tmp = new Float64Array(w * h),
      out = new Float64Array(w * h),
      INF = 1e20;
    if (!seed.some(x => x)) {
      out.fill(Infinity);
      return out;
    }
    function line(len) {
      let k = 0;
      v[0] = 0;
      z[0] = -Infinity;
      z[1] = Infinity;
      for (let q = 1; q < len; q++) {
        let s;
        do {
          s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
          if (s <= z[k]) k--;
          else break;
        } while (k >= 0);
        if (k < 0) {
          k = 0;
          v[0] = q;
          z[0] = -Infinity;
          z[1] = Infinity;
        } else {
          k++;
          v[k] = q;
          z[k] = s;
          z[k + 1] = Infinity;
        }
      }
      k = 0;
      for (let q = 0; q < len; q++) {
        while (z[k + 1] < q) k++;
        d[q] = (q - v[k]) ** 2 + f[v[k]];
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = seed[y * w + x] ? 0 : INF;
      line(h);
      for (let y = 0; y < h; y++) tmp[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) f[x] = tmp[y * w + x];
      line(w);
      for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
    }
    return out;
  }
  function pearson(a, b, roi) {
    let n = 0,
      ma = 0,
      mb = 0,
      va = 0,
      vb = 0,
      c = 0;
    for (let i = 0; i < a.length; i++)
      if (roi[i]) {
        n++;
        const da = a[i] - ma,
          db = b[i] - mb;
        ma += da / n;
        mb += db / n;
        va += da * (a[i] - ma);
        vb += db * (b[i] - mb);
        c += da * (b[i] - mb);
      }
    return va > 0 && vb > 0 ? Math.max(-1, Math.min(1, c / Math.sqrt(va * vb))) : null;
  }
  function analyze({
    w,
    h,
    roi,
    nmc,
    secondary,
    f,
    secondaryIntensity,
    fIntensity,
    grid = 5,
    calibration = null,
    binderRadius = 3,
    view = 'top',
    depthAxis = 'y',
    depthReverse = false,
  }) {
    const nr = sum(roi),
      nn = sum(nmc),
      ns = sum(secondary);
    if (!nr) throw Error('ROI 為空。');
    if (!nn) throw Error('NMC mask 為空，請調整 threshold。');
    if (!ns) throw Error('Secondary mask 為空，請調整 threshold。');
    let ng = 0,
      sg = 0,
      overlap = 0,
      nf = f ? sum(f) : 0;
    for (let i = 0; i < roi.length; i++)
      if (roi[i]) {
        if (!nmc[i]) {
          ng++;
          sg += secondary[i];
        }
        if (f && f[i] && secondary[i]) overlap++;
      }
    let xmin = w,
      xmax = -1,
      ymin = h,
      ymax = -1;
    for (let i = 0; i < roi.length; i++)
      if (roi[i]) {
        xmin = Math.min(xmin, i % w);
        xmax = Math.max(xmax, i % w);
        ymin = Math.min(ymin, Math.floor(i / w));
        ymax = Math.max(ymax, Math.floor(i / w));
      }
    const rw = xmax - xmin + 1,
      rh = ymax - ymin + 1;
    // Tile edges, shared by the counts below and by the grid drawn over the image.
    const edge = (origin, size, g) => origin + Math.floor((g * size) / grid),
      tiles = [];
    for (let gy = 0; gy < grid; gy++)
      for (let gx = 0; gx < grid; gx++) {
        const x0 = edge(xmin, rw, gx),
          x1 = edge(xmin, rw, gx + 1),
          y0 = edge(ymin, rh, gy),
          y1 = edge(ymin, rh, gy + 1);
        let a = 0,
          b = 0;
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const i = y * w + x;
            a += roi[i];
            b += secondary[i];
          }
        tiles.push({ x: gx, y: gy, area: a, fraction: a ? b / a : null, x0, y0, x1, y1 });
      }
    const dist = edt(perimeter(nmc, w, h), w, h),
      values = new Float64Array(ns),
      scale = calibration || 1;
    let k = 0,
      total = 0;
    for (let i = 0; i < dist.length; i++)
      if (secondary[i]) {
        values[k++] = dist[i] * scale;
        total += dist[i] * scale;
      }
    // The same measures inside each tile. Distances come from the whole-image fields above, so a
    // tile is not treated as if nothing existed beyond its edge.
    const medianOf = list => {
      if (!list.length) return null;
      const sorted = Float64Array.from(list).sort(),
        p = 0.5 * (sorted.length - 1),
        lo = Math.floor(p),
        hi = Math.ceil(p);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
    };
    const secondaryEdge = f && nf ? perimeter(secondary, w, h) : null,
      binderDistance = f && nf ? edt(f, w, h) : null;
    for (const tile of tiles) {
      const distances = [];
      let gap = 0,
        inGap = 0,
        count = 0,
        sumDistance = 0,
        edgePixels = 0,
        covered = 0;
      for (let y = tile.y0; y < tile.y1; y++)
        for (let x = tile.x0; x < tile.x1; x++) {
          const i = y * w + x;
          if (!roi[i]) continue;
          if (!nmc[i]) {
            gap++;
            inGap += secondary[i];
          }
          if (secondary[i]) {
            count++;
            distances.push(dist[i] * scale);
            sumDistance += dist[i] * scale;
          }
          if (secondaryEdge?.[i]) {
            edgePixels++;
            if (binderDistance[i] * scale <= binderRadius) covered++;
          }
        }
      tile.secondaryPixels = count;
      tile.interparticleOccupancy = fraction(inGap, gap);
      tile.targetingEfficiency = fraction(inGap, count);
      tile.distanceMedian = medianOf(distances);
      tile.distanceMean = count ? sumDistance / count : null;
      tile.binderCoverage = !f ? null : nf ? fraction(covered, edgePixels) : count ? 0 : null;
    }
    values.sort();
    const quantile = q => {
      const p = q * (values.length - 1),
        lo = Math.floor(p),
        hi = Math.ceil(p);
      return values[lo] + (values[hi] - values[lo]) * (p - lo);
    };
    const bins = [0, 0, 0, 0],
      edges = calibration ? [0.5, 1, 2] : [1, 2, 3];
    for (const x of values) bins[x < edges[0] ? 0 : x < edges[1] ? 1 : x <= edges[2] ? 2 : 3]++;
    const max = values[values.length - 1],
      hist = new Array(20).fill(0);
    for (const x of values) hist[max ? Math.min(19, Math.floor((x / max) * 20)) : 0]++;
    let coverage = null;
    if (f && nf) {
      const sp = secondaryEdge,
        fd = binderDistance;
      let p = 0,
        hit = 0;
      for (let i = 0; i < sp.length; i++)
        if (sp[i]) {
          p++;
          if (fd[i] * scale <= binderRadius) hit++;
        }
      coverage = fraction(hit, p);
    } else if (f) coverage = 0;
    let depth = null;
    if (view === 'cross') {
      let min = Infinity,
        max = -Infinity;
      for (let i = 0; i < roi.length; i++)
        if (roi[i]) {
          const coordinate = depthAxis === 'x' ? i % w : Math.floor(i / w);
          min = Math.min(min, coordinate);
          max = Math.max(max, coordinate);
        }
      const zones = Array.from({ length: 3 }, (_, j) => ({
        zone: ['Top', 'Middle', 'Bottom'][j],
        area: 0,
        secondary: 0,
        f: 0,
        overlap: 0,
      }));
      for (let i = 0; i < roi.length; i++)
        if (roi[i]) {
          const coord = depthAxis === 'x' ? i % w : Math.floor(i / w),
            norm = (coord - min + 0.5) / (max - min + 1);
          let z = Math.min(2, Math.floor(norm * 3));
          if (depthReverse) z = 2 - z;
          const a = zones[z];
          a.area++;
          a.secondary += secondary[i];
          a.f += f ? f[i] : 0;
          a.overlap += f && f[i] && secondary[i] ? 1 : 0;
        }
      for (const a of zones) {
        a.secondaryFraction = fraction(a.secondary, a.area);
        a.fFraction = f ? fraction(a.f, a.area) : null;
        a.overlapFraction = f ? fraction(a.overlap, a.area) : null;
      }
      depth = {
        zones,
        cv: cv(zones.filter(z => z.area).map(z => z.secondaryFraction)),
        fCV: f ? cv(zones.filter(z => z.area).map(z => z.fFraction)) : null,
      };
    }
    return {
      roiPixels: nr,
      nmcPixels: nn,
      secondaryPixels: ns,
      fPixels: f ? nf : null,
      secondaryAreaFraction: ns / nr,
      uniformityCV: cv(tiles.filter(t => t.area).map(t => t.fraction)),
      interparticleOccupancy: fraction(sg, ng),
      targetingEfficiency: sg / ns,
      distance: {
        unit: calibration ? 'μm' : 'px',
        mean: total / ns,
        median: quantile(0.5),
        p90: quantile(0.9),
        max,
        bins,
        edges,
        histogram: hist,
      },
      pearson: f ? pearson(secondaryIntensity, fIntensity, roi) : null,
      fWithSecondary: f ? fraction(overlap, nf) : null,
      secondaryWithF: f ? overlap / ns : null,
      binderCoverage: coverage,
      depth,
      tiles,
      warnings: [
        nn / nr > 0.95 ? 'NMC mask 超過 ROI 95%。' : null,
        ns / nr > 0.95 ? 'Secondary mask 超過 ROI 95%。' : null,
        f && nf / nr > 0.95 ? 'F mask 超過 ROI 95%。' : null,
        ng === 0 ? '無 NMC 顆粒間區域，Occupancy 無法計算。' : null,
      ].filter(Boolean),
    };
  }
  const ANALYSIS_KEYS = ['nmc', 'secondary', 'f'],
    MAX_PIXELS = 16e6,
    GRID_OPTIONS = [3, 5, 8],
    BINDER_DEFAULT = { px: 3, um: 0.5 },
    // Averaging radius (pixels) applied to a map before its threshold; 0 turns it off.
    DENOISE_DEFAULT = 2,
    DENOISE_MAX = 5;
  /* Binder neighbourhood after the calibration changes from `from` to `to` (μm per pixel, or
     null for pixels). The default follows the unit; a radius the user chose keeps its physical
     size, so it is converted when the unit changes and left alone otherwise. */
  function rescaleBinderRadius(radius, custom, from, to) {
    if (!custom) return to ? BINDER_DEFAULT.um : BINDER_DEFAULT.px;
    if (!from && to) return Number((radius * to).toPrecision(6));
    if (from && !to) return Number((radius / from).toPrecision(6));
    return radius;
  }
  /* Segment-then-analyze pipeline shared by the Worker and the tests. Imported intensity, the ROI
     mask and unchanged segmentations are kept between runs; returned arrays are the cached ones. */
  function createPipeline() {
    let channelCache = {},
      roiKey = '',
      roiCache = null,
      segCache = {};
    return function run(p) {
      const { w, h, settings } = p;
      if (p.channels) {
        channelCache = p.channels;
        segCache = {};
      }
      const nextROIKey = JSON.stringify([w, h, p.rois, p.roiInvert]);
      if (nextROIKey !== roiKey) {
        roiCache = roiMask(w, h, p.rois, p.roiInvert);
        roiKey = nextROIKey;
        segCache = {};
      }
      const masks = {},
        intensities = {},
        thresholds = {},
        ranges = {};
      for (const key of ANALYSIS_KEYS)
        if (channelCache[key]) {
          const param = p.seg[key],
            radius = param.denoise || 0,
            signature = JSON.stringify([
              radius,
              param.auto,
              param.auto ? null : param.threshold,
              param.invert,
              param.min,
              param.fill,
              param.smooth,
              key === 'secondary' ? settings.ratio : false,
              key === 'secondary' ? settings.epsilon : null,
            ]);
          if (segCache[key]?.signature !== signature) {
            // Both maps of a ratio are averaged first; a ratio of raw counts is mostly noise.
            let data = denoise(channelCache[key].data, w, h, radius);
            if (key === 'secondary' && settings.ratio) {
              const main = denoise(channelCache.nmc.data, w, h, radius);
              data = Float64Array.from(data, (x, i) => x / (main[i] + settings.epsilon));
            }
            segCache[key] = {
              signature,
              range: range(data),
              ...segment(data, w, h, roiCache, param),
            };
          }
          masks[key] = segCache[key].mask;
          intensities[key] = channelCache[key].data;
          thresholds[key] = segCache[key].threshold;
          ranges[key] = segCache[key].range;
        }
      const results = p.analyze
        ? analyze({
            w,
            h,
            roi: roiCache,
            nmc: masks.nmc,
            secondary: masks.secondary,
            f: masks.f,
            secondaryIntensity: intensities.secondary,
            fIntensity: intensities.f,
            ...settings,
          })
        : null;
      return { roi: roiCache, masks, thresholds, ranges, results };
    };
  }
  function process(p) {
    return createPipeline()(p);
  }
  return {
    sum,
    fraction,
    cv,
    parseCSV,
    range,
    otsu,
    roiMask,
    denoise,
    segment,
    perimeter,
    edt,
    pearson,
    analyze,
    process,
    createPipeline,
    ANALYSIS_KEYS,
    MAX_PIXELS,
    GRID_OPTIONS,
    BINDER_DEFAULT,
    DENOISE_DEFAULT,
    DENOISE_MAX,
    rescaleBinderRadius,
  };
})();
if (typeof module !== 'undefined') module.exports = Core;
