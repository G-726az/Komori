// Moving with the music: Rust sends the speakers' level (whatever plays —
// music, a video, a game) about 30 times a second while someone listens here;
// this turns it into a smooth level and a "beat" that jumps on each hit and
// fades out. Nothing is asked of Windows while nobody listens.

import { Bridge, IN_APP, on } from "../shared/bridge";
import { settings } from "../shared/settings";

export interface Pulse {
  /** 0–1, the sound right now (smoothed a little). */
  level: number;
  /** 0–1, jumps on a hit and fades; what the timelines dance to. */
  beat: number;
}

const fns = new Set<(p: Pulse) => void>();
let offLevel: (() => void) | null = null;
let demoTimer = 0;

// A hit is a level clearly above the recent average.
let avg = 0;
let beat = 0;
let level = 0;
let lastAt = 0;

function feed(raw: number) {
  const now = performance.now();
  const dt = lastAt ? Math.min(0.2, (now - lastAt) / 1000) : 0.033;
  lastAt = now;
  level += (raw - level) * 0.5;
  avg += (raw - avg) * Math.min(1, dt * 2.2);
  const hit = raw > 0.04 && raw > avg * 1.35;
  beat = hit ? Math.max(beat, Math.min(1, (raw - avg) * 4 + 0.35)) : beat * Math.pow(0.02, dt);
  const p = { level, beat };
  for (const fn of fns) fn(p);
}

/** Whether things should move with the music (Ajustes → Animaciones y 3D). */
export function beatWanted(): boolean {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return settings().perf?.musicBeat !== false && !reduced;
}

/** Listen to the music's pulse; returns a function to stop. */
export function onPulse(fn: (p: Pulse) => void): () => void {
  if (!beatWanted()) return () => {};
  fns.add(fn);
  if (fns.size === 1) start();
  return () => {
    if (!fns.delete(fn)) return;
    if (fns.size === 0) stop();
  };
}

function start() {
  if (IN_APP) {
    void Bridge.meterWatch(true);
    void on<number>("audio-level", (v) => feed(v)).then((off) => {
      // Stopped before the listener was ready.
      if (fns.size === 0) off();
      else offLevel = off;
    });
  } else {
    // In a browser (?demo): a made-up 118 bpm groove.
    const t0 = performance.now();
    demoTimer = window.setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      const phase = (t * 118 / 60) % 1;
      feed(Math.max(0.08, Math.exp(-phase * 7) * 0.9 + Math.random() * 0.08));
    }, 33);
  }
}

function stop() {
  window.clearInterval(demoTimer);
  offLevel?.();
  offLevel = null;
  if (IN_APP) void Bridge.meterWatch(false);
  beat = level = avg = 0;
}
