/* Worker bootstrap and the segment / analyze request cycle. */
const worker = new Worker(
  URL.createObjectURL(new Blob([/*WORKER_SOURCE*/], { type: 'text/javascript' })),
);
let waiter = new Map();
worker.onmessage = ({ data }) => {
  const call = waiter.get(data.id);
  if (!call) return;
  waiter.delete(data.id);
  call(data);
};
worker.onerror = e => {
  const reason = e.message,
    message = () => t('Background calculation failed') + ': ' + messageText(reason),
    pending = [...waiter.values()];
  // Settle every pending request; otherwise compute() waits forever with the UI marked busy.
  waiter.clear();
  workerSentVersion = -1;
  busy = false;
  $('#progress').classList.add('hidden');
  status(message, true);
  for (const call of pending) call({ error: message });
};
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(preview, 80);
}
async function preview() {
  if (!dimensions() || sizeError()) return;
  return compute(false);
}
async function compute(analyze = false) {
  if (sizeError()) {
    status(sizeErrorMessage, true);
    return;
  }
  if (!dimensions()) return;
  if (analyze && analysisBlocked().startsWith('Load')) {
    status(analysisBlocked(), true);
    return;
  }
  if (state.settings.ratio && (!state.channels.nmc || !state.channels.secondary)) {
    status('Ratio 需要 Ni 與 Mn map。', true);
    return;
  }
  if (analyze && state.material === 'Al2O3' && state.view === 'cross' && !state.rois.length) {
    status('Al₂O₃ 截面請先設定極層 ROI／排除集流體。', true);
    return;
  }
  const id = ++requestId;
  latest = id;
  const rev = revision;
  busy = true;
  $('#progress').classList.remove('hidden');
  status(analyze ? 'Analyzing…' : 'Segmenting…');
  const start = performance.now();
  const payload = {
    ...dimensions(),
    channels:
      workerSentVersion !== channelVersion
        ? Object.fromEntries(
            Object.entries(state.channels)
              .filter(([k]) => ANALYSIS_KEYS.includes(k))
              .map(([k, ch]) => [k, { data: ch.data }]),
          )
        : null,
    seg: state.seg,
    rois: state.rois,
    roiInvert: state.roiInvert,
    settings: { ...state.settings, view: state.view },
    analyze,
  };
  const response = await new Promise(resolve => {
    waiter.set(id, resolve);
    worker.postMessage({ id, payload });
    workerSentVersion = channelVersion;
  });
  if (id !== latest) return;
  busy = false;
  $('#progress').classList.add('hidden');
  if (response.error) {
    status(response.error, true);
    return;
  }
  if (rev !== revision) {
    status('設定已改變，請重新分析。');
    return;
  }
  masks = response.result.masks;
  segRanges = response.result.ranges;
  effectiveROI = response.result.roi;
  for (const [k, t] of Object.entries(response.result.thresholds)) {
    if (state.seg[k].auto) state.seg[k].threshold = t;
  }
  if (analyze) {
    regionTile = null;
    state.results = response.result.results;
    state.results.elapsedMs = performance.now() - start;
    state.results.analyzedAt = new Date().toISOString();
    state.results.trace = trace();
    // The figures follow an element that was analysed; the first one when the last is gone.
    if (!state.results.elements?.[metric])
      metric = METRIC_KEYS.find(k => state.results.elements?.[k]) || 'secondary';
    renderResults();
    renderControls();
    const elapsed = Math.round(state.results.elapsedMs),
      warnings = [...state.results.warnings];
    status(
      () =>
        `${t('Analysis complete')} · ${elapsed} ms${warnings.length ? ' · ' + warnings.map(messageText).join(' ') : ''}`,
    );
  } else {
    if (step === 'segment') {
      const t = state.seg[selected]?.threshold;
      if ($('#thresholdNumber') && t != null) {
        const range = segRanges[selected];
        if (range) {
          $('#thresholdSlider').min = range.min;
          $('#thresholdSlider').max = range.max === range.min ? range.max + 1 : range.max;
        }
        $('#thresholdNumber').value = Number(t.toPrecision(7));
        $('#thresholdSlider').value = t;
      }
      updateMaskLegend();
    }
    status('Mask updated');
  }
  draw();
}
