// Song lyrics for what's playing: asked once per song (Rust → LRCLIB), kept in
// a small cache, parsed from LRC, and read line by line against the position.

import { Bridge, IN_APP, type LyricsResult } from "../shared/bridge";
import { settings } from "../shared/settings";
import { media, onMedia, type Media } from "./media";

export interface Line {
  /** Seconds into the song. */
  t: number;
  text: string;
}

export interface SongLyrics {
  key: string;
  /** Timed lines, when the source has them. */
  synced: Line[] | null;
  /** Plain lines (untimed), when that's all there is. */
  plain: string[] | null;
  instrumental: boolean;
}

const CACHE_KEY = "komori-lyrics";
const CACHE_MAX = 120;

type Stored = { k: string; s: string | null; p: string | null; i: boolean };

function readCache(): Stored[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]") as Stored[];
  } catch {
    return [];
  }
}

function writeCache(list: Stored[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(-CACHE_MAX)));
  } catch {
    // Full or blocked: the next start asks again.
  }
}

/** "[01:02.34] words" → {t: 62.34, text: "words"}; a line may carry several stamps. */
export function parseLrc(lrc: string): Line[] {
  const out: Line[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

const songKey = (m: Media) => `${m.artist}|${m.title}`.toLowerCase();

let current: SongLyrics | null = null;
let asking = "";
const listeners = new Set<(l: SongLyrics | null) => void>();

/** The lyrics of what's playing now (null while unknown or none). */
export function lyrics(): SongLyrics | null {
  return current;
}

export function onLyrics(fn: (l: SongLyrics | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function publish(l: SongLyrics | null) {
  current = l;
  for (const fn of listeners) fn(l);
}

function fromStored(s: Stored): SongLyrics {
  return {
    key: s.k,
    synced: s.s ? parseLrc(s.s) : null,
    plain: s.p ? s.p.split(/\r?\n/).filter((x) => x.trim()) : null,
    instrumental: s.i,
  };
}

async function fetchFor(m: Media) {
  const key = songKey(m);
  if (key === asking || current?.key === key) return;
  asking = key;
  publish(null);
  const cached = readCache().find((x) => x.k === key);
  if (cached) {
    asking = "";
    publish(fromStored(cached));
    return;
  }
  const res = IN_APP ? await Bridge.lyricsGet(m.artist, m.title, m.album, m.duration) : await demoLyrics(m);
  if (asking !== key) return; // The song changed meanwhile.
  asking = "";
  const stored: Stored = { k: key, s: res?.synced ?? null, p: res?.plain ?? null, i: res?.instrumental ?? false };
  // Remember misses too, so a song without lyrics isn't asked for again and again.
  writeCache([...readCache().filter((x) => x.k !== key), stored]);
  publish(res ? fromStored(stored) : null);
}

/** Which synced line is playing at `position` (-1 before the first one). */
export function lineIndex(l: SongLyrics | null, position: number): number {
  const lines = l?.synced;
  if (!lines?.length) return -1;
  // Lines light up a hair early, like a karaoke screen.
  const t = position + 0.25;
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The line singing now, or "" (instrumental gaps, no synced lyrics). */
export function lineNow(): string {
  const m = media();
  if (!m?.playing) return "";
  const i = lineIndex(current, m.position);
  return i >= 0 ? current!.synced![i].text : "";
}

/** Start following the music: fetch lyrics whenever the song changes. */
export function startLyrics() {
  const follow = (m: Media | null) => {
    const on = settings().lyrics?.show !== false || settings().lyrics?.inPill !== false;
    if (!m || !m.title || !on) {
      if (current) publish(null);
      return;
    }
    void fetchFor(m);
  };
  onMedia(follow);
  // Something may already be playing before we started listening.
  follow(media());
}

// ── A browser-only stand-in for the demo song (?demo), written for Komori ────

function demoLyrics(m: Media): Promise<LyricsResult | null> {
  if (!/lluvia de octubre/i.test(m.title)) return Promise.resolve(null);
  const lrc = [
    "[00:36.00] Cae la lluvia de octubre en la ventana",
    "[00:40.50] y el café se enfría sin prisa",
    "[00:45.00] cuento gotas como quien cuenta horas",
    "[00:49.50] mientras la ciudad se borra en gris",
    "[00:54.00] ",
    "[00:56.00] Quédate un rato más",
    "[01:00.00] que la tarde todavía no se va",
    "[01:04.50] quédate un rato más",
    "[01:08.50] la lluvia también sabe esperar",
  ].join("\n");
  return Promise.resolve({ synced: lrc, plain: null, instrumental: false });
}
