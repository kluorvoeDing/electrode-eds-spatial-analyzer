/* Trace, comparison table and CSV / JSON / PNG export. */
function trace() {
  return {
    toolVersion: VERSION,
    sample: state.sample,
    view: state.view,
    material: state.material,
    images: Object.fromEntries(
      Object.entries(state.channels).map(([k, c]) => [
        k,
        {
          name: c.name,
          w: c.w,
          h: c.h,
          format: c.format,
          sha256: c.sha256 || null,
          sourceSha256: c.sourceSha256 || null,
          importInfo: c.importInfo || null,
          intensityRange: Core.range(c.data),
        },
      ]),
    ),
    rois: structuredClone(state.rois),
    roiInvert: state.roiInvert,
    segmentation: structuredClone(state.seg),
    parameters: structuredClone(state.settings),
    intensityMethod: 'CSV raw; image max(R,G,B)',
    distanceConvention: 'pixel-center to nearest 4-neighbor boundary pixel-center',
    connectivity: 4,
  };
}
function download(name, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
const safeName = () => state.sample.replace(/[^\p{L}\p{N}._-]/gu, '_') || 'sample';
function addComparison() {
  if (!state.results) return;
  state.comparison.push({
    sample: state.sample,
    view: state.view,
    metrics: structuredClone(state.results),
    trace: trace(),
    cohesive: '',
    peel: '',
    note: '',
  });
  renderControls();
  status('Added to Comparison');
}
function showComparison() {
  showDialog(
    'Comparison',
    `<div style="overflow:auto"><table><tr><th>${t('Sample')}</th><th>${t('CV')}</th><th>${t('Occupancy')}</th><th>${t('Targeting')}</th><th>${t('Median')}</th><th>${t('Binder')}</th><th>F CV</th><th>C CV</th><th>${t('Depth CV')}</th><th>${t('Cohesive')}</th><th>${t('Peel')}</th><th>${t('Recipe note')}</th><th></th></tr>${state.comparison.map((c, i) => `<tr><td>${esc(c.sample)}</td><td>${fmt(c.metrics.uniformityCV)}</td><td>${fmt(c.metrics.interparticleOccupancy, true)}</td><td>${fmt(c.metrics.targetingEfficiency, true)}</td><td>${c.metrics.distance ? `${fmt(c.metrics.distance.median)} ${esc(c.metrics.distance.unit)}` : '—'}</td><td>${fmt(c.metrics.binderCoverage, true)}</td><td>${fmt(c.metrics.elements?.f?.uniformityCV)}</td><td>${fmt(c.metrics.elements?.c?.uniformityCV)}</td><td>${fmt(c.metrics.depth?.cv)}</td>${['cohesive', 'peel', 'note'].map(k => `<td><input data-comp="${i}" data-key="${k}" aria-label="${t({ cohesive: 'Cohesive', peel: 'Peel', note: 'Recipe note' }[k])} ${i + 1}" value="${esc(c[k] || '')}"></td>`).join('')}<td><button data-removecomp="${i}">×</button></td></tr>`).join('')}</table></div><div class="row"><button id="comparisonCSV">${t('Export comparison CSV')}</button></div>`,
  );
  document
    .querySelectorAll('[data-comp]')
    .forEach(e => (e.oninput = () => (state.comparison[+e.dataset.comp][e.dataset.key] = e.value)));
  document.querySelectorAll('[data-removecomp]').forEach(
    b =>
      (b.onclick = () => {
        state.comparison.splice(+b.dataset.removecomp, 1);
        $('#dialog').close();
        showComparison();
        renderControls();
      }),
  );
  $('#comparisonCSV').onclick = () => exportCSV(true);
}
function csvCell(x) {
  let s = typeof x === 'object' ? JSON.stringify(x) : String(x ?? '');
  if (/^[=+@\-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function flatResult(r, t, c = {}) {
  return {
    Sample: t.sample,
    View: t.view,
    UniformityCV: r.uniformityCV,
    InterparticleOccupancy: r.interparticleOccupancy,
    TargetingEfficiency: r.targetingEfficiency,
    SecondaryAreaFraction: r.secondaryAreaFraction,
    MeanDistance: r.distance?.mean,
    MedianDistance: r.distance?.median,
    P90Distance: r.distance?.p90,
    DistanceUnit: r.distance?.unit,
    BinderCoverage: r.binderCoverage,
    Pearson: r.pearson,
    FWithSecondary: r.fWithSecondary,
    SecondaryWithF: r.secondaryWithF,
    DepthCV: r.depth?.cv,
    FDepthCV: r.depth?.fCV,
    Cohesive: c.cohesive || '',
    Peel: c.peel || '',
    RecipeNote: c.note || '',
    ToolVersion: VERSION,
    AnalyzedAt: r.analyzedAt,
    Calibration: t.parameters.calibration,
    Thresholds: t.segmentation,
    ROI: t.rois,
    ROIInvert: t.roiInvert,
    Parameters: t.parameters,
    Images: t.images,
    DepthZones: r.depth?.zones || [],
    Tiles: r.tiles,
    DistanceHistogram: r.distance?.histogram,
    DistanceBins: r.distance?.bins,
    Warnings: r.warnings,
    // Added in v0.4.0, after every earlier column so existing positions do not move.
    FAreaFraction: r.elements?.f?.areaFraction,
    FUniformityCV: r.elements?.f?.uniformityCV,
    FColumnCV: r.elements?.f?.columnCV,
    FRowCV: r.elements?.f?.rowCV,
    CAreaFraction: r.elements?.c?.areaFraction,
    CUniformityCV: r.elements?.c?.uniformityCV,
    CColumnCV: r.elements?.c?.columnCV,
    CRowCV: r.elements?.c?.rowCV,
    SecondaryColumnCV: r.elements?.secondary?.columnCV,
    SecondaryRowCV: r.elements?.secondary?.rowCV,
    CDepthCV: r.depth?.cCV,
    Elements: r.elements,
  };
}
function exportCSV(comparison = false) {
  const rows = comparison
    ? state.comparison.map(c => flatResult(c.metrics, c.trace, c))
    : state.results
      ? [flatResult(state.results, state.results.trace)]
      : [];
  if (!rows.length) {
    status('尚無分析結果。', true);
    return;
  }
  const keys = Object.keys(rows[0]);
  download(
    comparison ? 'comparison.csv' : safeName() + '.analysis.csv',
    '\uFEFF' +
      [keys, ...rows.map(r => keys.map(k => r[k]))]
        .map(row => row.map(csvCell).join(','))
        .join('\r\n'),
    'text/csv;charset=utf-8',
  );
}
$('#export').onclick = () => {
  showDialog(
    'Export',
    `<div class="row"><button id="exportCSV">${t('Analysis CSV')}</button><button id="exportJSON">${t('Analysis JSON')}</button><button id="exportPNG">${t('Overlay PNG')}</button></div><div class="row"><button id="exportSession">${t('Session JSON')}</button><button id="exportComparison">${t('Comparison CSV')}</button></div>`,
  );
  $('#exportCSV').onclick = () => exportCSV();
  $('#exportJSON').onclick = () => {
    if (!state.results) {
      status('尚無分析結果。', true);
      return;
    }
    download(
      safeName() + '.analysis.json',
      JSON.stringify(
        { schema: 'electrode-eds-analysis', results: state.results, trace: state.results.trace },
        null,
        2,
      ),
    );
  };
  $('#exportPNG').onclick = exportPNG;
  $('#exportSession').onclick = $('#save').onclick;
  $('#exportComparison').onclick = () => exportCSV(true);
};
function exportPNG() {
  if (!baseChannel() || !state.results) {
    status('請先完成分析。', true);
    return;
  }
  const old = display;
  display = 'overlay';
  draw();
  // Small maps are enlarged by a whole factor, pixels kept sharp, so the grid labels are legible.
  const source = $('#canvas'),
    out = document.createElement('canvas'),
    k = Math.max(1, Math.min(8, Math.ceil(960 / source.width))),
    imageHeight = source.height * k;
  out.width = Math.max(640, source.width * k);
  out.height = imageHeight + 100;
  const ctx = out.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, source.width * k, imageHeight);
  // The analysis grid with each cell's share of the element on show, as on screen.
  const key = state.results.elements?.[metric] ? metric : 'secondary',
    figures = state.results.elements?.[key];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const tile of state.results.tiles) {
    if (tile.x1 == null) break;
    const width = (tile.x1 - tile.x0) * k,
      height = (tile.y1 - tile.y0) * k,
      label = Math.min(22, width / 4.2, height / 1.7);
    ctx.strokeStyle = '#ffffffb0';
    ctx.lineWidth = 1;
    ctx.strokeRect(tile.x0 * k + 0.5, tile.y0 * k + 0.5, width - 1, height - 1);
    if (!tile.area || label < 7) continue;
    const share = tileShare(tile, key);
    if (share == null) continue;
    const text = (share * 100).toFixed(1) + '%',
      x = tile.x0 * k + width / 2,
      y = tile.y0 * k + height / 2;
    ctx.font = `600 ${label}px system-ui`;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(2, label / 5);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#242b35';
  const size = Math.max(12, Math.min(20, out.width / 35));
  const mark = scaleMark(140 / k);
  if (mark) {
    ctx.fillRect(out.width - 12 - mark.pixels * k, imageHeight + 18, mark.pixels * k, 4);
    ctx.font = `${size * 0.8}px system-ui`;
    ctx.textAlign = 'right';
    ctx.fillText(`${mark.um} μm`, out.width - 12, imageHeight + 44);
    ctx.textAlign = 'left';
  }
  ctx.font = `${size}px system-ui`;
  ctx.fillText(
    `${state.sample} · ${t(state.view === 'top' ? 'Top View' : 'Cross Section')} · v${VERSION}`,
    12,
    imageHeight + 28,
  );
  ctx.font = `${size * 0.8}px system-ui`;
  ctx.fillText(
    `${t('Grid labels')}: ${t(METRIC_LABELS[key])} ${t('Area fraction')} | ${fmt(figures?.areaFraction, true)} | CV ${fmt(figures?.uniformityCV)}${key === 'secondary' && state.results.distance ? ` | ${t('Median')} ${fmt(state.results.distance.median)} ${state.results.distance.unit}` : ''}`,
    12,
    imageHeight + 55,
  );
  ctx.fillText(
    `${t('2D image quantification')} · ${t(state.settings.calibration ? 'calibrated' : 'uncalibrated (px)')}`,
    12,
    imageHeight + 80,
  );
  out.toBlob(b => download(safeName() + '.overlay.png', b), 'image/png');
  display = old;
  draw();
}
