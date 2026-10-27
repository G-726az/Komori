// The cards the Home page can show. Each card sits at a cell (x, y) of a
// 4-column grid and takes w columns × h rows; empty cells are fine. A screen
// shows 3 rows; more rows scroll.

import { I } from "./icons";

export type WidgetKind =
  | "clock" | "weather" | "next" | "music" | "system"
  | "notes" | "apps" | "github" | "timer" | "modules"
  // Pieces of the tabs, and whole tabs.
  | "cal-month" | "cal-orbit" | "cal-sky" | "cal-agenda"
  | "sys-cpu" | "sys-ram" | "sys-net" | "sys-disk" | "sys-battery" | "sys-all"
  | "tool-watch" | "tool-timer" | "tool-board"
  | "tab-music" | "tab-notes" | "tab-apps" | "tab-chat" | "tab-github"
  | "pet";

export interface Widget {
  id: string;
  kind: WidgetKind;
  /** Columns (1–4) and rows (1–3). */
  w: number;
  h: number;
  /** Cell of the top-left corner (missing in layouts from before free placement). */
  x?: number;
  y?: number;
}

export type Placed = Widget & { x: number; y: number };

export const GRID = { cols: 4, rows: 3 };

const STOPWATCH = "M10 2h4v2h-4V2zm2 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-1 2v4.4l3.3 2 .9-1.5-2.2-1.4V9h-2z";
const CLOCK = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-1 2v5.4l4.3 2.6.9-1.5-3.2-1.9V7h-2z";
const BRANCH = "M7 3a3 3 0 0 0-1 5.83v6.34A3 3 0 1 0 8 15.2V13a2 2 0 0 1 2-2h4a4 4 0 0 0 4-4v-.17a3 3 0 1 0-2 0V7a2 2 0 0 1-2 2h-4c-.73 0-1.41.2-2 .54V8.83A3 3 0 0 0 7 3zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm10 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM7 17a1 1 0 1 1 0 2 1 1 0 0 1 0-2z";

const BRUSH = "M20.7 3.3a1 1 0 0 0-1.4 0L10 12.6 11.4 14l9.3-9.3a1 1 0 0 0 0-1.4zM7 14c-1.7 0-3 1.3-3 3 0 1.3-.8 2-2 2 1 1.3 2.6 2 4 2 2.2 0 4-1.8 4-4 0-1.7-1.3-3-3-3z";
const ORBIT = "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 5c5.5 0 10 3.1 10 7s-4.5 7-10 7S2 15.9 2 12s4.5-7 10-7zm0 2c-4.4 0-8 2.2-8 5s3.6 5 8 5 8-2.2 8-5-3.6-5-8-5z";

type Info = { name: string; icon: string; w: number; h: number; min: [number, number]; group: string };

export const WIDGETS: Record<WidgetKind, Info> = {
  clock: { name: "Reloj", icon: CLOCK, w: 2, h: 2, min: [1, 1], group: "General" },
  weather: { name: "Clima", icon: I.cloud, w: 2, h: 1, min: [1, 1], group: "General" },
  next: { name: "Próximos eventos", icon: I.calendar, w: 2, h: 1, min: [1, 1], group: "General" },
  modules: { name: "Accesos a pestañas", icon: I.grid, w: 2, h: 2, min: [1, 1], group: "General" },
  pet: { name: "Mascota 3D", icon: I.paw, w: 1, h: 2, min: [1, 1], group: "General" },

  "cal-month": { name: "Mes", icon: I.calendar, w: 2, h: 2, min: [2, 2], group: "Calendario y clima" },
  "cal-orbit": { name: "Reloj con pronóstico", icon: ORBIT, w: 2, h: 2, min: [2, 2], group: "Calendario y clima" },
  "cal-sky": { name: "Clima del día", icon: I.cloud, w: 1, h: 2, min: [1, 2], group: "Calendario y clima" },
  "cal-agenda": { name: "Agenda del día", icon: I.calendar, w: 4, h: 1, min: [2, 1], group: "Calendario y clima" },

  music: { name: "Mini reproductor", icon: I.music, w: 2, h: 1, min: [2, 1], group: "Música" },
  "tab-music": { name: "Reproductor completo", icon: I.music, w: 2, h: 2, min: [2, 2], group: "Música" },

  system: { name: "CPU y RAM", icon: I.chip, w: 2, h: 1, min: [1, 1], group: "Sistema" },
  "sys-cpu": { name: "CPU", icon: I.chip, w: 1, h: 2, min: [1, 1], group: "Sistema" },
  "sys-ram": { name: "Memoria", icon: I.chip, w: 1, h: 2, min: [1, 1], group: "Sistema" },
  "sys-net": { name: "Red", icon: I.chip, w: 1, h: 2, min: [1, 1], group: "Sistema" },
  "sys-disk": { name: "Discos", icon: I.chip, w: 2, h: 1, min: [2, 1], group: "Sistema" },
  "sys-battery": { name: "Energía", icon: I.chip, w: 1, h: 1, min: [1, 1], group: "Sistema" },
  "sys-all": { name: "Monitor completo", icon: I.chip, w: 4, h: 2, min: [3, 2], group: "Sistema" },

  apps: { name: "Apps (mini)", icon: I.apps, w: 2, h: 1, min: [1, 1], group: "Apps" },
  "tab-apps": { name: "Todas las apps", icon: I.apps, w: 2, h: 2, min: [2, 1], group: "Apps" },

  notes: { name: "Última nota", icon: I.note, w: 2, h: 1, min: [1, 1], group: "Notas" },
  "tab-notes": { name: "Editor de notas", icon: I.note, w: 2, h: 2, min: [2, 2], group: "Notas" },

  timer: { name: "Temporizador (mini)", icon: STOPWATCH, w: 1, h: 1, min: [1, 1], group: "Herramientas" },
  "tool-watch": { name: "Cronómetro", icon: STOPWATCH, w: 2, h: 2, min: [1, 1], group: "Herramientas" },
  "tool-timer": { name: "Temporizador", icon: STOPWATCH, w: 2, h: 2, min: [2, 2], group: "Herramientas" },
  "tool-board": { name: "Pizarra", icon: BRUSH, w: 2, h: 2, min: [2, 2], group: "Herramientas" },

  "tab-chat": { name: "Chat", icon: I.chat, w: 2, h: 2, min: [2, 2], group: "Chat" },

  github: { name: "Resumen de GitHub", icon: BRANCH, w: 1, h: 1, min: [1, 1], group: "GitHub" },
  "tab-github": { name: "GitHub completo", icon: BRANCH, w: 4, h: 2, min: [2, 2], group: "GitHub" },
};

/** Card groups in the order the palette shows them. */
export const WIDGET_GROUPS = ["General", "Calendario y clima", "Música", "Sistema", "Apps", "Notas", "Herramientas", "Chat", "GitHub"];

/** What Home shows on a fresh install: the pet up front, the forecast clock, memory and CPU, today's agenda and your apps. */
export const DEFAULT_HOME: Widget[] = [
  { id: "w-pet", kind: "pet", w: 1, h: 2, x: 0, y: 0 },
  { id: "w-orbit", kind: "cal-orbit", w: 2, h: 2, x: 1, y: 0 },
  { id: "w-ram", kind: "sys-ram", w: 1, h: 1, x: 3, y: 0 },
  { id: "w-cpu", kind: "sys-cpu", w: 1, h: 1, x: 3, y: 1 },
  { id: "w-agenda", kind: "cal-agenda", w: 3, h: 1, x: 0, y: 2 },
  { id: "w-apps", kind: "apps", w: 1, h: 1, x: 3, y: 2 },
];

export function newWidget(kind: WidgetKind): Widget {
  const k = WIDGETS[kind];
  return { id: `w-${kind}-${Math.random().toString(36).slice(2, 7)}`, kind, w: k.w, h: k.h };
}

const overlap = (a: Placed, b: Placed) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Rows a layout uses. */
export function rowsUsed(list: Placed[]): number {
  return list.reduce((m, w) => Math.max(m, w.y + w.h), 0);
}

/** Every card with a place: older layouts flow in order, filling gaps. */
export function placeAll(list: Widget[]): Placed[] {
  const out: Placed[] = [];
  for (const it of list) {
    const w = { ...it, w: Math.min(it.w, GRID.cols) } as Placed;
    if (typeof it.x === "number" && typeof it.y === "number") {
      w.x = Math.max(0, Math.min(it.x, GRID.cols - w.w));
      w.y = Math.max(0, it.y);
    } else {
      Object.assign(w, freeSpot(out, w.w, w.h));
    }
    out.push(w);
  }
  // Two cards on the same cells (a hand-edited file…): move the later one.
  return settleAll(out);
}

/** The first free place (top to bottom, left to right) for a card this size. */
export function freeSpot(list: Placed[], w: number, h: number): { x: number; y: number } {
  for (let y = 0; ; y++) {
    for (let x = 0; x + w <= GRID.cols; x++) {
      const probe = { x, y, w, h } as Placed;
      if (!list.some((o) => overlap(o, probe))) return { x, y };
    }
  }
}

/** The free place nearest to where a card wanted to be (staying on the first screen if it can). */
function nearestFree(card: Placed, taken: Placed[]): { x: number; y: number } {
  const limit = Math.max(GRID.rows, rowsUsed(taken)) + card.h + 1;
  let best = { x: 0, y: limit, score: Infinity };
  for (let y = 0; y <= limit; y++) {
    for (let x = 0; x + card.w <= GRID.cols; x++) {
      const probe = { ...card, x, y };
      if (taken.some((o) => overlap(o, probe))) continue;
      const score = Math.abs(y - card.y) * 2 + Math.abs(x - card.x) + (y + card.h > GRID.rows ? 12 : 0);
      if (score < best.score) best = { x, y, score };
    }
  }
  return { x: best.x, y: best.y };
}

/** The card `fixedId` keeps its place; any card it now covers moves to the nearest free spot. */
export function settle(list: Placed[], fixedId: string): Placed[] {
  const out = list.map((w) => ({ ...w }));
  const fixed = out.find((w) => w.id === fixedId);
  const taken: Placed[] = fixed ? [fixed] : [];
  const rest = out.filter((w) => w !== fixed).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const w of rest) {
    if (taken.some((o) => overlap(o, w))) Object.assign(w, nearestFree(w, taken));
    taken.push(w);
  }
  return out;
}

function settleAll(list: Placed[]): Placed[] {
  const taken: Placed[] = [];
  for (const w of list) {
    if (taken.some((o) => overlap(o, w))) Object.assign(w, nearestFree(w, taken));
    taken.push(w);
  }
  return list;
}
