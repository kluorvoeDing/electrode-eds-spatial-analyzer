/* One-page report figure, laid out as a double-column journal figure: 180 mm wide at 300 dpi,
   text at 7–10 pt, hairline axes. Panels a–c are the element masks with their grid shares,
   d the figures of each element, e and f the column and row profiles; a caption with the
   methods, taken from the analysis trace, runs underneath. Drawn only when exported. */
const REPORT = {
  dpi: 300,
  width: Math.round((180 / 25.4) * 300),
  margin: 48,
  gap: 56,
  font: '"Arial", "Helvetica Neue", Helvetica, "Microsoft JhengHei", "PingFang TC", sans-serif',
  ink: '#111111',
  soft: '#555555',
  rule: '#111111',
  markers: { secondary: 'circle', f: 'square', c: 'triangle' },
};
const pt = size => Math.round((size * REPORT.dpi) / 72);
function reportFont(size, weight = 400) {
  return `${weight} ${pt(size)}px ${REPORT.font}`;
}
/* Breaks text into lines that fit; Latin text breaks at spaces, CJK text between characters. */
function wrapText(ctx, text, width) {
  const tokens = text.match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+\s*|\s+/g) || [],
    lines = [];
  let line = '';
  for (const token of tokens) {
    if (line && ctx.measureText(line + token).width > width) {
      lines.push(line.trimEnd());
      line = token.trimStart();
    } else line += token;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}
function fitText(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > width) s = s.slice(0, -1);
  return s + '…';
}
/* Mask image of one element: the micrograph (or the main-phase map) in grey, the main phase and
   the element in their colours, outside the analysed area dimmed. Pixels as computed. */
function maskImage(key) {
  const base = baseChannel(),
    { w, h } = base,
    sem = state.channels.sem?.w === w && state.channels.sem?.h === h ? state.channels.sem : null,
    grey = sem || state.channels.nmc,
    range = Core.range(grey.data),
    span = range.max - range.min || 1,
    canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d'),
    image = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const g = grey.rgba
      ? (grey.rgba[i * 4] + grey.rgba[i * 4 + 1] + grey.rgba[i * 4 + 2]) / 3
      : ((grey.data[i] - range.min) / span) * 255;
    let rgb = [g * 0.8, g * 0.8, g * 0.8];
    for (const [k, alpha] of [
      ['nmc', 0.38],
      [key, 0.72],
    ])
      if (masks[k]?.[i]) rgb = rgb.map((v, c) => v * (1 - alpha) + ELEMENT_TINT[k][c] * alpha);
    if (effectiveROI && !effectiveROI[i]) rgb = rgb.map(v => v * 0.35);
    image.data.set([...rgb, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
/* Cell statistics along one axis: mean ± SD of the cell shares in each column (or row). */
function cellProfile(r, key, axis) {
  const n = Math.round(Math.sqrt(r.tiles.length));
  return Array.from({ length: n }, (_, g) => {
    const values = r.tiles
      .filter(tile => tile[axis] === g && tile.area)
      .map(tile => tileShare(tile, key))
      .filter(v => v != null)
      .map(v => v * 100);
    if (!values.length) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length,
      sd =
        values.length > 1
          ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1))
          : 0;
    return { mean, sd, n: values.length };
  });
}
function elementName(key) {
  return key === 'secondary'
    ? `${t('Secondary phase')} (${t(state.material)})`
    : t(METRIC_LABELS[key]);
}
const REPORT_ROWS = [
  ['Area fraction (%)', (r, e) => e.areaFraction * 100, 2],
  ['Uniformity CV', (r, e) => e.uniformityCV, 3],
  ['Thirds CV, left / right', (r, e) => e.thirds?.columnCV, 3],
  ['Thirds CV, top / bottom', (r, e) => e.thirds?.rowCV, 3],
  ['Column CV', (r, e) => e.columnCV, 3],
  ['Row CV', (r, e) => e.rowCV, 3],
  ['Between particles (%)', (r, e) => e.betweenParticles * 100, 1],
  [
    'Interparticle Occupancy (%)',
    (r, e, k) => (k === 'secondary' ? r.interparticleOccupancy * 100 : null),
    1,
  ],
  ['Median distance', (r, e, k) => (k === 'secondary' ? r.distance?.median : null), 3],
  [
    'Binder Coverage (%)',
    (r, e, k) => (k === 'secondary' && r.binderCoverage != null ? r.binderCoverage * 100 : null),
    1,
  ],
];
function drawMarker(ctx, shape, x, y, size) {
  ctx.beginPath();
  if (shape === 'square') ctx.rect(x - size, y - size, size * 2, size * 2);
  else if (shape === 'triangle') {
    ctx.moveTo(x, y - size * 1.2);
    ctx.lineTo(x + size * 1.1, y + size * 0.8);
    ctx.lineTo(x - size * 1.1, y + size * 0.8);
    ctx.closePath();
  } else ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
}
/* Profile chart: one series per element, mean ± SD of the cells, distinct markers for print. */
function drawProfileChart(ctx, box, r, keys, axis, letter, title, xTitle) {
  const n = Math.round(Math.sqrt(r.tiles.length)),
    series = keys.map(k => ({ k, points: cellProfile(r, k, axis) })),
    top = Math.max(1, ...series.flatMap(s => s.points.filter(Boolean).map(p => p.mean + p.sd))),
    step = [1, 2, 5, 10, 20, 25].find(s => top / s <= 5) || 25,
    max = Math.ceil(top / step) * step,
    plot = {
      x: box.x + pt(28),
      y: box.y + pt(30),
      w: box.w - pt(32),
      h: box.h - pt(30) - pt(26),
    },
    sx = i => plot.x + ((i + 0.5) / n) * plot.w,
    sy = v => plot.y + plot.h - (v / max) * plot.h;
  ctx.fillStyle = REPORT.ink;
  ctx.font = reportFont(10, 700);
  ctx.fillText(letter, box.x, box.y + pt(10));
  ctx.font = reportFont(8, 700);
  ctx.fillText(title, box.x + pt(12), box.y + pt(10));
  // Legend in one row, swatch and marker beside ink text.
  let lx = box.x + pt(12);
  ctx.font = reportFont(7);
  for (const s of series) {
    ctx.fillStyle = CHART_TINT[s.k];
    ctx.strokeStyle = CHART_TINT[s.k];
    ctx.lineWidth = pt(1);
    ctx.beginPath();
    ctx.moveTo(lx, box.y + pt(20));
    ctx.lineTo(lx + pt(14), box.y + pt(20));
    ctx.stroke();
    drawMarker(ctx, REPORT.markers[s.k], lx + pt(7), box.y + pt(20), pt(2));
    ctx.fillStyle = REPORT.ink;
    const label = elementName(s.k);
    ctx.fillText(label, lx + pt(18), box.y + pt(22.5));
    lx += pt(26) + ctx.measureText(label).width;
  }
  // Axes: hairlines, ticks outward.
  ctx.strokeStyle = REPORT.rule;
  ctx.lineWidth = pt(0.6);
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y);
  ctx.lineTo(plot.x, plot.y + plot.h);
  ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
  ctx.stroke();
  ctx.font = reportFont(7);
  ctx.textAlign = 'right';
  for (let v = 0; v <= max + 1e-9; v += step) {
    ctx.beginPath();
    ctx.moveTo(plot.x, sy(v));
    ctx.lineTo(plot.x - pt(2.5), sy(v));
    ctx.stroke();
    ctx.fillText(String(v), plot.x - pt(4), sy(v) + pt(2.5));
  }
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(sx(i), plot.y + plot.h);
    ctx.lineTo(sx(i), plot.y + plot.h + pt(2.5));
    ctx.stroke();
    ctx.fillText(String(i + 1), sx(i), plot.y + plot.h + pt(10));
  }
  ctx.fillText(xTitle, plot.x + plot.w / 2, plot.y + plot.h + pt(20));
  ctx.save();
  ctx.translate(box.x + pt(6), plot.y + plot.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${t('Area fraction')} (%)`, 0, 0);
  ctx.restore();
  // Series, nudged sideways so error bars of different elements do not sit on top of each other.
  series.forEach((s, j) => {
    const offset = (j - (series.length - 1) / 2) * pt(3);
    ctx.strokeStyle = CHART_TINT[s.k];
    ctx.fillStyle = CHART_TINT[s.k];
    ctx.lineWidth = pt(0.75);
    for (const [i, p] of s.points.entries())
      if (p && p.n > 1) {
        const x = sx(i) + offset;
        ctx.beginPath();
        ctx.moveTo(x, sy(p.mean - p.sd));
        ctx.lineTo(x, sy(p.mean + p.sd));
        ctx.moveTo(x - pt(1.5), sy(p.mean - p.sd));
        ctx.lineTo(x + pt(1.5), sy(p.mean - p.sd));
        ctx.moveTo(x - pt(1.5), sy(p.mean + p.sd));
        ctx.lineTo(x + pt(1.5), sy(p.mean + p.sd));
        ctx.stroke();
      }
    ctx.lineWidth = pt(1);
    ctx.beginPath();
    let pen = false;
    for (const [i, p] of s.points.entries()) {
      if (!p) {
        pen = false;
        continue;
      }
      ctx[pen ? 'lineTo' : 'moveTo'](sx(i) + offset, sy(p.mean));
      pen = true;
    }
    ctx.stroke();
    for (const [i, p] of s.points.entries())
      if (p) drawMarker(ctx, REPORT.markers[s.k], sx(i) + offset, sy(p.mean), pt(2.1));
  });
  ctx.textAlign = 'left';
}
/* Three-line table of the figures: one row per element, one column per figure. Headers wrap to
   two lines; a figure no element has is left out. Returns the height used, or measures only. */
function drawFigureTable(ctx, box, r, keys, letter, measureOnly = false) {
  const unit = r.distance?.unit || '',
    columns = REPORT_ROWS.map(([label, read, digits]) => ({
      label: label === 'Median distance' ? `${t('Median Distance')} (${unit})` : t(label),
      values: keys.map(k => read(r, r.elements[k], k)),
      digits,
    })).filter(c => c.values.some(v => v != null && Number.isFinite(v))),
    // The name column is as wide as the longest element name, so no name is cut.
    firstW = (() => {
      ctx.font = reportFont(7);
      return Math.max(
        box.w * 0.12,
        Math.max(...keys.map(k => ctx.measureText(elementName(k)).width)) + pt(14),
      );
    })(),
    colW = (box.w - firstW) / columns.length,
    rowH = pt(11.5);
  ctx.font = reportFont(7, 700);
  const headers = columns.map(c => wrapText(ctx, c.label, colW - pt(4)).slice(0, 3)),
    headerH = Math.max(...headers.map(h => h.length)) * pt(8.5),
    height = pt(18) + headerH + pt(6) + keys.length * rowH + pt(6);
  if (measureOnly) return height;
  ctx.fillStyle = REPORT.ink;
  ctx.font = reportFont(10, 700);
  ctx.fillText(letter, box.x, box.y + pt(10));
  ctx.font = reportFont(8, 700);
  ctx.fillText(t('Figures of the whole analysed region'), box.x + pt(12), box.y + pt(10));
  let y = box.y + pt(16);
  const rule = width => {
    ctx.lineWidth = width;
    ctx.strokeStyle = REPORT.rule;
    ctx.beginPath();
    ctx.moveTo(box.x, y);
    ctx.lineTo(box.x + box.w, y);
    ctx.stroke();
  };
  rule(pt(1));
  ctx.font = reportFont(7, 700);
  ctx.textAlign = 'right';
  headers.forEach((lines, j) =>
    lines.forEach((line, l) =>
      ctx.fillText(line, box.x + firstW + colW * (j + 1), y + pt(9) + l * pt(8.5)),
    ),
  );
  ctx.textAlign = 'left';
  y += headerH + pt(4);
  rule(pt(0.5));
  ctx.font = reportFont(7);
  keys.forEach((k, i) => {
    const ry = y + (i + 1) * rowH;
    ctx.fillStyle = CHART_TINT[k];
    drawMarker(ctx, REPORT.markers[k], box.x + pt(3), ry - pt(2.5), pt(2));
    ctx.fillStyle = REPORT.ink;
    ctx.fillText(fitText(ctx, elementName(k), firstW - pt(10)), box.x + pt(9), ry);
    ctx.textAlign = 'right';
    columns.forEach((c, j) => {
      const v = c.values[i];
      ctx.fillText(
        v == null || !Number.isFinite(v) ? '—' : v.toFixed(c.digits),
        box.x + firstW + colW * (j + 1),
        ry,
      );
    });
    ctx.textAlign = 'left';
  });
  y += keys.length * rowH + pt(5);
  rule(pt(1));
  return height;
}
/* Mask panel with its grid shares and a scale bar. Small maps are enlarged by a whole factor
   without smoothing; larger ones are reduced with smoothing so mask detail is averaged, not
   dropped. */
function drawMaskPanel(ctx, box, r, key, letter, maxH) {
  const source = maskImage(key),
    fit = Math.min(box.w / source.width, maxH / source.height),
    scale = fit >= 1 ? Math.floor(fit) : fit,
    w = Math.round(source.width * scale),
    h = Math.round(source.height * scale),
    x = box.x,
    y = box.y + pt(14);
  ctx.fillStyle = REPORT.ink;
  ctx.font = reportFont(10, 700);
  ctx.fillText(letter, box.x, box.y + pt(10));
  ctx.font = reportFont(8, 700);
  ctx.fillText(
    fitText(ctx, `${elementName(key)} · ${t('area fraction per cell')} (%)`, box.w - pt(12)),
    box.x + pt(12),
    box.y + pt(10),
  );
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, x, y, w, h);
  ctx.imageSmoothingEnabled = false;
  // Grid and the share in each cell.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const tile of r.tiles) {
    const tx = x + tile.x0 * scale,
      ty = y + tile.y0 * scale,
      tw = (tile.x1 - tile.x0) * scale,
      th = (tile.y1 - tile.y0) * scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = pt(0.4);
    ctx.strokeRect(tx, ty, tw, th);
    const share = tileShare(tile, key);
    if (!tile.area || share == null || tw < pt(16) || th < pt(8)) continue;
    const text = (share * 100).toFixed(1);
    ctx.font = reportFont(6.5, 700);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = pt(1.6);
    ctx.strokeText(text, tx + tw / 2, ty + th / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx + tw / 2, ty + th / 2);
  }
  ctx.textBaseline = 'alphabetic';
  // Scale bar under the image's lower right corner, clear of the cell numbers; without a
  // calibration, a note that distances are in pixels.
  const mark = scaleMark((w * 0.18) / scale);
  ctx.fillStyle = REPORT.ink;
  ctx.font = reportFont(7);
  ctx.textAlign = 'right';
  if (mark) {
    const length = mark.pixels * scale,
      label = `${mark.um} µm`,
      textW = ctx.measureText(label).width;
    ctx.fillText(label, x + w, y + h + pt(9));
    ctx.fillRect(x + w - textW - pt(4) - length, y + h + pt(5), length, pt(1.5));
  } else ctx.fillText(t('px, uncalibrated'), x + w, y + h + pt(9));
  ctx.textAlign = 'left';
  return pt(14) + h + pt(12);
}
/* The caption: what each panel is, how the error bars were made, and the methods. */
function reportCaption(r, keys, letters, later) {
  const trace = r.trace,
    seg = trace.segmentation,
    n = Math.round(Math.sqrt(r.tiles.length)),
    thresholds = ['nmc', ...keys]
      .map(
        k =>
          `${k === 'secondary' ? t('Secondary phase') : t(SHORT_NAMES[k])} ${seg[k].auto ? t('automatic') : `${t('manual')} ${Number(seg[k].threshold.toPrecision(4))}`}, ${t('averaging')} ${seg[k].denoise || 0} px`,
      )
      .join('; '),
    scale = trace.parameters.calibration
      ? `${Number(trace.parameters.calibration.toPrecision(4))} µm/px`
      : t('uncalibrated (px)'),
    region = trace.rois.length || trace.roiInvert ? t('user-defined region') : t('whole image'),
    small = cellSize(r).small ? ' ' + smallCellNote(r) : '';
  return [
    `${letters.length > 1 ? `${letters[0]}–${letters[letters.length - 1]}` : letters[0]}: ${t('Element masks (colour) over the micrograph; the main phase in magenta. Numbers are each cell’s area fraction of the element.')}`,
    `${later[0]}, ${later[1]}: ${t('Mean of the cell area fractions in each column (row) of the {n} × {n} grid; error bars ±1 SD over the {n} cells (spatial spread, not measurement uncertainty).').replaceAll('{n}', n)}`,
    `${later[2]}: ${t('Figures of the whole analysed region. CV is the population standard deviation divided by the mean.')}`,
    `${t('Methods')}: ${t('thresholds')} — ${thresholds}. ${t('Grid')} ${n} × ${n}; ${t('scale')} ${scale}; ${t('analysed area')}: ${region}.${small} ${t('2D image quantification')}. ${t('Electrode EDS Analyzer')} v${trace.toolVersion}, ${new Date(r.analyzedAt).toISOString().slice(0, 10)}.`,
  ];
}
function crc32(bytes) {
  let crc = -1;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
/* PNG with a pHYs chunk, so Word and PowerPoint place it at its printed size. */
async function withResolution(blob, dpi) {
  const png = new Uint8Array(await blob.arrayBuffer()),
    perMetre = Math.round(dpi / 0.0254),
    chunk = new Uint8Array(21),
    view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  view.setUint32(8, perMetre);
  view.setUint32(12, perMetre);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  // IHDR is always first: 8-byte signature + 25-byte chunk.
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, 33));
  out.set(chunk, 33);
  out.set(png.subarray(33), 33 + chunk.length);
  return new Blob([out], { type: 'image/png' });
}
/* Draws the whole figure, synchronously, in the current interface language. */
function drawReport(r) {
  const keys = METRIC_KEYS.filter(k => r.elements?.[k]),
    letters = keys.map((_, i) => 'abc'[i]),
    // After the mask panels: the column profile, the row profile, the table.
    later = [...'abcdef'.slice(keys.length, keys.length + 3)],
    W = REPORT.width,
    M = REPORT.margin,
    leftW = Math.round((W - 2 * M - REPORT.gap) * 0.52),
    rightW = W - 2 * M - REPORT.gap - leftW,
    rightX = M + leftW + REPORT.gap,
    measure = document.createElement('canvas').getContext('2d');
  // Lay out first to know the height: header; mask panels beside the two profile charts, the
  // charts as tall as the panels; the table across the page; the caption.
  const headerH = pt(26),
    base = baseChannel(),
    maxPanel = Math.round((pt(420) - keys.length * pt(26)) / keys.length),
    fit = Math.min(leftW / base.w, maxPanel / base.h),
    scale = fit >= 1 ? Math.floor(fit) : fit,
    panelH = pt(14) + Math.round(base.h * scale) + pt(12),
    leftH = keys.length * (panelH + pt(8)),
    chartH = Math.max(pt(120), Math.min(pt(200), (leftH - pt(10)) / 2)),
    bodyH = Math.max(leftH, 2 * chartH + pt(10)),
    tableH = drawFigureTable(measure, { x: 0, y: 0, w: W - 2 * M }, r, keys, '', true);
  measure.font = reportFont(7);
  const caption = reportCaption(r, keys, letters, later).flatMap(p =>
      wrapText(measure, p, W - 2 * M),
    ),
    tableY = M + headerH + bodyH + pt(6),
    captionY = tableY + tableH + pt(10),
    H = captionY + caption.length * pt(9.5) + M;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = Math.round(H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, canvas.height);
  ctx.textBaseline = 'alphabetic';
  // Header.
  ctx.fillStyle = REPORT.ink;
  ctx.font = reportFont(10, 700);
  ctx.fillText(
    fitText(ctx, `${state.sample} — ${t('EDS spatial distribution')}`, W - 2 * M),
    M,
    M + pt(10),
  );
  ctx.font = reportFont(7);
  ctx.fillStyle = REPORT.soft;
  ctx.fillText(
    [
      t(state.view === 'top' ? 'Top View' : 'Cross Section'),
      `${t('Additive')} ${t(state.material)}`,
      `${base.w} × ${base.h} px`,
      new Date(r.analyzedAt).toISOString().slice(0, 10),
    ].join(' · '),
    M,
    M + pt(20),
  );
  // Left: mask panels. Right: the column and row profiles.
  let y = M + headerH;
  keys.forEach((k, i) => {
    y += drawMaskPanel(ctx, { x: M, y, w: leftW }, r, k, letters[i], maxPanel) + pt(8);
  });
  const chartsTop = M + headerH;
  drawProfileChart(
    ctx,
    { x: rightX, y: chartsTop, w: rightW, h: chartH },
    r,
    keys,
    'x',
    later[0],
    t('Columns, image left to right'),
    t('Column'),
  );
  drawProfileChart(
    ctx,
    { x: rightX, y: chartsTop + chartH + pt(10), w: rightW, h: chartH },
    r,
    keys,
    'y',
    later[1],
    t('Rows, image top to bottom'),
    t('Row'),
  );
  // Table across the page.
  drawFigureTable(ctx, { x: M, y: tableY, w: W - 2 * M }, r, keys, later[2]);
  // Caption.
  let cy = captionY;
  ctx.fillStyle = REPORT.ink;
  ctx.font = reportFont(7);
  for (const line of caption) {
    cy += pt(9.5);
    ctx.fillText(line, M, cy - pt(2));
  }
  return canvas;
}
/* The figure in either language, whatever the interface shows: the language is switched only
   while it is drawn, which happens without any pause in between. */
async function exportReport(lang = language) {
  const r = state.results;
  if (!r || !baseChannel()) {
    status('請先完成分析。', true);
    return;
  }
  const previous = language;
  let canvas;
  setUILanguage(lang);
  try {
    canvas = drawReport(r);
  } finally {
    setUILanguage(previous);
  }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  download(
    `${safeName()}.report.${lang === 'en' ? 'en' : 'zh'}.png`,
    await withResolution(blob, REPORT.dpi),
  );
  status('Report figure exported');
}
