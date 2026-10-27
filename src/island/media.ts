// What's playing, for the island: Rust tells us when something changes and we
// count the seconds in between, so the progress bar moves smoothly.

import { Bridge, IN_APP, on, type MediaState } from "../shared/bridge";

export type Media = MediaState & { cover: string | null };

let state: Media | null = null;
/** When `state.position` was true (ms). */
let stamp = 0;
let coverKey = "";
const listeners = new Set<(m: Media | null) => void>();

/** The current track, with the position counted up to now. */
export function media(): Media | null {
  if (!state) return null;
  if (!state.playing) return state;
  const ahead = (Date.now() - stamp) / 1000;
  const position = state.duration > 0 ? Math.min(state.duration, state.position + ahead) : state.position + ahead;
  return { ...state, position };
}

/** Follow changes; returns a function that stops following. */
export function onMedia(fn: (m: Media | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function accept(next: MediaState | null) {
  if (next && next.coverKey !== coverKey) {
    coverKey = next.coverKey;
    const cover = next.coverKey ? await Bridge.mediaCover() : null;
    state = { ...next, cover };
  } else {
    state = next ? { ...next, cover: state?.cover ?? null } : null;
    if (!next) coverKey = "";
  }
  stamp = Date.now();
  for (const fn of listeners) fn(media());
}

export function control(action: "playpause" | "next" | "prev") {
  // Answer at once; Windows confirms a moment later.
  if (action === "playpause" && state) {
    const now = media();
    state = { ...state, playing: !state.playing, position: now?.position ?? state.position };
    stamp = Date.now();
    for (const fn of listeners) fn(media());
  }
  if (demo) return demoAct(action);
  void Bridge.mediaControl(action);
  // If the player ignored us, nothing new arrives: look again to stay honest.
  window.setTimeout(() => void Bridge.mediaNow().then((m) => accept(m ?? null)), 1200);
}

export function seek(seconds: number) {
  if (!state) return;
  state = { ...state, position: seconds };
  stamp = Date.now();
  for (const fn of listeners) fn(media());
  if (!demo) void Bridge.mediaControl("seek", seconds);
}

export function startMedia() {
  if (demo) {
    void accept(DEMO[0]);
    return;
  }
  void Bridge.mediaNow().then((m) => accept(m ?? null));
  void on<MediaState | null>("media-changed", (m) => void accept(m));
}

// ── A pretend player for working on the looks in a browser (?demo) ────────────

const demo = !IN_APP && new URLSearchParams(location.search).has("demo");
let demoIndex = 0;

const DEMO: MediaState[] = [
  { app: "Spotify", title: "Lluvia de octubre", artist: "Los Faroles", album: "Ventanas", playing: true, position: 42, duration: 214, canPrev: true, canNext: true, canSeek: true, coverKey: "" },
  { app: "YouTube", title: "Una canción con un nombre bastante largo para ver cómo se corta", artist: "Alguien", album: "", playing: true, position: 5, duration: 0, canPrev: false, canNext: true, canSeek: false, coverKey: "" },
];

function demoAct(action: string) {
  if (action === "next" || action === "prev") {
    demoIndex = (demoIndex + (action === "next" ? 1 : DEMO.length - 1)) % DEMO.length;
    void accept(DEMO[demoIndex]);
  }
}
