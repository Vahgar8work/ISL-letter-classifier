const MP_VERSION   = '0.10.14';
const MP_CDN_BASE  = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MP_WASM_PATH = `${MP_CDN_BASE}/wasm`;
const MP_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const ROI_PAD_PX = 24;

function landmarksToROI(landmarks, videoW, videoH) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const lm of landmarks) {
    const px = lm.x * videoW, py = lm.y * videoH;
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  const x  = Math.max(0,      Math.floor(minX) - ROI_PAD_PX);
  const y  = Math.max(0,      Math.floor(minY) - ROI_PAD_PX);
  const x2 = Math.min(videoW, Math.ceil(maxX)  + ROI_PAD_PX);
  const y2 = Math.min(videoH, Math.ceil(maxY)  + ROI_PAD_PX);
  return { x, y, w: x2 - x, h: y2 - y };
}

export async function loadHandDetector() {
  try {
    console.log('[Hand] Loading MediaPipe Tasks Vision…');
    const { HandLandmarker, FilesetResolver } = await import(
      `${MP_CDN_BASE}/vision_bundle.mjs`
    );
    const filesetResolver = await FilesetResolver.forVisionTasks(MP_WASM_PATH);
    const handLandmarker  = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath: MP_MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence:  0.5,
      minTrackingConfidence:      0.5,
    });
    console.log('[Hand] Ready.');

    return {
      detect(video, timestampMs) {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          return { hasHand: false, roi: null, landmarks: null };
        }
        const result    = handLandmarker.detectForVideo(video, timestampMs);
        const landmarks = result?.landmarks?.[0];
        if (!landmarks) return { hasHand: false, roi: null, landmarks: null };
        const roi = landmarksToROI(landmarks, video.videoWidth, video.videoHeight);
        if (roi.w < 20 || roi.h < 20) return { hasHand: false, roi: null, landmarks: null };
        return { hasHand: true, roi, landmarks };
      },
    };
  } catch (err) {
    throw new Error(`MediaPipe failed to load: ${err.message}`);
  }
}