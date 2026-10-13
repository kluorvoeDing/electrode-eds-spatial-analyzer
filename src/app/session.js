/* Session snapshot, validation and reload. */
function snapshot() {
  return {
    schema: 'electrode-eds-session',
    schemaVersion: 1,
    toolVersion: VERSION,
    uiLanguage: language,
    ...state,
    channels: Object.fromEntries(
      Object.entries(state.channels).map(([k, ch]) => [
        k,
        {
          name: ch.name,
          w: ch.w,
          h: ch.h,
          format: ch.format,
          sha256: ch.sha256,
          image: ch.image,
          sourceImage: ch.sourceImage,
          sourceSha256: ch.sourceSha256,
          importInfo: ch.importInfo,
          data: Array.from(ch.data),
        },
      ]),
    ),
    workspace: { selected, display, zoom, opacity },
  };
}
$('#save').onclick = () => download(safeName() + '.session.json', JSON.stringify(snapshot()));
$('#sessionFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const s = JSON.parse(await file.text());
    validateSession(s);
    state = {
      sample: s.sample,
      view: s.view,
      material: s.material,
      channels: Object.fromEntries(
        Object.entries(s.channels).map(([k, ch]) => [
          k,
          { ...ch, data: new Float64Array(ch.data) },
        ]),
      ),
      seg: s.seg,
      rois: s.rois,
      roiInvert: s.roiInvert,
      settings: s.settings,
      comparison: s.comparison || [],
      results: null,
    };
    for (const ch of Object.values(state.channels))
      if (ch.image) {
        const img = new Image();
        img.src = ch.image;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = ch.w;
        c.height = ch.h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        ch.rgba = ctx.getImageData(0, 0, ch.w, ch.h).data;
      }
    setUILanguage(s.uiLanguage || language);
    updateChrome();
    channelVersion++;
    revision++;
    selected = ANALYSIS_KEYS.includes(s.workspace?.selected)
      ? s.workspace.selected
      : 'secondary';
    display = ['original', 'mask', 'overlay'].includes(s.workspace?.display)
      ? s.workspace.display
      : 'overlay';
    zoom = Number.isFinite(s.workspace?.zoom) && s.workspace.zoom > 0 ? s.workspace.zoom : 1;
    opacity = Number.isFinite(s.workspace?.opacity)
      ? Math.min(1, Math.max(0, s.workspace.opacity))
      : 0.45;
    $('#opacity').value = opacity;
    $('#sample').value = state.sample;
    renderControls();
    renderChannels();
    await compute(!!state.channels.nmc && !!state.channels.secondary);
    fit();
    status('Session loaded · results recomputed');
  } catch (err) {
    status(() => t('Session could not be loaded') + ': ' + messageText(err.message), true);
  }
  e.target.value = '';
};
function validateSession(s) {
  if (s.schema !== 'electrode-eds-session' || s.schemaVersion !== 1)
    throw Error('不支援的 Session 格式。');
  if (
    typeof s.sample !== 'string' ||
    !['top', 'cross'].includes(s.view) ||
    !s.channels ||
    !s.seg ||
    !s.settings ||
    !Array.isArray(s.rois)
  )
    throw Error('欄位缺漏。');
  for (const [k, c] of Object.entries(s.channels)) {
    if (
      (c.image && !/^data:image\/png;base64,/.test(c.image)) ||
      (c.sourceImage && !/^data:image\/png;base64,/.test(c.sourceImage))
    )
      throw Error('圖片須為內嵌 PNG。');
    if (
      !channelNames[k] ||
      !Number.isInteger(c.w) ||
      !Number.isInteger(c.h) ||
      c.w < 1 ||
      c.h < 1 ||
      c.w * c.h > MAX_PIXELS ||
      !Array.isArray(c.data) ||
      c.data.length !== c.w * c.h ||
      c.data.some(x => !Number.isFinite(x))
    )
      throw Error('Channel 資料不合法。');
  }
  if (
    !GRID_OPTIONS.includes(s.settings.grid) ||
    !(s.settings.epsilon > 0) ||
    !Number.isFinite(s.settings.binderRadius) ||
    s.settings.binderRadius < 0 ||
    (s.settings.calibration !== null &&
      !(Number.isFinite(s.settings.calibration) && s.settings.calibration > 0))
  )
    throw Error('參數不合法。');
  for (const k of ANALYSIS_KEYS) {
    const p = s.seg[k];
    if (!p || !Number.isFinite(p.threshold) || !Number.isFinite(p.min) || p.min < 0)
      throw Error('Segmentation 不合法。');
  }
  for (const r of s.rois) {
    if (r.type === 'rect') {
      if (![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.w <= 0 || r.h <= 0)
        throw Error('ROI 不合法。');
    } else if (r.type === 'polygon') {
      if (
        !Array.isArray(r.points) ||
        r.points.length < 3 ||
        r.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))
      )
        throw Error('Polygon 不合法。');
    } else throw Error('ROI 格式不合法。');
  }
}
