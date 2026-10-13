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
    mask = masks[key] || masks[selected];
  for (let i = 0; i < ch.data.length; i++) {
    let g = r.max === r.min ? 0 : Math.round(((ch.data[i] - r.min) / (r.max - r.min)) * 255),
      rr = ch.rgba ? ch.rgba[i * 4] : g,
      gg = ch.rgba ? ch.rgba[i * 4 + 1] : g,
      bb = ch.rgba ? ch.rgba[i * 4 + 2] : g;
    if (display === 'mask') {
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
        status('Calibration updated');
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
document.querySelectorAll('[data-step]').forEach(
  b =>
    (b.onclick = () => {
      step = b.dataset.step;
      drawMode = 'pan';
      renderControls();
    }),
);
$('#sample').oninput = e => {
  state.sample = e.target.value;
  dirty();
};
$('#import').onclick = () => {
  step = 'data';
  renderControls();
};
