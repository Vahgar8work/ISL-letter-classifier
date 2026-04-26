function argmax(arr) {
  return arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);
}

function entropy(probs) {
  return -probs.reduce((s, p) => (p > 1e-9 ? s + p * Math.log2(p) : s), 0);
}

function buildTensor(source, roi, imgsz) {
  const canvas = new OffscreenCanvas(imgsz, imgsz);
  const ctx    = canvas.getContext('2d');
  if (roi) {
    ctx.drawImage(source, roi.x, roi.y, roi.w, roi.h, 0, 0, imgsz, imgsz);
  } else {
    ctx.drawImage(source, 0, 0, imgsz, imgsz);
  }
  const { data } = ctx.getImageData(0, 0, imgsz, imgsz);
  const n        = imgsz * imgsz;
  const float32  = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    float32[i]         = data[i * 4]     / 255.0;
    float32[n + i]     = data[i * 4 + 1] / 255.0;
    float32[2 * n + i] = data[i * 4 + 2] / 255.0;
  }
  return new ort.Tensor('float32', float32, [1, 3, imgsz, imgsz]);
}

export async function loadClassifier(modelUrl, labelsUrl, config) {
  if (typeof ort === 'undefined') {
    throw new Error('ONNX Runtime Web (window.ort) not loaded. Check CDN script tag.');
  }

  let labels = [];
  try {
    const res = await fetch(labelsUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${labelsUrl}`);
    const json = await res.json();
    labels = Object.keys(json).sort((a, b) => Number(a) - Number(b)).map(k => json[k]);
    console.log(`[Classifier] ${labels.length} labels loaded.`);
  } catch (err) {
    console.warn('[Classifier] labels.json unavailable, using fallback.', err.message);
    labels = [
      ...'0123456789'.split(''),
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      'no_gesture',
    ];
  }

  const noGestureIdx = labels.findIndex(
   l => l.toLowerCase() === 'null' || l.toLowerCase().includes('no_gesture')
  );

  console.log('[Classifier] Creating ONNX session…');
  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders:     [config.executionProvider ?? 'wasm'],
    graphOptimizationLevel: 'all',
  });
  const inputName  = session.inputNames[0];
  const outputName = session.outputNames[0];
  console.log(`[Classifier] Ready. input='${inputName}' output='${outputName}'`);

  return {
    labels,
    noGestureIdx,
    async predict(source, roi = null) {
      const tensor  = buildTensor(source, roi, config.imgsz ?? 256);
      const results = await session.run({ [inputName]: tensor });
      const logits  = Array.from(results[outputName].data);
      const probs = logits; 

      const top1Idx     = argmax(probs);
      const top1Conf    = probs[top1Idx];
      const sortedProbs = [...probs].sort((a, b) => b - a);
      const margin      = sortedProbs[0] - sortedProbs[1];
      const H           = entropy(probs);

      const isNoGesture = (
        top1Idx === noGestureIdx
        || top1Conf < (config.confThreshold   ?? 0.60)
        || margin   < (config.marginThreshold ?? 0.20)
      );

      return {
        letter:     top1Idx < labels.length ? labels[top1Idx] : String(top1Idx),
        labelIdx:   top1Idx,
        confidence: top1Conf,
        margin,
        entropy:    H,
        isNoGesture,
        probs,
      };
    },
  };
}