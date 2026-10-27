// The Home page: the cards chosen in Ajustes → Inicio, on a 4 × 3 grid. Each
// card draws itself for the room it got (a 1 × 1 card shows less than a 2 × 2).

import { Bridge, IN_APP, type NoteInfo, type Stats } from "../shared/bridge";
import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { settings, type ModuleId } from "../shared/settings";
import { deg, describe, onWeather, skyIcon, weather } from "../shared/weather";
import { GRID, WIDGETS, placeAll, type Widget } from "../shared/widgets";
import { appFace } from "./apps";
import { formatHm, fromYmd, sortedEvents, ymd } from "./calendar";
import { githubCount, githubData, onGithub } from "./github";
import { control, media, onMedia } from "./media";
import { PAUSE, PLAY } from "./music";
import { timerInfo, toggleTimer, toolsModule } from "./tools";
import { calendarPart } from "./calendar";
import { statsNow, systemModule } from "./system";
import { musicModule } from "./music";
import { notesModule } from "./notes";
import { appsModule } from "./apps";
import { chatModule } from "./chat";
import { githubModule } from "./github";
import type { WidgetKind } from "../shared/widgets";
import type { MeterId } from "../shared/settings";
import { pet3dStored, type Pet } from "./pet";
import { webglOk } from "./pet3d/engine";

type Card = { el: HTMLElement; tick?: (now: Date) => void };
type Ctx = { go: (id: ModuleId) => void; modules: Record<ModuleId, { label: string; icon: string; phase: number }>; pet?: Pet };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function box(w: Widget, ...children: (Node | null)[]): HTMLElement {
  const span = Math.min(w.w, GRID.cols);
  // Each card at its own cell; empty cells stay empty.
  const col = w.x !== undefined ? `${w.x + 1} / span ${span}` : `span ${span}`;
  const row = w.y !== undefined ? `${w.y + 1} / span ${w.h}` : `span ${w.h}`;
  return h("div", { class: `hw hw-${w.kind} w${w.w} h${w.h}`, style: { gridColumn: col, gridRow: row } }, ...children);
}

function clock(w: Widget): Card {
  const time = h("div", { class: "hw-time" });
  const date = h("div", { class: "hw-date" });
  return {
    el: box(w, time, date),
    tick(now) {
      time.textContent = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", second: w.w > 1 ? "2-digit" : undefined, hour12: settings().hour12 }).format(now);
      date.textContent = cap(new Intl.DateTimeFormat("es", w.w > 1 ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric" }).format(now));
    },
  };
}

function weatherCard(w: Widget, ctx: Ctx): Card {
  const el = box(w);
  el.addEventListener("click", () => ctx.go("calendar"));
  const draw = () => {
    const wx = weather();
    el.replaceChildren();
    if (!wx) {
      el.append(h("span", { class: "hw-dim", text: "Buscando el clima…" }));
      return;
    }
    el.append(h("div", { class: "hw-row" },
      skyIcon(wx.code, wx.day, w.h > 1 || w.w > 1 ? 40 : 28),
      h("div", {},
        h("b", { class: "hw-big", text: deg(wx.temp) }),
        h("span", { class: "hw-dim", text: describe(wx.code).text }),
      ),
    ));
    if (w.w > 1) el.append(h("span", { class: "hw-dim", text: `${settings().weather.place.name} · máx ${deg(wx.days[0]?.max ?? wx.temp)} · mín ${deg(wx.days[0]?.min ?? wx.temp)}` }));
    if (w.h > 1 || w.w > 2) {
      const d = new Date();
      // Forecast times are local "YYYY-MM-DDTHH:00".
      const from = `${ymd(d)}T${String(d.getHours()).padStart(2, "0")}`;
      const next = (wx.hours ?? []).filter((x) => x.time > from).filter((_, i) => i % 3 === 0).slice(0, w.w * 2);
      el.append(h("div", { class: "hw-hours" }, ...next.map((x) =>
        h("div", {}, h("span", { text: x.time.slice(11, 16) }), skyIcon(x.code, x.day, 18), h("b", { text: deg(x.temp) })))));
    }
  };
  draw();
  const off = onWeather(() => (el.isConnected ? draw() : off()));
  return { el };
}

function nextCard(w: Widget, ctx: Ctx): Card {
  const el = box(w);
  el.addEventListener("click", () => ctx.go("calendar"));
  const draw = (now: Date) => {
    const today = ymd(now);
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const list = sortedEvents(settings().events).filter((e) => e.date > today || (e.date === today && (!e.time || (e.end ?? e.time) >= hm)));
    el.replaceChildren(h("span", { class: "hw-title" }, icon(I.calendar, 12), "Próximos"));
    if (!list.length) el.append(h("span", { class: "hw-dim", text: "Nada en el calendario." }));
    for (const e of list.slice(0, w.h * 2)) {
      const day = e.date === today ? "Hoy" : cap(new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric" }).format(fromYmd(e.date)));
      el.append(h("div", { class: "hw-event" },
        h("b", { text: e.title }),
        h("span", { text: `${day}${e.time ? ` · ${formatHm(e.time)}` : ""}${e.place && w.w > 1 ? ` · ${e.place}` : ""}` })));
    }
  };
  draw(new Date());
  return { el, tick: (now) => now.getSeconds() === 0 && draw(now) };
}

function musicCard(w: Widget, ctx: Ctx): Card {
  const el = box(w);
  let key = "";
  const draw = () => {
    const m = media();
    const k = m ? `${m.title}|${m.artist}|${m.playing}|${m.cover?.length ?? 0}` : "";
    if (k === key && el.childElementCount) return;
    key = k;
    el.replaceChildren();
    if (!m) {
      el.append(h("span", { class: "hw-title" }, icon(I.music, 12), "Música"), h("span", { class: "hw-dim", text: "No suena nada." }));
      return;
    }
    const cover = m.cover ? h("img", { class: "hw-cover", src: m.cover, alt: "" }) : h("span", { class: "hw-cover none" }, icon(I.music, 20));
    cover.addEventListener("click", () => ctx.go("music"));
    el.append(h("div", { class: "hw-row" }, cover,
      h("div", { class: "hw-song" }, h("b", { text: m.title || "Sin título" }), h("span", { text: m.artist || m.app })),
      h("button", { class: "hw-play", title: m.playing ? "Pausa" : "Reproducir", onclick: (e: Event) => {
        e.stopPropagation();
        control("playpause");
      } }, icon(m.playing ? PAUSE : PLAY, 16)),
    ));
  };
  draw();
  const off = onMedia(() => (el.isConnected ? draw() : off()));
  return { el };
}

function systemCard(w: Widget, ctx: Ctx): Card {
  const cpu = h("i", {});
  const ram = h("i", {});
  const cpuT = h("b", {});
  const ramT = h("b", {});
  const el = box(w,
    h("span", { class: "hw-title" }, icon(I.chip, 12), "Sistema"),
    h("div", { class: "hw-meter" }, h("span", { text: "CPU" }), h("div", { class: "hw-bar" }, cpu), cpuT),
    h("div", { class: "hw-meter" }, h("span", { text: "RAM" }), h("div", { class: "hw-bar" }, ram), ramT),
  );
  el.addEventListener("click", () => ctx.go("system"));
  const show = (s: Stats) => {
    const r = s.memTotal ? (s.memUsed / s.memTotal) * 100 : 0;
    cpu.style.width = `${s.cpu}%`;
    ram.style.width = `${r}%`;
    cpuT.textContent = `${Math.round(s.cpu)}%`;
    ramT.textContent = `${Math.round(r)}%`;
  };
  let asking = false;
  return {
    el,
    tick: async () => {
      if (asking || !IN_APP) return;
      asking = true;
      const s = await statsNow();
      asking = false;
      if (s) show(s);
    },
  };
}

function notesCard(w: Widget, ctx: Ctx): Card {
  const el = box(w, h("span", { class: "hw-title" }, icon(I.note, 12), "Última nota"));
  el.addEventListener("click", () => ctx.go("notes"));
  void (IN_APP ? Bridge.notesList() : Promise.resolve([] as NoteInfo[])).then((list) => {
    const n = list?.[0];
    if (!n) return el.append(h("span", { class: "hw-dim", text: "Sin notas todavía." }));
    el.append(h("b", { class: "hw-note-t", text: n.name }), h("p", { class: "hw-note-p", text: n.preview || "Vacía" }));
  });
  return { el };
}

function appsCard(w: Widget): Card {
  const el = box(w);
  const per = w.w * (w.h > 1 ? 3 : 2) * w.h;
  const grid = h("div", { class: "hw-apps" });
  for (const app of settings().apps.slice(0, per)) {
    grid.append(h("button", { class: "hw-app", title: app.name, onclick: async () => {
      await Bridge.launch(app.target);
      window.dispatchEvent(new Event("komori-close"));
    } }, appFace(app, 30), w.h > 1 ? h("span", { text: app.name }) : null));
  }
  if (!settings().apps.length) grid.append(h("span", { class: "hw-dim", text: "Sin accesos." }));
  el.append(grid);
  return { el };
}

function githubCard(w: Widget, ctx: Ctx): Card {
  const el = box(w);
  el.addEventListener("click", () => ctx.go("github"));
  const draw = () => {
    const d = githubData();
    el.replaceChildren(h("span", { class: "hw-title" }, icon(WIDGETS.github.icon, 12), "GitHub"));
    if (!d) return el.append(h("span", { class: "hw-dim", text: "Sin conectar." }));
    el.append(h("div", { class: "hw-counts" },
      h("div", {}, h("b", { text: String(githubCount()) }), h("span", { text: "avisos" })),
      w.w > 1 ? h("div", {}, h("b", { text: String(d.reviews.length) }), h("span", { text: "revisiones" })) : null,
      w.w > 1 ? h("div", {}, h("b", { text: String(d.mine.length) }), h("span", { text: "tus PRs" })) : null,
    ));
  };
  draw();
  onGithub(() => el.isConnected && draw());
  return { el };
}

function timerCard(w: Widget, ctx: Ctx): Card {
  const left = h("b", { class: "hw-big" });
  const btn = h("button", { class: "hw-play" });
  const el = box(w, h("span", { class: "hw-title" }, icon(WIDGETS.timer.icon, 12), "Temporizador"), h("div", { class: "hw-row" }, left, btn));
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleTimer();
    show();
  });
  el.addEventListener("click", () => ctx.go("tools"));
  const show = () => {
    const t = timerInfo();
    left.textContent = t.text;
    btn.replaceChildren(icon(t.running ? PAUSE : PLAY, 16));
  };
  show();
  return { el, tick: show };
}

function modulesCard(w: Widget, ctx: Ctx): Card {
  const el = box(w);
  const grid = h("div", { class: "hw-tiles" });
  for (const id of settings().modules) {
    if (id === "home") continue;
    const m = ctx.modules[id];
    if (!m) continue;
    grid.append(h("button", { class: "hw-tile", onclick: () => ctx.go(id) }, icon(m.icon, 16), w.w > 1 ? h("span", { text: m.label }) : null));
  }
  el.append(grid);
  return { el };
}

/** Card size in px for a w × h card on the island's Home page (about). */
const CELL = { w: 180, h: 116, gap: 10 };

/** The pet, big, turning in 3D to look at the mouse — wherever it is on screen. */
function petCard(w: Widget, ctx: Ctx): Card | null {
  const pet = ctx.pet;
  if (!pet) return null;
  const cardW = w.w * CELL.w + (w.w - 1) * CELL.gap;
  const cardH = w.h * CELL.h + (w.h - 1) * CELL.gap;
  // The canvas is 1.3 × as tall as wide (room for hats).
  const size = Math.round(Math.min(cardW * 0.78, ((cardH - 20) / 1.3) * 0.95));
  const canvas = pet.clone(size);
  const tilt = h("div", { class: "hw-pet-tilt" }, canvas);
  // The 3D pet casts its own shadow on its floor.
  const shadow = h("i", { class: "hw-pet-shadow", style: { width: `${size * 0.6}px`, display: webglOk() ? "none" : "" } });
  const el = box(w, h("div", { class: "hw-pet-stage" }, tilt, shadow));
  el.title = "Tócala";
  el.addEventListener("click", () => pet.poke());

  // In a plain browser only the page's own mouse is known.
  let mouse: [number, number] | null = null;
  if (!IN_APP) window.addEventListener("mousemove", (e) => (mouse = [e.clientX, e.clientY]));
  const cur = { x: 0, y: 0 };
  let asking = false;
  let lastAsk = 0;
  let lastStep = 0;
  let calmSince = 0;
  const flat = !(webglOk() && pet3dStored());
  const loop = async (t: number) => {
    if (!el.isConnected) {
      if (el.dataset.seen) {
        pet.setLook(0, 0);
        return;
      }
      requestAnimationFrame(loop);
      return;
    }
    el.dataset.seen = "1";
    // Window hidden: no asking where the mouse is.
    if (document.visibilityState !== "visible") {
      window.setTimeout(() => requestAnimationFrame(loop), 500);
      return;
    }
    // 30 steps a second while the head turns; once it has caught up with a
    // still mouse, a look every 150 ms is enough.
    const calm = calmSince > 0 && t - calmSince > 400;
    const gap = (calm ? 150 : 33) - (t - lastStep);
    if (gap > 0) {
      window.setTimeout(() => requestAnimationFrame(loop), gap);
      return;
    }
    lastStep = t;
    // Not following the mouse: look ahead and stop asking where it is.
    if (settings().followMouse === false) {
      if (cur.x || cur.y) {
        cur.x = cur.y = 0;
        tilt.style.transform = "";
        shadow.style.transform = "";
        pet.setLook(0, 0);
      }
      window.setTimeout(() => requestAnimationFrame(loop), 500);
      return;
    }
    if (IN_APP && !asking && t - lastAsk > 40) {
      asking = true;
      lastAsk = t;
      void Bridge.cursorRel().then((m) => {
        if (m) mouse = m;
        asking = false;
      });
    }
    if (mouse) {
      const r = tilt.getBoundingClientRect();
      const tx = Math.max(-1, Math.min(1, (mouse[0] - (r.left + r.width / 2)) / 320));
      const ty = Math.max(-1, Math.min(1, (mouse[1] - (r.top + r.height * 0.55)) / 240));
      const moved = Math.abs(tx - cur.x) + Math.abs(ty - cur.y) > 0.004;
      if (!moved) {
        if (!calmSince) calmSince = t;
        requestAnimationFrame(loop);
        return;
      }
      calmSince = 0;
      cur.x += (tx - cur.x) * 0.22;
      cur.y += (ty - cur.y) * 0.22;
      // The model turns its own head; only the 2D pet needs the card to tilt.
      if (flat) {
        tilt.style.transform = `rotateY(${(cur.x * 30).toFixed(2)}deg) rotateX(${(-cur.y * 18).toFixed(2)}deg)`;
        shadow.style.transform = `translateX(${(-cur.x * 10).toFixed(1)}px) scaleX(${(1 - Math.abs(cur.x) * 0.15).toFixed(3)})`;
      }
      pet.setLook(cur.x, cur.y);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return { el };
}

/** Cards whose piece brings its own panels: no extra frame around them. */
const BARE = new Set<WidgetKind>(["cal-month", "sys-cpu", "sys-ram", "sys-net", "sys-disk", "sys-battery", "sys-all", "tab-music", "tab-notes", "tab-apps", "tab-github"]);

/** A piece of a tab (or a whole tab) living in a card. */
function embed(w: Widget, view: { el: HTMLElement; tick?: (now: Date) => void }): Card {
  const el = box(w, view.el);
  el.classList.add("embed");
  if (BARE.has(w.kind)) el.classList.add("bare");
  return { el, tick: view.tick ? (now) => view.tick!(now) : undefined };
}

function piece(w: Widget): Card | null {
  const k = w.kind;
  if (k.startsWith("cal-")) return embed(w, calendarPart(k.slice(4) as "month" | "orbit" | "sky" | "agenda"));
  if (k === "sys-all") return embed(w, systemModule());
  if (k.startsWith("sys-")) return embed(w, systemModule(k.slice(4) as MeterId));
  if (k.startsWith("tool-")) return embed(w, toolsModule(k.slice(5) as "watch" | "timer" | "board"));
  if (k === "tab-music") return embed(w, musicModule());
  if (k === "tab-notes") return embed(w, notesModule());
  if (k === "tab-apps") return embed(w, appsModule());
  if (k === "tab-chat") return embed(w, chatModule());
  if (k === "tab-github") return embed(w, githubModule());
  return null;
}

export function homeModule(ctx: Ctx) {
  const layout = placeAll(settings().home ?? []);
  const el = h("section", { class: "module home2" });
  const cards: Card[] = [];
  for (const w of layout) {
    const makers: Partial<Record<WidgetKind, (w: Widget, ctx: Ctx) => Card>> = { clock, weather: weatherCard, next: nextCard, music: musicCard, system: systemCard, notes: notesCard, apps: appsCard, github: githubCard, timer: timerCard, modules: modulesCard };
    const make = makers[w.kind];
    const card = make ? make(w, ctx) : w.kind === "pet" ? petCard(w, ctx) : piece(w);
    if (!card) continue;
    cards.push(card);
    el.append(card.el);
  }
  if (!cards.length) {
    el.append(h("div", { class: "music-empty" },
      h("h3", { text: "Inicio vacío" }),
      h("p", { text: "Elige qué tarjetas ver en Ajustes → Inicio." }),
      h("button", { class: "notes-new", onclick: () => void Bridge.openSettings("home") }, icon(I.gear, 14), "Abrir ajustes"),
    ));
  }
  return {
    el,
    tick(now: Date) {
      for (const c of cards) c.tick?.(now);
    },
  };
}
