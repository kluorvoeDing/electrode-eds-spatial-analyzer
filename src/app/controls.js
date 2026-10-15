/* Left-hand step panels: Data, Check masks and Analyze. */
const STEP_HINTS = {
  data: 'Paste or choose an image for each element. The map area and the scale bar are found when you crop.',
  segment:
    'Colour marks where each element is counted. Go on if it matches the maps; untick colours to check one at a time.',
  analyze: 'Click a cell to see its values; click it again for the whole region.',
};
const STEP_RENDERERS = {
  data: renderDataStep,
  segment: renderSegmentStep,
  analyze: renderAnalyzeStep,
};
function renderControls() {
  const index = STEP_ORDER.indexOf(step);
  document.querySelectorAll('[data-step]').forEach(b => {
    const i = STEP_ORDER.indexOf(b.dataset.step);
    b.classList.toggle('active', i === index);
    b.classList.toggle('done', i < index);
    b.setAttribute('aria-current', i === index ? 'step' : 'false');
  });
  $('main').dataset.stage = step;
  const c = $('#controls');
  (STEP_RENDERERS[step] || renderAnalyzeStep)(c);
  // One line on what this step is for, and the way on to the next one.
  c.querySelector('h2').insertAdjacentHTML(
    'afterend',
    `<p class="hint">${t(STEP_HINTS[step])}</p>`,
  );
  const next = STEP_ORDER[index + 1];
  if (next) {
    c.insertAdjacentHTML(
      'beforeend',
      `<div class="panel-foot"><button id="nextStep" class="primary full" type="button">${t('Next')}${language === 'zh-Hant' ? '：' : ': '}${t(STEP_LABELS[next])}</button></div>`,
    );
    $('#nextStep').onclick = () => setStep(next);
    // Nothing can be checked or measured before the main-phase map and one other are loaded.
    if (step === 'data' && analysisBlocked().startsWith('Load')) {
      $('#nextStep').disabled = true;
      $('#nextStep').insertAdjacentHTML(
        'afterend',
        `<p class="hint foot-hint">${t('Load the main-phase map and at least one of the secondary phase, F or C.')}</p>`,
      );
    }
  }
  setupTooltips();
}
const tintCSS = key => (ELEMENT_TINT[key] ? `rgb(${ELEMENT_TINT[key]})` : 'var(--ink-3)');
/* One row per channel: what it is, what is loaded, and the ways to load or change it. */
function channelRow(key) {
  const ch = state.channels[key],
    required = key === 'nmc',
    analysed = ANALYSIS_KEYS.includes(key);
  // Before an image is loaded the two ways in are spelled out; afterwards every action is an icon,
  // so the file name and four actions share one line.
  const name = t(channelNames[key]),
    action = (attribute, iconName, label, extra = '') =>
      `<button ${attribute}="${key}" type="button" class="small${ch ? ' icon-only' : ''}${extra}" title="${t(label)}" aria-label="${t(label)} · ${name}">${icon(iconName)}${ch ? '' : t(label)}</button>`;
  return `<div class="channel${ch ? ' loaded' : ''}${pasteTarget === key ? ' paste-target' : ''}" data-drop="${key}"><div class="channel-head"><span class="swatch" style="background:${tintCSS(key)}"></span><strong>${name}</strong>${key === 'secondary' ? info('secondary') : ''}<span class="channel-state">${ch ? `${ch.w} × ${ch.h}` : t(required ? 'Required' : analysed ? 'Optional' : 'Display only')}</span></div><div class="channel-body"><span class="filename" title="${ch ? esc(ch.name) : ''}">${ch ? esc(ch.name) : ''}</span><div class="channel-ops">${action('data-paste', 'paste', 'Paste')}<label class="small button${ch ? ' icon-only' : ''}" title="${t('Choose file')}">${icon('file')}${ch ? '' : t('Choose file')}<input type="file" data-file="${key}" aria-label="${t('Choose file')} · ${name}" accept=".png,.jpg,.jpeg,.csv"></label>${ch?.image ? action('data-crop', 'crop', 'Crop / review') : ''}${ch ? action('data-remove', 'close', 'Remove', ' quiet') : ''}</div></div></div>`;
}
function renderDataStep(c) {
  c.innerHTML = `<h2>${t('Data')} ${info('unit')}</h2><div class="field-pair"><label class="field">${t('View')}<select id="view"><option value="top">${t('Top View')}</option><option value="cross">${t('Cross Section')}</option></select></label><label class="field">${t('Additive')}<select id="material">${MATERIALS.map(x => `<option value="${x}">${t(x)}</option>`).join('')}</select></label></div><div id="materialWarning"></div><div class="group-label">${t('Maps to analyse')}</div>${['nmc', 'secondary', 'f', 'c'].map(channelRow).join('')}<div class="group-label">${t('Shown only, never measured')}</div>${['sem', 'other'].map(channelRow).join('')}<label class="field">${t('μm / pixel')} ${info('cal')}<input id="calibration" type="number" min="0" step="any" value="${state.settings.calibration || ''}" placeholder="${t('set from the scale bar when cropping')}"></label>`;
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
  $('#calibration').onchange = e => setCalibration(+e.target.value);
}
/* Why the analysis cannot run yet, as a message key; empty when it can. */
function analysisBlocked() {
  if (sizeError()) return 'Channel sizes differ; fix them with the notice above the image.';
  if (!state.channels.nmc || !METRIC_KEYS.some(k => state.channels[k]))
    return 'Load the main-phase map and at least one of the secondary phase, F or C.';
  if (state.material === 'Al2O3' && state.view === 'cross' && !state.rois.length)
    return 'Al₂O₃ cross sections need the current collector excluded; draw the area below.';
  return '';
}
function analyzeIfReady() {
  return analysisBlocked() ? preview() : compute(true);
}
/* After a change to what is analysed: on the analysis step the numbers follow at once, elsewhere
   only the masks are refreshed. */
function recompute() {
  return step === 'analyze' ? analyzeIfReady() : preview();
}
/* Optional tool for leaving part of the image out. Folded away: an accurately cropped map is
   analysed whole. */
function roiToolsHTML() {
  const used = state.rois.length || state.roiInvert;
  return `<details id="roiTools" ${roiToolsOpen ? 'open' : ''}><summary>${t('Limit the analysed area (optional)')}${used ? ` · ${t('in use')}` : ''}</summary><p class="hint">${t('Only needed when the image holds something that must not be counted, such as a current collector or an empty margin.')} ${info('roi')}</p><div class="button-row"><select id="roiMode"><option value="rect">${t('Rectangle')}</option><option value="polygon">${t('Polygon')}</option></select><button id="drawROI">${t('Draw')}</button></div><label class="check"><input id="exclude" type="checkbox"> ${t('Exclude region')}</label><div class="button-row"><button id="finishPolygon">${t('Finish Polygon')}</button><button id="cancelDraw">${t('Cancel')}</button></div><div class="button-row"><button id="fullROI">${t('Full image')}</button><button id="clearROI">${t('Clear')}</button></div><label class="check"><input id="roiInvert" type="checkbox"> ${t('Invert ROI')}</label><div class="roilist">${state.rois.map((r, i) => `<div class="roi-item"><span>${i + 1}. ${t(r.exclude ? 'Exclude' : 'Include')} ${t(r.type === 'rect' ? 'Rectangle' : 'Polygon')}</span><button data-delroi="${i}" class="small quiet icon-only" aria-label="${t('Remove')}">${icon('close')}</button></div>`).join('')}</div></details>`;
}
function bindROITools() {
  // Recorded on the click itself: returning nothing, so the toggle is not cancelled.
  $('#roiTools summary').onclick = () => {
    roiToolsOpen = !$('#roiTools').open;
  };
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
    recompute();
  };
  $('#roiInvert').onchange = e => {
    state.roiInvert = e.target.checked;
    dirty();
    recompute();
  };
  document.querySelectorAll('[data-delroi]').forEach(
    b =>
      (b.onclick = () => {
        state.rois.splice(+b.dataset.delroi, 1);
        dirty();
        renderControls();
        recompute();
      }),
  );
}
const advancedInUse = p => p.invert || p.fill || p.smooth || p.min > 0,
  advancedLabel = p => t('Advanced') + (advancedInUse(p) ? ` (${t('in use')})` : ''),
  // A mask the user has taken away from the defaults.
  maskAdjusted = p => !p.auto || advancedInUse(p) || p.denoise !== Core.DENOISE_DEFAULT,
  adjustLabel = () =>
    t('Adjust a mask') +
    (ANALYSIS_KEYS.some(k => maskAdjusted(state.seg[k])) ? ` (${t('in use')})` : '');
/* Share of the analysed area a mask covers, or null before it has been computed. */
function maskCoverage(key) {
  const mask = masks[key];
  if (!mask) return null;
  let covered = 0,
    area = 0;
  for (let i = 0; i < mask.length; i++) {
    covered += mask[i];
    area += effectiveROI ? effectiveROI[i] : 1;
  }
  return area ? covered / area : null;
}
function updateMaskLegend() {
  document.querySelectorAll('[data-coverage]').forEach(el => {
    const key = el.dataset.coverage;
    el.textContent = `${t(state.seg[key].auto ? 'Auto' : 'Manual')} · ${fmt(maskCoverage(key), true)}`;
  });
}
function renderSegmentStep(c) {
  const p = state.seg[selected] || state.seg.secondary,
    ch = state.channels[selected],
    r = segRanges[selected] || (ch ? Core.range(ch.data) : { min: 0, max: 255 }),
    // Clean-up options stay folded away unless one is in use, so an active setting is never hidden.
    advancedUsed = advancedInUse(p),
    // The Mn / Ni ratio only applies to Mn-based additives.
    showRatio = selected === 'secondary' && (state.material === 'MnO2' || state.settings.ratio),
    loaded = ANALYSIS_KEYS.filter(k => state.channels[k]);
  c.innerHTML = `<h2>${t('Check masks')} ${info('threshold')}</h2><div class="legend">${loaded.map(k => `<label class="legend-row"><input type="checkbox" data-maskshow="${k}" ${maskHidden.has(k) ? '' : 'checked'} aria-label="${t('Show')} ${t(channelNames[k])}"><span class="swatch" style="background:rgb(${ELEMENT_TINT[k]})"></span><span>${t(channelNames[k])}</span><span class="coverage" data-coverage="${k}"></span></label>`).join('') || `<div class="warning">${t('Load the main-phase map and at least one of the secondary phase, F or C.')}</div>`}</div>${state.material === 'MnO2' && !state.settings.ratio ? `<div class="warning">${t('Mn tracer requires main-phase separation')} ${info('mn')}</div>` : ''}<details id="segAdjust" ${segAdjustOpen ? 'open' : ''}><summary>${adjustLabel()}</summary><p class="hint">${t('While this is open, only the mask of the channel below is shown.')}</p><label class="field">${t('Channel')}<select id="segChannel">${ANALYSIS_KEYS.map(k => `<option value="${k}">${t(channelNames[k])}</option>`).join('')}</select></label><div class="seg"><button id="auto" class="${p.auto ? 'active' : ''}">${t('Auto')}</button><button id="manual" class="${!p.auto ? 'active' : ''}">${t('Manual')}</button></div><label class="field">${t('Threshold')}<input id="thresholdNumber" type="number" step="any" value="${Number(p.threshold.toPrecision(7))}"></label><input id="thresholdSlider" aria-label="${t('Threshold slider')}" type="range" min="${r.min}" max="${r.max === r.min ? r.max + 1 : r.max}" step="any" value="${Number(p.threshold.toPrecision(7))}"><label class="field">${t('Averaging radius (px)')} ${info('denoise')}<select id="denoise">${Array.from({ length: Core.DENOISE_MAX + 1 }, (_, n) => `<option value="${n}">${n ? n : t('Off')}</option>`).join('')}</select></label><details id="segAdvanced" ${segAdvancedOpen || advancedUsed ? 'open' : ''}><summary>${advancedLabel(p)}</summary><div class="checks"><label class="check"><input id="invert" type="checkbox" ${p.invert ? 'checked' : ''}> ${t('Invert')}</label><label class="check"><input id="fill" type="checkbox" ${p.fill ? 'checked' : ''}> ${t('Fill holes')}</label><label class="check"><input id="smooth" type="checkbox" ${p.smooth ? 'checked' : ''}> ${t('Smooth')} ${info('smooth')}</label></div><label class="field">${t('Min object size (px)')}<input id="minObject" type="number" min="0" step="1" value="${p.min}"></label></details>${showRatio ? `<h3>${t('Ratio map')} ${info('mn')}</h3><label class="check"><input id="ratio" type="checkbox" ${state.settings.ratio ? 'checked' : ''}> Mn / (Ni + ε)</label><label class="field">ε<input id="epsilon" type="number" min="0.000001" step="any" value="${state.settings.epsilon}"></label>` : ''}</details>`;
  updateMaskLegend();
  // Overlapping masks blend; unticking some lets each be checked against its own map.
  document.querySelectorAll('[data-maskshow]').forEach(
    box =>
      (box.onchange = () => {
        maskHidden[box.checked ? 'delete' : 'add'](box.dataset.maskshow);
        draw();
      }),
  );
  $('#segChannel').value = selected;
  $('#denoise').value = p.denoise;
  // Recorded on the click itself (the toggle event arrives later and also fires for a section
  // that is merely rendered open), so a re-render keeps the section as the user left it. While
  // the section is open only the mask being adjusted is drawn.
  $('#segAdjust > summary').onclick = () => {
    // No return value: returning false from a click handler would cancel the toggle itself.
    segAdjustOpen = !$('#segAdjust').open;
    draw();
  };
  $('#segAdvanced summary').onclick = () => {
    segAdvancedOpen = !$('#segAdvanced').open;
  };
  $('#segChannel').onchange = e => {
    selected = e.target.value;
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
    $('#segAdjust > summary').textContent = adjustLabel();
    dirty();
    schedulePreview();
  }
  $('#thresholdNumber').onchange = e => thresholdChange(+e.target.value);
  $('#thresholdSlider').oninput = e => thresholdChange(+e.target.value);
  // Averaging changes the scale of the values, so the threshold is found again.
  $('#denoise').onchange = e => {
    p.denoise = +e.target.value;
    p.auto = true;
    dirty();
    renderControls();
    preview();
  };
  for (const key of ['invert', 'fill', 'smooth'])
    $('#' + key).onchange = e => {
      p[key] = e.target.checked;
      $('#segAdvanced summary').textContent = advancedLabel(p);
      $('#segAdjust > summary').textContent = adjustLabel();
      dirty();
      preview();
    };
  $('#minObject').onchange = e => {
    p.min = Math.max(0, Math.floor(+e.target.value || 0));
    $('#segAdvanced summary').textContent = advancedLabel(p);
    $('#segAdjust > summary').textContent = adjustLabel();
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
  const blocked = analysisBlocked();
  // The one case where the area tool is required: show it rather than only naming it.
  if (blocked.startsWith('Al')) roiToolsOpen = true;
  c.innerHTML = `<h2>${t('Analysis')}</h2><label class="field">${t('Grid')} ${info('cv')}<select id="grid">${GRID_OPTIONS.map(n => `<option value="${n}">${n} × ${n}</option>`).join('')}</select></label><label class="field">${t('Binder neighborhood')} (${state.settings.calibration ? 'μm' : 'px'}) ${info('radius')}<input id="radius" type="number" min="0" step="any" value="${state.settings.binderRadius}"></label><div id="analysisWarnings">${blocked ? `<div class="warning">${t(blocked)}</div>` : ''}</div>${roiToolsHTML()}<section class="compare"><div class="group-label">${t('Comparison')} ${info('comparison')}</div><div class="button-row"><button id="addComparison" ${state.results ? '' : 'disabled'}>${t('Add to Comparison')}</button><button id="showComparison">${t('Open table')} (${state.comparison.length})</button></div></section><div class="panel-foot"><button id="analyze" class="quiet full">${t('Recalculate')}</button></div>`;
  bindROITools();
  $('#grid').value = state.settings.grid;
  $('#grid').onchange = e => {
    state.settings.grid = +e.target.value;
    dirty();
    analyzeIfReady();
  };
  $('#radius').onchange = e => {
    const text = e.target.value.trim();
    // An empty or negative distance is refused and the field shows the value still in use.
    if (!text || !Number.isFinite(+text) || +text < 0) {
      status('距離必須 ≥ 0。', true);
      e.target.value = state.settings.binderRadius;
      return;
    }
    if (+text === state.settings.binderRadius) return;
    const unit = state.settings.calibration ? 'um' : 'px';
    state.settings.binderRadius = +e.target.value;
    state.settings.binderRadiusCustom = +e.target.value !== Core.BINDER_DEFAULT[unit];
    dirty();
    analyzeIfReady();
  };
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
  recompute();
}
