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
  status(() => t('Background calculation failed') + ': ' + messageText(e.message), true);
  busy = false;
  $('#progress').classList.add('hidden');
};
function segIntensity(key) {
  const ch = state.channels[key];
  if (key === 'secondary' && state.settings.ratio && state.channels.nmc)
    return Float64Array.from(
      ch.data,
      (v, i) => v / (state.channels.nmc.data[i] + state.settings.epsilon),
    );
  return ch.data;
}
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
  if (analyze && (!state.channels.nmc || !state.channels.secondary)) {
    status('請載入 NMC 與 Secondary map。', true);
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
  if (rev !== revision) {
    status('設定已改變，請重新分析。');
    return;
  }
  if (response.error) {
    status(response.error, true);
    return;
  }
  masks = response.result.masks;
  effectiveROI = response.result.roi;
  for (const [k, t] of Object.entries(response.result.thresholds)) {
    if (state.seg[k].auto) state.seg[k].threshold = t;
  }
  if (analyze) {
    state.results = response.result.results;
    state.results.elapsedMs = performance.now() - start;
    state.results.analyzedAt = new Date().toISOString();
    state.results.trace = trace();
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
        $('#thresholdNumber').value = Number(t.toPrecision(7));
        $('#thresholdSlider').value = t;
      }
    }
    status('Mask updated');
  }
  draw();
}
