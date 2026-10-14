/* Results panel, per element, and the row / column trend charts under the image. */
function fmt(v, percent = false) {
  return v == null || !Number.isFinite(v)
    ? '—'
    : percent
      ? (v * 100).toFixed(2) + '%'
      : v.toFixed(3);
}
// Short names for the elements whose distribution is reported.
const METRIC_LABELS = { secondary: 'Secondary phase', f: 'Binder F', c: 'Carbon C' },
  // Line colours on the white chart surface: the channel hues, darkened until they read on white.
  CHART_TINT = { secondary: '#d97b00', f: '#2563d6', c: '#a68a00' };
/* Share of one element in one grid cell. */
function tileShare(tile, key) {
  return key === 'secondary' ? tile.fraction : key === 'f' ? tile.fFraction : tile.cFraction;
}
/* One figure: label with its help, the value, and a few words on how to read it. */
function kpi(label, value, { help, unit = '', note = '', hero = false } = {}) {
  const [number, suffix] = value.endsWith('%') ? [value.slice(0, -1), '%'] : [value, unit];
  return `<div class="kpi${hero ? ' hero' : ''}"><div class="kpi-label">${t(label)}${help ? ' ' + info(help) : ''}</div><div class="kpi-value">${number}${suffix ? `<small>${suffix}</small>` : ''}</div>${note ? `<div class="kpi-note">${t(note)}</div>` : ''}</div>`;
}
const groupLabel = text => `<div class="group-label">${t(text)}</div>`;
/* Figures of one element for the whole analysed region. */
function wholeRegionFigures(r, key) {
  const e = r.elements[key],
    // Direction in one block: across the image (left / right) and down it (top / bottom), by
    // thirds of the image and by grid column or row.
    spread = `${kpi('Uniformity CV', fmt(e.uniformityCV), { help: 'cv', note: 'Cell-to-cell spread; lower is more even.' })}${groupLabel('Spread by direction')}<table class="direction"><tr><th></th><th>${t('Left / right')}</th><th>${t('Top / bottom')}</th></tr><tr><th>${t('Thirds CV')} ${info('thirds')}</th><td>${fmt(e.thirds.columnCV)}</td><td>${fmt(e.thirds.rowCV)}</td></tr><tr><th>${t('Column / row CV')} ${info('profileCV')}</th><td>${fmt(e.columnCV)}</td><td>${fmt(e.rowCV)}</td></tr></table>`;
  let html = kpi('Area fraction', fmt(e.areaFraction, true), {
    help: { secondary: 'secondary', f: 'area', c: 'carbon' }[key],
    note: 'Share of the analysed area.',
    hero: true,
  });
  html += spread;
  if (key === 'secondary') {
    html += `${groupLabel('Around the main-phase particles')}${kpi('Interparticle Occupancy', fmt(r.interparticleOccupancy, true), { help: 'occupancy', note: 'Share of the gaps between particles it fills.' })}${kpi('Between particles', fmt(r.targetingEfficiency, true), { help: 'targeting', note: 'Share of it lying between particles, not on them.' })}${kpi('Median Distance', fmt(r.distance.median), { help: 'distance', unit: r.distance.unit, note: `${t('Mean')} ${fmt(r.distance.mean)} · P90 ${fmt(r.distance.p90)}` })}<div class="hist"><canvas id="hist" width="280" height="96"></canvas><dl id="bins"></dl></div>`;
    if (r.binderCoverage != null)
      html += `${groupLabel('With the binder')}${kpi('Binder Coverage', fmt(r.binderCoverage, true), { help: 'binder', note: 'Share of its outline with binder within the set distance.' })}`;
  } else {
    html += `${groupLabel('Around the main-phase particles')}${kpi('Between particles', fmt(e.betweenParticles, true), { help: 'between', note: 'Share of it lying between particles, not on them.' })}`;
    if (key === 'f' && r.secondaryPixels != null)
      html += `${groupLabel('With the secondary phase')}${kpi('Binder Coverage', fmt(r.binderCoverage, true), { help: 'binder', note: 'Share of the secondary-phase outline with binder nearby.' })}<div class="kpi-pair">${kpi('F with Secondary', fmt(r.fWithSecondary, true), { help: 'overlap' })}${kpi('Secondary with F', fmt(r.secondaryWithF, true), { help: 'overlap' })}</div>${kpi('Pearson r', fmt(r.pearson), { help: 'pearson' })}`;
  }
  return html;
}
/* Figures of one element inside the picked grid cell. */
function cellFigures(tile, key, unit) {
  let html = kpi('Area fraction', fmt(tileShare(tile, key), true), {
    help: 'area',
    note: 'Share of this cell.',
    hero: true,
  });
  if (key === 'secondary')
    html += `${kpi('Interparticle Occupancy', fmt(tile.interparticleOccupancy, true), { help: 'occupancy' })}${kpi('Between particles', fmt(tile.targetingEfficiency, true), { help: 'targeting' })}${kpi('Median Distance', fmt(tile.distanceMedian), { help: 'distance', unit, note: `${t('Mean')} ${fmt(tile.distanceMean)}` })}${tile.binderCoverage != null ? kpi('Binder Coverage', fmt(tile.binderCoverage, true), { help: 'binder' }) : ''}`;
  return `${html}<p class="hint">${t('Spread figures exist for the whole region only. The smaller the cell, the less steady the numbers.')}</p>`;
}
/* The results panel shows one element, for either the whole analysed region or the picked cell. */
function renderResults() {
  const r = state.results;
  if (!r) {
    const blocked = typeof analysisBlocked === 'function' ? analysisBlocked() : '';
    $('#results').innerHTML =
      `<div class="results-empty"><h2>${t('Results')}</h2><p>${t(step === 'analyze' && blocked ? blocked : 'Figures appear here once the analysis has run.')}</p></div>`;
    renderTrends();
    return;
  }
  const keys = METRIC_KEYS.filter(k => r.elements?.[k]),
    key = keys.includes(metric) ? metric : keys[0],
    tile = regionTile == null ? null : r.tiles[regionTile],
    grid = Math.round(Math.sqrt(r.tiles.length)),
    scope = tile
      ? `<span><b>${t('Row {r} · column {c}')
          .replace('{r}', tile.y + 1)
          .replace(
            '{c}',
            tile.x + 1,
          )}</b> · ${tile.area} px</span><button id="regionAll" type="button" class="small">${t('Whole region')}</button>`
      : `<span><b>${t('Whole region')}</b> · ${r.roiPixels} px</span><span>${grid} × ${grid}</span>`;
  $('#results').innerHTML =
    `<div class="results-head"><h2>${t('Results')}</h2><div class="scope">${scope}</div></div><div class="tabs" role="tablist">${keys.map(k => `<button role="tab" data-metric="${k}" aria-selected="${k === key}" class="${k === key ? 'on' : ''}"><span class="swatch" style="background:rgb(${ELEMENT_TINT[k]})"></span>${t(METRIC_LABELS[k])}</button>`).join('')}</div><div class="figures">${tile ? cellFigures(tile, key, r.distance?.unit || '') : wholeRegionFigures(r, key)}${r.warnings.map(w => `<div class="warning">${esc(messageText(w))}</div>`).join('')}</div>`;
  document.querySelectorAll('[data-metric]').forEach(
    b =>
      (b.onclick = () => {
        metric = b.dataset.metric;
        renderResults();
        draw();
      }),
  );
  if ($('#regionAll'))
    $('#regionAll').onclick = () => {
      regionTile = null;
      renderResults();
      renderGridOverlay();
    };
  if ($('#hist')) drawHistogram(r);
  renderTrends();
  setupTooltips();
}
function drawHistogram(r) {
  const canvas = $('#hist'),
    ctx = canvas.getContext('2d'),
    ratio = devicePixelRatio || 1,
    w = canvas.clientWidth || 280,
    h = 96,
    max = Math.max(...r.distance.histogram, 1),
    bar = (w - 8) / r.distance.histogram.length;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  ctx.scale(ratio, ratio);
  ctx.strokeStyle = '#e4e4e7';
  ctx.beginPath();
  ctx.moveTo(0, 74.5);
  ctx.lineTo(w, 74.5);
  ctx.stroke();
  ctx.fillStyle = CHART_TINT.secondary;
  r.distance.histogram.forEach((v, i) => {
    const height = (v / max) * 64;
    ctx.fillRect(4 + i * bar + 1, 74 - height, Math.max(1, bar - 2), height);
  });
  ctx.fillStyle = '#71717a';
  ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText('0', 4, 90);
  ctx.textAlign = 'right';
  ctx.fillText(`${fmt(r.distance.max)} ${r.distance.unit}`, w - 4, 90);
  // One band per line, value aligned on the right.
  const e = r.distance.edges,
    bands = [`< ${e[0]}`, `${e[0]}–${e[1]}`, `${e[1]}–${e[2]}`, `> ${e[2]}`];
  $('#bins').innerHTML = r.distance.bins
    .map(
      (v, i) =>
        `<div><dt>${bands[i]} ${r.distance.unit}</dt><dd>${fmt(v / r.secondaryPixels, true)}</dd></div>`,
    )
    .join('');
}
/* A round upper bound for a share axis, with its tick step. */
function shareAxis(max) {
  const top = Math.max(0.01, max);
  for (const step of [0.01, 0.02, 0.05, 0.1, 0.2, 0.25])
    if (top / step <= 4) return { max: Math.ceil(top / step) * step, step };
  return { max: 1, step: 0.25 };
}
/* Trend charts for the element on show. The column chart has one thin line per grid row, each
   running left to right, and one thick line for the share in each whole column; the row chart is
   the same turned round. A line under the pointer, and the row or column of the picked cell,
   stand out from the rest. */
function renderTrends() {
  const el = $('#trends'),
    r = state.results,
    key = r?.elements?.[metric] ? metric : null,
    show = step === 'analyze' && !!key && r.tiles?.[0]?.x1 != null;
  const changed = el.classList.contains('hidden') === show;
  el.classList.toggle('hidden', !show);
  // The strip takes height from the image; a fitted image is fitted again.
  if (changed && $('#zoom').value === 'fit') requestAnimationFrame(fit);
  if (!show) {
    el.innerHTML = '';
    return;
  }
  const n = Math.round(Math.sqrt(r.tiles.length)),
    cell = (x, y) => tileShare(r.tiles[y * n + x], key),
    lines = axis =>
      Array.from({ length: n }, (_, a) =>
        Array.from({ length: n }, (_, b) => (axis === 'columns' ? cell(b, a) : cell(a, b))),
      ),
    picked = regionTile == null ? null : r.tiles[regionTile],
    e = r.elements[key],
    charts = [
      {
        axis: 'columns',
        title: 'Columns, image left to right',
        series: lines('columns'),
        mean: e.columns,
        each: 'Row {n}',
        whole: 'Whole columns',
        picked: picked?.y,
        thirds: e.thirds.columns,
        thirdsCV: e.thirds.columnCV,
        bands: ['Left third', 'Middle third', 'Right third'],
      },
      {
        axis: 'rows',
        title: 'Rows, image top to bottom',
        series: lines('rows'),
        mean: e.rows,
        each: 'Column {n}',
        whole: 'Whole rows',
        picked: picked?.x,
        thirds: e.thirds.rows,
        thirdsCV: e.thirds.rowCV,
        bands: ['Top third', 'Middle third', 'Bottom third'],
      },
    ],
    all = charts.flatMap(c => [...c.series.flat(), ...c.mean, ...c.thirds]).filter(v => v != null),
    scale = shareAxis(Math.max(...all, 0)),
    name = t(METRIC_LABELS[key]);
  el.innerHTML = `<div class="trends-head"><strong>${t('{element}: share in each column and row').replace('{element}', name)}</strong><span class="trend-legend"><span class="key mean" style="--tint:${CHART_TINT[key]}"></span>${t('Whole column / row')}<span class="key each"></span>${t('Each row / column of cells')}<span class="key band"></span>${t('Thirds of the image')}</span></div><div class="trend-grid">${charts.map(c => `<figure class="trend" data-axis="${c.axis}"><figcaption><span>${t(c.title)}</span><span>${t('Thirds CV')} <b>${fmt(c.thirdsCV)}</b></span></figcaption><div class="trend-plot"></div></figure>`).join('')}</div>`;
  charts.forEach(c => drawTrend(el.querySelector(`[data-axis="${c.axis}"]`), c, scale, key, n));
}
/* One trend chart. Behind the lines, the image thirds with their shares on top; under the axis,
   one value per column (or row) set straight below its point. The value row shows the thick
   line, or the thin line under the pointer, or the row (column) of the picked cell. */
function drawTrend(figure, c, scale, key, n) {
  const plot = figure.querySelector('.trend-plot'),
    w = Math.max(240, plot.clientWidth || 320),
    left = 52,
    right = 10,
    top = 20,
    plotH = 92,
    h = top + plotH + 36,
    span = w - left - right,
    x = i => left + ((i + 0.5) / n) * span,
    y = v => top + (1 - v / scale.max) * plotH,
    path = values => {
      let d = '',
        pen = false;
      values.forEach((v, i) => {
        if (v == null) return (pen = false);
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      return d;
    },
    value = v => (v == null ? '—' : (v * 100).toFixed(1)),
    tickY = top + plotH + 13,
    valueY = top + plotH + 29;
  let svg = `<svg width="${w}" height="${h}" role="img" aria-label="${esc(t(c.title))}">`;
  // Thirds of the image: the middle band shaded, each labelled with its share.
  c.thirds.forEach((v, z) => {
    const x0 = left + (z / 3) * span;
    if (z === 1)
      svg += `<rect class="band" x="${x0}" y="${top}" width="${span / 3}" height="${plotH}"/>`;
    if (z) svg += `<line class="band-edge" x1="${x0}" x2="${x0}" y1="${top}" y2="${top + plotH}"/>`;
    svg += `<text class="band-label" x="${x0 + span / 6}" y="${top - 7}" text-anchor="middle">${t(c.bands[z])} ${value(v)}%</text>`;
  });
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step)
    svg += `<line class="gridline" x1="${left}" x2="${w - right}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${left - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v * 100)}%</text>`;
  for (let i = 0; i < n; i++)
    svg += `<text class="tick" x="${x(i)}" y="${tickY}" text-anchor="middle">${i + 1}</text><text class="val" data-i="${i}" x="${x(i)}" y="${valueY}" text-anchor="middle"></text>`;
  svg += `<text class="val-label" x="0" y="${valueY}"></text>`;
  c.series.forEach((values, i) => {
    const d = path(values);
    svg += `<g class="series${i === c.picked ? ' picked' : ''}" data-series="${i}"><path class="line" d="${d}"/><path class="hit" d="${d}"/></g>`;
  });
  svg += `<path class="mean" d="${path(c.mean)}" style="stroke:${CHART_TINT[key]}"/>`;
  c.mean.forEach((v, i) => {
    if (v != null)
      svg += `<circle class="mean-dot" cx="${x(i)}" cy="${y(v)}" r="3.5" style="fill:${CHART_TINT[key]}"/>`;
  });
  plot.innerHTML = svg + '</svg>';
  const cells = [...plot.querySelectorAll('.val')],
    label = plot.querySelector('.val-label'),
    show = (text, values, emphasis) => {
      label.textContent = text;
      cells.forEach((cell, i) => (cell.textContent = value(values[i])));
      plot.querySelector('svg').classList.toggle('val-hot', emphasis);
    },
    rest = () =>
      c.picked != null
        ? show(t(c.each).replace('{n}', c.picked + 1), c.series[c.picked], true)
        : show(t(c.whole), c.mean, false);
  rest();
  plot.querySelectorAll('.series').forEach(g => {
    const i = +g.dataset.series;
    g.onmouseenter = () => {
      g.classList.add('hot');
      show(t(c.each).replace('{n}', i + 1), c.series[i], true);
    };
    g.onmouseleave = () => {
      g.classList.remove('hot');
      rest();
    };
  });
}
addEventListener('resize', () => {
  clearTimeout(renderTrends.timer);
  renderTrends.timer = setTimeout(() => {
    if ($('#zoom').value === 'fit') fit();
    renderTrends();
  }, 120);
});
