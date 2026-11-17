// Sonido sintetizado con Web Audio: sin archivos que descargar.
// Disparo de réplica eléctrica (golpe del pistón + chasquido) e impacto seco en la cal.
let ctx = null;
let noiseBuf = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(at, { type, freq, q = 1, gain, decay }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(at, Math.random() * 0.1);
  src.stop(at + decay + 0.02);
}

function thump(at, { freq, gain, decay }) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(freq * 0.45, at + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  o.connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + decay + 0.02);
}

/** Reproduce una ráfaga. `times` son los segundos de cada disparo desde ahora. */
export function playBurst(times, volume = 0.5) {
  const a = audio();
  if (!a) return;
  const now = a.currentTime + 0.01;
  times.forEach((t) => {
    const at = now + t;
    const v = volume * (0.85 + Math.random() * 0.3);
    // disparo: pistón (golpe grave) + salida de aire (chasquido)
    thump(at, { freq: 150, gain: 0.5 * v, decay: 0.06 });
    noise(at, { type: 'bandpass', freq: 1700, q: 0.9, gain: 0.55 * v, decay: 0.05 });
    // impacto en la pared ~35 ms después: "tac" seco y brillante
    const hit = at + 0.035 + Math.random() * 0.01;
    noise(hit, { type: 'highpass', freq: 2600, q: 0.7, gain: 0.35 * v, decay: 0.022 });
    thump(hit, { freq: 420, gain: 0.12 * v, decay: 0.025 });
  });
}
