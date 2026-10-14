/* Viewport drawing, the analysis grid over it, zoom, pan and ROI pointer input. */
/* Channel whose mask is shown alone: the one being adjusted. Otherwise every mask is shown. */
function focusedMask() {
  return step === 'segment' && segAdjustOpen && masks[selected] ? selected : null;
}
function draw() {
  const ch = state.channels[$('#channel').value] || baseChannel(),
    canvas = $('#canvas'),
    ctx = canvas.getContext('2d');
  if (!ch) {
    canvas.width = 1;
    canvas.height = 1;
    $('#empty').classList.remove('hidden');
    return;
  }
  $('#empty').classList.add('hidden');
  canvas.width = ch.w;
  canvas.height = ch.h;
  canvas.style.width = `${ch.w * zoom}px`;
  canvas.style.height = `${ch.h * zoom}px`;
  const r = Core.range(ch.data),
    image = ctx.createImageData(ch.w, ch.h),
    key = $('#channel').value,
    maskKey = focusedMask() || (masks[key] ? key : selected),
    mask = masks[maskKey],
    // The mask overlay: each channel's mask in its own colour over a grey backdrop.
    // While analysing, the main phase and the element whose shares label the grid.
    shownMasks =
      display === 'overlay'
        ? MASK_ORDER.filter(
            k =>
              masks[k] &&
              (!focusedMask() || k === focusedMask()) &&
              (step !== 'segment' || focusedMask() || !maskHidden.has(k)) &&
              (step !== 'analyze' || !state.results || k === 'nmc' || k === metric),
          )
        : [],
    layers = display === 'elements' ? elementLayers(ch) : null;
  $('#elementChips').classList.toggle(
    'hidden',
    display !== 'elements' || !shownElements().loaded.length,
  );
  $('#maskLabel').innerHTML =
    display === 'overlay' && shownMasks.length
      ? ANALYSIS_KEYS.filter(k => shownMasks.includes(k))
          .map(
            k =>
              `<span><span class="swatch" style="background:rgb(${ELEMENT_TINT[k]})"></span>${esc(t(SHORT_NAMES[k]))}</span>`,
          )
          .join('')
      : mask && display === 'mask'
        ? `${t('Mask')}: ${esc(t(channelNames[maskKey]))}`
        : '';
  for (let i = 0; i < ch.data.length; i++) {
    let g = r.max === r.min ? 0 : Math.round(((ch.data[i] - r.min) / (r.max - r.min)) * 255),
      rr = ch.rgba ? ch.rgba[i * 4] : g,
      gg = ch.rgba ? ch.rgba[i * 4 + 1] : g,
      bb = ch.rgba ? ch.rgba[i * 4 + 2] : g;
    if (layers) {
      [rr, gg, bb] = layers.base ? layers.base(i) : [0, 0, 0];
      for (const layer of layers.elements) {
        const [lr, lg, lb, strength] = layer(i);
        if (!strength) continue;
        const alpha = strength * layers.gain;
        rr = rr * (1 - alpha) + lr * alpha;
        gg = gg * (1 - alpha) + lg * alpha;
        bb = bb * (1 - alpha) + lb * alpha;
      }
    } else if (display === 'mask') {
      rr = gg = bb = mask?.[i] ? 255 : 0;
    } else if (display === 'overlay') {
      rr = gg = bb = g * 0.85;
      for (const k of shownMasks)
        if (masks[k][i]) {
          const tint = ELEMENT_TINT[k];
          rr = rr * (1 - opacity) + tint[0] * opacity;
          gg = gg * (1 - opacity) + tint[1] * opacity;
          bb = bb * (1 - opacity) + tint[2] * opacity;
        }
    }
    if (effectiveROI && !effectiveROI[i]) {
      rr *= 0.35;
      gg *= 0.35;
      bb *= 0.35;
    }
    image.data[i * 4] = rr;
    image.data[i * 4 + 1] = gg;
    image.data[i * 4 + 2] = bb;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  ctx.lineWidth = 2 / zoom;
  state.rois.forEach(r => {
    ctx.strokeStyle = r.exclude ? '#f5ba70' : '#ffffff';
    ctx.setLineDash(r.exclude ? [6 / zoom, 4 / zoom] : []);
    ctx.beginPath();
    if (r.type === 'rect') ctx.rect(r.x, r.y, r.w, r.h);
    else {
      r.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    }
    ctx.stroke();
  });
  ctx.setLineDash([]);
  if (pendingPolygon.length) {
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    pendingPolygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  if (dragStart && drawMode === 'rect' && dragStart.end) {
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(
      dragStart.x,
      dragStart.y,
      dragStart.end[0] - dragStart.x,
      dragStart.end[1] - dragStart.y,
    );
  }
  // The scale mark sits under the image, where it stays sharp and never covers the grid.
  const mark = scaleMark(110 / zoom);
  $('#scaleMark').classList.toggle('hidden', !mark);
  if (mark)
    $('#scaleMark').innerHTML =
      `<span class="bar" style="width:${mark.pixels * zoom}px"></span>${mark.um} μm`;
  document
    .querySelectorAll('[data-display]')
    .forEach(b => b.classList.toggle('active', b.dataset.display === display));
  renderGridOverlay();
}
/* A scale mark of a round length close to `pixels` image pixels; null without a calibration. */
function scaleMark(pixels) {
  const scale = state.settings.calibration;
  if (!scale) return null;
  const raw = pixels * scale,
    power = 10 ** Math.floor(Math.log10(raw)),
    um = (raw / power >= 5 ? 5 : raw / power >= 2 ? 2 : 1) * power;
  return { um: Number(um.toPrecision(1)), pixels: um / scale };
}
/* The analysis grid over the image, each cell labelled with its local share of the secondary
   phase. Drawn as page elements so the labels stay sharp on a small map; clicks pass through to
   the canvas, which picks the cell. */
function renderGridOverlay() {
  const el = $('#gridOverlay'),
    tiles = state.results?.tiles,
    show =
      step === 'analyze' &&
      !!tiles?.length &&
      tiles[0].x1 != null &&
      !!state.results.elements?.[metric] &&
      !!baseChannel();
  el.classList.toggle('hidden', !show);
  el.innerHTML = show
    ? tiles
        .map((tile, i) => {
          const width = (tile.x1 - tile.x0) * zoom,
            height = (tile.y1 - tile.y0) * zoom,
            size = Math.min(14, width / 4.2, height / 1.7),
            share = tileShare(tile, metric),
            label = tile.area && share != null && size >= 7 ? (share * 100).toFixed(1) : '';
          return `<div class="tile${i === regionTile ? ' selected' : ''}" title="${esc(t(METRIC_LABELS[metric]))} ${label}%" style="left:${tile.x0 * zoom}px;top:${tile.y0 * zoom}px;width:${width}px;height:${height}px;font-size:${Math.max(7, size)}px">${label}</div>`;
        })
        .join('')
    : '';
}
/* Picks the grid cell under an image point; picking the selected cell again returns to the
   whole region. */
function selectTileAt([x, y]) {
  const index = state.results.tiles.findIndex(
    tile => x >= tile.x0 && x < tile.x1 && y >= tile.y0 && y < tile.y1,
  );
  regionTile = index < 0 || index === regionTile ? null : index;
  renderResults();
  renderGridOverlay();
}
/* Pixel readers for the element view: SEM (when it shares the grid) as the grey backdrop and the
   ticked element maps on top in their own colours, brightness setting how strongly each shows. */
function elementLayers(ch) {
  const onGrid = c => !!c && c.w === ch.w && c.h === ch.h,
    sem = onGrid(state.channels.sem) ? state.channels.sem : null,
    reader = c => {
      if (c.rgba) return i => [c.rgba[i * 4], c.rgba[i * 4 + 1], c.rgba[i * 4 + 2]];
      const range = Core.range(c.data),
        span = range.max - range.min || 1;
      return i => Array(3).fill(Math.round(((c.data[i] - range.min) / span) * 255));
    },
    keys = shownElements().shown.filter(k => onGrid(state.channels[k]));
  return {
    base: sem ? reader(sem) : null,
    gain: Math.min(1, opacity * 2),
    elements: keys.map(k => {
      const c = state.channels[k],
        read = reader(c),
        tint = ELEMENT_TINT[k];
      return i => {
        const [r, g, b] = read(i),
          peak = Math.max(r, g, b);
        if (!peak) return [0, 0, 0, 0];
        // Images keep their own hue at full brightness; numeric maps use the channel tint.
        return c.rgba
          ? [(r * 255) / peak, (g * 255) / peak, (b * 255) / peak, peak / 255]
          : [...tint, peak / 255];
      };
    }),
  };
}
/* Each step opens on the view that suits it: element colours while importing, the masks while
   checking them and analysing. Any view can still be picked by hand. Arriving at the analysis
   runs it, so the grid and the numbers are there without another click. */
function setStep(next) {
  step = STEP_ORDER.includes(next) ? next : 'data';
  drawMode = 'pan';
  if (step === 'data' && display === 'overlay') display = 'elements';
  if (step !== 'data' && display === 'elements') display = 'overlay';
  renderControls();
  renderResults();
  draw();
  // A mask refresh still pending or running is superseded: only the latest request is applied.
  if (step === 'analyze' && !state.results) {
    clearTimeout(previewTimer);
    analyzeIfReady();
  }
}
function fit() {
  const ch = state.channels[$('#channel').value] || baseChannel();
  if (!ch) return;
  zoom = Math.max(
    0.02,
    Math.min(
      4,
      // Room for the margin around the image and the scale mark under it.
      ($('#viewport').clientWidth - 56) / ch.w,
      ($('#viewport').clientHeight - 84) / ch.h,
    ),
  );
  $('#zoom').value = 'fit';
  draw();
}
function point(e) {
  const r = $('#canvas').getBoundingClientRect(),
    d = state.channels[$('#channel').value] || baseChannel();
  return [
    Math.max(0, Math.min(d.w, (e.clientX - r.left) / zoom)),
    Math.max(0, Math.min(d.h, (e.clientY - r.top) / zoom)),
  ];
}
$('#canvas').onpointerdown = e => {
  if (!baseChannel()) return;
  const p = point(e);
  if (drawMode === 'polygon') {
    pendingPolygon.push(p);
    draw();
    return;
  }
  if (drawMode === 'rect') dragStart = { x: p[0], y: p[1] };
  else
    panStart = {
      x: e.clientX,
      y: e.clientY,
      left: $('#viewport').scrollLeft,
      top: $('#viewport').scrollTop,
    };
  $('#canvas').setPointerCapture(e.pointerId);
};
$('#canvas').onpointermove = e => {
  if (dragStart && drawMode === 'rect') {
    dragStart.end = point(e);
    draw();
  }
  if (panStart) {
    $('#viewport').scrollLeft = panStart.left - (e.clientX - panStart.x);
    $('#viewport').scrollTop = panStart.top - (e.clientY - panStart.y);
  }
};
$('#canvas').onpointerup = e => {
  if (dragStart && drawMode === 'rect') {
    const p = point(e),
      r = {
        type: 'rect',
        x: Math.min(dragStart.x, p[0]),
        y: Math.min(dragStart.y, p[1]),
        w: Math.abs(p[0] - dragStart.x),
        h: Math.abs(p[1] - dragStart.y),
        exclude,
      };
    dragStart = null;
    if (r.w >= 1 && r.h >= 1) {
      state.rois.push(r);
      dirty();
      renderControls();
      recompute();
    }
    drawMode = 'pan';
  }
  // A click without dragging, on the analysed image, picks a grid cell.
  if (
    panStart &&
    step === 'analyze' &&
    state.results &&
    Math.hypot(e.clientX - panStart.x, e.clientY - panStart.y) < 4
  )
    selectTileAt(point(e));
  panStart = null;
};
$('#channel').onchange = () => {
  if (ANALYSIS_KEYS.includes($('#channel').value)) selected = $('#channel').value;
  if (step === 'segment') renderControls();
  draw();
};
$('#zoom').onchange = e => {
  if (e.target.value === 'fit') fit();
  else {
    zoom = +e.target.value;
    draw();
  }
};
$('#opacity').oninput = e => {
  opacity = +e.target.value;
  draw();
};
$('#pan').onclick = () => {
  drawMode = 'pan';
  pendingPolygon = [];
  draw();
};
document.querySelectorAll('[data-display]').forEach(
  b =>
    (b.onclick = () => {
      display = b.dataset.display;
      draw();
    }),
);
document.querySelectorAll('[data-step]').forEach(b => (b.onclick = () => setStep(b.dataset.step)));
$('#sample').oninput = e => {
  state.sample = e.target.value;
  dirty();
};
