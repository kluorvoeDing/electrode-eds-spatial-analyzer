/* Page chrome: layout, status line, dialog, tooltips, settings and About. */
$('#app').innerHTML =
  `<header><strong id="appName">${t('Electrode EDS Analyzer')}</strong><select id="language" aria-label="Language / 介面語言"><option value="zh-Hant">繁體中文</option><option value="en">English</option></select><input id="sample" aria-label="Sample name" value="Untitled"><button id="import">${t('Import')}</button><button id="save">${t('Save Session')}</button><button id="export">${t('Export')}</button><button id="settings">${t('Settings')}</button><button id="about">${t('About')}</button></header><main><aside><nav>${['data', 'roi', 'segment', 'analyze'].map((s, i) => `<button data-step="${s}">${i + 1} ${t(s === 'roi' ? 'ROI' : s[0].toUpperCase() + s.slice(1))}</button>`).join('')}</nav><div id="controls"></div></aside><section id="workspace"><div class="toolbar"><select id="channel" aria-label="Display channel"></select><div class="row" style="margin:0">${['original', 'mask', 'overlay'].map(x => `<button data-display="${x}">${t(x[0].toUpperCase() + x.slice(1))}</button>`).join('')}</div><label class="row compact"><span id="opacityLabel">${t('Opacity')}</span> <input type="range" id="opacity" min="0" max="1" step="0.05" value="0.45" aria-label="Overlay opacity"></label><span class="spacer"></span><select id="zoom" aria-label="Zoom"><option value="fit">${t('Fit')}</option><option value=".5">50%</option><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select><button id="pan" title="Pan">${t('Pan')}</button></div><div id="progress" class="progress hidden"></div><div id="viewport"><canvas id="canvas"></canvas><div class="empty" id="empty">${t('Import map')}</div></div></section><aside class="right"><button id="collapse" aria-label="Toggle results">⇥</button><div id="results"></div></aside></main><footer><span id="status">${t('Ready')}</span><span id="dimensions"></span><span>v${VERSION}</span>${info('scope')}</footer><div id="tooltip" role="tooltip" class="hidden"></div><dialog id="dialog"><div class="dialogbar"><h2 id="dialogtitle"></h2><button id="closeDialog">${t('Close')}</button></div><div id="dialogbody"></div></dialog><input id="sessionFile" type="file" accept=".json" hidden>`;
function status(message, error = false) {
  lastStatus = message;
  lastStatusError = error;
  $('#status').textContent = messageText(typeof message === 'function' ? message() : message);
  $('#status').classList.toggle('error', error);
}
function dirty() {
  revision++;
  state.results = null;
  renderResults();
}
function baseChannel() {
  return (
    state.channels.sem ||
    state.channels[selected] ||
    state.channels.nmc ||
    Object.values(state.channels)[0]
  );
}
function dimensions() {
  const ch = Object.values(state.channels)[0];
  return ch ? { w: ch.w, h: ch.h } : null;
}
function sizeError() {
  const a = Object.values(state.channels);
  return a.length && a.some(c => c.w !== a[0].w || c.h !== a[0].h);
}
function showDialog(title, body) {
  $('#dialog').classList.toggle('image-editor', title === 'Crop and review');
  $('#dialogtitle').textContent = t(title);
  $('#dialogbody').innerHTML = body;
  $('#dialog').showModal();
}
$('#dialog').addEventListener('close', () => {
  awaitingPaste = false;
  imageImport = null;
  imageImportTicket++;
});
$('#closeDialog').onclick = () => $('#dialog').close();
$('#dialog').onclick = e => {
  if (e.target === $('#dialog')) $('#dialog').close();
};
function renderChannels() {
  const current = $('#channel').value;
  $('#channel').innerHTML = Object.keys(state.channels)
    .map(k => `<option value="${k}">${t(channelNames[k])}</option>`)
    .join('');
  $('#channel').value = state.channels[current]
    ? current
    : state.channels[selected]
      ? selected
      : Object.keys(state.channels)[0] || '';
  $('#dimensions').textContent = dimensions() ? `${dimensions().w} × ${dimensions().h} px` : '';
}
$('#settings').onclick = () =>
  showDialog(
    'Settings',
    `<label class="field">${t('Overlay opacity')}<input id="settingsOpacity" type="range" min="0" max="1" step=".05" value="${opacity}"></label><button id="clearData">${t('Clear Local Data')}</button>`,
  );
$('#dialogbody').addEventListener('input', e => {
  if (e.target.id === 'settingsOpacity') {
    opacity = +e.target.value;
    $('#opacity').value = opacity;
    draw();
  }
});
$('#dialogbody').addEventListener('click', e => {
  if (e.target.id === 'clearData') {
    state = {
      sample: 'Untitled',
      view: 'top',
      material: 'TiO2',
      channels: {},
      seg: { nmc: defaults(), secondary: defaults(), f: defaults() },
      rois: [],
      roiInvert: false,
      settings: {
        grid: 5,
        calibration: null,
        binderRadius: 3,
        ratio: false,
        epsilon: 1,
        depthAxis: 'y',
        depthReverse: false,
      },
      comparison: [],
      results: null,
    };
    channelVersion++;
    revision++;
    masks = {};
    effectiveROI = null;
    $('#sample').value = 'Untitled';
    step = 'data';
    $('#dialog').close();
    renderControls();
    renderChannels();
    renderResults();
    draw();
    status('Local data cleared');
  }
});
$('#about').onclick = () =>
  showDialog(
    'About',
    `<p>Electrode EDS Spatial Analyzer · v${VERSION}</p><p>${help.scope}</p><p>${t('About intensity')}</p><p>${t('About offline')}</p>`,
  );
$('#collapse').onclick = () => $('main').classList.toggle('collapsed');
function setupTooltips() {
  document.querySelectorAll('[data-help]').forEach(el => {
    const show = (full = false) => {
      const t = $('#tooltip'),
        text = help[el.dataset.help] || el.dataset.help;
      t.textContent = full
        ? text
        : language === 'en'
          ? text.split(';')[0].split('. ')[0] + (text.endsWith('.') ? '' : '.')
          : text.split('；')[0].split('。')[0] + '。';
      t.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      t.style.left = Math.max(8, Math.min(innerWidth - 350, r.left)) + 'px';
      t.style.top = Math.min(innerHeight - t.offsetHeight - 10, r.bottom + 8) + 'px';
    };
    el.onmouseenter = () => show(false);
    el.onfocus = () => show(false);
    el.onmouseleave = () => {
      if (!$('#tooltip').classList.contains('pinned')) $('#tooltip').classList.add('hidden');
    };
    el.onblur = el.onmouseleave;
    el.onclick = e => {
      e.stopPropagation();
      show(true);
      $('#tooltip').classList.toggle('pinned');
    };
  });
}
document.addEventListener('click', () => {
  $('#tooltip').classList.add('hidden');
  $('#tooltip').classList.remove('pinned');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    pendingPolygon = [];
    drawMode = 'pan';
    $('#tooltip').classList.add('hidden');
    $('#tooltip').classList.remove('pinned');
    draw();
  }
});
