/* Comparison chart: one figure of every compared sample, by sample or against a measured value
   typed into the table (peel or cohesive strength). */
const COMPARE_FIGURES = [
  ['area', 'Area fraction', e => (e.areaFraction == null ? null : e.areaFraction * 100)],
  ['cv', 'Uniformity CV', e => e.uniformityCV],
  ['lr', 'Thirds CV, left / right', e => e.thirds?.columnCV],
  ['tb', 'Thirds CV, top / bottom', e => e.thirds?.rowCV],
];
let compareY = 'f:cv',
  compareX = 'sample';
/* A measured value typed into the table: a plain number, or null for empty; anything else
   (units, thousands separators) is not guessed at and is reported instead. */
function parseMeasured(text) {
  const s = String(text ?? '').trim();
  if (!s) return { value: null };
  const value = Number(s),
    // Too large to hold (1e400), or a non-zero value too small to hold (1e-400).
    lost = !Number.isFinite(value) || (value === 0 && /[1-9]/.test(s.split(/[eE]/)[0]));
  return /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s) && !lost
    ? { value }
    : { value: null, invalid: true };
}
/* Smallest |r| that is significant at p < 0.05 (two-sided) for n samples: from Student's t. */
function criticalR(n) {
  const df = n - 2,
    table = [
      [1, 12.706],
      [2, 4.303],
      [3, 3.182],
      [4, 2.776],
      [5, 2.571],
      [6, 2.447],
      [7, 2.365],
      [8, 2.306],
      [9, 2.262],
      [10, 2.228],
      [12, 2.179],
      [15, 2.131],
      [20, 2.086],
      [30, 2.042],
    ],
    tCrit = (table.find(([d]) => d >= df) || [0, 1.96])[1];
  return tCrit / Math.sqrt(tCrit * tCrit + df);
}
function compareFigure(entry, choice) {
  const [key, name] = choice.split(':'),
    figure = COMPARE_FIGURES.find(f => f[0] === name),
    e = entry.metrics.elements?.[key];
  return e ? (figure[2](e) ?? null) : null;
}
function comparisonChartHTML() {
  const options = METRIC_KEYS.flatMap(k =>
    COMPARE_FIGURES.map(
      ([name, label]) =>
        `<option value="${k}:${name}">${t(METRIC_LABELS[k])} · ${t(label)}${name === 'area' ? ' (%)' : ''}</option>`,
    ),
  ).join('');
  return `<section class="compare-chart"><div class="compare-controls"><label>${t('Vertical axis')}<select id="compareY">${options}</select></label><label>${t('Horizontal axis')}<select id="compareX"><option value="sample">${t('Sample')}</option><option value="peel">${t('Peel')}</option><option value="cohesive">${t('Cohesive')}</option></select></label></div><div id="compareChart"></div><p id="compareNote" class="hint"></p></section>`;
}
function bindComparisonChart() {
  $('#compareY').value = compareY;
  $('#compareX').value = compareX;
  $('#compareY').onchange = e => {
    compareY = e.target.value;
    drawComparisonChart();
  };
  $('#compareX').onchange = e => {
    compareX = e.target.value;
    drawComparisonChart();
  };
  drawComparisonChart();
}
/* Round axis bounds covering the values, with a step of 1, 2 or 5 × 10^k. */
function niceAxis(min, max) {
  if (min === max) [min, max] = [min - Math.abs(min || 1) * 0.1, max + Math.abs(max || 1) * 0.1];
  const raw = (max - min) / 4,
    power = 10 ** Math.floor(Math.log10(raw)),
    step = [1, 2, 5, 10].map(m => m * power).find(s => s >= raw);
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}
function drawComparisonChart() {
  const host = $('#compareChart'),
    note = $('#compareNote');
  if (!host) return;
  const rows = state.comparison.map((c, i) => ({
      i,
      name: c.sample,
      y: compareFigure(c, compareY),
      x: compareX === 'sample' ? { value: i } : parseMeasured(c[compareX]),
    })),
    lacking = rows.filter(r => r.y == null).length,
    unreadable = rows.filter(r => r.x.invalid).map(r => r.name),
    points = rows.filter(r => r.y != null && r.x.value != null),
    notes = [];
  if (lacking)
    notes.push(
      t(
        '{k} of {m} samples lack this figure (analysed with an older version or without this element).',
      )
        .replace('{k}', lacking)
        .replace('{m}', rows.length),
    );
  if (unreadable.length)
    notes.push(`${t('Not a plain number, left out')}: ${unreadable.map(esc).join('、')}`);
  const n = points.length;
  if (compareX !== 'sample') notes.push(`n = ${n}`);
  if (compareX !== 'sample' && n >= 4) {
    const r = Core.pearson(
      Float64Array.from(points, p => p.x.value),
      Float64Array.from(points, p => p.y),
      new Uint8Array(n).fill(1),
    );
    notes.push(
      `${t('Correlation r')} = ${fmt(r)} (${t('|r| must reach {c} for p < 0.05').replace('{c}', criticalR(n).toFixed(3))})`,
    );
  } else if (compareX !== 'sample' && n) notes.push(t('A correlation needs at least 4 samples.'));
  note.innerHTML = notes.join(' · ');
  if (!n) {
    host.innerHTML = `<div class="compare-empty">${t(compareX === 'sample' ? 'No sample has this figure yet.' : 'Type numbers into the column above to plot against them.')}</div>`;
    return;
  }
  const w = Math.max(420, Math.min(760, host.clientWidth || 640)),
    h = 260,
    left = 56,
    right = 16,
    top = 14,
    bottom = compareX === 'sample' ? 52 : 40,
    ys = niceAxis(Math.min(0, ...points.map(p => p.y)), Math.max(...points.map(p => p.y))),
    xs =
      compareX === 'sample'
        ? null
        : niceAxis(
            Math.min(...points.map(p => p.x.value)),
            Math.max(...points.map(p => p.x.value)),
          ),
    sx = p =>
      compareX === 'sample'
        ? left + ((p.i + 0.5) / rows.length) * (w - left - right)
        : left + ((p.x.value - xs.min) / (xs.max - xs.min)) * (w - left - right),
    sy = v => top + (1 - (v - ys.min) / (ys.max - ys.min)) * (h - top - bottom),
    digits = v => Number(v.toPrecision(6)),
    [key] = compareY.split(':');
  let svg = `<svg width="${w}" height="${h}" role="img" aria-label="${esc(t('Comparison'))}">`;
  for (let v = ys.min; v <= ys.max + ys.step / 2; v += ys.step)
    svg += `<line class="gridline" x1="${left}" x2="${w - right}" y1="${sy(v)}" y2="${sy(v)}"/><text class="tick" x="${left - 6}" y="${sy(v) + 3}" text-anchor="end">${digits(v)}</text>`;
  if (compareX === 'sample')
    rows.forEach(r => {
      const x = sx(r),
        label = r.name.length > 10 ? r.name.slice(0, 9) + '…' : r.name;
      svg += `<text class="tick" x="${x}" y="${h - bottom + 16}" text-anchor="middle">${esc(label)}</text>`;
    });
  else {
    for (let v = xs.min; v <= xs.max + xs.step / 2; v += xs.step) {
      const x = left + ((v - xs.min) / (xs.max - xs.min)) * (w - left - right);
      svg += `<line class="axis-tick" x1="${x}" x2="${x}" y1="${h - bottom}" y2="${h - bottom + 4}"/><text class="tick" x="${x}" y="${h - bottom + 16}" text-anchor="middle">${digits(v)}</text>`;
    }
    svg += `<text class="axis-title" x="${(left + w - right) / 2}" y="${h - 4}" text-anchor="middle">${t(compareX === 'peel' ? 'Peel' : 'Cohesive')}</text>`;
  }
  svg += `<line class="axis" x1="${left}" x2="${w - right}" y1="${h - bottom}" y2="${h - bottom}"/>`;
  for (const p of points)
    svg += `<g class="compare-point"><circle cx="${sx(p)}" cy="${sy(p.y)}" r="5" style="fill:${CHART_TINT[key]}"/><title>${esc(p.name)}: ${fmt(p.y)}</title>${compareX === 'sample' ? '' : `<text class="point-label" x="${sx(p) + 8}" y="${sy(p.y) + 3}">${esc(p.name.length > 20 ? p.name.slice(0, 19) + '…' : p.name)}</text>`}</g>`;
  host.innerHTML = svg + '</svg>';
}
