/* Viewport drawing, zoom, pan and ROI / scale-bar pointer input. */
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
    maskKey = masks[key] ? key : selected,
    mask = masks[maskKey],
    layers = display === 'elements' ? elementLayers(ch) : null;
  $('#elementChips').classList.toggle(
    'hidden',
    display !== 'elements' || !shownElements().loaded.length,
  );
  $('#maskLabel').textContent =
    mask && (display === 'overlay' || display === 'mask')
      ? `${t('Mask')}: ${t(channelNames[maskKey])}`
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
    } else if (display === 'overlay' && mask?.[i]) {
      rr = rr * (1 - opacity) + 7 * opacity;
      gg = gg * (1 - opacity) + 170 * opacity;
      bb = bb * (1 - opacity) + 183 * opacity;
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
  if (state.settings.calibration) {
    const length = Math.min(ch.w * 0.2, 100 / zoom),
      um = length * state.settings.calibration;
    ctx.fillStyle = 'white';
    ctx.fillRect(18 / zoom, ch.h - 28 / zoom, length, 3 / zoom);
    ctx.font = `${12 / zoom}px system-ui`;
    ctx.fillText(`${um.toPrecision(3)} μm`, 18 / zoom, ch.h - 10 / zoom);
  }
  document
    .querySelectorAll('[data-display]')
    .forEach(b => b.classList.toggle('active', b.dataset.display === display));
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
/* Each step opens on the view that suits it: element colours while importing and drawing the
   ROI, the mask while segmenting and analysing. Any view can still be picked by hand. */
function setStep(next) {
  step = next;
  drawMode = 'pan';
  if ((step === 'data' || step === 'roi') && display === 'overlay') display = 'elements';
  if ((step === 'segment' || step === 'analyze') && display === 'elements') display = 'overlay';
  renderControls();
  draw();
}
function fit() {
  const ch = state.channels[$('#channel').value] || baseChannel();
  if (!ch) return;
  zoom = Math.max(
    0.02,
    Math.min(
      4,
      ($('#viewport').clientWidth - 40) / ch.w,
      ($('#viewport').clientHeight - 40) / ch.h,
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
  if (drawMode === 'scale') {
    scalePoints.push(p);
    if (scalePoints.length === 2) {
      const distance = Math.hypot(scalePoints[0][0] - p[0], scalePoints[0][1] - p[1]);
      if (distance > 0) {
        setCalibration(+$('#scaleLength').value / distance);
      } else status('兩端不能相同。', true);
      drawMode = 'pan';
    }
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
      preview();
    }
    drawMode = 'pan';
  }
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
$('#import').onclick = () => setStep('data');
