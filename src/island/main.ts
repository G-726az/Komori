// The island: a small pill at the top of the screen that opens into a panel.
//
// The window is always exactly as big as what it shows (plus a margin for the
// shadow): opening grows the window first and then the panel; closing shrinks
// the panel first and then the window. So nothing invisible ever eats a click.

import "./island.css";
import { Bridge, IN_APP, on, onDragDrop } from "../shared/bridge";
import { h, icon, clear } from "../shared/dom";
import { I } from "../shared/icons";
import { applyBorder, applyTheme } from "../shared/theme";
import { applyPerf, loadSettings, onSettings, settings, updateSettings, type ModuleId, type Settings } from "../shared/settings";
import { MODULES, formatTime, type ModuleView } from "./modules";
import { createPet, wantPet3D } from "./pet";
import { wantGpu } from "../shared/gpu";
import { deg, onWeather, skyIcon, startWeather, weather } from "../shared/weather";
import { media, onMedia, startMedia } from "./media";
import { alertClosed, showNotice, startClaude, type AlertHost, type Notice } from "./claude";
import { githubCount, onGithub, startGithub } from "./github";
import { startReminders } from "./calendar";
import { albumColor, miniPanel } from "./minimal";
import { lineNow, lyrics, startLyrics } from "./lyrics";
import { shelfBusy, shelfDrag, shelfDrop, shelfPending } from "./shelf";
import { onPulse } from "./beat";

/** Window sizes in logical pixels (island + room for its shadow). */
const SIZE = {
  closed: { w: 360, h: 66 },
  open: { w: 800, h: 520 },
  /** A Claude notice on the closed island: this wide, as tall as it needs. */
  alertW: 500,
};
/** The minimal style: a slimmer pill and one compact size for every tab. */
const isMini = () => settings().islandStyle === "minimal";
/** The slim pill, in both styles (34 px plus room for its shadow). */
const closedH = () => 50;
/** Notas and Chat can open wider and taller (the arrows in their header). */
let expanded = false;
const canExpand = (id: ModuleId) => id === "notes" || id === "chat";
const wide = () => expanded && canExpand(current);
const openSize = () => isMini()
  ? (wide() ? { w: 800, h: 500 } : { w: 680, h: 300 })
  : (wide() ? { w: 980, h: 660 } : SIZE.open);

/** Open: grow into the wide island, or back (the window first when growing). */
let fitMine = 0;
function fitOpen() {
  const want = wide();
  if (want === island.classList.contains("wide")) return;
  const mine = ++fitMine;
  if (want) {
    void placeWindow(openSize().w, openSize().h).then(() => mine === fitMine && island.classList.add("wide"));
  } else {
    island.classList.remove("wide");
    window.setTimeout(() => {
      if (mine === fitMine && island.classList.contains("open")) void placeWindow(openSize().w, openSize().h);
    }, MORPH_MS);
  }
}

/** Matches the CSS transition on #island. */
const MORPH_MS = 280;

type OpenedBy = "click" | "hover";

/** The closed island is as wide as what it shows (time, weather, song…). */
let pillW = 220;
const closedW = () => pillW + 20;

/** Room for the curved corners of the "glued to the top" shape. */
const NOTCH_EXTRA = 28;

/** How big the island is drawn (Apariencia → Tamaño): the page is zoomed by Rust. */
let zoom = 1;
let zoomFor = "";

/** Sizes the window for an island of this size (plus the shape's extras), zoomed. */
function placeWindow(w: number, h: number) {
  const notch = settings().islandShape === "notch";
  return Bridge.placeIsland(Math.ceil((w + (notch ? NOTCH_EXTRA : 0)) * zoom), Math.ceil(h * zoom));
}

/** Apply the chosen size (only when it changed), then fit the window again. */
async function applyZoom() {
  const want = settings().islandScale ?? "auto";
  if (want === zoomFor) return;
  zoomFor = want;
  if (IN_APP) zoom = (await Bridge.islandZoom(want)) ?? 1;
  else {
    // A browser has no window to zoom: scale the page itself (auto = 100 %).
    zoom = want === "auto" ? 1 : Number(want) || 1;
    document.body.style.zoom = String(zoom);
  }
  await placeAgain();
}

/** The window again, for whatever the island shows now (after a shape change). */
function placeAgain() {
  if (island.classList.contains("open")) return placeWindow(openSize().w, openSize().h);
  if (island.classList.contains("alerting")) {
    const h_ = parseFloat(island.style.getPropertyValue("--alert-h")) || 140;
    return placeWindow(SIZE.alertW, h_ + 20);
  }
  return placeWindow(closedW(), closedH());
}

let shape = "";
function applyShape() {
  const next = `${settings().islandShape ?? "float"}|${settings().islandStyle ?? "minimal"}`;
  if (next === shape) return;
  const styleChanged = shape.split("|")[1] !== next.split("|")[1];
  shape = next;
  island.classList.toggle("notch", settings().islandShape === "notch");
  island.classList.toggle("minimal", isMini());
  // Switching style while open: rebuild what the panel shows.
  if (styleChanged && island.classList.contains("open")) show(current);
  pillSong = "";
  drawPillMusic();
  void placeAgain();
}

let openedBy: OpenedBy | null = null;
let current: ModuleId = "home";
let view: ModuleView | null = null;
let hoverTimer: number | null = null;
let leaveTimer: number | null = null;
let busy = false;

const root = document.getElementById("root")!;
const pet = createPet();

// ── DOM ───────────────────────────────────────────────────────────────────────

const pillTime = h("span", { class: "pill-time" });
const pillSky = h("span", { class: "pill-sky" });
const pillMusic = h("span", { class: "pill-music" });
const pillGithub = h("span", { class: "pill-gh", title: "Notificaciones de GitHub" });
const pill = h("button", { class: "pill", "aria-label": "Abrir Komori" },
  h("span", { class: "pill-pet" }, pet.el),
  pillTime,
  pillSky,
  pillMusic,
  pillGithub,
  h("span", { class: "pill-dot" }),
);

const body = h("main", { class: "body" });
const panel = h("div", { class: "panel" }, body);
const alertBox = h("div", { class: "alert" });
const island = h("div", { id: "island" }, pill, panel, alertBox);
root.append(island);

/** The pet's small copy in the header (one, reused). */
let miniFace: HTMLElement | null = null;

function show(id: ModuleId) {
  current = id;
  if (island.classList.contains("open")) fitOpen();
  // Header, the tab and the dock (the minimal style uses its compact pages).
  view = miniPanel(id, show, pet, (miniFace ??= pet.clone(26)), {
    compact: isMini(),
    close,
    expand: canExpand(id) ? { on: expanded, toggle: () => { expanded = !expanded; show(current); } } : undefined,
  });
  clear(body);
  body.append(view.el);
  view.tick?.(new Date());
}

// ── Open / close ──────────────────────────────────────────────────────────────

async function open(by: OpenedBy) {
  if (island.classList.contains("open") || busy) return;
  // Opening the panel takes over from a notice on the closed island.
  if (island.classList.contains("alerting")) {
    island.classList.remove("alerting");
    alertBox.replaceChildren();
    alertClosed();
  }
  busy = true;
  openedBy = by;
  await placeWindow(openSize().w, openSize().h);
  requestAnimationFrame(() => {
    island.classList.toggle("wide", wide());
    island.classList.add("open");
    show(current);
    pet.happy();
    busy = false;
  });
}

function close() {
  if (!island.classList.contains("open") || busy) return;
  busy = true;
  openedBy = null;
  fitMine++;
  island.classList.remove("open", "wide");
  window.setTimeout(async () => {
    // The panel is out of sight: let it go, so nothing in it keeps working
    // (the weather ring, a big pet, the stats). It is built again on open.
    if (!island.classList.contains("open")) {
      clear(body);
      view = null;
    }
    await placeWindow(closedW(), closedH());
    busy = false;
  }, MORPH_MS);
}

function cancel(timer: number | null) {
  if (timer != null) window.clearTimeout(timer);
}

pill.addEventListener("click", () => {
  cancel(hoverTimer);
  void open("click");
});

// Resting the mouse on the pill opens it, if the user wants that (item 12).
pill.addEventListener("mouseenter", () => {
  pet.setCurious(true);
  if (!settings().hoverOpen) return;
  cancel(hoverTimer);
  hoverTimer = window.setTimeout(() => void open("hover"), 280);
});
pill.addEventListener("mouseleave", () => {
  pet.setCurious(false);
  cancel(hoverTimer);
});

// Opened by hover: leaving it closes it again, with a little grace time.
island.addEventListener("mouseleave", () => {
  if (openedBy !== "hover") return;
  cancel(leaveTimer);
  leaveTimer = window.setTimeout(close, 650);
});
island.addEventListener("mouseenter", () => cancel(leaveTimer));
// Any click inside makes it stay, like a click-open.
panel.addEventListener("mousedown", () => {
  openedBy = "click";
  cancel(leaveTimer);
});

// Modules can ask the pet for a mood (the chat: thinking, answered).
window.addEventListener("komori-pet", (e) => {
  const mood = (e as CustomEvent<string>).detail;
  pet.setCurious(mood === "curious");
  if (mood === "happy") pet.happy();
});

// A module is done (e.g. an app was opened): fold away.
window.addEventListener("komori-close", () => close());

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close();
});
// Opened by click: clicking anywhere else closes it.
window.addEventListener("blur", () => {
  // Not while a file is on its way (a pending question waits for the next open).
  if (openedBy === "click" && !shelfBusy()) close();
});

// ── Claude notices ────────────────────────────────────────────────────────────

let alertTimer: number | undefined;
let alertHovered = false;
alertBox.addEventListener("mouseenter", () => (alertHovered = true));
alertBox.addEventListener("mouseleave", () => (alertHovered = false));

const host: AlertHost = {
  async show(card, sticky) {
    // The Claude Code tab already shows it: no card on top of it.
    if (!sticky && current === "claude" && island.classList.contains("open") && card.dataset.claude === "done") return;
    window.clearTimeout(alertTimer);
    alertBox.replaceChildren(card);
    if (!island.classList.contains("open")) {
      // Grow the window to fit the card, then morph the island into it.
      const h_ = Math.ceil(card.getBoundingClientRect().height);
      island.style.setProperty("--alert-h", `${h_}px`);
      await placeWindow(SIZE.alertW, h_ + 20);
      island.classList.add("alerting");
    }
    const ttl = () => {
      alertTimer = window.setTimeout(() => (alertHovered ? ttl() : host.hide()), 15000);
    };
    if (!sticky) ttl();
  },
  hide() {
    window.clearTimeout(alertTimer);
    alertClosed();
    if (!island.classList.contains("alerting")) {
      alertBox.replaceChildren();
      return;
    }
    island.classList.remove("alerting");
    window.setTimeout(async () => {
      alertBox.replaceChildren();
      if (!island.classList.contains("open") && !island.classList.contains("alerting")) {
        await placeWindow(closedW(), closedH());
      }
    }, MORPH_MS);
  },
  busy(on) {
    pill.classList.toggle("claude-busy", on);
  },
  react(kind) {
    if (kind === "done") pet.happy();
    else pet.poke();
  },
};

// ── Hello ─────────────────────────────────────────────────────────────────────

/** When Komori starts: the island opens into a little card and the pet says hi. */
function welcome() {
  if (island.classList.contains("open") || island.classList.contains("alerting")) return;
  const now = new Date();
  const hour = now.getHours();
  const hello = hour < 5 ? "¡Qué desvelo!" : hour < 12 ? "¡Buenos días!" : hour < 19 ? "¡Buenas tardes!" : "¡Buenas noches!";
  const w = weather();
  const date = now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  const card = h("div", { class: "welcome-card" },
    h("span", { class: "welcome-pet" }, pet.clone(64)),
    h("div", { class: "welcome-text" },
      h("b", { text: hello }),
      h("span", { text: w ? `${date} · ${deg(w.temp)}` : date }),
      h("span", { class: "welcome-small", text: "Komori está listo" }),
    ),
  );
  void host.show(card, true);
  pet.happy();
  window.setTimeout(() => {
    if (alertBox.contains(card)) host.hide();
  }, 3400);
}

// ── Clock ─────────────────────────────────────────────────────────────────────

function tick() {
  const now = new Date();
  pillTime.textContent = formatTime(now);
  fitPill();
  if (island.classList.contains("open")) view?.tick?.(now);
}

/** The temperature on the closed island, if wanted. */
function drawPillSky() {
  requestAnimationFrame(fitPill);
  const w = weather();
  pillSky.replaceChildren();
  if (!w || !settings().weather.inPill) return;
  pillSky.append(skyIcon(w.code, w.day, 18), h("span", { text: deg(w.temp) }));
}

/** A little equalizer and the song's name while something plays — or the line being sung. */
let pillSong = "";
function drawPillMusic() {
  const m = media();
  const song = m?.playing && settings().musicInPill ? [m.title, m.artist].filter(Boolean).join(" · ") : "";
  const line = song && settings().lyrics?.inPill !== false ? lineNow() : "";
  const key = line ? `♪${line}` : song;
  if (key === pillSong) return;
  pillSong = key;
  requestAnimationFrame(fitPill);
  pillMusic.replaceChildren();
  followSound(null);
  tintPill(line && m?.cover ? m.cover : "");
  if (!song) return;
  pillMusic.title = song;
  if (line) {
    pillMusic.append(h("span", { class: "pill-lyric" }, icon(I.music, 13), h("span", { text: line })));
    return;
  }
  const eq = h("span", { class: "eq" }, h("i", {}), h("i", {}), h("i", {}));
  pillMusic.append(eq, h("span", { class: "pill-song", text: song }));
  followSound(eq);
}

/** While a sung line shows, the minimal pill takes the colours of the cover. */
let tintFor = "";
function tintPill(cover: string) {
  if (cover === tintFor) return;
  tintFor = cover;
  if (!cover) return island.classList.remove("lyric-tint");
  void albumColor(cover).then((c) => {
    if (tintFor !== cover) return;
    island.style.setProperty("--album", c);
    island.classList.add("lyric-tint");
  });
}

/** The equalizer follows the real sound level (if wanted), each bar a little differently. */
let offEq: (() => void) | null = null;
function followSound(eq: HTMLElement | null) {
  offEq?.();
  offEq = null;
  if (!eq || settings().perf?.eq === false) return;
  const bars = [...eq.children] as HTMLElement[];
  const mix = [0.85, 1.15, 0.7];
  offEq = onPulse((p) => {
    if (!eq.isConnected) {
      offEq?.();
      offEq = null;
      return;
    }
    if (island.classList.contains("open")) return;
    eq.classList.add("live");
    bars.forEach((b, i) => {
      const v = Math.max(0.18, Math.min(1, p.level * mix[i] * 1.6 + p.beat * 0.35 * (i === 1 ? 1 : 0.6)));
      b.style.transform = `scaleY(${v.toFixed(3)})`;
    });
  });
}

/** Unread GitHub notifications on the closed island. */
function drawPillGithub() {
  requestAnimationFrame(fitPill);
  const n = settings().github.inPill ? githubCount() : 0;
  pillGithub.textContent = n ? String(n > 99 ? "99+" : n) : "";
}

/** Measure what the closed island shows and fit its width to it. */
let fitting = 0;
function fitPill() {
  const parts = [...pill.children].filter((el) => getComputedStyle(el).display !== "none") as HTMLElement[];
  let w = 10 + 16 + 10 * Math.max(0, parts.length - 1);
  for (const el of parts) {
    if (el === pillMusic) {
      // The song's whole name (up to a limit), not the room it has right now.
      const song = el.querySelector<HTMLElement>(".pill-song");
      const lyric = el.querySelector<HTMLElement>(".pill-lyric");
      w += lyric ? Math.min(lyric.scrollWidth, 360) + 4 : 13 + 7 + Math.min(song?.scrollWidth ?? 0, 200);
    } else {
      w += el.offsetWidth;
    }
  }
  const next = Math.max(150, Math.min(560, Math.ceil(w)));
  if (Math.abs(next - pillW) < 2) return;
  const growing = next > pillW;
  pillW = next;
  const apply = () => island.style.setProperty("--pill-w", `${pillW}px`);
  // Open or showing a notice: only remember it for later.
  if (island.classList.contains("open") || island.classList.contains("alerting")) return apply();
  const mine = ++fitting;
  if (growing) {
    // Make room first, then let the island stretch into it.
    void placeWindow(closedW(), closedH()).then(() => mine === fitting && apply());
  } else {
    apply();
    window.setTimeout(() => {
      if (mine === fitting && !island.classList.contains("open") && !island.classList.contains("alerting")) {
        void placeWindow(closedW(), closedH());
      }
    }, MORPH_MS);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

/** Tell about a new version on GitHub, once per start, unless it was skipped. */
async function lookForUpdate() {
  const u = settings().updates;
  if (!IN_APP || u?.check === false) return;
  try {
    const r = await Bridge.updateCheck();
    if (!r.available || r.latest === u?.skip) return;
    showNotice({
      title: `Komori ${r.latest} disponible`,
      message: "Mira las novedades y, si quieres, instálala desde Ajustes.",
      sticky: true,
      action: { label: "Ver novedades", run: () => void Bridge.openSettings("about") },
    }, host);
  } catch {
    // No releases yet or no connection: try again next start.
  }
}

async function main() {
  const s = await loadSettings();
  // The pet was built before Settings loaded; if 3D or the card tier changed, start over.
  const pets = wantPet3D(s.perf?.pet3d ?? true);
  const tier = wantGpu(s.perf?.gpu ?? "auto");
  if (pets || tier) return location.reload();
  applyTheme(s.theme, s.accent);
  applyBorder(s.islandBorder, s.accent);
  applyPerf(s);
  applyShape();
  await applyZoom();
  pet.setKind(s.pet, s.petColors?.[s.pet], s.petStyles?.[s.pet]);
  pet.setOutfit(s.outfits?.[s.pet]);
  current = s.modules[0] ?? "home";
  onSettings((next: Settings) => {
    const pets = wantPet3D(next.perf?.pet3d ?? true);
    const tier = wantGpu(next.perf?.gpu ?? "auto");
    if (pets || tier) return location.reload();
    applyTheme(next.theme, next.accent);
    applyBorder(next.islandBorder, next.accent);
    applyPerf(next);
    applyShape();
    void applyZoom();
    pet.setKind(next.pet, next.petColors?.[next.pet], next.petStyles?.[next.pet]);
    pet.setOutfit(next.outfits?.[next.pet]);
    drawPillSky();
    drawPillMusic();
    drawPillGithub();
    if (!next.modules.includes(current)) current = next.modules[0] ?? "home";
    if (island.classList.contains("open")) show(current);
  });
  onWeather(drawPillSky);
  onMedia(drawPillMusic);
  startMedia();
  startLyrics();
  // The sung line on the closed island follows the song closely (only while there are synced lyrics).
  window.setInterval(() => {
    if (lyrics()?.synced && media()?.playing && !island.classList.contains("open")) drawPillMusic();
  }, 300);
  startClaude(host);
  // Komori's own notices (timer finished, an event about to start…).
  window.addEventListener("komori-notice", (e) => showNotice((e as CustomEvent<Notice>).detail, host));
  startReminders();
  onGithub(drawPillGithub);
  startGithub();
  startWeather();
  drawPillSky();
  // A while after start, a quiet look for a new version (never installs anything).
  window.setTimeout(() => void lookForUpdate(), 15_000);
  void on("open-island", () => void open("click"));
  // Files dragged onto the island: open on the shelf and ask what to do with them.
  let openedForDrop = false;
  let dragGone: number | undefined;
  void onDragDrop((e) => {
    if (e.type === "enter") {
      // Back in (the island growing under the cursor can look like leaving).
      window.clearTimeout(dragGone);
      shelfDrag(true);
      if (!island.classList.contains("open")) {
        openedForDrop = true;
        current = "shelf";
        void open("click");
      } else if (current !== "shelf") show("shelf");
    } else if (e.type === "drop") {
      window.clearTimeout(dragGone);
      openedForDrop = false;
      shelfDrop(e.paths);
      if (current !== "shelf") show("shelf");
    } else if (e.type === "leave") {
      window.clearTimeout(dragGone);
      dragGone = window.setTimeout(() => {
        shelfDrag(false);
        // Only passing by: fold away again.
        if (openedForDrop && !shelfPending()) {
          openedForDrop = false;
          close();
        }
      }, 700);
    }
  });
  // The mouse has been still for a while (or moved again): rest or wake up.
  void on<boolean>("idle-changed", (resting) => pet.setSleeping(resting));
  // Now and then, a little coffee break.
  window.setInterval(() => {
    if (Math.random() < 0.2) pet.coffee();
  }, 60_000);

  tick();
  window.setInterval(tick, 1000);
  await placeWindow(closedW(), closedH());
  await Bridge.islandReady();
  // A hello once it is on screen (in a browser only with ?welcome).
  const greet = IN_APP ? settings().welcome !== false : new URLSearchParams(location.search).has("welcome");
  if (greet) window.setTimeout(welcome, 900);
  if (!IN_APP) {
    document.body.classList.add("browser");
    await browserShot();
  }
}

/**
 * Only in a plain browser (development, screenshots): `?set={json}` applies
 * settings and `?open=<tab>` opens the island on that tab.
 */
async function browserShot() {
  const q = new URLSearchParams(location.search);
  // ?bare: no desk behind the island (transparent captures for the promo video).
  if (q.has("bare")) document.body.style.background = "transparent";
  try {
    const patch = q.get("set");
    if (patch) await updateSettings(JSON.parse(patch));
  } catch {
    // Not valid JSON: ignore it.
  }
  const tab = q.get("open") as ModuleId | null;
  if (tab && MODULES[tab]) {
    current = tab;
    await open("click");
  }
}

void main();
