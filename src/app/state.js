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
  return `<button class="info" type="button" aria-label="${t('Help')}" data-help="${key}">i</button>`;
}
/* Line icons drawn inline (the page loads nothing from outside), 16 px, 1.5 px strokes. */
const ICONS = {
  paste:
    '<rect x="4" y="3.5" width="8" height="10" rx="1.5"/><path d="M6.5 3.5V2.8c0-.4.3-.8.8-.8h1.4c.5 0 .8.4.8.8v.7"/><path d="M6.5 8h3M6.5 10.5h3"/>',
  file: '<path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/>',
  crop: '<path d="M4.5 1.5v10h10"/><path d="M1.5 4.5h10v10"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  more: '<circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/>',
  panel: '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M10 2.5v11"/>',
  open: '<path d="M2 4.5V12c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V6.5c0-.6-.4-1-1-1H8L6.5 3.5H3c-.6 0-1 .4-1 1z"/>',
};
const icon = name =>
  `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${ICONS[name]}</svg>`;
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
const DISPLAY_MODES = ['elements', 'overlay', 'original', 'mask'],
  DISPLAY_LABELS = {
    elements: 'Elements',
    overlay: 'Overlay',
    original: 'Original',
    mask: 'Single mask',
  },
  ELEMENT_TINT = {
    nmc: [224, 64, 251],
    secondary: [255, 152, 0],
    f: [41, 121, 255],
    c: [242, 210, 0],
    other: [0, 188, 212],
  };
// Elements whose distribution is reported, in the order of the results tabs.
const METRIC_KEYS = ['secondary', 'f', 'c'];
// Element whose local shares label the grid and whose figures and trends are shown.
let metric = 'secondary';
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
const MASK_ORDER = ['nmc', 'f', 'c', 'secondary'];
// Masks the user has unticked on the mask step, to read overlapping elements one at a time.
const maskHidden = new Set();
const MATERIALS = ['TiO2', 'ZrO2', 'MnO2', 'Al2O3', 'LFP', 'Other'];
const initialState = () => ({
  sample: 'Untitled',
  view: 'top',
  material: 'TiO2',
  channels: {},
  seg: { nmc: defaults(), secondary: defaults(), f: defaults(), c: defaults() },
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
// Names short enough for the legend above the image.
const SHORT_NAMES = {
  nmc: 'Ni',
  secondary: 'Secondary phase',
  f: 'F',
  c: 'C',
  other: 'Other',
  sem: 'SEM',
};
const channelNames = {
  sem: 'SEM / BSE',
  nmc: 'NMC / Ni',
  secondary: 'Secondary phase / Additive',
  f: 'PVDF / F',
  c: 'Carbon / C',
  other: 'Other element',
};
let lastStatus = 'Ready',
  lastStatusError = false;
