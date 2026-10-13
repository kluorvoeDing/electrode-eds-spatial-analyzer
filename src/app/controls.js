/* Left-hand step panels: Data, ROI, Segment and Analyze. */
const STEP_ORDER = ['data', 'roi', 'segment', 'analyze'],
  STEP_LABELS = { data: 'Data', roi: 'ROI', segment: 'Segment', analyze: 'Analyze' },
  STEP_HINTS = {
    data: 'Paste or choose an image for each channel. The map area is found for you and every channel is kept the same size.',
    roi: 'The region is optional: leave it empty to analyse the whole image. Enter μm / pixel here if distances should be in micrometres.',
    segment:
      'Check that the mask of each channel covers the right areas; adjust the threshold if not.',
    analyze: 'Run the analysis. Change a setting and run it again to compare.',
  };
const STEP_RENDERERS = {
  data: renderDataStep,
  roi: renderROIStep,
  segment: renderSegmentStep,
  analyze: renderAnalyzeStep,
};
function renderControls() {
  document
    .querySelectorAll('[data-step]')
    .forEach(b => b.classList.toggle('active', b.dataset.step === step));
  const c = $('#controls');
  (STEP_RENDERERS[step] || renderAnalyzeStep)(c);
  // One line on what this step is for, and the way on to the next one.
  c.querySelector('h2').insertAdjacentHTML(
    'afterend',
    `<p class="hint">${t(STEP_HINTS[step])}</p>`,
  );
  const next = STEP_ORDER[STEP_ORDER.indexOf(step) + 1];
  if (next) {
    c.insertAdjacentHTML(
      'beforeend',
      `<button id="nextStep" class="primary full" type="button">${t('Next')}${language === 'zh-Hant' ? '：' : ': '}${t(STEP_LABELS[next])}</button>`,
    );
    $('#nextStep').onclick = () => setStep(next);
  }
  setupTooltips();
}
function renderDataStep(c) {
  c.innerHTML = `<h2>${t('Data')} ${info('unit')}</h2><label class="field">${t('View')}<select id="view"><option value="top">${t('Top View')}</option><option value="cross">${t('Cross Section')}</option></select></label><label class="field">${t('Additive')}<select id="material">${MATERIALS.map(x => `<option value="${x}">${t(x)}</option>`).join('')}</select></label><div id="materialWarning"></div>${Object.entries(
    channelNames,
  )
    .map(
      ([key, name]) =>
        `<div class="drop ${pasteTarget === key ? 'paste-target' : ''}" data-drop="${key}"><strong>${t(name)} ${key === 'secondary' ? info('secondary') : info('csv')}</strong><input type="file" data-file="${key}" aria-label="${t('Import')} ${t(name)}" accept=".png,.jpg,.jpeg,.csv"><div class="row"><button data-paste="${key}" type="button">${t('Paste / Ctrl+V')}</button>${state.channels[key]?.image ? `<button data-crop="${key}" type="button">${t('Crop / review')}</button>` : ''}</div><div class="filename">${esc(state.channels[key] ? state.channels[key].name + ' · ' + state.channels[key].w + '×' + state.channels[key].h : '—')}</div>${state.channels[key] ? `<button data-remove="${key}" class="compact">${t('Remove')}</button>` : ''}</div>`,
    )
    .join(
      '',
    )}<div class="row"><button id="loadSession">${t('Load Session')}</button><button id="demo">${t('Synthetic')}</button></div>`;
  $('#view').value = state.view;
  $('#material').value = state.material;
  $('#view').onchange = e => {
    state.view = e.target.value;
    dirty();
    renderControls();
  };
  $('#material').onchange = e => {
    state.material = e.target.value;
    dirty();
    renderControls();
  };
  const mw = $('#materialWarning');
  if (state.material === 'MnO2')
    mw.innerHTML = `<div class="warning">${t('Mn tracer requires main-phase separation')} ${info('mn')}</div>`;
  if (state.material === 'Al2O3' && state.view === 'cross')
    mw.innerHTML = `<div class="warning">${t('Exclude Al current collector')} ${info('al')}</div>`;
  document
    .querySelectorAll('[data-paste]')
    .forEach(b => (b.onclick = () => preparePaste(b.dataset.paste)));
  document
    .querySelectorAll('[data-crop]')
    .forEach(
      b =>
        (b.onclick = () => openImageImport(null, b.dataset.crop, state.channels[b.dataset.crop])),
    );
  document
    .querySelectorAll('[data-file]')
    .forEach(el => (el.onchange = () => loadFile(el.files[0], el.dataset.file)));
  document.querySelectorAll('[data-drop]').forEach(el => {
    el.ondragover = e => {
      e.preventDefault();
      el.classList.add('drag');
    };
    el.ondragleave = () => el.classList.remove('drag');
    el.ondrop = e => {
      e.preventDefault();
      el.classList.remove('drag');
      loadFile(e.dataTransfer.files[0], el.dataset.drop);
    };
  });
  document.querySelectorAll('[data-remove]').forEach(
    b =>
      (b.onclick = () => {
        delete state.channels[b.dataset.remove];
        channelVersion++;
        dirty();
        masks = {};
        effectiveROI = null;
        renderControls();
        renderChannels();
        draw();
        preview();
      }),
  );
  $('#loadSession').onclick = () => $('#sessionFile').click();
  $('#demo').onclick = loadDemo;
}
function renderROIStep(c) {
  c.innerHTML = `<h2>${t('ROI')} ${info('roi')}</h2><div class="row"><select id="roiMode"><option value="rect">${t('Rectangle')}</option><option value="polygon">${t('Polygon')}</option></select><button id="drawROI">${t('Draw')}</button></div><label><input id="exclude" type="checkbox"> ${t('Exclude region')}</label><div class="row"><button id="finishPolygon">${t('Finish Polygon')}</button><button id="cancelDraw">${t('Cancel')}</button></div><div class="row"><button id="fullROI">${t('Full image')}</button><button id="clearROI">${t('Clear')}</button></div><label><input id="roiInvert" type="checkbox"> ${t('Invert ROI')}</label><div class="roilist">${state.rois.map((r, i) => `<div class="row"><span>${i + 1}. ${t(r.exclude ? 'Exclude' : 'Include')} ${t(r.type === 'rect' ? 'Rectangle' : 'Polygon')}</span><button data-delroi="${i}">×</button></div>`).join('')}</div><h3>${t('Calibration')} ${info('cal')}</h3><label class="field">${t('μm / pixel')}<input id="calibration" type="number" min="0" step="any" value="${state.settings.calibration || ''}"></label><label class="field">${t('Scale bar length (\u03bcm)')}<input id="scaleLength" type="number" min="0" step="any" value="10"></label><button id="scaleBar">${t('Select scale bar endpoints')}</button>`;
  $('#exclude').checked = exclude;
  $('#roiInvert').checked = state.roiInvert;
  $('#exclude').onchange = e => (exclude = e.target.checked);
  $('#drawROI').onclick = () => {
    drawMode = $('#roiMode').value;
    pendingPolygon = [];
    status(drawMode === 'rect' ? '拖曳 Rectangle。' : '點選 Polygon 頂點，完成後按完成。');
  };
  $('#finishPolygon').onclick = finishPolygon;
  $('#cancelDraw').onclick = () => {
    pendingPolygon = [];
    dragStart = null;
    drawMode = 'pan';
    draw();
    status('Ready');
  };
  $('#clearROI').onclick = $('#fullROI').onclick = () => {
    state.rois = [];
    state.roiInvert = false;
    dirty();
    renderControls();
    preview();
  };
  $('#roiInvert').onchange = e => {
    state.roiInvert = e.target.checked;
    dirty();
    preview();
  };
  document.querySelectorAll('[data-delroi]').forEach(
    b =>
      (b.onclick = () => {
        state.rois.splice(+b.dataset.delroi, 1);
        dirty();
        renderControls();
        preview();
      }),
  );
  $('#calibration').onchange = e => setCalibration(+e.target.value);
  $('#scaleBar').onclick = () => {
    if (!(+$('#scaleLength').value > 0)) {
      status('Scale bar length 必須 > 0。', true);
      return;
    }
    scalePoints = [];
    drawMode = 'scale';
    status('點選 Scale bar 兩端。');
  };
}
const advancedInUse = p => p.invert || p.fill || p.smooth || p.min > 0,
  advancedLabel = p => t('Advanced') + (advancedInUse(p) ? ` (${t('in use')})` : '');
function renderSegmentStep(c) {
  const p = state.seg[selected] || state.seg.secondary,
    ch = state.channels[selected],
    a = ch ? segIntensity(selected) : null,
    r = a ? Core.range(a) : { min: 0, max: 255 },
    // Clean-up options stay folded away unless one is in use, so an active setting is never hidden.
    advancedUsed = advancedInUse(p),
    // The Mn / Ni ratio only applies to Mn-based additives.
    showRatio = selected === 'secondary' && (state.material === 'MnO2' || state.settings.ratio);
  c.innerHTML = `<h2>${t('Segmentation')} ${info('threshold')}</h2><label class="field">${t('Channel')}<select id="segChannel">${ANALYSIS_KEYS.map(k => `<option value="${k}">${t(channelNames[k])}</option>`).join('')}</select></label>${state.material === 'MnO2' && !state.settings.ratio ? `<div class="warning">${t('Mn tracer requires main-phase separation')} ${info('mn')}</div>` : ''}<div class="row"><button id="auto" class="${p.auto ? 'active' : ''}">${t('Auto')}</button><button id="manual" class="${!p.auto ? 'active' : ''}">${t('Manual')}</button></div><label class="field">${t('Threshold')}<input id="thresholdNumber" type="number" step="any" value="${Number(p.threshold.toPrecision(7))}"></label><input id="thresholdSlider" aria-label="${t('Threshold slider')}" type="range" min="${r.min}" max="${r.max === r.min ? r.max + 1 : r.max}" step="any" value="${Number(p.threshold.toPrecision(7))}"><details id="segAdvanced" ${segAdvancedOpen || advancedUsed ? 'open' : ''}><summary>${advancedLabel(p)}</summary><div class="checks"><label><input id="invert" type="checkbox" ${p.invert ? 'checked' : ''}> ${t('Invert')}</label><label><input id="fill" type="checkbox" ${p.fill ? 'checked' : ''}> ${t('Fill holes')}</label><label><input id="smooth" type="checkbox" ${p.smooth ? 'checked' : ''}> ${t('Smooth')} ${info('smooth')}</label></div><label class="field">${t('Min object size (px)')}<input id="minObject" type="number" min="0" step="1" value="${p.min}"></label></details>${showRatio ? `<h3>${t('Ratio map')} ${info('mn')}</h3><label><input id="ratio" type="checkbox" ${state.settings.ratio ? 'checked' : ''}> Mn / (Ni + ε)</label><label class="field">ε<input id="epsilon" type="number" min="0.000001" step="any" value="${state.settings.epsilon}"></label>` : ''}`;
  $('#segChannel').value = selected;
  // Recorded on the click itself (the toggle event arrives later and also fires for a section
  // that is merely rendered open), so a re-render keeps the section as the user left it.
  $('#segAdvanced summary').onclick = () => {
    // No return value: returning false from a click handler would cancel the toggle itself.
    segAdvancedOpen = !$('#segAdvanced').open;
  };
  $('#segChannel').onchange = e => {
    selected = e.target.value;
    if (state.channels[selected]) $('#channel').value = selected;
    renderControls();
    draw();
  };
  $('#auto').onclick = () => {
    p.auto = true;
    dirty();
    renderControls();
    preview();
  };
  $('#manual').onclick = () => {
    p.auto = false;
    dirty();
    renderControls();
  };
  function thresholdChange(value) {
    if (!Number.isFinite(value)) {
      status('Threshold 必須為有限數值。', true);
      return;
    }
    p.threshold = value;
    p.auto = false;
    $('#thresholdNumber').value = value;
    $('#thresholdSlider').value = value;
    $('#manual').classList.add('active');
    $('#auto').classList.remove('active');
    dirty();
    schedulePreview();
  }
  $('#thresholdNumber').onchange = e => thresholdChange(+e.target.value);
  $('#thresholdSlider').oninput = e => thresholdChange(+e.target.value);
  for (const key of ['invert', 'fill', 'smooth'])
    $('#' + key).onchange = e => {
      p[key] = e.target.checked;
      $('#segAdvanced summary').textContent = advancedLabel(p);
      dirty();
      preview();
    };
  $('#minObject').onchange = e => {
    p.min = Math.max(0, Math.floor(+e.target.value || 0));
    $('#segAdvanced summary').textContent = advancedLabel(p);
    dirty();
    preview();
  };
  if ($('#ratio')) {
    $('#ratio').onchange = e => {
      state.settings.ratio = e.target.checked;
      p.auto = true;
      dirty();
      renderControls();
      preview();
    };
    $('#epsilon').onchange = e => {
      if (+e.target.value <= 0) {
        status('ε 必須 > 0。', true);
        return;
      }
      state.settings.epsilon = +e.target.value;
      dirty();
      preview();
    };
  }
}
function renderAnalyzeStep(c) {
  c.innerHTML = `<h2>${t('Analysis')}</h2><label class="field">${t('Grid')} ${info('cv')}<select id="grid">${GRID_OPTIONS.map(n => `<option value="${n}">${n} × ${n}</option>`).join('')}</select></label><label class="field">${t('Binder neighborhood')} (${state.settings.calibration ? 'μm' : 'px'}) ${info('radius')}<input id="radius" type="number" min="0" step="any" value="${state.settings.binderRadius}"></label>${state.view === 'cross' ? `<label class="field">${t('Depth axis')} ${info('depth')}<select id="depthAxis"><option value="y">${t('Y (vertical)')}</option><option value="x">${t('X (horizontal)')}</option></select></label><label><input id="depthReverse" type="checkbox" ${state.settings.depthReverse ? 'checked' : ''}> ${t('Reverse Top / Bottom')}</label>` : ''}<div class="row"><button class="primary full" id="analyze">${t('Analyze')}</button></div><div class="row"><button id="addComparison" ${state.results ? '' : 'disabled'}>${t('Add to Comparison')}</button></div><button id="showComparison">${t('Comparison')} (${state.comparison.length})</button><div id="analysisWarnings"></div>`;
  $('#grid').value = state.settings.grid;
  $('#grid').onchange = e => {
    state.settings.grid = +e.target.value;
    dirty();
  };
  $('#radius').onchange = e => {
    if (!Number.isFinite(+e.target.value) || +e.target.value < 0) {
      status('距離必須 ≥ 0。', true);
      return;
    }
    const unit = state.settings.calibration ? 'um' : 'px';
    state.settings.binderRadius = +e.target.value;
    state.settings.binderRadiusCustom = +e.target.value !== Core.BINDER_DEFAULT[unit];
    dirty();
  };
  if ($('#depthAxis')) {
    $('#depthAxis').value = state.settings.depthAxis;
    $('#depthAxis').onchange = e => {
      state.settings.depthAxis = e.target.value;
      dirty();
    };
    $('#depthReverse').onchange = e => {
      state.settings.depthReverse = e.target.checked;
      dirty();
    };
  }
  const blocked = sizeError()
    ? 'Channel sizes differ; fix them with the notice above the image.'
    : !state.channels.nmc || !state.channels.secondary
      ? 'Load the main-phase and secondary-phase maps first.'
      : '';
  if (blocked) $('#analysisWarnings').innerHTML = `<div class="warning">${t(blocked)}</div>`;
  $('#analyze').onclick = () => compute(true);
  $('#addComparison').onclick = addComparison;
  $('#showComparison').onclick = showComparison;
}
/* Changes the calibration without re-rendering; the binder radius follows the new unit. */
function applyCalibration(value) {
  const s = state.settings,
    next = value > 0 && Number.isFinite(value) ? value : null;
  s.binderRadius = Core.rescaleBinderRadius(
    s.binderRadius,
    s.binderRadiusCustom,
    s.calibration,
    next,
  );
  s.calibration = next;
}
function setCalibration(value) {
  const before = state.settings.calibration;
  applyCalibration(value);
  dirty();
  renderControls();
  draw();
  const { calibration, binderRadius, binderRadiusCustom } = state.settings;
  if (!calibration && !(before && binderRadiusCustom)) return;
  status(
    () =>
      t(calibration ? 'Calibration updated' : 'Calibration cleared') +
      (binderRadiusCustom
        ? ` · ${t('Binder neighborhood')} ${binderRadius} ${calibration ? 'μm' : 'px'}`
        : ''),
  );
}
function finishPolygon() {
  if (pendingPolygon.length < 3) {
    status('Polygon 至少需要 3 個頂點。', true);
    return;
  }
  state.rois.push({ type: 'polygon', points: pendingPolygon, exclude });
  pendingPolygon = [];
  drawMode = 'pan';
  dirty();
  renderControls();
  preview();
}
