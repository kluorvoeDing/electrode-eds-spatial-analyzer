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
/* Longest run of consecutive indices in [0, length) that satisfy `accept`, as [first, last]. */
function longestRun(length, accept) {
  let best = null,
    start = -1;
  for (let i = 0; i <= length; i++) {
    if (i < length && accept(i)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (!best || i - start > best[1] - best[0] + 1) best = [start, i - 1];
      start = -1;
    }
  }
  return best;
}
/* Finds the map on a report-style image: a dark rectangle carrying coloured counts on a light
   page, with title, label and scale bar around it. Returns the rectangle, or null when nothing
   convincing stands out (the caller then keeps the whole image). Only a starting suggestion: the
   user still reviews and confirms the crop. */
function detectMapRegion(rgba, w, h) {
  const inMap = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4],
      g = rgba[i * 4 + 1],
      b = rgba[i * 4 + 2],
      high = Math.max(r, g, b);
    inMap[i] = high < 70 || high - Math.min(r, g, b) > 70 ? 1 : 0;
  }
  const rowCount = (y, x0, x1) => {
      let n = 0;
      for (let x = x0; x <= x1; x++) n += inMap[y * w + x];
      return n;
    },
    columnCount = (x, y0, y1) => {
      let n = 0;
      for (let y = y0; y <= y1; y++) n += inMap[y * w + x];
      return n;
    };
  // Seed with the rows that are about as full as the fullest row, then tighten each side in turn.
  let widest = 0;
  for (let y = 0; y < h; y++) widest = Math.max(widest, rowCount(y, 0, w - 1));
  if (widest < 16) return null;
  let rows = longestRun(h, y => rowCount(y, 0, w - 1) >= 0.8 * widest),
    columns = null;
  for (let pass = 0; pass < 2 && rows; pass++) {
    const [y0, y1] = rows;
    columns = longestRun(w, x => columnCount(x, y0, y1) >= 0.8 * (y1 - y0 + 1));
    if (!columns) return null;
    const [x0, x1] = columns;
    rows = longestRun(h, y => rowCount(y, x0, x1) >= 0.8 * (x1 - x0 + 1));
  }
  if (!rows || !columns) return null;
  const region = {
    x: columns[0],
    y: rows[0],
    w: columns[1] - columns[0] + 1,
    h: rows[1] - rows[0] + 1,
  };
  let filled = 0;
  for (let y = region.y; y < region.y + region.h; y++)
    filled += rowCount(y, region.x, region.x + region.w - 1);
  const whole = region.w === w && region.h === h,
    plausible =
      region.w >= 16 &&
      region.h >= 16 &&
      region.w * region.h >= 0.04 * w * h &&
      filled >= 0.9 * region.w * region.h;
  return plausible && !whole ? region : null;
}
/* Finds the thin bright frame an EDS report draws on the micrograph around the mapped area, and
   returns the rectangle inside it; null when no such frame is found. A line must be clearly
   brighter than the image two pixels to either side (or border the page), so a brightness step
   between materials does not count. */
function detectFrame(rgba, w, h) {
  if (w < 32 || h < 32) return null;
  const LINE = 40,
    PAGE = 225,
    gray = (x, y) =>
      Math.max(rgba[(y * w + x) * 4], rgba[(y * w + x) * 4 + 1], rgba[(y * w + x) * 4 + 2]),
    mean = (from, to, value) => {
      let sum = 0;
      for (let i = from; i <= to; i++) sum += value(i);
      return sum / (to - from + 1);
    };
  // Walks outwards from `start`; `direction` is +1 or -1.
  const findLine = (start, direction, length, level) => {
    for (let i = start; i >= 2 && i < length - 2; i += direction) {
      const here = level(i),
        outside = level(i + 2 * direction);
      if (here - level(i - 2 * direction) >= LINE && (here - outside >= LINE || outside >= PAGE))
        return i;
    }
    return -1;
  };
  const x0 = Math.floor(w * 0.2),
    x1 = Math.ceil(w * 0.8),
    rowLevel = y => mean(x0, x1, x => gray(x, y)),
    top = findLine(Math.floor(h / 2) - 8, -1, h, rowLevel),
    bottom = findLine(Math.floor(h / 2) + 8, 1, h, rowLevel);
  if (top < 0 || bottom < 0 || bottom - top < 18) return null;
  const columnLevel = x => mean(top + 2, bottom - 2, y => gray(x, y)),
    left = findLine(Math.floor(w / 2) - 8, -1, w, columnLevel),
    right = findLine(Math.floor(w / 2) + 8, 1, w, columnLevel);
  if (left < 0 || right < 0 || right - left < 18) return null;
  return { x: left + 1, y: top + 1, w: right - left - 1, h: bottom - top - 1 };
}
/* A crop of exactly the grid size, centred on `region` (or on the image) and kept inside the
   image; null when the grid is larger than the image. */
function placeLocked(region, target, w, h) {
  if (target.w > w || target.h > h) return null;
  const centre = region ? [region.x + region.w / 2, region.y + region.h / 2] : [w / 2, h / 2];
  return {
    x: Math.max(0, Math.min(w - target.w, Math.round(centre[0] - target.w / 2))),
    y: Math.max(0, Math.min(h - target.h, Math.round(centre[1] - target.h / 2))),
    w: target.w,
    h: target.h,
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
/* Size the analysis channels share: the grid every channel has to match. `exceptKey` leaves out
   the channel being (re)imported. Null until an analysis channel defines it. When loaded channels
   disagree, the size most of them use wins, analysis channels counting first. */
function gridTarget(exceptKey = null) {
  const scores = new Map();
  for (const [key, ch] of Object.entries(state.channels)) {
    if (key === exceptKey) continue;
    const size = `${ch.w}x${ch.h}`,
      entry = scores.get(size) || { w: ch.w, h: ch.h, analysis: 0, all: 0 };
    entry.analysis += ANALYSIS_KEYS.includes(key) ? 1 : 0;
    entry.all++;
    scores.set(size, entry);
  }
  const ranked = [...scores.values()]
    .filter(entry => entry.analysis)
    .sort((a, b) => b.analysis - a.analysis || b.all - a.all);
  return ranked.length ? { w: ranked[0].w, h: ranked[0].h } : null;
}
/* Starting selection for a freshly opened image: the detected map (or the frame on a micrograph),
   adjusted to the grid when the dialog is going to enforce it. */
function suggestCrop(p) {
  const region =
    p.key === 'sem' ? detectFrame(p.rgba, p.w, p.h) : detectMapRegion(p.rgba, p.w, p.h);
  p.detected = !!region;
  if (p.fit && p.target) {
    if (!region) return lockAspect({ x: 0, y: 0, w: p.w, h: p.h }, p.target, 'w', p.w, p.h);
    // Use the frame as drawn unless its shape is far from the grid's.
    const skew = Math.abs(p.target.w / region.w / (p.target.h / region.h) - 1);
    p.lockAspect = skew > 0.02;
    return p.lockAspect ? lockAspect(region, p.target, 'w', p.w, p.h) : region;
  }
  if (p.lockSize) return placeLocked(region, p.target, p.w, p.h);
  return region || { x: 0, y: 0, w: p.w, h: p.h };
}
async function openImageImport(file, key, existing = null, origin = {}) {
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
      target = gridTarget(key),
      onGrid = k =>
        !!target && state.channels[k].w === target.w && state.channels[k].h === target.h,
      remembered = existing?.importInfo?.reference,
      // The reference only drives the comparison preview; sizes always follow the grid.
      reference =
        (others.includes(remembered) && onGrid(remembered) && remembered) ||
        ANALYSIS_KEYS.find(k => others.includes(k) && onGrid(k)) ||
        others.find(onGrid) ||
        others[0] ||
        '',
      savedCrop = existing?.sourceImage && existing.importInfo?.crop,
      fit =
        key === 'sem' &&
        !!target &&
        (existing?.importInfo?.displayOnly === true || w !== target.w || h !== target.h);
    imageImport = {
      key,
      w,
      h,
      canvas,
      rgba,
      name: existing
        ? existing.name
        : origin.name || `clipboard-${key}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      sourceImage: canvas.toDataURL('image/png'),
      sourceSha,
      kind: existing ? existing.importInfo?.kind || 'file' : origin.kind || 'clipboard',
      rect: null,
      reference,
      target,
      // Resampling onto the grid is offered for SEM only; see importPixels.
      fit,
      lockAspect: existing?.importInfo?.lockAspect ?? true,
      // Every other import is held to the grid size, so channels cannot end up a pixel apart.
      lockSize: !fit && !!target && target.w <= w && target.h <= h,
      detected: false,
      view: 'blend',
      flip: false,
      reviewed: false,
    };
    // A stored crop is reused when it still fits the grid. Otherwise the region is detected
    // again, falling back to the stored position, and the box takes the grid size.
    const p = imageImport,
      saved = savedCrop ? { ...existing.importInfo.crop } : null;
    if (saved && (!p.lockSize || (saved.w === target.w && saved.h === target.h))) p.rect = saved;
    else {
      p.rect = suggestCrop(p);
      if (saved && p.lockSize && !p.detected) p.rect = placeLocked(saved, target, w, h);
      p.rect = p.rect || { x: 0, y: 0, w, h };
    }
    renderImageImport();
  } catch (e) {
    if (ticket !== imageImportTicket) return;
    status(
      () =>
        `${t('Import failed')}: ${existing?.name || origin.name || t('Clipboard image')} · ${messageText(e.message)}`,
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
    canFit = p.key === 'sem' && !!p.target,
    gridLabel = p.target ? `${p.target.w} × ${p.target.h}` : '';
  const nudge = (dx, dy, label, arrow) =>
    `<button type="button" data-nudge="${dx},${dy}" aria-label="${t(label)}" title="${t(label)}">${arrow}</button>`;
  showDialog(
    'Crop and review',
    `<div class="crop-heading"><strong>${esc(t(channelNames[p.key]))}</strong><span>${p.w} × ${p.h} px</span>${info('pasteCrop')}</div><div class="crop-layout"><div><div class="crop-source-wrap"><canvas id="cropSource" tabindex="0" aria-label="${t('Drag to select image region')}"></canvas></div><div class="crop-coordinates">${['x', 'y', 'w', 'h'].map(k => `<label>${t({ x: 'Left (px)', y: 'Top (px)', w: 'Width (px)', h: 'Height (px)' }[k])}<input id="crop-${k}" type="number" step="1" min="${k === 'w' || k === 'h' ? 1 : 0}" value="${p.rect[k]}"></label>`).join('')}</div><div class="row crop-nudge"><span class="compact">${t('Nudge (px)')} ${info('nudge')}</span>${nudge(-1, 0, 'Move left', '←')}${nudge(0, -1, 'Move up', '↑')}${nudge(0, 1, 'Move down', '↓')}${nudge(1, 0, 'Move right', '→')}<span class="muted compact">${t('Shift = 10 px')}</span></div><div class="row"><button id="cropDetect">${t('Detect map region')}</button><button id="cropFull">${t('Use full image')}</button>${others.length ? `<button id="cropMatch">${t('Use reference dimensions')}</button>` : ''}</div><div class="crop-fit">${p.target ? `<label><input id="cropLockSize" type="checkbox" ${p.lockSize ? 'checked' : ''}> ${t('Keep the analysis grid size')} (${gridLabel}) ${info('lockSize')}</label>` : ''}${canFit ? `<label><input id="cropFit" type="checkbox" ${p.fit ? 'checked' : ''}> ${t('Scale selection to reference size (SEM only)')} ${info('semFit')}</label><label><input id="cropLock" type="checkbox" ${p.lockAspect ? 'checked' : ''}> ${t('Lock reference aspect ratio')}</label>` : ''}</div></div><div><h3>${t('Crop preview')}</h3><canvas id="cropPreview"></canvas>${others.length ? `<label class="field">${t('Reference channel')}<select id="cropReference">${others.map(k => `<option value="${k}">${esc(t(channelNames[k]))} · ${state.channels[k].w}×${state.channels[k].h}</option>`).join('')}</select></label><label class="field">${t('Preview mode')}<select id="cropView"><option value="blend">${t('Blend')}</option><option value="difference">${t('Difference')}</option></select></label><label class="field">${t('Image / reference blend')}<input id="cropBlend" type="range" min="0" max="1" step=".05" value=".5"></label><button id="cropFlip" type="button">${t('Hold to show reference')}</button>` : ''}<div id="cropSizeStatus" class="compact"></div></div></div><label class="crop-confirm"><input id="cropReviewed" type="checkbox"> ${t('I checked the image region, orientation and alignment.')}</label><div class="row"><button id="cropApply" class="primary" disabled>${t('Apply to channel')}</button><button id="cropCancel">${t('Cancel')}</button></div>`,
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
  // Size-locked: the box has the grid size and can only be moved.
  const sizeLocked = () => p.lockSize && !fitTarget(p);
  const syncLockControls = () => {
    const fixed = sizeLocked();
    for (const k of ['w', 'h']) $('#crop-' + k).disabled = fixed;
    $('#cropFull').disabled = fixed;
    if ($('#cropMatch')) $('#cropMatch').disabled = fixed;
    if ($('#cropLockSize')) {
      $('#cropLockSize').checked = p.lockSize;
      $('#cropLockSize').disabled = !!fitTarget(p) || p.target.w > p.w || p.target.h > p.h;
    }
    if ($('#cropLock')) $('#cropLock').disabled = !fitTarget(p);
  };
  if ($('#cropLockSize'))
    $('#cropLockSize').onchange = e => {
      p.lockSize = e.target.checked;
      if (sizeLocked())
        p.rect = placeLocked(cropRectValid(p.rect, p.w, p.h) ? p.rect : null, p.target, p.w, p.h);
      syncLockControls();
      changed();
    };
  $('#cropDetect').onclick = () => {
    const wasLocked = p.lockAspect;
    p.rect = suggestCrop(p) || { x: 0, y: 0, w: p.w, h: p.h };
    if ($('#cropLock') && wasLocked !== p.lockAspect) $('#cropLock').checked = p.lockAspect;
    changed();
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
      // Without scaling, SEM is held to the grid like any other channel.
      p.lockSize = !p.fit && p.target.w <= p.w && p.target.h <= p.h;
      if (sizeLocked()) p.rect = placeLocked(p.rect, p.target, p.w, p.h);
      locked('w');
      syncLockControls();
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
  // Size-locked boxes follow the pointer by their centre.
  const moveLocked = e => {
    const [x, y] = point(e);
    p.rect = placeLocked({ x, y, w: 0, h: 0 }, p.target, p.w, p.h);
    changed();
  };
  c.onpointerdown = e => {
    start = point(e);
    c.setPointerCapture(e.pointerId);
    resetCropReview();
    if (sizeLocked()) moveLocked(e);
  };
  c.onpointermove = e => {
    if (!start) return;
    if (sizeLocked()) moveLocked(e);
    else move(e, true);
  };
  c.onpointerup = e => {
    if (start && !sizeLocked()) move(e, false);
    start = null;
  };
  c.onpointercancel = () => {
    start = null;
  };
  syncLockControls();
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
/* Grid size the SEM selection is resampled onto, or null for an exact crop. */
function fitTarget(p) {
  return p.fit && p.key === 'sem' ? p.target : null;
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
  const offGrid = !!p.target && (r.w !== p.target.w || r.h !== p.target.h);
  label.classList.toggle('warning', offGrid);
  label.textContent = `${r.w} × ${r.h} px · ${t(offGrid ? 'Dimensions differ. Adjust the crop or crop the other channels before analysis.' : p.target ? 'Equal dimensions; check alignment using the blend slider.' : 'First channel: select only the map region.')}${p.detected ? ' · ' + t('Region suggested automatically; please check it.') : ''}`;
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
    // The close event is dispatched later and cancels whatever review is open at that moment, so
    // anything that opens a new one has to wait for it.
    const closed = new Promise(resolve =>
      $('#dialog').addEventListener('close', resolve, { once: true }),
    );
    $('#dialog').close();
    const cleared = replaceChannel(p.key, ch);
    renderControls();
    renderChannels();
    $('#channel').value = p.key;
    if (ANALYSIS_KEYS.includes(p.key)) selected = p.key;
    draw();
    if (sizeError()) {
      status(sizeErrorMessage, true);
      // A micrograph loaded before the maps now has a grid to match: go straight to scaling it.
      const offenders = gridMismatch().offenders;
      if (
        p.key !== 'sem' &&
        offenders.length === 1 &&
        offenders[0] === 'sem' &&
        state.channels.sem.image
      ) {
        await closed;
        await openImageImport(null, 'sem', state.channels.sem);
      }
    } else {
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
    detectMapRegion,
    detectFrame,
    placeLocked,
  };
