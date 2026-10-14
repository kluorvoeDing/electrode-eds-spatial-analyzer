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
    spread = `${kpi('Uniformity CV', fmt(e.uniformityCV), { help: 'cv', note: 'Cell-to-cell spread; lower is more even.' })}<div class="kpi-pair">${kpi('Column CV', fmt(e.columnCV), { help: 'profileCV', note: 'Left to right' })}${kpi('Row CV', fmt(e.rowCV), { help: 'profileCV', note: 'Top to bottom' })}</div>`;
  let html = kpi('Area fraction', fmt(e.areaFraction, true), {
    help: key === 'secondary' ? 'secondary' : 'area',
    note: 'Share of the analysed area.',
    hero: true,
  });
  html += spread;
  if (key === 'secondary') {
    html += `${groupLabel('Around the main-phase particles')}${kpi('Interparticle Occupancy', fmt(r.interparticleOccupancy, true), { help: 'occupancy', note: 'Share of the gaps between particles it fills.' })}${kpi('Between particles', fmt(r.targetingEfficiency, true), { help: 'targeting', note: 'Share of it lying between particles, not on them.' })}${kpi('Median Distance', fmt(r.distance.median), { help: 'distance', unit: r.distance.unit, note: `${t('Mean')} ${fmt(r.distance.mean)} · P90 ${fmt(r.distance.p90)}` })}<div class="hist"><canvas id="hist" width="280" height="96"></canvas><div class="compact muted" id="bins"></div></div>`;
    if (r.binderCoverage != null)
      html += `${groupLabel('With the binder')}${kpi('Binder Coverage', fmt(r.binderCoverage, true), { help: 'binder', note: 'Share of its outline with binder within the set distance.' })}`;
  } else {
    html += `${groupLabel('Around the main-phase particles')}${kpi('Between particles', fmt(e.betweenParticles, true), { help: 'between', note: 'Share of it lying between particles, not on them.' })}`;
    if (key === 'f' && r.secondaryPixels != null)
      html += `${groupLabel('With the secondary phase')}${kpi('Binder Coverage', fmt(r.binderCoverage, true), { help: 'binder', note: 'Share of the secondary-phase outline with binder nearby.' })}<div class="kpi-pair">${kpi('F with Secondary', fmt(r.fWithSecondary, true), { help: 'overlap' })}${kpi('Secondary with F', fmt(r.secondaryWithF, true), { help: 'overlap' })}</div>${kpi('Pearson r', fmt(r.pearson), { help: 'pearson' })}`;
  }
  if (r.depth) {
    const field = { secondary: 'secondaryFraction', f: 'fFraction', c: 'cFraction' }[key],
      depthCV = { secondary: r.depth.cv, f: r.depth.fCV, c: r.depth.cCV }[key];
    html += `${groupLabel('Through the thickness')}${kpi('Depth CV', fmt(depthCV), { help: 'depth', note: 'Spread between the top, middle and bottom thirds.' })}<table class="depth"><tr>${r.depth.zones.map(z => `<th>${t(z.zone)}</th>`).join('')}</tr><tr>${r.depth.zones.map(z => `<td>${fmt(z[field], true)}</td>`).join('')}</tr></table>`;
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
  $('#bins').innerHTML = r.distance.bins
    .map(
      (v, i) =>
        `${['< ' + r.distance.edges[0], r.distance.edges[0] + '–' + r.distance.edges[1], r.distance.edges[1] + '–' + r.distance.edges[2], '> ' + r.distance.edges[2]][i]} ${r.distance.unit}: ${fmt(v / r.secondaryPixels, true)}`,
    )
    .join(' · ');
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
    charts = [
      {
        axis: 'columns',
        title: 'Columns, left to right',
        series: lines('columns'),
        mean: r.elements[key].columns,
        each: 'Row {n}',
        picked: picked?.y,
      },
      {
        axis: 'rows',
        title: 'Rows, top to bottom',
        series: lines('rows'),
        mean: r.elements[key].rows,
        each: 'Column {n}',
        picked: picked?.x,
      },
    ],
    all = charts.flatMap(c => [...c.series.flat(), ...c.mean]).filter(v => v != null),
    scale = shareAxis(Math.max(...all, 0)),
    name = t(METRIC_LABELS[key]);
  el.innerHTML = `<div class="trends-head"><strong>${t('{element}: share in each column and row').replace('{element}', name)}</strong><span class="trend-legend"><span class="key mean" style="--tint:${CHART_TINT[key]}"></span>${t('Whole column / row')}<span class="key each"></span>${t('Each row / column of cells')}</span></div><div class="trend-grid">${charts.map(c => `<figure class="trend" data-axis="${c.axis}"><figcaption>${t(c.title)}</figcaption><div class="trend-plot"></div><div class="trend-caption"></div></figure>`).join('')}</div>`;
  charts.forEach(c => drawTrend(el.querySelector(`[data-axis="${c.axis}"]`), c, scale, key, n));
}
function drawTrend(figure, c, scale, key, n) {
  const plot = figure.querySelector('.trend-plot'),
    caption = figure.querySelector('.trend-caption'),
    w = Math.max(220, plot.clientWidth || 320),
    h = 132,
    left = 38,
    right = 12,
    top = 8,
    bottom = 20,
    x = i => left + ((i + 0.5) / n) * (w - left - right),
    y = v => top + (1 - v / scale.max) * (h - top - bottom),
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
    percent = v => (v == null ? '—' : (v * 100).toFixed(1));
  let svg = `<svg width="${w}" height="${h}" role="img" aria-label="${esc(figure.querySelector('figcaption').textContent)}">`;
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step)
    svg += `<line class="gridline" x1="${left}" x2="${w - right}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${left - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v * 100)}%</text>`;
  for (let i = 0; i < n; i++)
    svg += `<text class="tick" x="${x(i)}" y="${h - 5}" text-anchor="middle">${i + 1}</text>`;
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
  const describe = (label, values) => `${label}: ${values.map(percent).join(' · ')} %`;
  const rest = () =>
    (caption.textContent =
      c.picked != null
        ? describe(t(c.each).replace('{n}', c.picked + 1), c.series[c.picked])
        : describe(t(c.axis === 'columns' ? 'Whole columns' : 'Whole rows'), c.mean));
  rest();
  plot.querySelectorAll('.series').forEach(g => {
    g.onmouseenter = () => {
      g.classList.add('hot');
      const i = +g.dataset.series;
      caption.textContent = describe(t(c.each).replace('{n}', i + 1), c.series[i]);
    };
    g.onmouseleave = () => {
      g.classList.remove('hot');
      rest();
    };
  });
}
addEventListener('resize', () => {
  clearTimeout(renderTrends.timer);
  renderTrends.timer = setTimeout(renderTrends, 120);
});
