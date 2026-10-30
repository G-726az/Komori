// The island's open panel, in both styles: a slim header (the pet, the tab's
// name, the date), the tab, and a dock with every tab plus Ajustes. The
// minimal style is black, one compact size for every tab, with its own pages
// for Música, Claude Code, Calendario, Hoy, Sistema and Herramientas; the
// other tabs keep their own look, fitted to that size. Komori's own layout.

import "./minimal.css";
import { Bridge, IN_APP, type VolumeState } from "../shared/bridge";
import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { settings, updateSettings, type ModuleId } from "../shared/settings";
import { deg, describe, skyIcon, weather } from "../shared/weather";
import { control, media, onMedia, seek, type Media } from "./media";
import { PAUSE, PLAY, artBox, clock } from "./music";
import { lineIndex, lyrics, onLyrics, type SongLyrics } from "./lyrics";
import { nextEvent, whenLabel } from "./calendar";
import { MODULES, buildModule, formatTime, type ModuleView } from "./modules";
import { statsNow } from "./system";
import { presetTimer, resetWatch, timerInfo, toggleTimer, toggleWatch, watchInfo } from "./tools";
import type { Pet } from "./pet";
import { claudePage } from "./claudepage";
import { timeline } from "./timeline";
import { onPulse } from "./beat";
import { calendarPage } from "./minical";
import { shelfPage } from "./shelf";

const NEXT = "M5 6.2v11.6a.9.9 0 0 0 1.4.75L15 12.75v4.75a1 1 0 0 0 2 0v-11a1 1 0 0 0-2 0v4.75L6.4 5.45A.9.9 0 0 0 5 6.2z";
const PREV = "M19 6.2v11.6a.9.9 0 0 1-1.4.75L9 12.75v4.75a1 1 0 0 1-2 0v-11a1 1 0 0 1 2 0v4.75l8.6-5.8a.9.9 0 0 1 1.4.75z";
const RESET = "M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v3L7.5 6 12 2v3z";
const SPEAKER = "M3 9h4l5-4.5v15L7 15H3V9zm12.5-1.6a6 6 0 0 1 0 9.2l-1.3-1.5a4 4 0 0 0 0-6.2l1.3-1.5zm2.6-3a10 10 0 0 1 0 15.2l-1.3-1.5a8 8 0 0 0 0-12.2l1.3-1.5z";
const MUTED = "M3 9h4l5-4.5v15L7 15H3V9zm12.3.2 1.4-1.4 2.3 2.3 2.3-2.3 1.4 1.4-2.3 2.3 2.3 2.3-1.4 1.4-2.3-2.3-2.3 2.3-1.4-1.4 2.3-2.3-2.3-2.3z";
const LYRICS = "M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 0-1zm3 4.2V10h10V8.2H7zm0 3.6v1.8h6.5v-1.8H7z";

const GROW = "M4 4h6v2H7.4l4.3 4.3-1.4 1.4L6 7.4V10H4V4zm16 16h-6v-2h2.6l-4.3-4.3 1.4-1.4 4.3 4.3V14h2v6z";
const SHRINK = "M10 3v7H3V8h3.6L2.3 3.7l1.4-1.4L8 6.6V3h2zm4 18v-7h7v2h-3.6l4.3 4.3-1.4 1.4-4.3-4.3V21h-2z";

type Page = { el: HTMLElement; update: () => void; stop: () => void };

/** Tabs with a compact page of their own in the minimal style. */
const COMPACT: Partial<Record<ModuleId, { label: string; build: (tint: (c: string | null) => void) => Page }>> = {};


// ── Album colour: the average of a tiny copy of the cover, made a bit livelier ──

const albumColors = new Map<string, string>();

/** The cover's colour, livelier and dark enough for white text on it. */
export function albumColor(src: string): Promise<string> {
  const known = albumColors.get(src);
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 12;
      const ctx = c.getContext("2d");
      if (!ctx) return resolve("#1d2a27");
      ctx.drawImage(img, 0, 0, 12, 12);
      const d = ctx.getImageData(0, 0, 12, 12).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        // Skip near-black and near-white pixels: they wash the colour out.
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (lum < 24 || lum > 235) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      if (!n) return resolve("#1d2a27");
      const avg = [r / n, g / n, b / n];
      const mean = (avg[0] + avg[1] + avg[2]) / 3;
      // More saturation, a little darker, so white text always reads on it.
      const out = avg.map((v) => Math.max(0, Math.min(255, (mean + (v - mean) * 1.5) * 0.62)));
      const hex = `#${out.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
      albumColors.set(src, hex);
      resolve(hex);
    };
    img.onerror = () => resolve("#1d2a27");
    img.src = src;
  });
}

// ── Pages ────────────────────────────────────────────────────────────────────

/** `roomy`: the full island's Música tab — the same page, bigger, with the record. */
function musicPage(tint: (c: string | null) => void, roomy = false): Page {
  const el = h("div", { class: roomy ? "mm roomy" : "mm" });
  const vol = volumeRow();
  let drawnKey = "";
  let lyricsEl: HTMLElement | null = null;
  let lines: HTMLElement[] = [];
  let lastLine = -2;
  let bar: ReturnType<typeof timeline> | null = null;
  let at: HTMLElement | null = null;
  let left: HTMLElement | null = null;
  let playBtn: HTMLElement | null = null;
  // The song's line moves with the sound while it plays.
  let offPulse: (() => void) | null = null;

  const draw = () => {
    const m = media();
    const l = lyrics();
    const want = settings().lyrics?.show !== false;
    const key = [m?.app, m?.title, m?.artist, m?.cover?.length, !!m?.playing, l?.key ?? "", want].join("|");
    if (key === drawnKey) return;
    drawnKey = key;
    lastLine = -2;
    el.replaceChildren();
    lyricsEl = bar = at = left = playBtn = null;
    lines = [];
    if (!m || !m.title) {
      tint(null);
      el.append(h("div", { class: "mm-empty" }, icon(I.music, 22), h("span", { text: "No suena nada ahora mismo" })));
      return;
    }
    const cover = roomy ? artBox(m) : m.cover
      ? h("img", { class: "mm-cover", src: m.cover, alt: "" })
      : h("div", { class: "mm-cover none" }, icon(I.music, 30));
    // The island takes the colour of the app playing (green for Spotify, red for
    // YouTube, orange for Brave…); an app Komori doesn't know lends the cover's.
    const own = appTint(m.app);
    if (own) tint(own);
    else if (m.cover) void albumColor(m.cover).then((c) => media()?.cover === m.cover && tint(c));
    else tint(null);

    bar = timeline(settings().music?.timeline ?? "clasica");
    offPulse?.();
    offPulse = null;
    if (m.playing) {
      const line = bar;
      offPulse = onPulse((p) => line.pulse(p.beat, p.level));
    }
    at = h("span", { class: "mm-at" });
    left = h("span", { class: "mm-left" });
    const track = h("div", { class: `mm-bar${m.canSeek ? " seek" : ""}${m.playing ? " playing" : ""}` }, bar.el);
    if (m.canSeek) {
      track.addEventListener("click", (e) => {
        const r = track.getBoundingClientRect();
        const now = media();
        if (now && now.duration > 0) seek(((e.clientX - r.left) / r.width) * now.duration);
      });
    }
    playBtn = h("button", { class: "mm-play", title: m.playing ? "Pausa" : "Reproducir", onclick: () => control("playpause") }, icon(m.playing ? PAUSE : PLAY, 18));
    const info = h("div", { class: "mm-info" },
      playerChip(m.app),
      h("b", { class: "mm-title", text: m.title, title: m.title }),
      h("span", { class: "mm-artist", text: [m.artist, m.album].filter(Boolean).join(" · ") }),
      h("div", { class: "mm-time" }, at, track, left),
      h("div", { class: "mm-controls" },
        h("button", { class: "mm-skip", title: "Anterior", disabled: !m.canPrev, onclick: () => control("prev") }, icon(PREV, 16)),
        playBtn,
        h("button", { class: "mm-skip", title: "Siguiente", disabled: !m.canNext, onclick: () => control("next") }, icon(NEXT, 16)),
        h("button", {
          class: want ? "mm-lyr on" : "mm-lyr",
          title: want ? "Ocultar la letra" : "Mostrar la letra",
          "aria-pressed": String(want),
          onclick: () => void updateSettings({ lyrics: { ...settings().lyrics, show: !want } }),
        }, icon(LYRICS, 15)),
      ),
      vol.el,
    );
    el.append(cover, info);

    // Lyrics: synced lines that scroll with the song; plain lyrics as a quiet column.
    if (want && l && (l.synced?.length || l.plain?.length)) {
      lyricsEl = h("div", { class: "mm-lyrics" });
      const inner = h("div", { class: "mm-lines" });
      const texts = l.synced?.length ? l.synced.map((x) => x.text || "♪") : l.plain!;
      lines = texts.map((t) => h("p", { text: t }));
      inner.append(...lines);
      lyricsEl.append(inner);
      if (!l.synced?.length) lyricsEl.classList.add("plain");
      // While the island opens the column is narrow and lines wrap: centre again when it settles.
      new ResizeObserver(() => {
        lastLine = -2;
        update();
      }).observe(lyricsEl);
      el.append(lyricsEl);
      el.classList.add("with-lyrics");
    } else el.classList.remove("with-lyrics");
  };

  const update = () => {
    draw();
    const m = media();
    if (!m || !bar || !at || !left) return;
    const ratio = m.duration > 0 ? m.position / m.duration : 0;
    bar.set(ratio);
    at.textContent = clock(m.position);
    left.textContent = m.duration > 0 ? `-${clock(Math.max(0, m.duration - m.position))}` : "";
    const l: SongLyrics | null = lyrics();
    // Measure only once it's on screen (a detached column has no size yet).
    if (lyricsEl && l?.synced?.length && lyricsEl.isConnected && lyricsEl.clientHeight > 0) {
      const i = lineIndex(l, m.position);
      if (i !== lastLine) {
        lastLine = i;
        lines.forEach((p, k) => p.classList.toggle("now", k === i));
        lines.forEach((p, k) => p.classList.toggle("past", k < i));
        // Keep the line being sung in the middle of the column.
        const target = lines[Math.max(0, i)];
        const inner = lyricsEl.firstElementChild as HTMLElement;
        const y = target ? target.offsetTop + target.offsetHeight / 2 - lyricsEl.clientHeight / 2 : 0;
        inner.style.transform = `translateY(${-Math.max(0, y)}px)`;
      }
    }
  };

  const offMedia = onMedia(() => update());
  const offLyrics = onLyrics(() => update());
  // Smooth progress and on-time lyrics while this page is on screen.
  let seen = false;
  const stop = () => {
    offMedia();
    offLyrics();
    offPulse?.();
    vol.stop();
    window.clearInterval(loop);
  };
  const loop = window.setInterval(() => {
    // Gone with the closed panel: let go of everything.
    if (!el.isConnected) return seen && stop();
    seen = true;
    if (media()?.playing) update();
  }, 200);
  update();
  return { el, update, stop };
}

/** Who is playing: the app's name with a colour that stands for it. */
const PLAYERS: [RegExp, string][] = [
  [/spotify/i, "#1ed760"],
  [/youtube/i, "#ff2a3d"],
  [/apple music/i, "#fa2d55"],
  [/deezer/i, "#a238ff"],
  [/tidal/i, "#d8d8d8"],
  [/soundcloud/i, "#ff6a1a"],
  [/amazon/i, "#25d1da"],
  [/vlc/i, "#ff8a00"],
  [/edge/i, "#2d8cf0"],
  [/chrome/i, "#4c8bf5"],
  [/firefox/i, "#ff7139"],
  [/opera/i, "#ff2a3d"],
  [/brave/i, "#fb542b"],
  [/reproductor|películas|media player/i, "#3a96dd"],
];

/** The app's colour, darkened so white text still reads on the tinted island. */
function appTint(app: string): string | null {
  const hex = PLAYERS.find(([re]) => re.test(app))?.[1];
  if (!hex) return null;
  const rgb = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.58));
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function playerChip(app: string): HTMLElement | null {
  if (!app) return null;
  const color = PLAYERS.find(([re]) => re.test(app))?.[1] ?? "var(--accent)";
  const chip = h("span", { class: "mm-app" }, h("i", {}, icon(I.music, 11)), app);
  chip.style.setProperty("--app", color);
  return chip;
}

/** The Windows volume: a speaker that mutes and a bar you can drag. */
function volumeRow(): { el: HTMLElement; stop: () => void } {
  let state: VolumeState = { level: 0.6, muted: false };
  // The same look as the song's line (Ajustes → Música → Línea de tiempo).
  const line = timeline(settings().music?.timeline ?? "clasica");
  const bar = h("div", { class: "mv-bar", role: "slider", "aria-label": "Volumen", tabindex: "0", "aria-valuemin": "0", "aria-valuemax": "100" }, line.el);
  const btn = h("button", { class: "mv-btn" });
  const el = h("div", { class: "mv" }, btn, bar);
  let dragging = false;
  let shownIcon = "";
  const draw = () => {
    const v = state.muted ? 0 : state.level;
    line.set(v);
    bar.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    btn.title = state.muted ? "Activar sonido" : "Silenciar";
    const want = state.muted || state.level === 0 ? MUTED : SPEAKER;
    if (want !== shownIcon) {
      shownIcon = want;
      btn.replaceChildren(icon(want, 15));
    }
  };
  const take = (s: VolumeState | null) => {
    if (s && !dragging) state = s;
    draw();
  };
  // One change on its way at a time while dragging; the last one always lands.
  let pending: number | null = null;
  let sending = false;
  const send = async () => {
    if (sending || pending == null) return;
    sending = true;
    const level = pending;
    pending = null;
    const s = IN_APP ? await Bridge.volumeSet(level) : null;
    sending = false;
    if (s && pending == null && !dragging) state = s;
    void send();
  };
  const setLevel = (level: number) => {
    state = { level: Math.max(0, Math.min(1, level)), muted: false };
    draw();
    pending = state.level;
    void send();
  };
  const fromX = (x: number) => {
    const r = bar.getBoundingClientRect();
    setLevel((x - r.left) / r.width);
  };
  bar.addEventListener("pointerdown", (e) => {
    dragging = true;
    bar.setPointerCapture(e.pointerId);
    fromX(e.clientX);
  });
  bar.addEventListener("pointermove", (e) => {
    if (dragging) fromX(e.clientX);
  });
  const drop = () => (dragging = false);
  bar.addEventListener("pointerup", drop);
  bar.addEventListener("pointercancel", drop);
  bar.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 0.05 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.05 : 0;
    if (!d) return;
    e.preventDefault();
    setLevel(state.level + d);
  });
  // The wheel over the volume changes the volume (not the page).
  el.addEventListener("wheel", (e) => {
    e.stopPropagation();
    setLevel(state.level + (e.deltaY < 0 ? 0.04 : -0.04));
  }, { passive: true });
  btn.addEventListener("click", async () => {
    state = { ...state, muted: !state.muted };
    draw();
    take(IN_APP ? await Bridge.volumeMute(state.muted) : null);
  });
  draw();
  const read = async () => take(IN_APP ? await Bridge.volumeGet() : null);
  void read();
  // It may change from the keyboard or the taskbar: look again now and then.
  const loop = window.setInterval(() => {
    if (el.isConnected && !dragging && !sending) void read();
  }, 2000);
  return { el, stop: () => window.clearInterval(loop) };
}

function todayPage(): Page {
  const time = h("b", { class: "mt-time" });
  const date = h("span", { class: "mt-date" });
  const sky = h("div", { class: "mt-sky" });
  const next = h("div", { class: "mt-next" });
  const el = h("div", { class: "mt" }, h("div", { class: "mt-clock" }, time, date), sky, next);
  const update = () => {
    const now = new Date();
    time.textContent = formatTime(now);
    date.textContent = now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
    const w = weather();
    sky.replaceChildren();
    if (w) {
      const d = describe(w.code);
      sky.append(skyIcon(w.code, w.day, 34), h("div", {},
        h("b", { text: deg(w.temp) }),
        h("span", { text: `${d.text} · ${settings().weather.place.name}` })));
    } else sky.append(h("span", { class: "mt-dim", text: "Buscando el clima…" }));
    const e = nextEvent(now);
    next.replaceChildren(h("span", { class: "mt-label", text: "Próximo" }));
    if (e) next.append(h("b", { text: e.title }), h("span", { text: whenLabel(e, now) }));
    else next.append(h("b", { class: "mt-dim", text: "Nada en el calendario" }));
  };
  update();
  return { el, update, stop() {} };
}

function systemPage(): Page {
  const meter = (label: string) => {
    const value = h("b", {});
    const fill = h("i", {});
    const detail = h("span", { class: "ms-detail" });
    const box = h("div", { class: "ms-meter" }, h("span", { class: "ms-label", text: label }), value, h("div", { class: "ms-bar" }, fill), detail);
    return { box, set(pct: number | null, text: string, sub = "") {
      value.textContent = text;
      detail.textContent = sub;
      fill.style.transform = `scaleX(${pct == null ? 0 : Math.max(0, Math.min(1, pct / 100)).toFixed(3)})`;
    } };
  };
  const cpu = meter("Procesador");
  // One little bar per core, under the processor.
  const cores = h("div", { class: "ms-cores", title: "Uso de cada núcleo" });
  cpu.box.append(cores);
  const ram = meter("Memoria");
  const bat = meter("Batería");
  const el = h("div", { class: "ms" }, cpu.box, ram.box, bat.box);
  let busy = false;
  const update = () => {
    if (busy) return;
    busy = true;
    void statsNow().then((s) => {
      busy = false;
      if (!s) return;
      cpu.set(s.cpu, `${Math.round(s.cpu)}%`, `${s.cores.length} núcleos`);
      if (cores.childElementCount !== s.cores.length) cores.replaceChildren(...s.cores.map(() => h("i", {})));
      s.cores.forEach((c, i) => {
        const bar = cores.children[i] as HTMLElement;
        bar.style.transform = `scaleY(${Math.max(0.06, Math.min(1, c / 100)).toFixed(3)})`;
        bar.title = `Núcleo ${i + 1}: ${Math.round(c)}%`;
      });
      const used = (s.memUsed / s.memTotal) * 100;
      ram.set(used, `${Math.round(used)}%`, `${(s.memUsed / 2 ** 30).toFixed(1)} de ${(s.memTotal / 2 ** 30).toFixed(0)} GB`);
      if (s.battery) bat.set(s.battery.percent, `${Math.round(s.battery.percent)}%`, s.battery.charging ? "Cargando" : s.battery.plugged ? "Conectada" : "Con batería");
      else bat.set(null, "—", "Sin batería");
    });
  };
  update();
  return { el, update, stop() {} };
}

function toolsPage(): Page {
  const tText = h("b", { class: "mx-time" });
  const tBtn = h("button", { class: "mm-play", onclick: () => { toggleTimer(); update(); } });
  const presets = h("div", { class: "mx-presets" }, ...[5, 10, 25].map((n) =>
    h("button", { text: `${n} min`, onclick: () => { presetTimer(n); update(); } })));
  const wText = h("b", { class: "mx-time" });
  const wBtn = h("button", { class: "mm-play", onclick: () => { toggleWatch(); update(); } });
  const wReset = h("button", { class: "mm-skip", title: "Reiniciar", onclick: () => { resetWatch(); update(); } }, icon(RESET, 16));
  const el = h("div", { class: "mx" },
    h("div", { class: "mx-tool" }, h("span", { class: "ms-label", text: "Temporizador" }), tText, h("div", { class: "mx-row" }, tBtn, presets)),
    h("div", { class: "mx-tool" }, h("span", { class: "ms-label", text: "Cronómetro" }), wText, h("div", { class: "mx-row" }, wBtn, wReset)),
  );
  let tRun: boolean | null = null;
  let wRun: boolean | null = null;
  const update = () => {
    const t = timerInfo();
    tText.textContent = t.text;
    if (t.running !== tRun) {
      tRun = t.running;
      tBtn.replaceChildren(icon(t.running ? PAUSE : PLAY, 18));
    }
    const w = watchInfo();
    wText.textContent = w.text;
    if (w.running !== wRun) {
      wRun = w.running;
      wBtn.replaceChildren(icon(w.running ? PAUSE : PLAY, 18));
    }
  };
  let seen = false;
  const loop = window.setInterval(() => {
    if (!el.isConnected) return seen && window.clearInterval(loop);
    seen = true;
    update();
  }, 100);
  update();
  return { el, update, stop: () => window.clearInterval(loop) };
}

Object.assign(COMPACT, {
  music: { label: "Música", build: musicPage },
  claude: { label: "Claude Code", build: claudePage },
  calendar: { label: "Calendario", build: calendarPage },
  shelf: { label: "Estante", build: shelfPage },
  home: { label: "Hoy", build: todayPage },
  system: { label: "Sistema", build: systemPage },
  tools: { label: "Herramientas", build: toolsPage },
});


/** The tab shown last, to slide the next one in from its side. */
let shown: ModuleId | null = null;
/** The compact page on screen, let go when the next one is built. */
let live: Page | null = null;

/**
 * The whole minimal panel for tab `id`: header, page and dock. `go` switches
 * tabs (main.ts builds the panel again and resizes the island when needed).
 * `face` is the pet's small copy, kept by main.ts and reused on every build.
 */
export function miniPanel(id: ModuleId, go: (id: ModuleId) => void, pet: Pet, face: HTMLElement,
  opts: { compact: boolean; close: () => void; expand?: { on: boolean; toggle: () => void } }): ModuleView {
  const tabs = settings().modules.filter((m) => MODULES[m]);
  const root = h("div", { class: opts.compact ? "mini" : "mini roomy" });
  const label = (t: ModuleId) => (opts.compact ? COMPACT[t]?.label : null) ?? MODULES[t].label;
  const tint = (c: string | null) => {
    if (c) root.style.setProperty("--album", c);
    else root.style.removeProperty("--album");
    root.classList.toggle("tinted", !!c);
  };

  // Header: the pet, where you are, and the date.
  const when = h("span", { class: "mini-when" });
  const head = h("header", { class: "mini-head" },
    h("button", { class: "mini-pet", title: "¡Hola!", onclick: () => pet.poke() }, face),
    h("b", { class: "mini-title", text: label(id) }),
    when,
    opts.expand ? h("button", {
      class: "mini-x",
      title: opts.expand.on ? "Achicar" : "Agrandar",
      "aria-pressed": String(opts.expand.on),
      onclick: () => opts.expand!.toggle(),
    }, icon(opts.expand.on ? SHRINK : GROW, 14)) : null,
    h("button", { class: "mini-x", title: "Cerrar", onclick: () => opts.close() }, icon(I.close, 14)),
  );

  // The page itself.
  const stage = h("div", { class: "mini-stage" });
  const compact = opts.compact ? COMPACT[id] : undefined;
  live?.stop();
  // The full island's Música is the same page as the minimal one, roomier.
  const build = compact?.build ?? (id === "music" ? (t: typeof tint) => musicPage(t, true) : undefined);
  const page: Page | null = build ? build(tint) : null;
  live = page;
  const full: ModuleView | null = page ? null : buildModule(id, go, pet);
  full?.tintWith?.(tint);
  const content = page ? page.el : h("div", { class: "mini-full" }, full!.el);
  const from = shown ? tabs.indexOf(shown) : -1;
  if (shown && shown !== id) content.classList.add(tabs.indexOf(id) < from ? "enter-left" : "enter-right");
  shown = id;
  stage.append(content);

  // Dock: every tab, the current one with its name; then Ajustes.
  const dock = h("nav", { class: "mini-dock", "aria-label": "Pestañas" },
    ...tabs.map((t) => h("button", {
      class: t === id ? "on" : "",
      title: label(t),
      "aria-current": t === id ? "page" : "false",
      onclick: () => t !== id && go(t),
    }, icon(MODULES[t].icon, 15), t === id ? h("span", { text: label(t) }) : "")),
    h("i", { class: "mini-sep" }),
    h("button", { class: "mini-gear", title: "Ajustes", onclick: () => {
      // Ajustes takes over: fold the island away.
      opts.close();
      void Bridge.openSettings();
    } }, icon(I.gear, 15)),
  );

  root.append(head, stage, dock);

  // On a compact page a scroll (or a trackpad swipe) moves to the next compact tab.
  if (compact) {
    let wheelAt = 0;
    stage.addEventListener("wheel", (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(d) < 8 || performance.now() - wheelAt < 380) return;
      wheelAt = performance.now();
      const ring = tabs.filter((t) => COMPACT[t]);
      const i = ring.indexOf(id);
      if (ring.length > 1) go(ring[(i + (d > 0 ? 1 : -1) + ring.length) % ring.length]);
    }, { passive: true });
  }

  const tick = (now: Date) => {
    when.textContent = `${now.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })} · ${formatTime(now)}`;
    if (page) page.update();
    else full?.tick?.(now);
  };
  tick(new Date());
  return { el: root, tick };
}

export type { Media };
