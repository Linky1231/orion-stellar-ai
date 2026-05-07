// Subtle Apple-like sound effects via WebAudio (no asset deps)
let ctx: AudioContext | null = null;
function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

function tone(freq: number, dur = 0.08, type: OscillatorType = "sine", gain = 0.06) {
  const c = getCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

export const sfx = {
  tap: () => tone(880, 0.05, "sine", 0.04),
  send: () => { tone(740, 0.07); setTimeout(() => tone(988, 0.09), 50); },
  receive: () => tone(523, 0.1, "sine", 0.05),
  open: () => tone(660, 0.12, "triangle", 0.05),
  error: () => tone(220, 0.18, "sawtooth", 0.05),
};
