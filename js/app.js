import { loadClassifier }   from './classifier.js';
import { createBuffer }     from './buffer.js';
import { loadHandDetector } from './hand.js';
import { initUI, setLoading, setStatus, updateUI, drawGuideBox, addToHistory } from './ui.js';

const CFG = window.ISL_CONFIG ?? {};

let classifier    = null;
let detector      = null;
let buffer        = null;
let videoEl       = null;
let running       = false;
let rafId         = null;
let lastTimestamp = -1;

function btn(id) { return document.getElementById(id); }

function speak(word) {
  if (!word || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterText = word.toLowerCase();
  const utt   = new SpeechSynthesisUtterance(utterText);
  utt.lang    = CFG.ttsLang ?? 'en-US';
  utt.rate    = CFG.ttsRate ?? 0.95;
  utt.onend   = () => { if (running) setStatus('detecting'); };
  utt.onerror = e => { console.warn('[App] TTS error:', e.error); if (running) setStatus('detecting'); };
  window.speechSynthesis.speak(utt);
  setStatus('speaking', `Speaking: "${word}"`);
}

async function loop() {
  if (!running) return;
  try {
    const now       = performance.now();
    const timestamp = now > lastTimestamp ? now : lastTimestamp + 1;
    lastTimestamp   = timestamp;

const { hasHand } = detector.detect(videoEl, timestamp);
const fixedROI    = drawGuideBox(hasHand);  // always draw, always get ROI

let prediction = { isNoGesture: true, letter: '', confidence: 0, margin: 0 };

if (hasHand && fixedROI) {
  try { prediction = await classifier.predict(videoEl, fixedROI); }
  catch (err) { console.warn('[App] Inference error:', err); }
}

    if (!running) return; // re-check after async predict

    const event     = buffer.update(prediction);
    const bufState  = buffer.getState();
    const confirmed = event.type === 'letter_added';

    updateUI({
      letter:       prediction.letter ?? '—',
      confidence:   prediction.confidence ?? 0,
      holdProgress: bufState.holdProgress,
      word:         bufState.wordBuffer,
      isNoGesture:  prediction.isNoGesture,
    });

    if (event.type === 'speak') {
      speak(event.word); addToHistory(event.word);
    } else if (event.type === 'letter_added') {
      setStatus('confirming', `✓ ${event.letter}  →  "${event.word}"`);
    } else if (event.type === 'holding') {
      setStatus('confirming', `Hold "${event.letter}"… ${Math.round(bufState.holdProgress * 100)}%`);
    } else if (hasHand) {
      setStatus('detecting', 'Detecting hand…');
    } else {
      setStatus('idle', bufState.wordBuffer ? `Buffer: "${bufState.wordBuffer}"` : 'Ready');
    }
  } catch (err) {
    console.error('[App] Unhandled loop error:', err);
    setStatus('error', err.message);
    running = false;
    const s = btn('btn-start');
    if (s) { s.removeAttribute('data-running'); s.textContent = 'Start'; }
    return;
  }
  rafId = requestAnimationFrame(loop);
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  }).catch(err => { throw new Error(`Camera access denied: ${err.message}`); });
  videoEl.srcObject = stream;
  await new Promise((resolve, reject) => {
    videoEl.onloadedmetadata = resolve;
    videoEl.onerror = () => reject(new Error('Video element setup failed'));
  });
  await videoEl.play();
}

function stopCamera() {
  videoEl?.srcObject?.getTracks().forEach(t => t.stop());
  if (videoEl) videoEl.srcObject = null;
}

function startApp() {
  if (running) return;
  running = true; lastTimestamp = -1;
  buffer.reset(); setStatus('detecting');
  rafId = requestAnimationFrame(loop);
  const s = btn('btn-start');
  if (s) { s.setAttribute('data-running', 'true'); s.textContent = 'Stop'; }
}

function stopApp() {
  running = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  setStatus('idle', 'Stopped'); drawGuideBox(false);
  const s = btn('btn-start');
  if (s) { s.removeAttribute('data-running'); s.textContent = 'Start'; }
}

async function init() {
  initUI();
  videoEl = document.getElementById('video');

  const steps = [
    { msg: 'Loading ONNX model…',    fn: () => loadClassifier('./best.onnx', './labels.json', CFG), key: 'clf' },
    { msg: 'Loading hand detector…', fn: () => loadHandDetector(),                                  key: 'det' },
    { msg: 'Starting camera…',       fn: () => startCamera(),                                       key: null  },
  ];

  for (const step of steps) {
    setLoading(true, step.msg);
    try {
      const result = await step.fn();
      if      (step.key === 'clf') classifier = result;
      else if (step.key === 'det') detector   = result;
    } catch (err) {
      setLoading(true, `❌ ${err.message}`);
      console.error('[App] Init failed:', err);
      return;
    }
  }

  buffer = createBuffer(CFG);
  setLoading(false);
  setStatus('idle', 'Ready — press Start');

  btn('btn-start')?.addEventListener('click', () => {
    btn('btn-start')?.getAttribute('data-running') ? stopApp() : startApp();
  });
  btn('btn-speak')?.addEventListener('click', () => {
    const ev = buffer.flush();
    if (ev.type === 'speak') { speak(ev.word); addToHistory(ev.word); }
  });
  btn('btn-backspace')?.addEventListener('click', () => {
    buffer.backspace();
    updateUI({ letter: '', confidence: 0, holdProgress: 0,
               word: buffer.getState().wordBuffer, isNoGesture: true });
  });
  btn('btn-clear')?.addEventListener('click', () => {
    buffer.reset();
    updateUI({ letter: '', confidence: 0, holdProgress: 0, word: '', isNoGesture: true });
    setStatus('idle', 'Cleared');
  });

  window.addEventListener('beforeunload', stopCamera);
}

init();