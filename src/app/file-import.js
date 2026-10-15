/* File and drag-and-drop import, plus the synthetic demo. */
async function decodeLocalImage(file) {
  try {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(file);
  } catch (_) {}
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('File could not be read'));
    reader.readAsDataURL(file);
  });
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(Error('Image could not be decoded'));
    img.src = url;
  });
}
function sizeErrorMessage() {
  const sizes = Object.entries(state.channels)
    .map(([k, c]) => `${t(channelNames[k])}: ${c.w}×${c.h}`)
    .join(' · ');
  return `${t('Channel dimensions differ')} · ${sizes} · ${t('Crop labels and scale bars; use aligned map regions of equal size.')}`;
}
/* The analysis grid is set by the analysis channels; display-only channels define it only while
   no analysis channel is loaded. */
function gridChannel() {
  return (
    ANALYSIS_KEYS.map(k => state.channels[k]).find(Boolean) || Object.values(state.channels)[0]
  );
}
/* Single entry point for putting a channel into the workspace. ROI and calibration describe the
   analysis grid, so both are cleared when an analysis channel is replaced or the grid size
   changes. Adding a channel, or changing a display-only one while analysis channels are loaded,
   keeps them. Returns whether anything was cleared. */
function replaceChannel(key, ch) {
  // The first real image replaces the whole example, so none of its maps are left behind.
  if (demoLoaded) {
    state.channels = {};
    demoLoaded = false;
  }
  const grid = gridChannel(),
    isAnalysis = ANALYSIS_KEYS.includes(key),
    definesGrid = isAnalysis || !ANALYSIS_KEYS.some(k => state.channels[k]),
    gridChanged = !!grid && (grid.w !== ch.w || grid.h !== ch.h),
    reset = definesGrid && (gridChanged || (isAnalysis && !!state.channels[key])),
    cleared =
      reset && !!(state.rois.length || state.roiInvert || state.settings.calibration !== null);
  state.channels[key] = ch;
  channelVersion++;
  if (reset) {
    state.rois = [];
    state.roiInvert = false;
    applyCalibration(null);
  }
  if (state.seg[key]) state.seg[key].auto = true;
  masks = {};
  effectiveROI = null;
  dirty();
  return cleared;
}
async function loadFile(file, key) {
  if (!file) return;
  try {
    let ch;
    if (/\.csv$/i.test(file.name)) {
      ch = Core.parseCSV(await file.text());
      ch.format = 'csv';
    } else if (/\.(png|jpe?g)$/i.test(file.name)) {
      const img = await decodeLocalImage(file),
        canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      if (canvas.width * canvas.height > MAX_PIXELS) {
        img.close?.();
        throw Error('Map 超過 1600 萬像素，請先縮小。');
      }
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      // Report-style images (title, scale bar) and images off the analysis grid go through the
      // crop review, exactly like a pasted image; a clean map on the grid is imported directly.
      const grid = gridTarget(key),
        framed =
          key === 'sem'
            ? detectFrame(rgba, canvas.width, canvas.height)
            : detectMapRegion(rgba, canvas.width, canvas.height);
      if (framed || (grid && (grid.w !== canvas.width || grid.h !== canvas.height))) {
        img.close?.();
        status(() => `${t('Review the crop')} · ${t(channelNames[key])}`);
        return openImageImport(file, key, null, { kind: 'file', name: file.name });
      }
      ch = {
        w: canvas.width,
        h: canvas.height,
        data: Float64Array.from({ length: canvas.width * canvas.height }, (_, i) =>
          Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]),
        ),
        image: canvas.toDataURL('image/png'),
        rgba: new Uint8ClampedArray(rgba),
        format: 'image',
      };
      img.close?.();
    } else throw Error('僅支援 PNG / JPG / CSV。');
    if (ch.w * ch.h > MAX_PIXELS) throw Error('Map 超過 1600 萬像素，請先縮小。');
    ch.name = file.name;
    if (crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      ch.sha256 = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    }
    const cleared = replaceChannel(key, ch);
    renderControls();
    renderChannels();
    draw();
    if (sizeError()) status(sizeErrorMessage, true);
    else {
      status(
        () =>
          `${t('Imported')} ${file.name}${cleared ? ' · ' + t('ROI and calibration cleared.') : ''}`,
      );
      await preview();
      fit();
    }
  } catch (e) {
    const reason = e.message;
    status(() => `${t('Import failed')}: ${file.name} · ${messageText(reason)}`, true);
  }
}
function loadDemo() {
  const w = 240,
    h = 240,
    ni = new Float64Array(w * h),
    s = new Float64Array(w * h),
    f = new Float64Array(w * h),
    c = new Float64Array(w * h),
    sem = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        dx = (x % 48) - 24,
        dy = (y % 48) - 24;
      ni[i] = Math.hypot(dx, dy) < 14 ? 200 : 0;
      s[i] = x % 48 < 10 && y % 48 < 12 ? 180 : 0;
      f[i] = x % 48 < 13 && y % 48 < 15 ? 220 : 0;
      // Carbon dots in the gaps, larger towards the right, so the trends have something to show.
      c[i] =
        x % 48 >= 36 && x % 48 < 38 + Math.floor(x / 48) && y % 48 >= 38 && y % 48 < 44 ? 160 : 0;
      sem[i] = 30 + ni[i] * 0.7 + s[i] * 0.4;
    }
  state.channels = {
    sem: { name: 'synthetic-sem.csv', w, h, data: sem, format: 'csv' },
    nmc: { name: 'synthetic-ni.csv', w, h, data: ni, format: 'csv' },
    secondary: { name: 'synthetic-ti.csv', w, h, data: s, format: 'csv' },
    f: { name: 'synthetic-f.csv', w, h, data: f, format: 'csv' },
    c: { name: 'synthetic-c.csv', w, h, data: c, format: 'csv' },
  };
  channelVersion++;
  state.sample = 'Synthetic uniform';
  $('#sample').value = state.sample;
  state.rois = [];
  state.roiInvert = false;
  state.settings.ratio = false;
  state.settings.binderRadiusCustom = false;
  applyCalibration(null);
  // Noise-free reference maps: thresholded as they are, so the expected values stay exact.
  const exact = () => ({ ...defaults(), denoise: 0 });
  state.seg = { nmc: exact(), secondary: exact(), f: exact(), c: exact() };
  demoLoaded = true;
  dirty();
  renderControls();
  renderChannels();
  // On the analysis step the example is analysed at once, like any other arrival there.
  recompute().then(fit);
}
