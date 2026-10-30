// Preferences: one object, the front end owns its shape. Rust stores it as JSON
// in %APPDATA%\Komori\settings.json and tells every page when it changes.

import { Bridge, on } from "./bridge";
import { DEFAULT_HOME, type Widget } from "./widgets";
import { tierOf, type GpuMode } from "./gpu";

export type PetId = "bou" | "ghost" | "cat" | "bat" | "neko" | "chick" | "bunny";

/** What a pet wears: an item id per wardrobe slot. */
export interface Outfit {
  head?: string;
  face?: string;
}
/** A place for the weather. */
export interface Place {
  name: string;
  /** Region and country, to tell places apart. */
  detail?: string;
  lat: number;
  lon: number;
}

/** A shortcut on the Apps tab. */
export interface AppItem {
  id: string;
  name: string;
  /** A program, shell:AppsFolder\<id>, a file, a folder or a web address. */
  target: string;
  /** PNG data: URL, fetched once and kept. */
  icon?: string;
}

/** Something on the calendar. */
export interface CalEvent {
  id: string;
  /** YYYY-MM-DD, local. */
  date: string;
  /** HH:MM, or none for all day. */
  time?: string;
  /** HH:MM when it ends (optional). */
  end?: string;
  /** Where (optional). */
  place?: string;
  title: string;
}

export type MeterId = "cpu" | "ram" | "disk" | "net" | "battery";

export type ModuleId = "home" | "claude" | "music" | "calendar" | "system" | "apps" | "notes" | "shelf" | "tools" | "chat" | "github";

/** Every module, in panel order. */
export const ALL_MODULES: ModuleId[] = ["home", "claude", "music", "calendar", "system", "apps", "notes", "shelf", "tools", "chat", "github"];

export type Provider = "anthropic" | "openai" | "ollama";

export const PROVIDER_NAMES: Record<Provider, string> = {
  anthropic: "Claude",
  openai: "OpenAI compatible",
  ollama: "Ollama (local)",
};

export interface Settings {
  theme: string;
  /** #rrggbb */
  accent: string;
  pet: PetId;
  /** Body colour per pet (#rrggbb); missing = the pet's own colour. */
  petColors: Partial<Record<PetId, string>>;
  /** Look per pet, for pets that have several (the neko's hairstyle). */
  petStyles: Partial<Record<PetId, string>>;
  /** Wardrobe, per pet. */
  outfits: Partial<Record<PetId, Outfit>>;
  /** Opening the island by resting the mouse on it, without a click. */
  hoverOpen: boolean;
  /** A coloured border around the island ("" colour = the accent). */
  islandBorder: { on: boolean; color: string; width: number };
  /** "full": the island with tabs and cards; "minimal": slim and black, one page at a time. */
  islandStyle: "full" | "minimal";
  /** How big the island is drawn: picked from the screen, or 100 % / 125 %. */
  islandScale: "auto" | "1" | "1.25";
  /** Song lyrics (LRCLIB): in the music page, and the current line on the closed island. */
  lyrics: { show: boolean; inPill: boolean };
  /** "float": a floating pill; "notch": glued to the top edge with curved corners. */
  islandShape: "float" | "notch";
  /** Minutes of a still mouse before the pet starts its idle animation. */
  idleMinutes: number;
  idleAnimation: boolean;
  /** Which tabs the panel shows, in order. */
  modules: ModuleId[];
  hour12: boolean;
  autostart: boolean;
  weather: {
    place: Place;
    unit: "c" | "f";
    /** Show the temperature on the closed island. */
    inPill: boolean;
  };
  /** Show what's playing on the closed island. */
  musicInPill: boolean;
  /** How the Música tab looks: the cover, the cover with its record, or the record alone; and the progress line. */
  music: { art: "cover" | "sleeve" | "vinyl"; timeline: "clasica" | "latido" | "glitch" | "regla" | "guiones" | "flecha" };
  /** What moves and what is 3D: everything can be turned down to save battery (and the fan). */
  perf: {
    /** Pets as 3D models (off: the drawn 2D pets). */
    pet3d: boolean;
    /** Frames per second for the pet while it only breathes (reactions always run smooth). */
    petFps: 10 | 20 | 30;
    /** The forecast ring sways and turns to the mouse. */
    orbit: boolean;
    /** The record turns while music plays. */
    vinyl: boolean;
    /** Little equalizer on the closed island. */
    eq: boolean;
    /** Moving progress lines (glitch shiver…) and soft idle motions (bobbing hours). */
    flourishes: boolean;
    /** The song's line and the little equalizer move with what is playing (its real sound level). */
    musicBeat: boolean;
    /** How hard to lean on the graphics card ("auto" decides by the card). */
    gpu: GpuMode;
  };
  /** The pet's little sounds, and how loud (0–1). */
  sound: { pet: boolean; volume: number };
  /** The pet (and the forecast ring) turn to look at the mouse. */
  followMouse: boolean;
  /** A short hello from the pet when Komori starts. */
  welcome: boolean;
  /** Which meters the Sistema tab shows. */
  meters: Record<MeterId, boolean>;
  /** 1 = the week starts on Monday, 0 = on Sunday. */
  weekStart: 0 | 1;
  events: CalEvent[];
  apps: AppItem[];
  /** The cards on the Home page, in order. */
  home: Widget[];
  /** The chat: which service, which model, and how it should behave. */
  ai: {
    provider: Provider;
    anthropicModel: string;
    openaiBase: string;
    openaiModel: string;
    ollamaBase: string;
    ollamaModel: string;
    system: string;
  };
  /** What the GitHub tab shows, and a count on the closed island. */
  github: { notifications: boolean; reviews: boolean; mine: boolean; inPill: boolean };
  /** Look for new versions on GitHub at start; a version the user chose to skip. */
  updates: { check: boolean; skip: string };
  /** Modules this install already knew, so new ones appear on their own. */
  knownModules: ModuleId[];
  /** Claude Code notices: which ones show, and a sound. */
  claude: { done: boolean; question: boolean; permission: boolean; working: boolean; sound: boolean };
}

export const DEFAULTS: Settings = {
  theme: "mint",
  accent: "#8fe3c0",
  pet: "bou",
  petColors: {},
  petStyles: {},
  outfits: {},
  hoverOpen: true,
  islandShape: "float",
  // New installs start minimal; "full" is the other choice in Apariencia.
  islandStyle: "minimal",
  lyrics: { show: true, inPill: true },
  islandBorder: { on: false, color: "", width: 2 },
  idleMinutes: 5,
  idleAnimation: true,
  modules: [...ALL_MODULES],
  knownModules: [...ALL_MODULES],
  hour12: false,
  autostart: false,
  weather: {
    place: { name: "Cuenca", detail: "Azuay, Ecuador", lat: -2.9005, lon: -79.0045 },
    unit: "c",
    inPill: true,
  },
  musicInPill: true,
  music: { art: "sleeve", timeline: "clasica" },
  perf: { pet3d: true, petFps: 20, orbit: true, vinyl: true, eq: true, flourishes: true, musicBeat: true, gpu: "auto" },
  islandScale: "auto",
  sound: { pet: true, volume: 0.6 },
  followMouse: true,
  welcome: true,
  meters: { cpu: true, ram: true, disk: true, net: true, battery: true },
  weekStart: 1,
  events: [],
  claude: { done: true, question: true, permission: true, working: true, sound: true },
  ai: {
    provider: "anthropic",
    anthropicModel: "claude-opus-5",
    openaiBase: "https://api.openai.com/v1",
    openaiModel: "",
    ollamaBase: "http://localhost:11434",
    ollamaModel: "",
    system: "Eres el asistente de Komori, una islita en el escritorio. Responde en el idioma de la persona, con calidez y de forma clara y breve.",
  },
  github: { notifications: true, reviews: true, mine: true, inPill: true },
  updates: { check: true, skip: "" },
  home: DEFAULT_HOME,
  apps: [
    { id: "explorer", name: "Explorador", target: "shell:AppsFolder\\Microsoft.Windows.Explorer" },
    { id: "settings", name: "Configuración", target: "shell:AppsFolder\\windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel" },
    { id: "calc", name: "Calculadora", target: "shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App" },
    { id: "notepad", name: "Bloc de notas", target: "shell:AppsFolder\\Microsoft.WindowsNotepad_8wekyb3d8bbwe!App" },
  ],
};

let current: Settings = { ...DEFAULTS };
const listeners = new Set<(s: Settings) => void>();

export function settings(): Settings {
  return current;
}

/** Loads from disk and starts following changes made in other windows. */
/** Modules added in a newer version show up without anyone having to look for them. */
function withNewModules(s: Settings, stored: Record<string, unknown> | null): Settings {
  // Installs from before this list existed knew every module but GitHub.
  const known = (stored?.knownModules as ModuleId[] | undefined) ?? (stored ? ALL_MODULES.filter((m) => m !== "github" && m !== "tools" && m !== "claude") : ALL_MODULES);
  const fresh = ALL_MODULES.filter((m) => !known.includes(m) && !s.modules.includes(m));
  // New ones take their place in the usual order.
  const modules = ALL_MODULES.filter((m) => s.modules.includes(m) || fresh.includes(m));
  return { ...s, modules, knownModules: [...ALL_MODULES] };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await Bridge.getSettings();
  current = withNewModules({ ...DEFAULTS, ...(stored ?? {}) } as Settings, stored);
  void on<Record<string, unknown>>("settings-changed", (s) => {
    current = withNewModules({ ...DEFAULTS, ...s } as Settings, s);
    for (const fn of listeners) fn(current);
  });
  return current;
}

export async function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  await Bridge.saveSettings(current as unknown as Record<string, unknown>);
  // Outside the app there is no round trip: notify here.
  for (const fn of listeners) fn(current);
}

export function onSettings(fn: (s: Settings) => void) {
  listeners.add(fn);
}

/** Put the motion choices on <html> so the CSS can stop what is turned off. */
export function applyPerf(s: Settings) {
  const p = s.perf ?? DEFAULTS.perf;
  const root = document.documentElement;
  root.toggleAttribute("data-no-vinyl", !p.vinyl);
  root.toggleAttribute("data-no-eq", !p.eq);
  root.toggleAttribute("data-no-flourish", !p.flourishes);
  root.dataset.gpu = tierOf(p.gpu ?? "auto");
}
