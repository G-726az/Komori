// The island: a small pill at the top of the screen that opens into a panel.
//
// The window is always exactly as big as what it shows (plus a margin for the
// shadow): opening grows the window first and then the panel; closing shrinks
// the panel first and then the window. So nothing invisible ever eats a click.

import "./island.css";
import { Bridge, IN_APP, on } from "../shared/bridge";
import { h, icon, clear } from "../shared/dom";
import { I } from "../shared/icons";
import { applyBorder, applyTheme } from "../shared/theme";
import { applyPerf, loadSettings, onSettings, settings, updateSettings, type ModuleId, type Settings } from "../shared/settings";
import { MODULES, buildModule, formatTime, type ModuleView } from "./modules";
import { createPet, wantPet3D } from "./pet";
import { wantGpu } from "../shared/gpu";
import { deg, onWeather, skyIcon, startWeather, weather } from "../shared/weather";
import { media, onMedia, startMedia } from "./media";
import { alertClosed, showNotice, startClaude, type AlertHost, type Notice } from "./claude";
import { githubCount, onGithub, startGithub } from "./github";
import { startReminders } from "./calendar";

/** Window sizes in logical pixels (island + room for its shadow). */
const SIZE = {
  closed: { w: 360, h: 66 },
  open: { w: 800, h: 470 },
  /** A Claude notice on the closed island: this wide, as tall as it needs. */
  alertW: 500,
};
/** Matches the CSS transition on #island. */
const MORPH_MS = 280;

type OpenedBy = "click" | "hover";

/** The closed island is as wide as what it shows (time, weather, song…). */
let pillW = 220;
const closedW = () => pillW + 20;

/** Room for the curved corners of the "glued to the top" shape. */
const NOTCH_EXTRA = 28;

/** Sizes the window for an island of this size (plus the shape's extras). */
function placeWindow(w: number, h: number) {
  const notch = settings().islandShape === "notch";
  return Bridge.placeIsland(w + (notch ? NOTCH_EXTRA : 0), h);
}

/** The window again, for whatever the island shows now (after a shape change). */
function placeAgain() {
  if (island.classList.contains("open")) return placeWindow(SIZE.open.w, SIZE.open.h);
  if (island.classList.contains("alerting")) {
    const h_ = parseFloat(island.style.getPropertyValue("--alert-h")) || 140;
    return placeWindow(SIZE.alertW, h_ + 20);
  }
  return placeWindow(closedW(), SIZE.closed.h);
}

let shape = "";
function applyShape() {
  const next = settings().islandShape ?? "float";
  if (next === shape) return;
  shape = next;
  island.classList.toggle("notch", next === "notch");
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

const tabs = h("nav", { class: "tabs" });
const headTime = h("span", { class: "head-time" });
const gear = h("button", { class: "head-btn", title: "Ajustes", onclick: () => void Bridge.openSettings() }, icon(I.gear, 15));
const closeBtn = h("button", { class: "head-btn", title: "Cerrar", onclick: () => close() }, icon(I.close, 15));
const head = h("header", { class: "head" },
  h("button", { class: "head-pet", title: "¡Hola!", onclick: () => pet.poke() }, pet.clone(30)),
  tabs,
  h("span", { class: "spacer" }),
  headTime,
  gear,
  closeBtn,
);
const body = h("main", { class: "body" });
const panel = h("div", { class: "panel" }, head, body);
const alertBox = h("div", { class: "alert" });
const island = h("div", { id: "island" }, pill, panel, alertBox);
root.append(island);

function drawTabs() {
  clear(tabs);
  for (const id of settings().modules) {
    const m = MODULES[id];
    if (!m) continue;
    const b = h("button", {
      class: id === current ? "tab on" : "tab",
      title: m.label,
      onclick: () => show(id),
    }, icon(m.icon, 16));
    tabs.append(b);
  }
}

function show(id: ModuleId) {
  current = id;
  view = buildModule(id, show, pet);
  clear(body);
  body.append(view.el);
  view.tick?.(new Date());
  drawTabs();
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
  await placeWindow(SIZE.open.w, SIZE.open.h);
  requestAnimationFrame(() => {
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
  island.classList.remove("open");
  window.setTimeout(async () => {
    // The panel is out of sight: let it go, so nothing in it keeps working
    // (the weather ring, a big pet, the stats). It is built again on open.
    if (!island.classList.contains("open")) {
      clear(body);
      view = null;
    }
    await placeWindow(closedW(), SIZE.closed.h);
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
  if (openedBy === "click") close();
});

// ── Claude notices ────────────────────────────────────────────────────────────

let alertTimer: number | undefined;
let alertHovered = false;
alertBox.addEventListener("mouseenter", () => (alertHovered = true));
alertBox.addEventListener("mouseleave", () => (alertHovered = false));

const host: AlertHost = {
  async show(card, sticky) {
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
        await placeWindow(closedW(), SIZE.closed.h);
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

// ── Clock ─────────────────────────────────────────────────────────────────────

function tick() {
  const now = new Date();
  pillTime.textContent = formatTime(now);
  fitPill();
  headTime.textContent = formatTime(now);
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

/** A little equalizer and the song's name while something plays. */
let pillSong = "";
function drawPillMusic() {
  requestAnimationFrame(fitPill);
  const m = media();
  const song = m?.playing && settings().musicInPill ? [m.title, m.artist].filter(Boolean).join(" · ") : "";
  if (song === pillSong) return;
  pillSong = song;
  pillMusic.replaceChildren();
  if (!song) return;
  pillMusic.append(h("span", { class: "eq" }, h("i", {}), h("i", {}), h("i", {})), h("span", { class: "pill-song", text: song }));
  pillMusic.title = song;
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
      w += 13 + 7 + Math.min(song?.scrollWidth ?? 0, 200);
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
    void placeWindow(closedW(), SIZE.closed.h).then(() => mine === fitting && apply());
  } else {
    apply();
    window.setTimeout(() => {
      if (mine === fitting && !island.classList.contains("open") && !island.classList.contains("alerting")) {
        void placeWindow(closedW(), SIZE.closed.h);
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
  // The mouse has been still for a while (or moved again): rest or wake up.
  void on<boolean>("idle-changed", (resting) => pet.setSleeping(resting));
  // Now and then, a little coffee break.
  window.setInterval(() => {
    if (Math.random() < 0.2) pet.coffee();
  }, 60_000);

  tick();
  window.setInterval(tick, 1000);
  await placeWindow(closedW(), SIZE.closed.h);
  await Bridge.islandReady();
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
