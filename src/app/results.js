/* Results panel and its charts. */
function fmt(v, percent = false) {
  return v == null || !Number.isFinite(v)
    ? '—'
    : percent
      ? (v * 100).toFixed(2) + '%'
      : v.toFixed(3);
}
/* One plain sentence per figure, shown under it. */
const METRIC_NOTES = {
  area: 'Share of this area covered by the secondary phase.',
  cv: 'How much that share differs from cell to cell. Lower is more even.',
  occupancy: 'Share of the space between main-phase particles filled by the secondary phase.',
  targeting: 'Share of the secondary phase that lies between particles rather than on them.',
  distance: 'Typical distance from the secondary phase to the nearest main-phase surface.',
  binder: 'Share of the secondary-phase outline with binder within the set distance.',
  depth:
    'How much that share differs between the top, middle and bottom thirds. Lower is more even.',
};
/* The results panel shows either the whole analysed region or the grid cell picked on the image. */
function renderResults() {
  const r = state.results;
  if (!r) {
    $('#results').innerHTML = '';
    return;
  }
  const tile = regionTile == null ? null : r.tiles[regionTile],
    grid = Math.round(Math.sqrt(r.tiles.length)),
    m = (name, value, key, unit = '', note = key) =>
      `<div class="metric"><div class="label">${t(name)} ${info(key)}</div><div class="value">${value} <small>${unit}</small></div><div class="note">${t(METRIC_NOTES[note])}</div></div>`,
    binder = state.channels.f
      ? m('Binder Coverage', fmt((tile || r).binderCoverage, true), 'binder')
      : '',
    region = tile
      ? `<div class="region"><strong>${t('Row {r} · column {c}')
          .replace('{r}', tile.y + 1)
          .replace(
            '{c}',
            tile.x + 1,
          )}</strong><span class="muted compact">${grid} × ${grid}</span><button id="regionAll" type="button">${t('Whole region')}</button></div><p class="hint">${t('Values of this cell only. The smaller the cell, the less steady the numbers.')}</p>`
      : `<div class="region"><strong>${t('Whole region')}</strong></div><p class="hint">${t('Click a cell on the image to see its values.')}</p>`;
  if (tile) {
    $('#results').innerHTML =
      `<h2>${t('Results')}</h2>${region}${m('Secondary area fraction', fmt(tile.fraction, true), 'cv', '', 'area')}${m('Interparticle Occupancy', fmt(tile.interparticleOccupancy, true), 'occupancy')}${m('Targeting Efficiency', fmt(tile.targetingEfficiency, true), 'targeting')}${m('Median Distance', fmt(tile.distanceMedian), 'distance', r.distance.unit)}<div class="row compact">${t('Mean')} ${fmt(tile.distanceMean)}</div>${binder}<div class="row compact muted">${t('Uniformity CV')}: ${t('whole region only')} · ${tile.area} px</div>`;
    $('#regionAll').onclick = () => {
      regionTile = null;
      renderResults();
      renderGridOverlay();
    };
    setupTooltips();
    return;
  }
  $('#results').innerHTML =
    `<h2>${t('Results')}</h2>${region}${m('Secondary area fraction', fmt(r.secondaryAreaFraction, true), 'cv', '', 'area')}${m('Uniformity CV', fmt(r.uniformityCV), 'cv')}${m('Interparticle Occupancy', fmt(r.interparticleOccupancy, true), 'occupancy')}${m('Targeting Efficiency', fmt(r.targetingEfficiency, true), 'targeting')}${m('Median Distance', fmt(r.distance.median), 'distance', r.distance.unit)}<div class="row compact">${t('Mean')} ${fmt(r.distance.mean)} · P90 ${fmt(r.distance.p90)}</div>${binder}<h3>${t('Distance distribution')} ${info('distance')}</h3><canvas id="hist" class="chart" width="260" height="130"></canvas><div class="compact" id="bins"></div>${state.channels.f ? `<h3>${t('F colocalization')} ${info('overlap')}</h3><div class="row">${t('Pearson r')} ${info('pearson')} <strong>${fmt(r.pearson)}</strong></div><div class="row compact">${t('F with Secondary')} <strong>${fmt(r.fWithSecondary, true)}</strong></div><div class="row compact">${t('Secondary with F')} <strong>${fmt(r.secondaryWithF, true)}</strong></div>` : ''}${r.depth ? `${m('Depth CV', fmt(r.depth.cv), 'depth')}<table><tr><th>${t('Zone')}</th><th>${t('Additive')}</th><th>F</th><th>${t('Overlap')}</th></tr>${r.depth.zones.map(z => `<tr><td>${t(z.zone)}</td><td>${fmt(z.secondaryFraction, true)}</td><td>${fmt(z.fFraction, true)}</td><td>${fmt(z.overlapFraction, true)}</td></tr>`).join('')}</table><div class="compact">${t('F Depth CV')} ${fmt(r.depth.fCV)}</div>` : ''}${r.warnings.map(w => `<div class="warning">${esc(messageText(w))}</div>`).join('')}`;
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
  setupTooltips();
}
