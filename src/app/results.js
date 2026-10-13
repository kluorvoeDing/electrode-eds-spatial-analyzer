/* Results panel and its charts. */
function fmt(v, percent = false) {
  return v == null || !Number.isFinite(v)
    ? '—'
    : percent
      ? (v * 100).toFixed(2) + '%'
      : v.toFixed(3);
}
function renderResults() {
  const r = state.results;
  if (!r) {
    $('#results').innerHTML = '';
    return;
  }
  const m = (name, value, key, unit = '') =>
    `<div class="metric"><div class="label">${t(name)} ${info(key)}</div><div class="value">${value} <small>${unit}</small></div></div>`;
  $('#results').innerHTML =
    `<h2>${t('Results')}</h2>${m('Uniformity CV', fmt(r.uniformityCV), 'cv')}${m('Interparticle Occupancy', fmt(r.interparticleOccupancy, true), 'occupancy')}${m('Targeting Efficiency', fmt(r.targetingEfficiency, true), 'targeting')}${m('Median Distance', fmt(r.distance.median), 'distance', r.distance.unit)}<div class="row compact">${t('Mean')} ${fmt(r.distance.mean)} · P90 ${fmt(r.distance.p90)}</div>${state.channels.f ? m('Binder Coverage', fmt(r.binderCoverage, true), 'binder') : ''}<h3>${t('Distance distribution')} ${info('distance')}</h3><canvas id="hist" class="chart" width="260" height="130"></canvas><div class="compact" id="bins"></div><h3>${t('Local area fraction')} ${info('cv')}</h3><canvas id="tileChart" class="chart" width="260" height="130"></canvas>${state.channels.f ? `<h3>${t('F colocalization')} ${info('overlap')}</h3><div class="row">${t('Pearson r')} ${info('pearson')} <strong>${fmt(r.pearson)}</strong></div><div class="row compact">${t('F with Secondary')} <strong>${fmt(r.fWithSecondary, true)}</strong></div><div class="row compact">${t('Secondary with F')} <strong>${fmt(r.secondaryWithF, true)}</strong></div>` : ''}${r.depth ? `${m('Depth CV', fmt(r.depth.cv), 'depth')}<table><tr><th>${t('Zone')}</th><th>${t('Additive')}</th><th>F</th><th>${t('Overlap')}</th></tr>${r.depth.zones.map(z => `<tr><td>${t(z.zone)}</td><td>${fmt(z.secondaryFraction, true)}</td><td>${fmt(z.fFraction, true)}</td><td>${fmt(z.overlapFraction, true)}</td></tr>`).join('')}</table><div class="compact">${t('F Depth CV')} ${fmt(r.depth.fCV)}</div>` : ''}${r.warnings.map(w => `<div class="warning">${esc(messageText(w))}</div>`).join('')}`;
  const ctx = $('#hist').getContext('2d'),
    max = Math.max(...r.distance.histogram, 1);
  ctx.fillStyle = '#078491';
  r.distance.histogram.forEach((v, i) =>
    ctx.fillRect(10 + i * 12, 105 - (v / max) * 90, 10, (v / max) * 90),
  );
  ctx.fillStyle = '#6b7380';
  ctx.font = '11px system-ui';
  ctx.fillText(`0`, 10, 124);
  ctx.fillText(`${fmt(r.distance.max)} ${r.distance.unit}`, 175, 124);
  ctx.fillText(`${max} px`, 10, 11);
  $('#bins').innerHTML = r.distance.bins
    .map(
      (v, i) =>
        `${['< ' + r.distance.edges[0], r.distance.edges[0] + ' – ' + r.distance.edges[1], r.distance.edges[1] + ' – ' + r.distance.edges[2], '> ' + r.distance.edges[2]][i]} ${r.distance.unit}: ${fmt(v / r.secondaryPixels, true)}`,
    )
    .join('<br>');
  const tc = $('#tileChart').getContext('2d'),
    grid = state.settings.grid,
    tm = Math.max(...r.tiles.map(t => t.fraction || 0), 0.01),
    cell = 120 / grid;
  r.tiles.forEach(t => {
    tc.fillStyle = t.area ? `rgba(7,132,145,${0.1 + (0.9 * (t.fraction || 0)) / tm})` : '#ddd';
    tc.fillRect(5 + t.x * cell, 5 + t.y * cell, cell - 1, cell - 1);
  });
  tc.fillStyle = '#6b7380';
  tc.font = '11px system-ui';
  tc.fillText(`0 – ${fmt(tm, true)}`, 140, 22);
  setupTooltips();
}
