export function createBuffer(config = {}) {
  const HOLD_FRAMES       = config.holdFrames       ?? 7;
  const DEFAULT_TOLERANCE = config.defaultTolerance ?? 2;
  const SPEAK_TRIGGER     = config.speakTrigger     ?? 12;

  let holdCount      = 0;
  let noneCount      = 0;
  let lastLetter     = '';
  let cooldownLetter = '';
  let wordBuffer     = '';

  function resetHold() { holdCount = 0; lastLetter = ''; }
  function resetWord() { wordBuffer = ''; resetHold(); noneCount = 0; cooldownLetter = ''; }

  function update(prediction) {
    if (prediction.isNoGesture) {
      resetHold();
      cooldownLetter = '';
      noneCount++;
      if (noneCount <= DEFAULT_TOLERANCE) return { type: 'idle' };
      if (noneCount >= SPEAK_TRIGGER && wordBuffer.length > 0) {
        const word = wordBuffer; resetWord();
        return { type: 'speak', word };
      }
      return { type: 'idle' };
    }

    noneCount = 0;
    const letter = typeof prediction.letter === 'string' ? prediction.letter : '';

    if (letter === cooldownLetter) {
      return { type: 'cooldown', letter, holdProgress: 0 };
    }

    if (letter !== lastLetter) {
      holdCount = 1; lastLetter = letter;
      return { type: 'holding', letter, holdProgress: 1 / HOLD_FRAMES };
    }

    holdCount++;
    if (holdCount < HOLD_FRAMES) {
      return { type: 'holding', letter, holdProgress: holdCount / HOLD_FRAMES };
    }

    resetHold();
    cooldownLetter = letter;
    wordBuffer += letter;
    return { type: 'letter_added', letter, word: wordBuffer };
  }

  function flush() {
    if (wordBuffer.length === 0) return { type: 'idle' };
    const word = wordBuffer; resetWord();
    return { type: 'speak', word };
  }

  function backspace() {
    if (wordBuffer.length === 0) return { type: 'idle' };
    wordBuffer = wordBuffer.slice(0, -1);
    return { type: 'backspace', word: wordBuffer };
  }

  function reset() { resetWord(); }

  function getState() {
    return { holdCount, noneCount, lastLetter, wordBuffer,
             holdProgress: holdCount / HOLD_FRAMES };
  }

  return { update, flush, backspace, reset, getState };
}