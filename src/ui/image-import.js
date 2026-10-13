/* User-initiated clipboard input and pixel-preserving crop review. No network or screen capture. */
let pasteTarget = 'nmc',
  awaitingPaste = false,
  imageImport = null,
  imageImportTicket = 0;
const cropRectValid = (r, w, h) =>
  ['x', 'y', 'w', 'h'].every(k => Number.isInteger(r[k])) &&
  r.x >= 0 &&
  r.y >= 0 &&
  r.w > 0 &&
  r.h > 0 &&
  r.x + r.w <= w &&
  r.y + r.h <= h;
function cropRGBA(rgba, w, h, r) {
  if (!cropRectValid(r, w, h) || rgba.length !== w * h * 4) throw Error('Invalid crop rectangle');
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++)
    out.set(rgba.subarray(((r.y + y) * w + r.x) * 4, ((r.y + y) * w + r.x + r.w) * 4), y * r.w * 4);
  return out;
}
/* Moves a crop by whole pixels without changing its size; the result stays inside the image. */
function nudgeRect(r, dx, dy, w, h) {
  return {
    x: Math.max(0, Math.min(w - r.w, r.x + dx)),
    y: Math.max(0, Math.min(h - r.h, r.y + dy)),
    w: r.w,
    h: r.h,
  };
}
/* Resizes a crop to the reference shape. `driver` names the side the user just set; the other
   follows, and both shrink together if the rectangle would leave the image. */
function lockAspect(r, ref, driver, w, h) {
  const ratio = ref.w / ref.h;
  let rw = Math.max(1, Math.min(driver === 'w' ? r.w : Math.round(r.h * ratio), w - r.x)),
    rh = Math.max(1, Math.round(rw / ratio));
  if (rh > h - r.y) {
    rh = Math.max(1, h - r.y);
    rw = Math.max(1, Math.min(Math.round(rh * ratio), w - r.x));
  }
  return { x: r.x, y: r.y, w: rw, h: rh };
}
/* Source taps for one axis: area averaging when shrinking, linear interpolation between pixel
   centres otherwise. Each entry lists [sourceIndex, weight] pairs whose weights sum to 1. */
function axisTaps(inLength, outLength) {
  const taps = [],
    scale = inLength / outLength;
  for (let i = 0; i < outLength; i++) {
    const entry = [];
    if (outLength < inLength) {
      const from = i * scale,
        to = (i + 1) * scale;
      for (let s = Math.floor(from); s < Math.min(inLength, Math.ceil(to)); s++)
        entry.push([s, (Math.min(to, s + 1) - Math.max(from, s)) / scale]);
    } else {
      const position = Math.max(0, Math.min(inLength - 1, (i + 0.5) * scale - 0.5)),
        s = Math.min(inLength - 1, Math.floor(position)),
        fraction = position - s;
      entry.push([s, 1 - fraction]);
      if (fraction > 0) entry.push([s + 1, fraction]);
    }
    taps.push(entry);
  }
  return taps;
}
const resamplingMode = (r, outW, outH) => {
  if (r.w === outW && r.h === outH) return 'none';
  const shrink = outW < r.w || outH < r.h,
    grow = outW > r.w || outH > r.h;
  return shrink && grow ? 'area-average+bilinear' : shrink ? 'area-average' : 'bilinear';
};
/* Resamples the crop `r` of an RGBA image to outW × outH in plain arithmetic rather than with the
   canvas scaler, so every browser produces the same bytes. Display use only: see importPixels. */
function resampleRGBA(rgba, w, h, r, outW, outH) {
  if (!cropRectValid(r, w, h) || rgba.length !== w * h * 4) throw Error('Invalid crop rectangle');
  if (![outW, outH].every(n => Number.isInteger(n) && n > 0)) throw Error('Invalid target size');
  if (r.w === outW && r.h === outH) return cropRGBA(rgba, w, h, r);
  const columns = axisTaps(r.w, outW),
    rows = axisTaps(r.h, outH),
    wide = new Float64Array(outW * r.h * 4);
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < outW; x++)
      for (const [s, weight] of columns[x]) {
        const from = ((r.y + y) * w + r.x + s) * 4,
          to = (y * outW + x) * 4;
        for (let c = 0; c < 4; c++) wide[to + c] += rgba[from + c] * weight;
      }
  const sums = new Float64Array(outW * outH * 4);
  for (let y = 0; y < outH; y++)
    for (const [s, weight] of rows[y])
      for (let i = 0; i < outW * 4; i++) sums[y * outW * 4 + i] += wide[s * outW * 4 + i] * weight;
  return Uint8ClampedArray.from(sums, Math.round);
}
/* Pixels a channel receives from the import dialog. Analysis channels are always an exact crop.
   Only SEM, which is a display backdrop and never reaches the metrics, may be resampled onto the
   grid of a reference channel (`target`). */
function importPixels(key, rgba, w, h, r, target) {
  if (!target)
    return { rgba: cropRGBA(rgba, w, h, r), w: r.w, h: r.h, info: { pixelResampling: 'none' } };
  if (key !== 'sem') throw Error('Only the SEM display channel can be resampled');
  return {
    rgba: resampleRGBA(rgba, w, h, r, target.w, target.h),
    w: target.w,
    h: target.h,
    info: {
      pixelResampling: resamplingMode(r, target.w, target.h),
      scaleX: target.w / r.w,
      scaleY: target.h / r.h,
      displayOnly: true,
    },
  };
}
function selectPasteTarget(key) {
  pasteTarget = key;
  document
    .querySelectorAll('[data-drop]')
    .forEach(el => el.classList.toggle('paste-target', el.dataset.drop === key));
}
function preparePaste(key) {
  selectPasteTarget(key);
  awaitingPaste = true;
  showDialog(
    'Paste image',
    `<div id="pasteWell" class="paste-well" tabindex="0"><strong>${esc(t(channelNames[key]))}</strong><p>${t('Copy an image or screenshot in VDI, then press Ctrl+V here.')}</p><span class="muted">${t('Paste image pixels, not a file shortcut.')}</span></div>`,
  );
  $('#pasteWell').focus();
  status(() => `${t('Waiting for image')} · ${t(channelNames[key])}`);
}
function canvasForChannel(ch) {
  const c = document.createElement('canvas');
  c.width = ch.w;
  c.height = ch.h;
  const ctx = c.getContext('2d');
  const image = ctx.createImageData(ch.w, ch.h);
  if (ch.rgba) image.data.set(ch.rgba);
  else {
    const range = Core.range(ch.data);
    for (let i = 0; i < ch.data.length; i++) {
      const g =
        range.max === range.min
          ? 0
          : Math.round(((ch.data[i] - range.min) / (range.max - range.min)) * 255);
      image.data.set([g, g, g, 255], i * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  return c;
}
async function hashBytes(bytes) {
  if (!crypto.subtle) return null;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
}
async function openImageImport(file, key, existing = null) {
  const ticket = ++imageImportTicket;
  try {
    let source;
    if (existing) {
      source = existing.sourceImage || existing.image;
    }
    const input = existing
      ? await (async () => {
          const img = new Image();
          const done = new Promise((resolve, reject) => {
            img.onload = () => resolve(img);
            img.onerror = () => reject(Error('Image could not be decoded'));
          });
          img.src = source;
          return done;
        })()
      : await decodeLocalImage(file);
    if (ticket !== imageImportTicket) {
      input.close?.();
      return;
    }
    const w = input.naturalWidth || input.width,
      h = input.naturalHeight || input.height;
    if (w * h > MAX_PIXELS) {
      input.close?.();
      throw Error('Map 超過 1600 萬像素，請先縮小。');
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(input, 0, 0);
    input.close?.();
    const rgba = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const sourceSha = existing
      ? existing.sourceSha256 || existing.sha256 || null
      : await hashBytes(await file.arrayBuffer());
    if (ticket !== imageImportTicket) return;
    awaitingPaste = false;
    const others = Object.keys(state.channels).filter(k => k !== key),
      remembered = existing?.importInfo?.reference,
      reference =
        (others.includes(remembered) && remembered) ||
        others.find(k => state.channels[k].w === w && state.channels[k].h === h) ||
        (key === 'sem' && ANALYSIS_KEYS.find(k => others.includes(k))) ||
        others[0] ||
        '',
      target = state.channels[reference];
    imageImport = {
      key,
      w,
      h,
      canvas,
      rgba,
      name: existing
        ? existing.name
        : `clipboard-${key}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      sourceImage: canvas.toDataURL('image/png'),
      sourceSha,
      kind: existing ? existing.importInfo?.kind || 'file' : 'clipboard',
      rect:
        existing?.sourceImage && existing.importInfo?.crop
          ? { ...existing.importInfo.crop }
          : { x: 0, y: 0, w, h },
      reference,
      // Resampling onto the reference grid is offered for SEM only; see importPixels.
      fit:
        key === 'sem' &&
        !!target &&
        (existing?.importInfo?.displayOnly === true || w !== target.w || h !== target.h),
      lockAspect: existing?.importInfo?.lockAspect ?? true,
      view: 'blend',
      flip: false,
      reviewed: false,
    };
    renderImageImport();
  } catch (e) {
    if (ticket !== imageImportTicket) return;
    status(
      () =>
        `${t('Import failed')}: ${existing?.name || t('Clipboard image')} · ${messageText(e.message)}`,
      true,
    );
    if (awaitingPaste && $('#pasteWell'))
      $('#pasteWell').innerHTML =
        `<p class="warning">${esc(messageText(e.message))}</p><p>${t('Copy an image or screenshot in VDI, then press Ctrl+V here.')}</p>`;
  }
}
function renderImageImport() {
  const p = imageImport;
  if (!p) return;
  const others = Object.keys(state.channels).filter(k => k !== p.key),
    canFit = p.key === 'sem' && others.length > 0;
  const nudge = (dx, dy, label, arrow) =>
    `<button type="button" data-nudge="${dx},${dy}" aria-label="${t(label)}" title="${t(label)}">${arrow}</button>`;
  showDialog(
    'Crop and review',
    `<div class="crop-heading"><strong>${esc(t(channelNames[p.key]))}</strong><span>${p.w} × ${p.h} px</span>${info('pasteCrop')}</div><div class="crop-layout"><div><div class="crop-source-wrap"><canvas id="cropSource" tabindex="0" aria-label="${t('Drag to select image region')}"></canvas></div><div class="crop-coordinates">${['x', 'y', 'w', 'h'].map(k => `<label>${t({ x: 'Left (px)', y: 'Top (px)', w: 'Width (px)', h: 'Height (px)' }[k])}<input id="crop-${k}" type="number" step="1" min="${k === 'w' || k === 'h' ? 1 : 0}" value="${p.rect[k]}"></label>`).join('')}</div><div class="row crop-nudge"><span class="compact">${t('Nudge (px)')} ${info('nudge')}</span>${nudge(-1, 0, 'Move left', '←')}${nudge(0, -1, 'Move up', '↑')}${nudge(0, 1, 'Move down', '↓')}${nudge(1, 0, 'Move right', '→')}<span class="muted compact">${t('Shift = 10 px')}</span></div><div class="row"><button id="cropFull">${t('Use full image')}</button>${others.length ? `<button id="cropMatch">${t('Use reference dimensions')}</button>` : ''}</div>${canFit ? `<div class="crop-fit"><label><input id="cropFit" type="checkbox" ${p.fit ? 'checked' : ''}> ${t('Scale selection to reference size (SEM only)')} ${info('semFit')}</label><label><input id="cropLock" type="checkbox" ${p.lockAspect ? 'checked' : ''}> ${t('Lock reference aspect ratio')}</label></div>` : ''}</div><div><h3>${t('Crop preview')}</h3><canvas id="cropPreview"></canvas>${others.length ? `<label class="field">${t('Reference channel')}<select id="cropReference">${others.map(k => `<option value="${k}">${esc(t(channelNames[k]))} · ${state.channels[k].w}×${state.channels[k].h}</option>`).join('')}</select></label><label class="field">${t('Preview mode')}<select id="cropView"><option value="blend">${t('Blend')}</option><option value="difference">${t('Difference')}</option></select></label><label class="field">${t('Image / reference blend')}<input id="cropBlend" type="range" min="0" max="1" step=".05" value=".5"></label><button id="cropFlip" type="button">${t('Hold to show reference')}</button>` : ''}<div id="cropSizeStatus" class="compact"></div></div></div><label class="crop-confirm"><input id="cropReviewed" type="checkbox"> ${t('I checked the image region, orientation and alignment.')}</label><div class="row"><button id="cropApply" class="primary" disabled>${t('Apply to channel')}</button><button id="cropCancel">${t('Cancel')}</button></div>`,
  );
  $('#cropSource').width = p.w;
  $('#cropSource').height = p.h;
  // Every edit to the selection invalidates the manual confirmation.
  const changed = (fast = false) => {
    syncCropInputs();
    resetCropReview();
    drawImageImport(fast);
  };
  const locked = driver => {
    const ref = fitTarget(p);
    if (ref && p.lockAspect) p.rect = lockAspect(p.rect, ref, driver, p.w, p.h);
  };
  if ($('#cropReference')) {
    $('#cropReference').value = p.reference;
    $('#cropReference').onchange = e => {
      p.reference = e.target.value;
      locked('w');
      changed();
    };
    $('#cropView').value = p.view;
    $('#cropView').onchange = e => {
      p.view = e.target.value;
      drawImageImport();
    };
    $('#cropBlend').oninput = () => drawImageImport();
    const flip = $('#cropFlip'),
      hold = on => () => {
        p.flip = on;
        drawImageImport();
      };
    flip.onpointerdown = hold(true);
    flip.onpointerup = flip.onpointerleave = flip.onblur = hold(false);
    flip.onkeydown = e => (e.key === ' ' || e.key === 'Enter') && hold(true)();
    flip.onkeyup = hold(false);
  }
  if ($('#cropFit')) {
    $('#cropFit').onchange = e => {
      p.fit = e.target.checked;
      locked('w');
      changed();
    };
    $('#cropLock').onchange = e => {
      p.lockAspect = e.target.checked;
      locked('w');
      changed();
    };
  }
  for (const k of ['x', 'y', 'w', 'h'])
    $('#crop-' + k).oninput = () => {
      p.rect[k] = Number($('#crop-' + k).value);
      resetCropReview();
      drawImageImport();
    };
  // The other side follows once the field is committed, so typing is never interrupted.
  for (const k of ['w', 'h'])
    $('#crop-' + k).onchange = () => {
      // Only the origin and the edited side need to be usable; the other side is derived.
      const { x, y } = p.rect,
        usable =
          [x, y, p.rect[k]].every(Number.isInteger) &&
          x >= 0 &&
          y >= 0 &&
          x < p.w &&
          y < p.h &&
          p.rect[k] >= 1;
      if (!usable || !fitTarget(p) || !p.lockAspect) return;
      locked(k);
      changed();
    };
  $('#cropFull').onclick = () => {
    p.rect = { x: 0, y: 0, w: p.w, h: p.h };
    changed();
  };
  if ($('#cropMatch'))
    $('#cropMatch').onclick = () => {
      const ref = state.channels[p.reference];
      if (!ref) return;
      p.rect.w = ref.w;
      p.rect.h = ref.h;
      changed();
    };
  const nudgeBy = (dx, dy, coarse) => {
    if (!cropRectValid(p.rect, p.w, p.h)) return;
    const step = coarse ? 10 : 1;
    p.rect = nudgeRect(p.rect, dx * step, dy * step, p.w, p.h);
    changed();
  };
  document.querySelectorAll('[data-nudge]').forEach(b => {
    b.onclick = e => {
      const [dx, dy] = b.dataset.nudge.split(',').map(Number);
      nudgeBy(dx, dy, e.shiftKey);
    };
  });
  $('#cropReviewed').onchange = e => {
    p.reviewed = e.target.checked;
    drawImageImport();
  };
  $('#cropCancel').onclick = () => $('#dialog').close();
  $('#cropApply').onclick = applyImageImport;
  let start = null;
  const c = $('#cropSource');
  c.onkeydown = e => {
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      e.key
    ];
    if (!move) return;
    e.preventDefault();
    nudgeBy(move[0], move[1], e.shiftKey);
  };
  const point = e => {
    const bounds = c.getBoundingClientRect();
    return [
      Math.max(0, Math.min(p.w, Math.round(((e.clientX - bounds.left) * p.w) / bounds.width))),
      Math.max(0, Math.min(p.h, Math.round(((e.clientY - bounds.top) * p.h) / bounds.height))),
    ];
  };
  const move = (e, fast) => {
    if (!start) return;
    const end = point(e);
    p.rect = {
      x: Math.min(start[0], end[0]),
      y: Math.min(start[1], end[1]),
      w: Math.abs(end[0] - start[0]),
      h: Math.abs(end[1] - start[1]),
    };
    if (p.rect.w > 0) locked('w');
    changed(fast);
  };
  c.onpointerdown = e => {
    start = point(e);
    c.setPointerCapture(e.pointerId);
    resetCropReview();
  };
  c.onpointermove = e => move(e, true);
  c.onpointerup = e => {
    move(e, false);
    start = null;
  };
  c.onpointercancel = () => {
    start = null;
  };
  drawImageImport();
  setupTooltips();
}
function syncCropInputs() {
  for (const k of ['x', 'y', 'w', 'h']) $('#crop-' + k).value = imageImport.rect[k];
}
function resetCropReview() {
  imageImport.reviewed = false;
  $('#cropReviewed').checked = false;
}
/* Reference channel whose grid the selection is resampled onto, or null for an exact crop. */
function fitTarget(p) {
  return p.fit && p.key === 'sem' ? state.channels[p.reference] || null : null;
}
function referenceCanvas(p) {
  if (p.referenceCache?.key !== p.reference)
    p.referenceCache = { key: p.reference, canvas: canvasForChannel(state.channels[p.reference]) };
  return p.referenceCache.canvas;
}
/* `fast` is used while dragging a resampled selection: the canvas scaler stands in for the exact
   resampler until the pointer is released. */
function drawImageImport(fast = false) {
  const p = imageImport;
  if (!p) return;
  const source = $('#cropSource'),
    ctx = source.getContext('2d'),
    r = p.rect;
  ctx.clearRect(0, 0, p.w, p.h);
  ctx.drawImage(p.canvas, 0, 0);
  const valid = cropRectValid(r, p.w, p.h);
  $('#cropApply').disabled = !valid || !p.reviewed;
  const preview = $('#cropPreview'),
    label = $('#cropSizeStatus');
  if (!valid) {
    preview.width = 1;
    preview.height = 1;
    label.textContent = t('Crop must be an integer rectangle inside the image.');
    label.classList.add('warning');
    return;
  }
  ctx.save();
  ctx.fillStyle = '#0007';
  ctx.beginPath();
  ctx.rect(0, 0, p.w, p.h);
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.fill('evenodd');
  ctx.strokeStyle = '#0ed5e2';
  ctx.lineWidth = Math.max(1, p.w / 500);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
  const ref = state.channels[p.reference],
    target = fitTarget(p),
    outW = target ? target.w : r.w,
    outH = target ? target.h : r.h;
  preview.width = outW;
  preview.height = outH;
  const pc = preview.getContext('2d', { willReadFrequently: true });
  if (target && fast) pc.drawImage(p.canvas, r.x, r.y, r.w, r.h, 0, 0, outW, outH);
  else
    pc.putImageData(
      new ImageData(importPixels(p.key, p.rgba, p.w, p.h, r, target).rgba, outW, outH),
      0,
      0,
    );
  const match = ref && ref.w === outW && ref.h === outH;
  if (match) {
    const reference = referenceCanvas(p);
    if (p.flip) pc.drawImage(reference, 0, 0);
    else if (p.view === 'difference') {
      const mine = pc.getImageData(0, 0, outW, outH),
        theirs = reference
          .getContext('2d', { willReadFrequently: true })
          .getImageData(0, 0, outW, outH).data;
      for (let i = 0; i < mine.data.length; i += 4) {
        for (let c = 0; c < 3; c++) mine.data[i + c] = Math.abs(mine.data[i + c] - theirs[i + c]);
        mine.data[i + 3] = 255;
      }
      pc.putImageData(mine, 0, 0);
    } else {
      pc.globalAlpha = 1 - +$('#cropBlend').value;
      pc.drawImage(reference, 0, 0);
      pc.globalAlpha = 1;
    }
  }
  if (target) {
    const sx = outW / r.w,
      sy = outH / r.h,
      skewed = Math.abs(sx / sy - 1) > 0.02;
    label.classList.toggle('warning', skewed);
    label.textContent = `${r.w} × ${r.h} → ${outW} × ${outH} px · ${t('Scale')} ×${sx.toFixed(3)} / ×${sy.toFixed(3)} · ${t(skewed ? 'Horizontal and vertical scale differ by more than 2%; check the selected region.' : 'SEM is display-only; resampled pixels never enter the metrics.')}`;
    return;
  }
  label.classList.toggle('warning', !!ref && !match);
  label.textContent = `${r.w} × ${r.h} px · ${t(!ref ? 'First channel: select only the map region.' : match ? 'Equal dimensions; check alignment using the blend slider.' : 'Dimensions differ. Adjust the crop or crop the other channels before analysis.')}`;
}
async function applyImageImport() {
  const p = imageImport;
  if (!p || !p.reviewed || !cropRectValid(p.rect, p.w, p.h)) return;
  const button = $('#cropApply');
  button.disabled = true;
  try {
    const r = { ...p.rect },
      target = fitTarget(p),
      { rgba, w, h, info: pixelInfo } = importPixels(p.key, p.rgba, p.w, p.h, r, target),
      canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw Error('Image could not be decoded');
    const sha256 = await hashBytes(await png.arrayBuffer());
    if (imageImport !== p) return;
    const original = state.channels[p.key],
      ch = {
        w,
        h,
        rgba,
        data: Float64Array.from({ length: w * h }, (_, i) =>
          Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]),
        ),
        image: canvas.toDataURL('image/png'),
        format: 'image',
        name: p.name,
        sha256,
        sourceImage: p.sourceImage,
        sourceSha256: p.sourceSha,
        importInfo: {
          kind: p.kind,
          sourceWidth: p.w,
          sourceHeight: p.h,
          crop: r,
          ...pixelInfo,
          ...(target ? { lockAspect: p.lockAspect } : {}),
          reviewed: true,
          reference: p.reference || null,
          reviewedAt: new Date().toISOString(),
        },
      };
    $('#dialog').close();
    const cleared = replaceChannel(p.key, ch);
    renderControls();
    renderChannels();
    $('#channel').value = p.key;
    if (ANALYSIS_KEYS.includes(p.key)) selected = p.key;
    draw();
    if (sizeError()) status(sizeErrorMessage, true);
    else {
      await preview();
      fit();
      status(
        () =>
          `${t('Image applied')} · ${t(channelNames[p.key])} · ${ch.w}×${ch.h}${target ? ' · ' + t('Display only, resampled') : ''}${cleared ? ' · ' + t('ROI and calibration cleared; recalibrate cropped screenshots.') : state.settings.calibration === null ? ' · ' + t('Calibrate screenshots before using micrometres.') : ''}`,
      );
    }
  } catch (e) {
    status(messageText(e.message), true);
    if (imageImport === p) drawImageImport();
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('paste', e => {
    const editable = e.target.closest?.('input,textarea,[contenteditable="true"]');
    if (editable || imageImport) return;
    if ($('#dialog')?.open && !awaitingPaste) return;
    const item = Array.from(e.clipboardData?.items || []).find(
        x => x.kind === 'file' && x.type.startsWith('image/'),
      ),
      file = item?.getAsFile();
    if (!file) {
      if (awaitingPaste) {
        status('No image in clipboard. Copy the displayed image or a screenshot.', true);
        e.preventDefault();
      }
      return;
    }
    e.preventDefault();
    openImageImport(file, pasteTarget);
  });
  document.addEventListener('click', e => {
    const card = e.target.closest?.('[data-drop]');
    if (card) selectPasteTarget(card.dataset.drop);
  });
  // Closing a review cancels any pending asynchronous decode or commit, preserving the existing channel.
}
if (typeof module !== 'undefined')
  module.exports = {
    cropRectValid,
    cropRGBA,
    nudgeRect,
    lockAspect,
    resampleRGBA,
    resamplingMode,
    importPixels,
  };
