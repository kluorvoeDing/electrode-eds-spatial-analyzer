/* Page chrome: layout, status line, dialog, tooltips, settings and About. */
$('#app').innerHTML =
  `<header class="topbar"><div class="brand"><svg class="mark" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><rect x="1" y="1" width="16" height="16" rx="4"/><circle cx="6.5" cy="7" r="2.2" fill="#e040fb"/><circle cx="11.5" cy="11.2" r="2.2" fill="#ff9800"/><circle cx="12" cy="5.4" r="1.3" fill="#2979ff"/><circle cx="5.6" cy="12.3" r="1" fill="#20b278"/></svg><strong id="appName">${t('Electrode EDS Analyzer')}</strong><span class="sep"></span><input id="sample" aria-label="${t('Sample name')}" value="Untitled" spellcheck="false"></div><nav class="stepper" aria-label="${t('Steps')}">${STEP_ORDER.map((s, i) => `${i ? '<span class="link"></span>' : ''}<button data-step="${s}"><span class="n">${i + 1}</span><span class="label">${t(STEP_LABELS[s])}</span></button>`).join('')}</nav><div class="actions"><select id="language" class="quiet" aria-label="Language / 介面語言"><option value="zh-Hant">中文</option><option value="en">English</option></select><button id="loadSession" class="ghost">${t('Open project')}</button><button id="save">${t('Save Session')}</button><button id="export" class="primary">${t('Export')}</button><div class="menu-wrap"><button id="more" class="ghost icon-only" title="${t('More')}" aria-label="${t('More')}" aria-haspopup="true" aria-expanded="false">${icon('more')}</button><div id="moreMenu" class="menu hidden" role="menu"><button id="demoMenu" role="menuitem">${t('Load the synthetic example')}</button><button id="settings" role="menuitem">${t('Settings')}</button><button id="about" role="menuitem">${t('About')}</button></div></div></div></header><main><aside class="left"><div id="controls"></div></aside><section id="workspace"><div class="toolbar"><div class="seg dark" role="group" aria-label="${t('View')}">${DISPLAY_MODES.map(x => `<button data-display="${x}">${t(DISPLAY_LABELS[x])}</button>`).join('')}</div><label class="base-pick"><span id="baseLabel">${t('Base')}</span><select id="channel" aria-label="Display channel"></select></label><div class="layer-slot"><span id="maskLabel" class="legend-inline"></span><div id="elementChips" class="chips hidden"></div></div><label class="range"><span id="opacityLabel">${t('Opacity')}</span><input type="range" id="opacity" min="0" max="1" step="0.05" value="0.45" aria-label="Overlay opacity"></label><select id="zoom" aria-label="Zoom"><option value="fit">${t('Fit')}</option><option value=".5">50%</option><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select><button id="pan" class="hidden" title="Pan">${t('Pan')}</button></div><div id="progress" class="progress hidden"></div><div id="notice" class="notice hidden" role="alert"></div><div id="viewport"><div id="stage"><canvas id="canvas"></canvas><div id="gridOverlay" class="hidden"></div><div class="under-image"><div id="scaleMark" class="hidden"></div><div id="gridCaption" class="hidden"></div></div></div><div class="empty" id="empty"></div></div><div id="trends" class="trends hidden"></div></section><aside class="right"><button id="collapse" class="ghost icon-only" aria-label="Toggle results">${icon('panel')}</button><div id="results"></div></aside></main><footer><span class="dot-status"></span><span id="status">${t('Ready')}</span><span id="dimensions"></span><span>v${VERSION}</span>${info('scope')}</footer><div id="tooltip" role="tooltip" class="hidden"></div><dialog id="dialog"><div class="dialogbar"><h2 id="dialogtitle"></h2><button id="closeDialog" class="ghost">${t('Close')}</button></div><div id="dialogbody"></div></dialog><input id="sessionFile" type="file" accept=".json" hidden>`;
/* What the image area shows before anything is loaded: where to start, and the two other ways in. */
function renderEmpty() {
  $('#empty').innerHTML =
    `<div class="empty-card"><h2>${t('Start with the first element map')}</h2><p>${t('Paste or choose it on the left. The map area and the scale bar are found for you.')}</p><div class="empty-actions"><button id="emptyOpen">${icon('open')}${t('Open a saved project')}</button><button id="demo">${t('Try the synthetic example')}</button></div><p class="fine">${t('The example is generated data for trying the steps; it is not a measurement.')}</p></div>`;
  $('#emptyOpen').onclick = () => $('#sessionFile').click();
  $('#demo').onclick = loadDemo;
}
function status(message, error = false) {
  lastStatus = message;
  lastStatusError = error;
  $('#status').textContent = messageText(typeof message === 'function' ? message() : message);
  $('#status').classList.toggle('error', error);
  $('footer').classList.toggle('error', error);
  renderNotice();
}
/* Channels whose size differs from the analysis grid, with the grid they should match. */
function gridMismatch() {
  const grid = gridTarget();
  if (!grid) {
    const first = Object.values(state.channels)[0];
    return first
      ? {
          grid: { w: first.w, h: first.h },
          offenders: Object.keys(state.channels).filter(
            k => state.channels[k].w !== first.w || state.channels[k].h !== first.h,
          ),
        }
      : null;
  }
  return {
    grid,
    offenders: Object.keys(state.channels).filter(
      k => state.channels[k].w !== grid.w || state.channels[k].h !== grid.h,
    ),
  };
}
/* Problems that stop the workflow are shown above the image, not only in the footer. A size
   mismatch names the channel to fix and offers the way there. */
function renderNotice() {
  const el = $('#notice'),
    mismatch = sizeError() ? gridMismatch() : null;
  if (mismatch?.offenders.length) {
    el.innerHTML = `<strong>${t('Calculation is paused: channel sizes differ.')}</strong> <span>${t('Analysis grid')} ${mismatch.grid.w} × ${mismatch.grid.h} px</span>${mismatch.offenders
      .map(k => {
        const ch = state.channels[k],
          size = `${t(channelNames[k])} ${ch.w} × ${ch.h}`;
        return ch.image
          ? `<button type="button" data-fix="${k}">${t('Fix')} ${esc(size)}</button>`
          : `<span>${esc(size)} · ${t('Re-import this channel at the grid size, or remove it.')}</span>`;
      })
      .join('')}`;
    el.querySelectorAll('[data-fix]').forEach(
      b => (b.onclick = () => openImageImport(null, b.dataset.fix, state.channels[b.dataset.fix])),
    );
  } else if (lastStatusError) el.textContent = $('#status').textContent;
  el.classList.toggle('hidden', !(mismatch?.offenders.length || lastStatusError));
}
function dirty() {
  revision++;
  state.results = null;
  regionTile = null;
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
  $('#channel').classList.toggle('hidden', !Object.keys(state.channels).length);
  renderElementChips();
  renderNotice();
}
/* Element maps available to the element view, and the ones currently laid over the backdrop. */
function shownElements() {
  const loaded = Object.keys(state.channels).filter(k => k !== 'sem'),
    chosen = elementsShown || (loaded.includes('secondary') ? ['secondary'] : loaded);
  return { loaded, shown: loaded.filter(k => [...chosen].includes(k)) };
}
function renderElementChips() {
  const { loaded, shown } = shownElements(),
    el = $('#elementChips');
  el.innerHTML = loaded
    .map(
      k =>
        `<label title="${t(channelNames[k])}"><input type="checkbox" data-element="${k}" ${shown.includes(k) ? 'checked' : ''} aria-label="${t('Show')} ${t(channelNames[k])}"><span class="swatch" style="background:rgb(${ELEMENT_TINT[k]})"></span>${t(SHORT_NAMES[k])}</label>`,
    )
    .join('');
  el.querySelectorAll('[data-element]').forEach(
    box =>
      (box.onchange = () => {
        elementsShown = new Set(
          [...el.querySelectorAll('[data-element]')]
            .filter(b => b.checked)
            .map(b => b.dataset.element),
        );
        draw();
      }),
  );
  el.classList.toggle('hidden', display !== 'elements' || !loaded.length);
}
$('#settings').onclick = () =>
  showDialog(
    'Settings',
    `<label class="field">${t('Overlay opacity')}<input id="settingsOpacity" type="range" min="0" max="1" step=".05" value="${opacity}"></label><button id="clearData">${t('Reset workspace')}</button>`,
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
    state = initialState();
    elementsShown = null;
    channelVersion++;
    revision++;
    masks = {};
    segRanges = {};
    effectiveROI = null;
    regionTile = null;
    segAdjustOpen = roiToolsOpen = false;
    $('#sample').value = 'Untitled';
    step = 'data';
    $('#dialog').close();
    renderControls();
    renderChannels();
    renderResults();
    draw();
    status('Workspace reset');
  }
});
$('#about').onclick = () =>
  showDialog(
    'About',
    `<p>Electrode EDS Spatial Analyzer · v${VERSION}</p><p>${help.scope}</p><p>${t('About intensity')}</p><p>${t('About offline')}</p>`,
  );
$('#collapse').onclick = () => $('main').classList.toggle('collapsed');
$('#loadSession').onclick = () => $('#sessionFile').click();
function closeMenu() {
  $('#moreMenu').classList.add('hidden');
  $('#more').setAttribute('aria-expanded', 'false');
}
$('#more').onclick = e => {
  e.stopPropagation();
  const open = $('#moreMenu').classList.toggle('hidden');
  $('#more').setAttribute('aria-expanded', String(!open));
};
$('#moreMenu').addEventListener('click', closeMenu);
document.addEventListener('click', closeMenu);
// The example replaces whatever is loaded, so it asks first when there is something to lose.
$('#demoMenu').onclick = () => {
  if (
    Object.keys(state.channels).length &&
    !confirm(t('Replace the loaded images with the synthetic example?'))
  )
    return;
  loadDemo();
};
function setupTooltips() {
  document.querySelectorAll('[data-help]').forEach(el => {
    // The texts are short enough to show whole on hover.
    const show = () => {
      const t = $('#tooltip');
      t.textContent = help[el.dataset.help] || el.dataset.help;
      t.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      t.style.left = Math.max(8, Math.min(innerWidth - 320, r.left - 8)) + 'px';
      t.style.top = Math.min(innerHeight - t.offsetHeight - 10, r.bottom + 8) + 'px';
    };
    el.onmouseenter = () => show();
    el.onfocus = () => show();
    el.onmouseleave = () => {
      if (!$('#tooltip').classList.contains('pinned')) $('#tooltip').classList.add('hidden');
    };
    el.onblur = el.onmouseleave;
    el.onclick = e => {
      e.stopPropagation();
      show();
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
