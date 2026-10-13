/* Message plumbing only; the cached pipeline lives in Core so it can be unit tested. */
const run = Core.createPipeline();
onmessage = event => {
  try {
    const { roi, masks, thresholds, results } = run(event.data.payload);
    // Copies are transferred so the cached arrays stay usable for the next request.
    const result = {
      roi: new Uint8Array(roi),
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
