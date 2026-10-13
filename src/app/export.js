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
    `<div style="overflow:auto"><table><tr><th>${t('Sample')}</th><th>${t('CV')}</th><th>${t('Occupancy')}</th><th>${t('Targeting')}</th><th>${t('Median')}</th><th>${t('Binder')}</th><th>${t('Depth CV')}</th><th>${t('Cohesive')}</th><th>${t('Peel')}</th><th>${t('Recipe note')}</th><th></th></tr>${state.comparison.map((c, i) => `<tr><td>${esc(c.sample)}</td><td>${fmt(c.metrics.uniformityCV)}</td><td>${fmt(c.metrics.interparticleOccupancy, true)}</td><td>${fmt(c.metrics.targetingEfficiency, true)}</td><td>${fmt(c.metrics.distance.median)} ${esc(c.metrics.distance.unit)}</td><td>${fmt(c.metrics.binderCoverage, true)}</td><td>${fmt(c.metrics.depth?.cv)}</td>${['cohesive', 'peel', 'note'].map(k => `<td><input data-comp="${i}" data-key="${k}" aria-label="${t({ cohesive: 'Cohesive', peel: 'Peel', note: 'Recipe note' }[k])} ${i + 1}" value="${esc(c[k] || '')}"></td>`).join('')}<td><button data-removecomp="${i}">×</button></td></tr>`).join('')}</table></div><div class="row"><button id="comparisonCSV">${t('Export comparison CSV')}</button></div>`,
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
    MeanDistance: r.distance.mean,
    MedianDistance: r.distance.median,
    P90Distance: r.distance.p90,
    DistanceUnit: r.distance.unit,
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
    DistanceHistogram: r.distance.histogram,
    DistanceBins: r.distance.bins,
    Warnings: r.warnings,
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
  const source = $('#canvas'),
    out = document.createElement('canvas');
  out.width = Math.max(640, source.width);
  out.height = source.height + 100;
  const ctx = out.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);
  ctx.fillStyle = '#242b35';
  const size = Math.max(12, Math.min(20, out.width / 35));
  ctx.font = `${size}px system-ui`;
  ctx.fillText(
    `${state.sample} · ${t(state.view === 'top' ? 'Top View' : 'Cross Section')} · v${VERSION}`,
    12,
    source.height + 28,
  );
  ctx.font = `${size * 0.8}px system-ui`;
  ctx.fillText(
    `CV ${fmt(state.results.uniformityCV)} | ${t('Occupancy')} ${fmt(state.results.interparticleOccupancy, true)} | ${t('Median')} ${fmt(state.results.distance.median)} ${state.results.distance.unit}`,
    12,
    source.height + 55,
  );
  ctx.fillText(
    `${t('2D image quantification')} · ${t(state.settings.calibration ? 'calibrated' : 'uncalibrated (px)')}`,
    12,
    source.height + 80,
  );
  out.toBlob(b => download(safeName() + '.overlay.png', b), 'image/png');
  display = old;
  draw();
}
