// The pet's little sounds, made on the spot with WebAudio (no sound files):
// a boop when poked, a chirp when happy, a "hmph", a dizzy wobble, a sip of
// coffee, a yawn and a stretch. Soft and short; off in Ajustes → Mascota.

import { settings } from "../shared/settings";

export type PetSound = "poke" | "happy" | "pout" | "dizzy" | "coffee" | "sleep" | "wake";

let ctx: AudioContext | null = null;
let lastHappy = 0;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One voice: a wave gliding between pitches, with a soft attack and release. */
function voice(ac: AudioContext, out: AudioNode, o: {
  type?: OscillatorType; from: number; to?: number; at?: number; len: number; gain: number; wobble?: number;
}) {
  const t = ac.currentTime + (o.at ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.from, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.len);
  if (o.wobble) {
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = o.wobble;
    depth.gain.value = o.from * 0.08;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + o.len + 0.05);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain, t + Math.min(0.02, o.len / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.len);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.len + 0.05);
}

/** A short breath of filtered noise (a sip). */
function puff(ac: AudioContext, out: AudioNode, at: number, len: number, gain: number, freq: number) {
  const t = ac.currentTime + at;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = freq;
  band.Q.value = 1.4;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + len * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(band).connect(g).connect(out);
  src.start(t);
}

/** `test`: a button in Ajustes asked for it (always heard, even if muted). */
export function petSound(kind: PetSound, test = false) {
  const s = settings().sound;
  if (s && !s.pet && !test) return;
  // Opening the island cheers the pet every time: chirp only now and then.
  if (kind === "happy" && !test) {
    const now = performance.now();
    if (now - lastHappy < 20_000) return;
    lastHappy = now;
  }
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = Math.max(0, Math.min(1, s?.volume ?? 0.6)) * 0.5;
  out.connect(ac.destination);
  switch (kind) {
    case "poke":
      voice(ac, out, { type: "sine", from: 520, to: 900, len: 0.12, gain: 0.5 });
      voice(ac, out, { type: "triangle", from: 1040, to: 1500, len: 0.08, gain: 0.12 });
      break;
    case "happy":
      voice(ac, out, { type: "triangle", from: 880, to: 1050, len: 0.12, gain: 0.32 });
      voice(ac, out, { type: "triangle", from: 1175, to: 1400, at: 0.11, len: 0.16, gain: 0.3 });
      break;
    case "pout":
      voice(ac, out, { type: "sawtooth", from: 300, to: 210, len: 0.26, gain: 0.08 });
      voice(ac, out, { type: "sine", from: 300, to: 210, len: 0.28, gain: 0.35 });
      break;
    case "dizzy":
      voice(ac, out, { type: "sine", from: 760, to: 330, len: 0.7, gain: 0.35, wobble: 11 });
      break;
    case "coffee":
      puff(ac, out, 0, 0.16, 0.5, 1800);
      puff(ac, out, 0.2, 0.14, 0.4, 1500);
      voice(ac, out, { type: "sine", from: 660, to: 520, at: 0.42, len: 0.3, gain: 0.25 });
      break;
    case "sleep":
      voice(ac, out, { type: "sine", from: 620, to: 300, len: 0.6, gain: 0.22, wobble: 4 });
      break;
    case "wake":
      voice(ac, out, { type: "triangle", from: 420, to: 840, len: 0.3, gain: 0.25 });
      break;
  }
  window.setTimeout(() => out.disconnect(), 1500);
}
