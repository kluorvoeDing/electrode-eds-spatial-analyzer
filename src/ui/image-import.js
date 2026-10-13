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
      reference:
        Object.keys(state.channels).find(
          k => k !== key && state.channels[k].w === w && state.channels[k].h === h,
        ) ||
        Object.keys(state.channels).find(k => k !== key) ||
        '',
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
  const others = Object.keys(state.channels).filter(k => k !== p.key);
  showDialog(
    'Crop and review',
    `<div class="crop-heading"><strong>${esc(t(channelNames[p.key]))}</strong><span>${p.w} × ${p.h} px</span>${info('pasteCrop')}</div><div class="crop-layout"><div><div class="crop-source-wrap"><canvas id="cropSource" aria-label="${t('Drag to select image region')}"></canvas></div><div class="crop-coordinates">${['x', 'y', 'w', 'h'].map(k => `<label>${t({ x: 'Left (px)', y: 'Top (px)', w: 'Width (px)', h: 'Height (px)' }[k])}<input id="crop-${k}" type="number" step="1" min="${k === 'w' || k === 'h' ? 1 : 0}" value="${p.rect[k]}"></label>`).join('')}</div><div class="row"><button id="cropFull">${t('Use full image')}</button>${others.length ? `<button id="cropMatch">${t('Use reference dimensions')}</button>` : ''}</div></div><div><h3>${t('Crop preview')}</h3><canvas id="cropPreview"></canvas>${others.length ? `<label class="field">${t('Reference channel')}<select id="cropReference">${others.map(k => `<option value="${k}">${esc(t(channelNames[k]))} · ${state.channels[k].w}×${state.channels[k].h}</option>`).join('')}</select></label><label class="field">${t('Image / reference blend')}<input id="cropBlend" type="range" min="0" max="1" step=".05" value=".5"></label>` : ''}<div id="cropSizeStatus" class="compact"></div></div></div><label class="crop-confirm"><input id="cropReviewed" type="checkbox"> ${t('I checked the image region, orientation and alignment.')}</label><div class="row"><button id="cropApply" class="primary" disabled>${t('Apply to channel')}</button><button id="cropCancel">${t('Cancel')}</button></div>`,
  );
  $('#cropSource').width = p.w;
  $('#cropSource').height = p.h;
  if ($('#cropReference')) {
    $('#cropReference').value = p.reference;
    $('#cropReference').onchange = e => {
      p.reference = e.target.value;
      resetCropReview();
      drawImageImport();
    };
    $('#cropBlend').oninput = drawImageImport;
  }
  for (const k of ['x', 'y', 'w', 'h'])
    $('#crop-' + k).oninput = () => {
      p.rect[k] = Number($('#crop-' + k).value);
      resetCropReview();
      drawImageImport();
    };
  $('#cropFull').onclick = () => {
    p.rect = { x: 0, y: 0, w: p.w, h: p.h };
    syncCropInputs();
    resetCropReview();
    drawImageImport();
  };
  if ($('#cropMatch'))
    $('#cropMatch').onclick = () => {
      const ref = state.channels[p.reference];
      if (!ref) return;
      p.rect.w = ref.w;
      p.rect.h = ref.h;
      syncCropInputs();
      resetCropReview();
      drawImageImport();
    };
  $('#cropReviewed').onchange = e => {
    p.reviewed = e.target.checked;
    drawImageImport();
  };
  $('#cropCancel').onclick = () => $('#dialog').close();
  $('#cropApply').onclick = applyImageImport;
  let start = null;
  const c = $('#cropSource');
  const point = e => {
    const bounds = c.getBoundingClientRect();
    return [
      Math.max(0, Math.min(p.w, Math.round(((e.clientX - bounds.left) * p.w) / bounds.width))),
      Math.max(0, Math.min(p.h, Math.round(((e.clientY - bounds.top) * p.h) / bounds.height))),
    ];
  };
  const move = e => {
    if (!start) return;
    const end = point(e);
    p.rect = {
      x: Math.min(start[0], end[0]),
      y: Math.min(start[1], end[1]),
      w: Math.abs(end[0] - start[0]),
      h: Math.abs(end[1] - start[1]),
    };
    syncCropInputs();
    resetCropReview();
    drawImageImport();
  };
  c.onpointerdown = e => {
    start = point(e);
    c.setPointerCapture(e.pointerId);
    resetCropReview();
  };
  c.onpointermove = move;
  c.onpointerup = e => {
    move(e);
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
function drawImageImport() {
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
  preview.width = r.w;
  preview.height = r.h;
  const pc = preview.getContext('2d');
  const rgba = cropRGBA(p.rgba, p.w, p.h, r);
  pc.putImageData(new ImageData(rgba, r.w, r.h), 0, 0);
  const ref = state.channels[p.reference];
  const match = ref && ref.w === r.w && ref.h === r.h;
  if (match) {
    const alpha = +$('#cropBlend').value;
    pc.globalAlpha = 1 - alpha;
    pc.drawImage(canvasForChannel(ref), 0, 0);
    pc.globalAlpha = 1;
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
      rgba = cropRGBA(p.rgba, p.w, p.h, r),
      canvas = document.createElement('canvas');
    canvas.width = r.w;
    canvas.height = r.h;
    canvas.getContext('2d').putImageData(new ImageData(rgba, r.w, r.h), 0, 0);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw Error('Image could not be decoded');
    const sha256 = await hashBytes(await png.arrayBuffer());
    if (imageImport !== p) return;
    const original = state.channels[p.key],
      ch = {
        w: r.w,
        h: r.h,
        rgba,
        data: Float64Array.from({ length: r.w * r.h }, (_, i) =>
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
          pixelResampling: 'none',
          reviewed: true,
          reference: p.reference || null,
          reviewedAt: new Date().toISOString(),
        },
      };
    if (original || !dimensions()) {
      state.rois = [];
      state.roiInvert = false;
      state.settings.calibration = null;
      state.settings.binderRadius = 3;
    }
    $('#dialog').close();
    state.channels[p.key] = ch;
    channelVersion++;
    masks = {};
    effectiveROI = null;
    dirty();
    if (state.seg[p.key]) state.seg[p.key].auto = true;
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
          `${t('Image applied')} · ${t(channelNames[p.key])} · ${ch.w}×${ch.h}${original ? ' · ' + t('ROI and calibration cleared; recalibrate cropped screenshots.') : ' · ' + t('Calibrate screenshots before using micrometres.')}`,
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
if (typeof module !== 'undefined') module.exports = { cropRectValid, cropRGBA };
