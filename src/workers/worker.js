/* Keep imported intensity and unchanged masks in Worker memory. */
let channelCache = {},
  roiKey = '',
  roiCache = null,
  segCache = {};
onmessage = event => {
  try {
    const p = event.data.payload,
      { w, h, settings } = p;
    if (p.channels) {
      channelCache = p.channels;
      segCache = {};
    }
    const nextROIKey = JSON.stringify([w, h, p.rois, p.roiInvert]);
    if (nextROIKey !== roiKey) {
      roiCache = Core.roiMask(w, h, p.rois, p.roiInvert);
      roiKey = nextROIKey;
      segCache = {};
    }
    const masks = {},
      intensities = {},
      thresholds = {};
    for (const key of ['nmc', 'secondary', 'f'])
      if (channelCache[key]) {
        const param = p.seg[key],
          signature = JSON.stringify([
            param.auto,
            param.auto ? null : param.threshold,
            param.invert,
            param.min,
            param.fill,
            param.smooth,
            key === 'secondary' ? settings.ratio : false,
            key === 'secondary' ? settings.epsilon : null,
          ]);
        if (segCache[key]?.signature !== signature) {
          let data = channelCache[key].data;
          if (key === 'secondary' && settings.ratio)
            data = Float64Array.from(
              data,
              (x, i) => x / (channelCache.nmc.data[i] + settings.epsilon),
            );
          segCache[key] = { signature, data, ...Core.segment(data, w, h, roiCache, param) };
        }
        masks[key] = segCache[key].mask;
        intensities[key] = channelCache[key].data;
        thresholds[key] = segCache[key].threshold;
      }
    const results = p.analyze
      ? Core.analyze({
          w,
          h,
          roi: roiCache,
          nmc: masks.nmc,
          secondary: masks.secondary,
          f: masks.f,
          secondaryIntensity: intensities.secondary,
          fIntensity: intensities.f,
          ...settings,
        })
      : null;
    const result = {
      roi: new Uint8Array(roiCache),
      masks: Object.fromEntries(Object.entries(masks).map(([k, m]) => [k, new Uint8Array(m)])),
      thresholds,
      results,
    };
    postMessage({ id: event.data.id, result }, [
      result.roi.buffer,
      ...Object.values(result.masks).map(x => x.buffer),
    ]);
  } catch (e) {
    postMessage({ id: event.data.id, error: e.message });
  }
};
