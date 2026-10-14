/* Language switching and start-up. */
function updateChrome() {
  document.documentElement.lang = language;
  document.title = t('Electrode EDS Analyzer');
  $('#language').value = language;
  for (const [id, key] of Object.entries({
    appName: 'Electrode EDS Analyzer',
    loadSession: 'Open project',
    save: 'Save Session',
    export: 'Export',
    settings: 'Settings',
    about: 'About',
    demoMenu: 'Load the synthetic example',
    pan: 'Pan',
    closeDialog: 'Close',
    opacityLabel: 'Opacity',
    baseLabel: 'Base',
  }))
    $('#' + id).textContent = t(key);
  for (const [id, key] of Object.entries({
    sample: 'Sample name',
    channel: 'Display channel',
    zoom: 'Zoom',
    opacity: 'Overlay opacity',
    collapse: 'Toggle results',
    more: 'More',
  }))
    $('#' + id).setAttribute('aria-label', t(key));
  document
    .querySelectorAll('[data-step] .label')
    .forEach(l => (l.textContent = t(STEP_LABELS[l.parentElement.dataset.step])));
  document
    .querySelectorAll('[data-display]')
    .forEach(b => (b.textContent = t(DISPLAY_LABELS[b.dataset.display])));
  renderEmpty();
  $('#zoom').querySelector('[value="fit"]').textContent = t('Fit');
  $('#pan').title = t('Pan');
  status(lastStatus, lastStatusError);
}
function changeLanguage(value) {
  if (!setUILanguage(value)) return;
  const transient = Object.fromEntries(
    ['roiMode'].filter(id => $('#' + id)).map(id => [id, $('#' + id).value]),
  );
  $('#tooltip').classList.add('hidden');
  $('#tooltip').classList.remove('pinned');
  updateChrome();
  renderControls();
  renderChannels();
  renderResults();
  for (const [id, value] of Object.entries(transient)) if ($('#' + id)) $('#' + id).value = value;
  draw();
  setupTooltips();
}
$('#language').onchange = e => changeLanguage(e.target.value);
updateChrome();
renderControls();
renderChannels();
draw();
setupTooltips();
