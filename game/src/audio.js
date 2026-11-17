// audio.js — procedural WebAudio sounds. No audio files, no network.
// One job: turn game events into short synthesized sounds.
let ctx = null;
let master = null;

export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

function tone(freq, dur, type, vol, slideTo) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}

function noise(dur, vol, filterFreq) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master); src.start(t);
}

export const sfx = {
  shot(kind) { noise(0.12, kind === 'rifle' ? 0.9 : 0.6, kind === 'pistol' ? 1800 : 1200); tone(160, 0.08, 'square', 0.25, 60); },
  enemyShot() { noise(0.1, 0.35, 900); },
  reload() { tone(500, 0.07, 'square', 0.2); setTimeout(() => tone(700, 0.07, 'square', 0.2), 180); },
  hit() { tone(1200, 0.05, 'sine', 0.4); },
  kill() { tone(900, 0.08, 'sine', 0.4, 1400); },
  hurt() { tone(140, 0.15, 'sawtooth', 0.4, 70); },
  step() { noise(0.05, 0.12, 500); },
  plant() { tone(880, 0.1, 'sine', 0.4); },
  beep() { tone(1100, 0.12, 'square', 0.3); },
  explosion() { noise(0.8, 1.0, 300); tone(60, 0.7, 'sine', 0.8, 30); },
  buy() { tone(660, 0.08, 'sine', 0.3); setTimeout(() => tone(990, 0.1, 'sine', 0.3), 90); },
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.35), i * 140)); },
  roundLose() { [400, 300, 200].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'sine', 0.3), i * 160)); },
  flash() { tone(2000, 0.3, 'sine', 0.3, 400); },
};
