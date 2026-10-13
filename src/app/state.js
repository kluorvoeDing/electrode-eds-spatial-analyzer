/* Shared application state, defaults and constants. */
const VERSION = '/*VERSION*/';
const { ANALYSIS_KEYS, MAX_PIXELS, GRID_OPTIONS } = Core;
const $ = s => document.querySelector(s),
  esc = s =>
    String(s).replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
function info(key) {
  return `<button class="info" type="button" aria-label="${esc(key)} ${t('Help')}" data-help="${key}">i</button>`;
}
const defaults = () => ({
  auto: true,
  threshold: 128,
  invert: false,
  min: 0,
  fill: false,
  smooth: false,
});
let state = {
  sample: 'Untitled',
  view: 'top',
  material: 'TiO2',
  channels: {},
  seg: { nmc: defaults(), secondary: defaults(), f: defaults() },
  rois: [],
  roiInvert: false,
  settings: {
    grid: 5,
    calibration: null,
    binderRadius: 3,
    ratio: false,
    epsilon: 1,
    depthAxis: 'y',
    depthReverse: false,
  },
  comparison: [],
  results: null,
};
let step = 'data',
  selected = 'secondary',
  display = 'overlay',
  zoom = 1,
  opacity = 0.45,
  masks = {},
  effectiveROI = null,
  revision = 0,
  busy = false,
  requestId = 0,
  latest = 0,
  pendingPolygon = [],
  dragStart = null,
  drawMode = 'pan',
  exclude = false,
  scalePoints = [],
  panStart = null,
  previewTimer = null,
  channelVersion = 0,
  workerSentVersion = -1;
const channelNames = {
  sem: 'SEM / BSE',
  nmc: 'NMC / Ni',
  secondary: 'Secondary phase / Additive',
  f: 'PVDF / F',
  other: 'Other element',
};
let lastStatus = 'Ready',
  lastStatusError = false;
