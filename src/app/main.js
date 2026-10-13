/* Language switching and start-up. */
function updateChrome() {
  document.documentElement.lang = language;
  document.title = t('Electrode EDS Analyzer');
  $('#language').value = language;
  for (const [id, key] of Object.entries({
    appName: 'Electrode EDS Analyzer',
    import: 'Import',
    save: 'Save Session',
    export: 'Export',
    settings: 'Settings',
    about: 'About',
    pan: 'Pan',
    closeDialog: 'Close',
    empty: 'Import map',
    opacityLabel: 'Opacity',
  }))
    $('#' + id).textContent = t(key);
  for (const [id, key] of Object.entries({
    sample: 'Sample name',
    channel: 'Display channel',
    zoom: 'Zoom',
    opacity: 'Overlay opacity',
    collapse: 'Toggle results',
  }))
    $('#' + id).setAttribute('aria-label', t(key));
  document.querySelectorAll('[data-step]').forEach(b => {
    const s = b.dataset.step;
    b.textContent =
      { data: '1 ', roi: '2 ', segment: '3 ', analyze: '4 ' }[s] +
      t({ data: 'Data', roi: 'ROI', segment: 'Segment', analyze: 'Analyze' }[s]);
  });
  document
    .querySelectorAll('[data-display]')
    .forEach(
      b => (b.textContent = t(b.dataset.display[0].toUpperCase() + b.dataset.display.slice(1))),
    );
  $('#zoom').querySelector('[value="fit"]').textContent = t('Fit');
  $('#pan').title = t('Pan');
  status(lastStatus, lastStatusError);
}
function changeLanguage(value) {
  if (!setUILanguage(value)) return;
  const transient = Object.fromEntries(
    ['roiMode', 'scaleLength'].filter(id => $('#' + id)).map(id => [id, $('#' + id).value]),
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
