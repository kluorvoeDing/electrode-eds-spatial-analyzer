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
    // Everything is validated and decoded before the current workspace is replaced.
    const s = normalizeSession(JSON.parse(await file.text()));
    await decodeSessionImages(s.channels);
    state = {
      sample: s.sample,
      view: s.view,
      material: s.material,
      channels: s.channels,
      seg: s.seg,
      rois: s.rois,
      roiInvert: s.roiInvert,
      settings: s.settings,
      comparison: s.comparison,
      results: null,
    };
    masks = {};
    effectiveROI = null;
    setUILanguage(s.uiLanguage || language);
    updateChrome();
    channelVersion++;
    revision++;
    selected = ANALYSIS_KEYS.includes(s.workspace?.selected) ? s.workspace.selected : 'secondary';
    display = DISPLAY_MODES.includes(s.workspace?.display) ? s.workspace.display : 'overlay';
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
async function decodeSessionImages(channels) {
  for (const ch of Object.values(channels))
    if (ch.image) {
      const img = new Image();
      img.src = ch.image;
      await img.decode().catch(() => {
        throw Error('Image could not be decoded');
      });
      // A PNG of another size would be cropped or padded silently and no longer match `data`.
      if (img.naturalWidth !== ch.w || img.naturalHeight !== ch.h)
        throw Error('Channel 資料不合法。');
      const c = document.createElement('canvas');
      c.width = ch.w;
      c.height = ch.h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      ch.rgba = ctx.getImageData(0, 0, ch.w, ch.h).data;
    }
}

const PNG_DATA_URL = /^data:image\/png;base64,/,
  RESAMPLING_MODES = ['none', 'area-average', 'bilinear', 'area-average+bilinear'];
const isRecord = x => !!x && typeof x === 'object' && !Array.isArray(x),
  isBool = x => typeof x === 'boolean',
  isText = x => typeof x === 'string';
/* Checks a parsed session file and returns a copy holding only known fields, so nothing
   unexpected reaches the workspace. Fields added after schema version 1 was introduced are
   optional and fall back to their defaults. Throws on anything inconsistent. */
function normalizeSession(s) {
  if (!isRecord(s) || s.schema !== 'electrode-eds-session' || s.schemaVersion !== 1)
    throw Error('不支援的 Session 格式。');
  if (
    !isText(s.sample) ||
    !['top', 'cross'].includes(s.view) ||
    !isRecord(s.channels) ||
    !isRecord(s.seg) ||
    !isRecord(s.settings) ||
    !Array.isArray(s.rois)
  )
    throw Error('欄位缺漏。');
  const material = s.material ?? 'TiO2',
    roiInvert = s.roiInvert ?? false,
    comparison = s.comparison ?? [];
  if (!MATERIALS.includes(material)) throw Error('參數不合法。');
  if (!isBool(roiInvert)) throw Error('ROI 不合法。');
  if (!Array.isArray(comparison)) throw Error('欄位缺漏。');
  return {
    sample: s.sample,
    view: s.view,
    material,
    channels: Object.fromEntries(
      Object.entries(s.channels).map(([k, c]) => [k, normalizeChannel(k, c)]),
    ),
    seg: Object.fromEntries(ANALYSIS_KEYS.map(k => [k, normalizeSegmentation(s.seg[k])])),
    rois: s.rois.map(normalizeROI),
    roiInvert,
    settings: normalizeSettings(s.settings),
    comparison: comparison.map(normalizeComparison),
    uiLanguage: s.uiLanguage,
    workspace: isRecord(s.workspace) ? s.workspace : {},
  };
}
function normalizeChannel(key, c) {
  if (!isRecord(c)) throw Error('Channel 資料不合法。');
  for (const field of ['image', 'sourceImage'])
    if (c[field] != null && !(isText(c[field]) && PNG_DATA_URL.test(c[field])))
      throw Error('圖片須為內嵌 PNG。');
  const format = c.format ?? (c.image ? 'image' : 'csv');
  if (
    !channelNames[key] ||
    !['csv', 'image'].includes(format) ||
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
  const text = x => (isText(x) ? x : undefined);
  return {
    name: text(c.name) ?? key,
    w: c.w,
    h: c.h,
    format,
    sha256: text(c.sha256),
    image: c.image ?? undefined,
    sourceImage: c.sourceImage ?? undefined,
    sourceSha256: text(c.sourceSha256),
    importInfo: normalizeImportInfo(c.importInfo),
    data: new Float64Array(c.data),
  };
}
function normalizeImportInfo(v) {
  if (v == null) return undefined;
  if (!isRecord(v)) throw Error('Channel 資料不合法。');
  const out = {},
    keep = (key, valid) => {
      if (v[key] == null) return;
      if (!valid(v[key])) throw Error('Channel 資料不合法。');
      out[key] = v[key];
    },
    positive = x => Number.isFinite(x) && x > 0;
  keep('kind', isText);
  keep('sourceWidth', Number.isInteger);
  keep('sourceHeight', Number.isInteger);
  keep('crop', r => isRecord(r) && ['x', 'y', 'w', 'h'].every(k => Number.isInteger(r[k])));
  if (out.crop) out.crop = { x: v.crop.x, y: v.crop.y, w: v.crop.w, h: v.crop.h };
  keep('pixelResampling', x => RESAMPLING_MODES.includes(x));
  keep('scaleX', positive);
  keep('scaleY', positive);
  keep('lockAspect', isBool);
  keep('displayOnly', isBool);
  keep('reviewed', isBool);
  keep('reviewedAt', isText);
  out.reference = isText(v.reference) && channelNames[v.reference] ? v.reference : null;
  return out;
}
function normalizeSegmentation(p) {
  if (!isRecord(p) || !Number.isFinite(p.threshold) || !Number.isFinite(p.min) || p.min < 0)
    throw Error('Segmentation 不合法。');
  const out = { ...defaults(), threshold: p.threshold, min: p.min };
  for (const flag of ['auto', 'invert', 'fill', 'smooth'])
    if (p[flag] != null) {
      if (!isBool(p[flag])) throw Error('Segmentation 不合法。');
      out[flag] = p[flag];
    }
  return out;
}
function normalizeROI(r) {
  const excluded = r?.exclude ?? false;
  if (!isRecord(r) || !isBool(excluded)) throw Error('ROI 不合法。');
  if (r.type === 'rect') {
    if (![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.w <= 0 || r.h <= 0)
      throw Error('ROI 不合法。');
    return { type: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, exclude: excluded };
  }
  if (r.type === 'polygon') {
    if (
      !Array.isArray(r.points) ||
      r.points.length < 3 ||
      r.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))
    )
      throw Error('Polygon 不合法。');
    return { type: 'polygon', points: r.points.map(([x, y]) => [x, y]), exclude: excluded };
  }
  throw Error('ROI 格式不合法。');
}
function normalizeSettings(v) {
  const out = {
    grid: v.grid,
    calibration: v.calibration ?? null,
    binderRadius: v.binderRadius,
    ratio: v.ratio ?? false,
    epsilon: v.epsilon,
    depthAxis: v.depthAxis ?? 'y',
    depthReverse: v.depthReverse ?? false,
  };
  if (
    !GRID_OPTIONS.includes(out.grid) ||
    !(Number.isFinite(out.epsilon) && out.epsilon > 0) ||
    !Number.isFinite(out.binderRadius) ||
    out.binderRadius < 0 ||
    (out.calibration !== null && !(Number.isFinite(out.calibration) && out.calibration > 0)) ||
    !isBool(out.ratio) ||
    !['x', 'y'].includes(out.depthAxis) ||
    !isBool(out.depthReverse)
  )
    throw Error('參數不合法。');
  // Sessions saved before this flag existed: a radius off the unit's default was chosen by hand.
  out.binderRadiusCustom =
    v.binderRadiusCustom ?? out.binderRadius !== Core.BINDER_DEFAULT[out.calibration ? 'um' : 'px'];
  if (!isBool(out.binderRadiusCustom)) throw Error('參數不合法。');
  return out;
}
function normalizeComparison(c) {
  if (
    !isRecord(c) ||
    !isText(c.sample) ||
    !isRecord(c.metrics) ||
    !isRecord(c.metrics.distance) ||
    !isRecord(c.trace) ||
    !isRecord(c.trace.parameters)
  )
    throw Error('欄位缺漏。');
  const text = x => (isText(x) ? x : '');
  return {
    sample: c.sample,
    view: c.view,
    metrics: c.metrics,
    trace: c.trace,
    cohesive: text(c.cohesive),
    peel: text(c.peel),
    note: text(c.note),
  };
}
