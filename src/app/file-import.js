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
      if (canvas.width * canvas.height > 16e6) {
        img.close?.();
        throw Error('Map 超過 1600 萬像素，請先縮小。');
      }
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
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
    if (ch.w * ch.h > 16e6) throw Error('Map 超過 1600 萬像素，請先縮小。');
    ch.name = file.name;
    if (crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      ch.sha256 = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    }
    const previous = dimensions();
    state.channels[key] = ch;
    channelVersion++;
    if (previous && (previous.w !== ch.w || previous.h !== ch.h)) {
      state.rois = [];
      state.roiInvert = false;
    }
    state.seg[key] && (state.seg[key].auto = true);
    dirty();
    renderControls();
    renderChannels();
    draw();
    if (sizeError()) {
      masks = {};
      effectiveROI = null;
      status(sizeErrorMessage, true);
    } else {
      status(() => `${t('Imported')} ${file.name}`);
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
    sem = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        dx = (x % 48) - 24,
        dy = (y % 48) - 24;
      ni[i] = Math.hypot(dx, dy) < 14 ? 200 : 0;
      s[i] = x % 48 < 10 && y % 48 < 12 ? 180 : 0;
      f[i] = x % 48 < 13 && y % 48 < 15 ? 220 : 0;
      sem[i] = 30 + ni[i] * 0.7 + s[i] * 0.4;
    }
  state.channels = {
    sem: { name: 'synthetic-sem.csv', w, h, data: sem, format: 'csv' },
    nmc: { name: 'synthetic-ni.csv', w, h, data: ni, format: 'csv' },
    secondary: { name: 'synthetic-ti.csv', w, h, data: s, format: 'csv' },
    f: { name: 'synthetic-f.csv', w, h, data: f, format: 'csv' },
  };
  channelVersion++;
  state.sample = 'Synthetic uniform';
  $('#sample').value = state.sample;
  state.rois = [];
  state.roiInvert = false;
  state.settings.ratio = false;
  state.settings.calibration = null;
  state.settings.binderRadius = 3;
  state.seg = { nmc: defaults(), secondary: defaults(), f: defaults() };
  dirty();
  renderControls();
  renderChannels();
  preview().then(fit);
}

