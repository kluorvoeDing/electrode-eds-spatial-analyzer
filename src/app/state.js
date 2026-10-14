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
  denoise: Core.DENOISE_DEFAULT,
  invert: false,
  min: 0,
  fill: false,
  smooth: false,
});
// 'elements' lays the element maps over SEM in their own colours; 'overlay' shows a mask.
const DISPLAY_MODES = ['original', 'elements', 'overlay', 'mask'],
  ELEMENT_TINT = {
    nmc: [224, 64, 251],
    secondary: [255, 152, 0],
    f: [41, 121, 255],
    other: [255, 235, 59],
  };
// Element maps laid over SEM in the element view. Null until the user picks: the phase under
// study if it is loaded, otherwise every loaded element.
let elementsShown = null;
// Whether the user has opened the less common segmentation options.
let segAdvancedOpen = false;
// The steps of the workflow, in order, and the folded-away tools inside them.
const STEP_ORDER = ['data', 'segment', 'analyze'],
  STEP_LABELS = { data: 'Data', segment: 'Check masks', analyze: 'Analyze' };
let segAdjustOpen = false,
  roiToolsOpen = false;
// Cell of the analysis grid whose values the results panel shows; null for the whole region.
let regionTile = null;
// Masks are drawn in the colour of their channel, the phase under study on top.
const MASK_ORDER = ['nmc', 'f', 'secondary'];
const MATERIALS = ['TiO2', 'ZrO2', 'MnO2', 'Al2O3', 'LFP', 'Other'];
const initialState = () => ({
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
    binderRadius: Core.BINDER_DEFAULT.px,
    binderRadiusCustom: false,
    ratio: false,
    epsilon: 1,
    depthAxis: 'y',
    depthReverse: false,
  },
  comparison: [],
  results: null,
});
let state = initialState();
let step = 'data',
  selected = 'secondary',
  display = 'elements',
  zoom = 1,
  opacity = 0.45,
  masks = {},
  // Value range of each map as it is thresholded (after averaging and the optional ratio).
  segRanges = {},
  effectiveROI = null,
  revision = 0,
  busy = false,
  requestId = 0,
  latest = 0,
  pendingPolygon = [],
  dragStart = null,
  drawMode = 'pan',
  exclude = false,
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
