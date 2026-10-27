// The "Herramientas" tab: a stopwatch with laps, a timer that calls you when
// it's done (even with the island closed), and a board to draw on. They keep
// going while you look at other tabs.

import { Bridge, IN_APP } from "../shared/bridge";
import { h, icon } from "../shared/dom";

export type Tool = "watch" | "timer" | "board";

const STOPWATCH = "M10 2h4v2h-4V2zm2 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-1 2v4.4l3.3 2 .9-1.5-2.2-1.4V9h-2zm7.2-3.6 1.4 1.4-1.4 1.4-1.4-1.4 1.4-1.4z";
const HOURGLASS = "M6 2h12v2h-1v3.2a5 5 0 0 1-2.5 4.3L12 12l2.5.5A5 5 0 0 1 17 16.8V20h1v2H6v-2h1v-3.2a5 5 0 0 1 2.5-4.3L12 12l-2.5-.5A5 5 0 0 1 7 7.2V4H6V2zm3 2v3.2a3 3 0 0 0 1.5 2.6L12 10.6l1.5-.8A3 3 0 0 0 15 7.2V4H9z";
const BRUSH = "M20.7 3.3a1 1 0 0 0-1.4 0L10 12.6 11.4 14l9.3-9.3a1 1 0 0 0 0-1.4zM7 14c-1.7 0-3 1.3-3 3 0 1.3-.8 2-2 2 1 1.3 2.6 2 4 2 2.2 0 4-1.8 4-4 0-1.7-1.3-3-3-3z";

export const TOOLS_ICON = STOPWATCH;

let tool: Tool = "watch";

// ── Stopwatch ────────────────────────────────────────────────────────────────

const watch = { running: false, base: 0, since: 0, laps: [] as number[] };
const watchNow = () => watch.base + (watch.running ? performance.now() - watch.since : 0);

function fmtWatch(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return { main: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, small: `.${String(cs).padStart(2, "0")}` };
}

// ── Timer ────────────────────────────────────────────────────────────────────

const timer = { total: 5 * 60_000, left: 5 * 60_000, running: false, endsAt: 0, loop: 0 };
const timerLeft = () => (timer.running ? Math.max(0, timer.endsAt - Date.now()) : timer.left);

function fmtLeft(ms: number) {
  const t = Math.ceil(ms / 1000);
  const hrs = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return hrs ? `${hrs}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function minutesLabel(ms: number) {
  const total = Math.round(ms / 1000);
  const hrs = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [hrs ? `${hrs} h` : "", m ? `${m} min` : "", s ? `${s} s` : ""].filter(Boolean).join(" ") || "0 s";
}

function startTimer() {
  if (timer.running || timer.left <= 0) return;
  timer.running = true;
  timer.endsAt = Date.now() + timer.left;
  window.clearInterval(timer.loop);
  // Checked from here, not from the tab: it rings even with the island closed.
  timer.loop = window.setInterval(() => {
    if (timerLeft() > 0) return;
    window.clearInterval(timer.loop);
    timer.running = false;
    timer.left = 0;
    window.dispatchEvent(new CustomEvent("komori-notice", {
      detail: { title: "¡Se acabó el tiempo!", message: `Terminó el temporizador de ${minutesLabel(timer.total)}.`, sticky: true },
    }));
  }, 250);
}

function pauseTimer() {
  if (!timer.running) return;
  timer.left = timerLeft();
  timer.running = false;
  window.clearInterval(timer.loop);
}

function setTimer(ms: number) {
  pauseTimer();
  timer.total = timer.left = Math.max(1000, Math.min(ms, 24 * 3600_000));
}

/** For the Home card: how the timer is doing, and a play/pause. */
export function timerInfo() {
  return { left: timerLeft(), total: timer.total, running: timer.running, text: fmtLeft(timerLeft()) };
}

export function toggleTimer() {
  if (timer.running) pauseTimer();
  else if (timer.left > 0) startTimer();
  else {
    setTimer(timer.total);
    startTimer();
  }
}

// ── Board ────────────────────────────────────────────────────────────────────

type Stroke = { color: string; size: number; erase: boolean; points: [number, number][] };
const board = { strokes: [] as Stroke[], color: "#8fe3c0", size: 4, erase: false };
const COLORS = ["#f4f1ea", "#8fe3c0", "#7dd3fc", "#f9a8d4", "#fde68a", "#ff8a80", "#b39ae0", "#1f2328"];
const SIZES = [2, 4, 9];

function paint(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = canvas.width / canvas.clientWidth || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  for (const s of strokes) line(ctx, s);
}

function line(ctx: CanvasRenderingContext2D, s: Stroke, from = 0) {
  ctx.save();
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pts = s.points;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], s.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    const start = Math.max(0, from - 1);
    ctx.moveTo(pts[start][0], pts[start][1]);
    for (let i = start + 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

// ── The tab ──────────────────────────────────────────────────────────────────

/** The tab with its three tools, or just one of them (for a Home card). */
export function toolsModule(only?: Tool) {
  const body = h("div", { class: "tools-body" });
  const tabs = h("div", { class: "seg tools-tabs" });
  const el = only ? h("section", { class: "module tools single" }, body) : h("section", { class: "module tools" }, tabs, body);
  let tick: (() => void) | null = null;
  // This copy's tool (the tab remembers its last one for next time).
  let mine: Tool = only ?? tool;

  const choices: [Tool, string, string][] = [["watch", "Cronómetro", STOPWATCH], ["timer", "Temporizador", HOURGLASS], ["board", "Pizarra", BRUSH]];
  function drawTabs() {
    tabs.replaceChildren(...choices.map(([id, label, path]) =>
      h("button", { class: id === mine ? "on" : "", onclick: () => {
        tool = id;
        mine = id;
        draw();
      } }, icon(path, 14), label)));
  }

  function draw() {
    drawTabs();
    body.replaceChildren();
    tick = null;
    if (mine === "watch") drawWatch();
    else if (mine === "timer") drawTimer();
    else drawBoard();
  }

  function drawWatch() {
    const big = h("span", { class: "tw-main" });
    const small = h("span", { class: "tw-small" });
    const laps = h("div", { class: "tw-laps" });
    const go = h("button", { class: "tw-btn primary" });
    const lap = h("button", { class: "tw-btn" });
    const show = () => {
      const t = fmtWatch(watchNow());
      big.textContent = t.main;
      small.textContent = t.small;
    };
    const drawButtons = () => {
      go.textContent = watch.running ? "Pausar" : watchNow() > 0 ? "Seguir" : "Iniciar";
      lap.textContent = watch.running ? "Vuelta" : "Reiniciar";
      (lap as HTMLButtonElement).disabled = !watch.running && watchNow() === 0;
      laps.replaceChildren(...watch.laps.map((ms, i) => {
        const prev = i ? watch.laps[i - 1] : 0;
        const t = fmtWatch(ms - prev);
        const all = fmtWatch(ms);
        return h("div", { class: "tw-lap" }, h("span", { text: `Vuelta ${i + 1}` }), h("b", { text: t.main + t.small }), h("span", { text: all.main + all.small }));
      }).reverse());
    };
    go.addEventListener("click", () => {
      if (watch.running) {
        watch.base = watchNow();
        watch.running = false;
      } else {
        watch.since = performance.now();
        watch.running = true;
      }
      drawButtons();
    });
    lap.addEventListener("click", () => {
      if (watch.running) watch.laps.push(watchNow());
      else {
        watch.base = 0;
        watch.laps = [];
      }
      drawButtons();
      show();
    });
    body.append(h("div", { class: "tw" },
      h("div", { class: "tw-face" }, big, small),
      h("div", { class: "tw-actions" }, lap, go),
      laps,
    ));
    show();
    drawButtons();
    // Fast enough for the hundredths while the tab is visible.
    const loop = () => {
      if (!body.isConnected || mine !== "watch") return;
      show();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  function drawTimer() {
    const r = 92;
    const len = 2 * Math.PI * r;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 210 210");
    svg.setAttribute("class", "tt-ring");
    svg.innerHTML = `<circle cx="105" cy="105" r="${r}" class="track"/><circle cx="105" cy="105" r="${r}" class="fill" stroke-dasharray="${len} ${len}" transform="rotate(-90 105 105)"/>`;
    const fill = svg.querySelector(".fill") as SVGCircleElement;
    const left = h("span", { class: "tt-left" });
    const of = h("span", { class: "tt-of" });
    const go = h("button", { class: "tw-btn primary" });
    const reset = h("button", { class: "tw-btn", text: "Reiniciar" });
    const show = () => {
      const ms = timerLeft();
      left.textContent = fmtLeft(ms);
      of.textContent = `de ${minutesLabel(timer.total)}`;
      fill.setAttribute("stroke-dashoffset", String(len * (1 - ms / timer.total)));
      go.textContent = timer.running ? "Pausar" : ms === timer.total ? "Iniciar" : ms > 0 ? "Seguir" : "Listo";
      (go as HTMLButtonElement).disabled = ms <= 0 && !timer.running;
    };
    go.addEventListener("click", () => {
      if (timer.running) pauseTimer();
      else startTimer();
      show();
    });
    reset.addEventListener("click", () => {
      setTimer(timer.total);
      show();
    });
    const presets = h("div", { class: "tt-presets" },
      ...[1, 3, 5, 10, 15, 25, 45, 60].map((m) => h("button", { class: "chip", text: `${m} min`, onclick: () => {
        setTimer(m * 60_000);
        show();
      } })));
    const mins = h("input", { class: "c2-in", type: "number", min: "0", max: "999", placeholder: "min" }) as HTMLInputElement;
    const secs = h("input", { class: "c2-in", type: "number", min: "0", max: "59", placeholder: "s" }) as HTMLInputElement;
    const own = h("button", { class: "chip", text: "Usar", onclick: () => {
      const ms = ((Number(mins.value) || 0) * 60 + (Number(secs.value) || 0)) * 1000;
      if (ms > 0) {
        setTimer(ms);
        show();
      }
    } });
    body.append(h("div", { class: "tt" },
      h("div", { class: "tt-dial" }, svg, h("div", { class: "tt-read" }, left, of)),
      h("div", { class: "tt-side" },
        h("b", { text: "Tiempo" }),
        presets,
        h("div", { class: "tt-own" }, mins, h("span", { text: ":" }), secs, own),
        h("div", { class: "tw-actions" }, reset, go),
        h("p", { class: "tt-hint", text: "Te aviso con la mascota aunque cierres la isla." }),
      ),
    ));
    show();
    tick = show;
  }

  function drawBoard() {
    const canvas = h("canvas", { class: "tb-canvas" }) as HTMLCanvasElement;
    const bar = h("div", { class: "tb-bar" });
    const status = h("span", { class: "tb-status" });
    const drawBar = () => {
      bar.replaceChildren(
        ...COLORS.map((c) => h("button", { class: !board.erase && board.color === c ? "tb-color on" : "tb-color", style: { background: c }, title: c, onclick: () => {
          board.color = c;
          board.erase = false;
          drawBar();
        } })),
        h("span", { class: "tb-sep" }),
        ...SIZES.map((s) => h("button", { class: board.size === s ? "tb-size on" : "tb-size", title: `Grosor ${s}`, onclick: () => {
          board.size = s;
          drawBar();
        } }, h("i", { style: { width: `${s + 2}px`, height: `${s + 2}px` } }))),
        h("span", { class: "tb-sep" }),
        h("button", { class: board.erase ? "tb-tool on" : "tb-tool", onclick: () => {
          board.erase = !board.erase;
          drawBar();
        } }, "Borrador"),
        h("button", { class: "tb-tool", onclick: () => {
          board.strokes.pop();
          paint(canvas, board.strokes);
        } }, "Deshacer"),
        h("button", { class: "tb-tool", onclick: () => {
          board.strokes = [];
          paint(canvas, board.strokes);
        } }, "Limpiar"),
        h("span", { class: "spacer" }),
        status,
        h("button", { class: "tb-tool save", onclick: async () => {
          if (!IN_APP) return;
          // A dark backdrop under the strokes, so light ink shows in any viewer.
          const out = document.createElement("canvas");
          out.width = canvas.width;
          out.height = canvas.height;
          const ctx = out.getContext("2d")!;
          ctx.fillStyle = "#14191c";
          ctx.fillRect(0, 0, out.width, out.height);
          ctx.drawImage(canvas, 0, 0);
          const path = await Bridge.saveDrawing(out.toDataURL("image/png"));
          status.textContent = path ? "Guardado en la carpeta de dibujos" : "No se pudo guardar";
        } }, "Guardar"),
        h("button", { class: "tb-tool", title: "Abrir la carpeta de dibujos", onclick: () => void Bridge.openDrawingsFolder() }, "Carpeta"),
      );
    };
    body.append(h("div", { class: "tb" }, bar, canvas));
    drawBar();

    // Size the canvas to its box, then paint what was drawn before.
    requestAnimationFrame(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      paint(canvas, board.strokes);
    });

    let current: Stroke | null = null;
    const at = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      current = { color: board.color, size: board.erase ? board.size * 3 : board.size, erase: board.erase, points: [at(e)] };
      board.strokes.push(current);
      const ctx = canvas.getContext("2d");
      if (ctx) line(ctx, current);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!current) return;
      current.points.push(at(e));
      const ctx = canvas.getContext("2d");
      if (ctx) line(ctx, current, current.points.length - 1);
    });
    const end = () => (current = null);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  draw();
  return { el, tick: () => tick?.() };
}
