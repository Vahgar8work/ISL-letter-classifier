let els = {};

export function initUI() {
  els = {
    video:          document.getElementById('video'),
    canvas:         document.getElementById('overlay'),
    letterDisplay:  document.getElementById('letter-display'),
    letterSub:      document.getElementById('letter-sub'),
    confBar:        document.getElementById('conf-bar'),
    confValue:      document.getElementById('conf-value'),
    holdRing:       document.getElementById('hold-ring'),
    wordDisplay:    document.getElementById('word-display'),
    historyList:    document.getElementById('history-list'),
    statusDot:      document.getElementById('status-dot'),
    statusText:     document.getElementById('status-text'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingMsg:     document.getElementById('loading-msg'),
  };
  const ro = new ResizeObserver(syncCanvasSize);
  if (els.video) ro.observe(els.video);
  syncCanvasSize();
}

function syncCanvasSize() {
  if (!els.canvas || !els.video) return;
  els.canvas.width  = els.video.clientWidth;
  els.canvas.height = els.video.clientHeight;
}

export function setLoading(visible, message = '') {
  if (!els.loadingOverlay) return;
  els.loadingOverlay.style.display = visible ? 'flex' : 'none';
  if (els.loadingMsg && message) els.loadingMsg.textContent = message;
}

export function setStatus(state, detail = '') {
  if (!els.statusDot || !els.statusText) return;
  const map = {
    idle:       { color: '#797876', text: 'Ready' },
    detecting:  { color: '#4f98a3', text: 'Detecting hand…' },
    confirming: { color: '#e8af34', text: 'Holding…' },
    speaking:   { color: '#6daa45', text: 'Speaking' },
    error:      { color: '#dd6974', text: 'Error' },
  };
  const entry = map[state] ?? map.idle;
  els.statusDot.style.background = entry.color;
  els.statusText.textContent     = detail || entry.text;
}

export function updateUI({ letter, confidence, holdProgress, word, isNoGesture }) {
  if (els.letterDisplay) {
    els.letterDisplay.textContent   = isNoGesture ? '—' : letter;
    els.letterDisplay.style.opacity = isNoGesture ? '0.25' : '1';
  }
  if (els.letterSub) {
    els.letterSub.textContent = isNoGesture
      ? 'No gesture'
      : `${(confidence * 100).toFixed(0)}% confident`;
  }
  if (els.confBar) {
    const pct = Math.round((isNoGesture ? 0 : confidence) * 100);
    els.confBar.style.width = `${pct}%`;
    els.confBar.style.background =
      confidence > 0.80 ? 'var(--color-success)' :
      confidence > 0.60 ? 'var(--color-gold)'    : 'var(--color-warning)';
  }
  if (els.confValue) {
    els.confValue.textContent = isNoGesture ? '—' : `${(confidence * 100).toFixed(1)}%`;
  }
  if (els.holdRing) {
    const circumference = 2 * Math.PI * 20;
    const progress      = isNoGesture ? 0 : Math.min(holdProgress, 1);
    els.holdRing.style.strokeDashoffset = circumference * (1 - progress);
    els.holdRing.style.stroke = progress > 0.8 ? 'var(--color-success)' : 'var(--color-primary)';
  }
  if (els.wordDisplay) {
    els.wordDisplay.textContent   = word || '…';
    els.wordDisplay.style.opacity = word ? '1' : '0.3';
  }
}

export function addToHistory(word) {
  if (!els.historyList || !word) return;
  const placeholder = els.historyList.querySelector('.history-empty');
  if (placeholder) placeholder.remove();

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const item = document.createElement('div');
  item.className = 'history-item';
  item.innerHTML =
    `<span class="history-word">${escapeHtml(word)}</span>` +
    `<span class="history-time">${time}</span>`;
  els.historyList.insertBefore(item, els.historyList.firstChild);
  while (els.historyList.children.length > 20) {
    els.historyList.removeChild(els.historyList.lastChild);
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function drawGuideBox(hasHand) {
  if (!els.canvas || !els.video) return;
  const ctx = els.canvas.getContext('2d');
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);

  const cw = els.canvas.width, ch = els.canvas.height;
  // Fixed box: centered, 55% of the shorter canvas dimension
  const size = Math.min(cw, ch) * 0.55;
  const bx   = (cw - size) / 2;
  const by   = (ch - size) / 2;

  // Dim overlay outside the box
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0,  0,  cw,       by);           // top
  ctx.fillRect(0,  by + size, cw, ch);           // bottom
  ctx.fillRect(0,  by,  bx,      size);          // left
  ctx.fillRect(bx + size, by, cw, size);         // right

  // Guide box border
  ctx.strokeStyle = hasHand ? '#6daa45' : '#4f98a3';
  ctx.lineWidth   = 2.5;
  ctx.setLineDash(hasHand ? [] : [6, 3]);
  ctx.strokeRect(bx, by, size, size);
  ctx.setLineDash([]);

  // Corner accents
  const cLen = size * 0.12;
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = hasHand ? '#6daa45' : '#4f98a3';
  [
    [[bx,          by + cLen], [bx,        by       ], [bx + cLen,        by        ]],
    [[bx+size-cLen,by       ], [bx + size, by       ], [bx + size,        by + cLen ]],
    [[bx,          by+size-cLen],[bx,      by + size ], [bx + cLen,        by + size ]],
    [[bx+size-cLen,by+size  ], [bx + size, by + size], [bx + size,        by+size-cLen]],
  ].forEach(([start, corner, end]) => {
    ctx.beginPath();
    ctx.moveTo(...start); ctx.lineTo(...corner); ctx.lineTo(...end);
    ctx.stroke();
  });

  // Label
  ctx.font = '500 13px Inter, sans-serif';
  ctx.fillStyle = hasHand ? '#6daa45' : 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(hasHand ? 'Hand detected' : 'Place hand here', cw / 2, by - 8);
  ctx.textAlign = 'left';

  // Return the ROI in VIDEO pixel coordinates for classifier
  const scaleX = els.video.videoWidth  / cw;
  const scaleY = els.video.videoHeight / ch;
  return {
    x: Math.round(bx   * scaleX),
    y: Math.round(by   * scaleY),
    w: Math.round(size * scaleX),
    h: Math.round(size * scaleY),
  };
}