// The "Calendario y clima" tab. Three columns over one strip:
//   left   — the month; days with events have a dot;
//   centre — a big clock, with the day's forecast hour by hour on an orbit
//            around it (the nearest hours in front, larger);
//   right  — the chosen day's weather, with rings for wind, humidity, rain
//            and how it feels;
//   bottom — the chosen day's agenda, with time and place.
// One chosen day drives all of them. Komori's own design, in its own code.

import { clear, h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { settings, updateSettings, type CalEvent } from "../shared/settings";
import { deg, describe, onWeather, skyIcon, weather, weatherFailed, type Hour, type Weather } from "../shared/weather";

/** Local date as YYYY-MM-DD. */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Events in order: by date, then all-day first, then by time. */
export function sortedEvents(list: CalEvent[]): CalEvent[] {
  return [...list].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.time ?? "").localeCompare(b.time ?? ""));
}

/** The next event from now on (today's without a time count as upcoming all day). */
export function nextEvent(now: Date): CalEvent | null {
  const today = ymd(now);
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return sortedEvents(settings().events).find((e) =>
    e.date > today || (e.date === today && (!e.time || e.time >= hm))) ?? null;
}

/** "hoy", "mañana" or "jue 29 oct". */
export function whenLabel(e: CalEvent, now: Date): string {
  const today = ymd(now);
  const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const day = e.date === today ? "hoy" : e.date === tomorrow ? "mañana"
    : new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short" }).format(fromYmd(e.date));
  return e.time ? `${day}, ${formatHm(e.time)}` : day;
}

export function formatHm(hm: string): string {
  const [hh, mm] = hm.split(":").map(Number);
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", hour12: settings().hour12 })
    .format(new Date(2000, 0, 1, hh, mm));
}

const LEFT = "M15 5.5 8.5 12l6.5 6.5-1.6 1.5L5.4 12l8-8 1.6 1.5z";
const RIGHT = "M9 5.5 15.5 12 9 18.5l1.6 1.5 8-8-8-8L9 5.5z";
const PLUS = "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z";
const CLOCK = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-1 2v5.4l4.3 2.6.9-1.5-3.2-1.9V7h-2z";
const PIN = "M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z";

// What the tab remembers while the panel is rebuilt.
let shownMonth: Date | null = null;
let selected: string | null = null;
let adding = false;

/** Every piece on screen redraws when the chosen day changes (they may live
 *  in different places: the tab, or separate cards on the Home page). */
const bus = new Set<() => void>();
function notify() {
  for (const fn of [...bus]) fn();
}

/** The forecast hours of a day (or the next 24 h from now, for today). */
function hoursFor(w: Weather | null, day: string): Hour[] {
  const all = w?.hours ?? [];
  if (day === ymd(new Date())) {
    const now = new Date();
    const key = `${day}T${String(now.getHours()).padStart(2, "0")}:00`;
    const i = all.findIndex((x) => x.time >= key);
    return i < 0 ? [] : all.slice(i, i + 24);
  }
  return all.filter((x) => x.time.startsWith(day));
}

export type CalendarPart = "month" | "orbit" | "sky" | "agenda";

/** The four pieces of the tab, alive and in sync with every other copy. */
function calendarParts() {
  const now = new Date();
  shownMonth ??= new Date(now.getFullYear(), now.getMonth(), 1);
  selected ??= ymd(now);

  const month = h("div", { class: "c2-month" });
  const orbit = h("div", { class: "c2-orbit" });
  const sky = h("div", { class: "c2-sky" });
  const agenda = h("div", { class: "c2-agenda" });

  const pick = (day: string) => {
    selected = day;
    const d = fromYmd(day);
    shownMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    notify();
  };

  // ── The month ──
  function drawMonth() {
    clear(month);
    const today = ymd(new Date());
    const first = shownMonth!;
    const step = (n: number) => () => {
      shownMonth = new Date(first.getFullYear(), first.getMonth() + n, 1);
      drawMonth();
    };
    month.append(h("div", { class: "c2-mhead" },
      h("button", { class: "c2-arrow", title: "Mes anterior", onclick: step(-1) }, icon(LEFT, 13)),
      h("b", { text: new Intl.DateTimeFormat("es", { month: "short", year: "numeric" }).format(first).replace(".", "").toUpperCase() }),
      h("button", { class: "c2-arrow", title: "Mes siguiente", onclick: step(1) }, icon(RIGHT, 13)),
      h("button", { class: "c2-arrow plus", title: "Agregar evento", onclick: () => {
        adding = true;
        notify();
      } }, icon(PLUS, 13)),
    ));
    const ws = settings().weekStart;
    const grid = h("div", { class: "c2-days" });
    for (let i = 0; i < 7; i++) {
      // 2024-01-07 was a Sunday.
      const d = new Date(2024, 0, 7 + ((i + ws) % 7));
      grid.append(h("span", { class: "c2-wd", text: cap(new Intl.DateTimeFormat("es", { weekday: "short" }).format(d).slice(0, 2)) }));
    }
    const busy = new Set(settings().events.map((e) => e.date));
    const lead = (first.getDay() - ws + 7) % 7;
    for (let i = 0; i < 42; i++) {
      const d = new Date(first.getFullYear(), first.getMonth(), 1 - lead + i);
      const key = ymd(d);
      const cls = ["c2-day"];
      if (d.getMonth() !== first.getMonth()) cls.push("out");
      if (key === today) cls.push("today");
      if (key === selected) cls.push("on");
      grid.append(h("button", { class: cls.join(" "), onclick: () => pick(key) },
        String(d.getDate()),
        busy.has(key) ? h("i", {}) : null,
      ));
    }
    month.append(grid);
  }

  // ── The clock and the forecast orbit ──
  const time = h("span", { class: "c2-hm" });
  const secs = h("span", { class: "c2-s" });
  const date = h("div", { class: "c2-date" });
  // Each redraw starts a new animation; older ones stop.
  let orbitRun = 0;
  function drawOrbit(w: Weather | null) {
    clear(orbit);
    orbitRun++;
    const run = orbitRun;
    const ns = "http://www.w3.org/2000/svg";
    // The ring is drawn in two halves: the far one behind the clock, the near one in front.
    const back = document.createElementNS(ns, "svg");
    const front = document.createElementNS(ns, "svg");
    back.setAttribute("class", "c2-ring back");
    front.setAttribute("class", "c2-ring front");
    const backPath = document.createElementNS(ns, "path");
    const frontPath = document.createElementNS(ns, "path");
    back.append(backPath);
    front.append(frontPath);
    orbit.append(back);

    // Eight stops, three hours apart: the first in front, then around to the left.
    const hours = hoursFor(w, selected!);
    const stops = (selected === ymd(new Date()) ? hours.filter((_, i) => i % 3 === 0) : hours.filter((x) => Number(x.time.slice(11, 13)) % 3 === 0)).slice(0, 8);
    const pills = stops.map((hr, i) => {
      const pill = h("div", { class: "c2-hour", title: describe(hr.code).text, style: { animationDelay: `${-i * 0.7}s` } },
        h("span", { class: "c2-ht", text: formatHm(hr.time.slice(11, 16)) }),
        skyIcon(hr.code, hr.day, 18),
        h("b", { text: `${hr.temp.toFixed(1)}°` }),
      );
      orbit.append(pill);
      return pill;
    });
    orbit.append(h("div", { class: "c2-clock" }, h("div", { class: "c2-time" }, time, secs), date), front);
    tickClock(new Date());

    // A real 3D ring seen from a little above, in perspective: far things are
    // smaller, fainter and behind the clock. It sways slowly and turns a bit
    // toward the mouse.
    let spin = 0;
    let aim = 0;
    orbit.onmousemove = (e) => {
      // Following the mouse can be turned off in Ajustes.
      if (settings().followMouse === false) return;
      const r = orbit.getBoundingClientRect();
      aim = ((e.clientX - r.left) / r.width - 0.5) * 1.1;
    };
    orbit.onmouseleave = () => (aim = 0);
    const TILT = 0.62;
    const project = (phi: number, W: number, H: number) => {
      // As wide as the card allows, but the nearest hour (the biggest pill, at
      // the front) and the side ones must stay inside it, never cut off.
      const half = (pills[0]?.offsetHeight || 62) / 2;
      const front = Math.sin(TILT) * (3.4 / (3.4 - Math.cos(TILT)));
      const R = Math.max(20, Math.min(W * 0.41, H * 0.62, (H * 0.52 - half * 1.15 - 6) / front, W / 2 - 40));
      const x = R * Math.sin(phi);
      const z = R * Math.cos(phi);
      const f = R * 3.4;
      const k = f / (f - z * Math.cos(TILT));
      return { x: W / 2 + x * k, y: H * 0.48 + z * Math.sin(TILT) * k, k, z: z / R };
    };
    let seen = false;
    let drawnAt = -1e9;
    let still = false;
    const frame = (t: number) => {
      if (run !== orbitRun) return;
      if (!orbit.isConnected) {
        if (seen) return;
        requestAnimationFrame(frame);
        return;
      }
      seen = true;
      // Turned off in Settings: one still drawing, facing front.
      const moving = settings().perf?.orbit ?? true;
      if (!moving && still) return;
      // Out of sight (window hidden): check again in a while.
      if (document.visibilityState !== "visible") {
        window.setTimeout(() => requestAnimationFrame(frame), 500);
        return;
      }
      // Following the mouse: 30 frames. Only the slow sway: 10 are plenty
      // (it moves a fraction of a pixel between them).
      const aiming = Math.abs(aim - spin) > 0.02;
      const gap = (aiming ? 31 : 99) - (t - drawnAt);
      if (moving && gap > 0) {
        window.setTimeout(() => requestAnimationFrame(frame), gap);
        return;
      }
      drawnAt = t;
      if (!moving) {
        still = true;
        spin = 0;
      }
      const W = orbit.clientWidth;
      const H = orbit.clientHeight;
      if (moving) spin += (aim + Math.sin(t / 6500) * 0.18 - spin) * (aiming ? 0.09 : 0.27);
      for (const svg of [back, front]) svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      let dBack = "";
      let dFront = "";
      let prevFront: boolean | null = null;
      for (let i = 0; i <= 96; i++) {
        const p = project((i / 96) * Math.PI * 2, W, H);
        const isFront = p.z >= 0;
        const cmd = prevFront === isFront ? "L" : "M";
        if (isFront) dFront += `${cmd}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        else dBack += `${cmd}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        prevFront = isFront;
      }
      backPath.setAttribute("d", dBack);
      frontPath.setAttribute("d", dFront);
      pills.forEach((pill, i) => {
        const p = project(-(i / 8) * Math.PI * 2 + spin, W, H);
        const depth = (p.z + 1) / 2; // 1 in front, 0 behind
        // Moved by transform only (no layout), and far ones fade instead of
        // blurring: a blur is redrawn by the graphics card every frame.
        pill.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) scale(${(p.k * (0.52 + depth * 0.33)).toFixed(3)})`;
        pill.style.opacity = (0.22 + depth * 0.78).toFixed(2);
        pill.style.zIndex = String(p.z >= -0.15 ? 3 : 1);
      });
      if (moving) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function tickClock(d: Date) {
    const parts = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: settings().hour12 }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    time.textContent = `${get("hour")}:${get("minute")}`;
    secs.textContent = `:${get("second")}`;
    date.textContent = cap(new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(d));
  }

  // ── The chosen day's weather ──
  function gauge(value: number, max: number, label: string, text: string) {
    const r = 17;
    const len = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1, value / max));
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 44 44");
    svg.setAttribute("class", "c2-gauge-ring");
    svg.innerHTML = `<circle cx="22" cy="22" r="${r}" class="track"/><circle cx="22" cy="22" r="${r}" class="fill" stroke-dasharray="${len} ${len}" stroke-dashoffset="${len * (1 - p)}" transform="rotate(-90 22 22)"/>`;
    return h("div", { class: "c2-gauge" }, h("div", { class: "c2-gauge-box" }, svg, h("span", { text })), h("span", { class: "c2-gauge-label", text: label }));
  }

  function drawSky(w: Weather | null) {
    clear(sky);
    const day = fromYmd(selected!);
    const shift = (n: number) => () => pick(ymd(new Date(day.getFullYear(), day.getMonth(), day.getDate() + n)));
    sky.append(h("div", { class: "c2-dayhead" },
      h("button", { class: "c2-arrow", title: "Día anterior", onclick: shift(-1) }, icon(LEFT, 13)),
      h("b", { text: new Intl.DateTimeFormat("es", { weekday: "long" }).format(day).toUpperCase() }),
      h("button", { class: "c2-arrow", title: "Día siguiente", onclick: shift(1) }, icon(RIGHT, 13)),
    ));
    if (!w) {
      sky.append(h("p", { class: "c2-none", text: weatherFailed() ? "Sin conexión con el clima por ahora." : "Buscando el clima…" }));
      return;
    }
    const isToday = selected === ymd(new Date());
    const daily = w.days.find((d) => d.date === selected);
    const hours = (w.hours ?? []).filter((x) => x.time.startsWith(selected!));
    if (!daily && !isToday) {
      sky.append(h("p", { class: "c2-none", text: "Sin pronóstico para este día." }));
      return;
    }
    const avg = (f: (x: Hour) => number) => (hours.length ? hours.reduce((s, x) => s + f(x), 0) / hours.length : 0);
    const temp = isToday ? w.temp : (daily?.max ?? 0);
    const code = isToday ? w.code : (daily?.code ?? 0);
    const wind = isToday ? w.wind : (daily?.wind ?? avg((x) => x.wind));
    const humidity = isToday ? w.humidity : avg((x) => x.humidity);
    const rain = daily?.rain ?? avg((x) => x.rain);
    const feels = isToday ? w.feels : Math.max(...hours.map((x) => x.feels), temp);
    const unitWind = w.unit === "f" ? "mph" : "km/h";
    sky.append(
      h("div", { class: "c2-temp", text: deg(temp) }),
      h("div", { class: "c2-desc", text: describe(code).text }),
      h("div", { class: "c2-range", text: daily ? `máx ${deg(daily.max)} · mín ${deg(daily.min)}` : "" }),
      h("div", { class: "c2-gauges" },
        gauge(wind, w.unit === "f" ? 30 : 50, "Viento", `${Math.round(wind)}`),
        gauge(humidity, 100, "Humedad", `${Math.round(humidity)}%`),
        gauge(rain, 100, "Lluvia", `${Math.round(rain)}%`),
        gauge(feels + 10, 50, "Sensación", deg(feels)),
      ),
      h("span", { class: "c2-unit", text: `viento en ${unitWind}` }),
    );
  }

  // ── The chosen day's agenda ──
  function drawAgenda() {
    clear(agenda);
    const day = fromYmd(selected!);
    const today = new Date();
    const rel = selected === ymd(today) ? " (Hoy)"
      : selected === ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) ? " (Mañana)" : "";
    agenda.append(
      waves(),
      h("div", { class: "c2-ahead" },
        h("span", { class: "c2-aicon" }, icon(I.calendar, 14)),
        h("b", { text: cap(new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(day)) + rel }),
        h("span", { class: "spacer" }),
        adding ? null : h("button", { class: "c2-add", onclick: () => {
          adding = true;
          notify();
        } }, icon(PLUS, 12), "Agregar"),
      ),
    );
    if (adding) {
      agenda.append(form());
      return;
    }
    const mine = sortedEvents(settings().events.filter((e) => e.date === selected));
    const row = h("div", { class: "c2-events" });
    if (!mine.length) row.append(h("p", { class: "c2-empty", text: "Nada para este día." }));
    for (const e of mine) {
      row.append(h("div", { class: "c2-event" },
        h("b", { text: e.title }),
        h("span", {}, icon(CLOCK, 11), e.time ? `${formatHm(e.time)}${e.end ? `–${formatHm(e.end)}` : ""}` : "Todo el día"),
        e.place ? h("span", {}, icon(PIN, 11), e.place) : null,
        h("button", { class: "c2-del", title: "Quitar", onclick: () =>
          void updateSettings({ events: settings().events.filter((x) => x.id !== e.id) }).then(notify) }, icon(I.close, 11)),
      ));
    }
    agenda.append(row);
  }

  function form() {
    const title = h("input", { class: "c2-in grow", placeholder: "Título", maxlength: "80" }) as HTMLInputElement;
    const start = h("input", { class: "c2-in", type: "time", title: "Empieza" }) as HTMLInputElement;
    const end = h("input", { class: "c2-in", type: "time", title: "Termina" }) as HTMLInputElement;
    const place = h("input", { class: "c2-in", placeholder: "Lugar", maxlength: "40" }) as HTMLInputElement;
    const save = () => {
      if (!title.value.trim()) return title.focus();
      const ev: CalEvent = { id: crypto.randomUUID(), date: selected!, title: title.value.trim() };
      if (start.value) ev.time = start.value;
      if (end.value) ev.end = end.value;
      if (place.value.trim()) ev.place = place.value.trim();
      adding = false;
      void updateSettings({ events: [...settings().events, ev] }).then(notify);
    };
    for (const input of [title, place]) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") save();
      });
    }
    window.setTimeout(() => title.focus(), 30);
    return h("div", { class: "c2-form" }, title, start, end, place,
      h("button", { class: "c2-save", onclick: save }, "Guardar"),
      h("button", { class: "c2-cancel", onclick: () => {
        adding = false;
        notify();
      } }, "Cancelar"),
    );
  }

  function drawAll() {
    drawMonth();
    drawOrbit(weather());
    drawSky(weather());
    drawAgenda();
  }

  const parts = { month, orbit, sky, agenda };
  const alive = () => Object.values(parts).some((x) => x.isConnected);
  drawAll();
  // Follow the shared day and the weather while any piece is on screen.
  let seen = false;
  const follow = () => {
    if (alive()) seen = true;
    else if (seen) {
      bus.delete(follow);
      off();
      return;
    }
    drawAll();
  };
  bus.add(follow);
  const off = onWeather((w) => {
    if (seen && !alive()) return off();
    drawOrbit(w);
    drawSky(w);
  });
  return { parts, tick: (d: Date) => tickClock(d) };
}

export function calendarModule() {
  const { parts, tick } = calendarParts();
  const el = h("section", { class: "module c2" }, parts.month, parts.orbit, parts.sky, parts.agenda);
  return { el, tick };
}

/** One piece, for a card on the Home page. */
export function calendarPart(kind: CalendarPart) {
  const { parts, tick } = calendarParts();
  return { el: parts[kind], tick: kind === "orbit" ? tick : undefined };
}

/** Soft waves behind the agenda. */
function waves(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 400 60");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "c2-waves");
  for (const [amp, phase, y] of [[9, 0, 30], [6, 1.6, 34], [11, 3.1, 28]]) {
    const pts: string[] = [];
    for (let x = 0; x <= 400; x += 8) pts.push(`${x},${(y + Math.sin(x / 38 + phase) * amp).toFixed(1)}`);
    const p = document.createElementNS(ns, "polyline");
    p.setAttribute("points", pts.join(" "));
    svg.append(p);
  }
  return svg;
}

/** Calls you when an event of today starts (once each), via the island's notice. */
export function startReminders() {
  const told = new Set<string>();
  const check = () => {
    const now = new Date();
    const today = ymd(now);
    for (const e of settings().events) {
      if (e.date !== today || !e.time || told.has(e.id)) continue;
      // Up to two minutes late still counts (the PC may have been asleep).
      const [h1, m1] = e.time.split(":").map(Number);
      const late = now.getHours() * 60 + now.getMinutes() - (h1 * 60 + m1);
      if (late < 0 || late > 2) continue;
      told.add(e.id);
      const when = `${formatHm(e.time)}${e.end ? `–${formatHm(e.end)}` : ""}${e.place ? ` · ${e.place}` : ""}`;
      window.dispatchEvent(new CustomEvent("komori-notice", { detail: { title: e.title, message: `Empieza ahora (${when}).`, sticky: true } }));
    }
  };
  check();
  window.setInterval(check, 20_000);
}
