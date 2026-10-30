// Claude Code notices on the island: when a task is done, when Claude asks
// something or needs a permission. Komori can't answer for Claude (that stays
// in Claude), so every notice has "Abrir Claude", which brings forward the very
// window the session runs in.

import { Bridge, IN_APP, on } from "../shared/bridge";
import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { settings } from "../shared/settings";

export interface ClaudeEvent {
  kind: "working" | "tool" | "done" | "question" | "permission" | "waiting" | "ended";
  /** For "tool": the tool Claude is about to use. */
  tool?: string;
  /** For "tool": what it works on (claude.rs `snippet`). */
  snippet?: Snippet | null;
  session: string;
  project: string;
  message: string;
  questions: { header: string; question: string; options: string[] }[];
}

export const SPARK = "M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z";

/** Sessions Claude is working on right now. */
const working = new Set<string>();

export interface AlertHost {
  /** Show this card (replacing any other). */
  show(card: HTMLElement, sticky: boolean): void;
  /** Take the card away. */
  hide(): void;
  /** Claude busy or not, for the pill. */
  busy(on: boolean): void;
  react(kind: ClaudeEvent["kind"]): void;
}

let shownSession: string | null = null;

/** A soft two-note chime, made on the spot (no sound files). */
function chime(kind: ClaudeEvent["kind"], always = false) {
  if (!always && !settings().claude.sound) return;
  try {
    const ac = new AudioContext();
    const notes = kind === "done" ? [784, 1046.5] : [659.3, 523.3];
    notes.forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ac.currentTime + i * 0.14;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
    window.setTimeout(() => void ac.close(), 1200);
  } catch {
    // No sound available: the notice still shows.
  }
}

function card(ev: ClaudeEvent, host: AlertHost): HTMLElement {
  const titles: Record<string, string> = {
    done: "Claude terminó",
    question: ev.questions.length > 1 ? "Claude te hace unas preguntas" : "Claude te hace una pregunta",
    permission: "Claude necesita tu permiso",
    waiting: "Claude espera tu respuesta",
  };
  const body = h("div", { class: "alert-body" });
  if (ev.kind === "question" && ev.questions.length) {
    for (const q of ev.questions) {
      body.append(h("div", { class: "alert-q" },
        q.header ? h("span", { class: "alert-tag", text: q.header }) : null,
        h("p", { text: q.question }),
        q.options.length ? h("div", { class: "alert-opts" }, ...q.options.map((o) => h("span", { text: o }))) : null,
      ));
    }
    body.append(h("p", { class: "alert-hint", text: "Respóndelas en Claude." }));
  } else if (ev.message) {
    body.append(h("p", { class: "alert-msg", text: ev.message }));
  }
  const openBtn = h("button", { class: "alert-open", onclick: () => {
    void Bridge.claudeFocus(ev.session);
    host.hide();
  } }, icon(SPARK, 14), "Abrir Claude");
  return h("div", { class: `alert-card ${ev.kind}`, "data-claude": ev.kind },
    h("div", { class: "alert-head" },
      h("span", { class: "alert-icon" }, icon(ev.kind === "done" ? SPARK : I.chat, 16)),
      h("div", { class: "alert-titles" },
        h("b", { text: titles[ev.kind] ?? "Claude" }),
        ev.project ? h("span", { text: ev.project }) : null,
      ),
      h("button", { class: "alert-x", title: "Cerrar", onclick: () => host.hide() }, icon(I.close, 13)),
    ),
    body,
    h("div", { class: "alert-actions" }, openBtn),
  );
}

// ── The task in progress: which steps Claude went through, and for how long ──

/** A change to a file, a command, or a file being read. */
export type Snippet =
  | { kind: "edit"; file: string; path: string; line: number; old: string[]; new: string[]; before?: string[]; after?: string[] }
  | { kind: "command"; command: string[]; about: string }
  | { kind: "read"; file: string; path: string };

export type Step = "read" | "edit" | "test" | "done";
export const STEPS: { id: Step; label: string; doing: string }[] = [
  { id: "read", label: "Leer", doing: "Leyendo" },
  { id: "edit", label: "Editar", doing: "Editando" },
  { id: "test", label: "Probar", doing: "Probando" },
  { id: "done", label: "Listo", doing: "Listo" },
];

export interface Progress {
  session: string;
  project: string;
  /** Date.now() when the prompt was sent, and when it finished. */
  started: number;
  ended: number | null;
  state: "working" | "waiting" | "done";
  seen: Step[];
  now: Step | null;
  /** The last few things it did: [step, what]. */
  log: { step: Step | null; what: string }[];
  /** Claude's answer, once done. */
  reply: string;
  /** The last thing worth showing: an edit, a command, a read. */
  snippet: Snippet | null;
}

function stepOf(tool: string): Step | null {
  if (/^(Read|Grep|Glob|LS|WebFetch|WebSearch|NotebookRead)$/.test(tool)) return "read";
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) return "edit";
  if (/^(Bash|PowerShell|BashOutput|Monitor)$/.test(tool)) return "test";
  return null;
}

let progress: Progress | null = null;
const progressFns = new Set<(p: Progress | null) => void>();

export function claudeProgress(): Progress | null {
  return progress;
}

export function onClaudeProgress(fn: (p: Progress | null) => void): () => void {
  progressFns.add(fn);
  return () => progressFns.delete(fn);
}

function track(ev: ClaudeEvent) {
  const fresh = (): Progress => ({
    session: ev.session, project: ev.project, started: Date.now(), ended: null,
    state: "working", seen: [], now: null, log: [], reply: "", snippet: null,
  });
  let p = progress;
  if (ev.kind === "working") p = fresh();
  else if (!p || p.session !== ev.session) {
    // Joined halfway (Komori started after the prompt): follow it from here.
    if (ev.kind !== "tool") return;
    p = fresh();
  }
  if (ev.kind === "tool") {
    const step = stepOf(ev.tool ?? "");
    if (step) {
      p.now = step;
      if (!p.seen.includes(step)) p.seen = [...p.seen, step];
    }
    p.state = "working";
    p.log = [...p.log, { step, what: ev.message || ev.tool || "" }].slice(-4);
    if (ev.snippet) p.snippet = ev.snippet;
  } else if (ev.kind === "done") {
    p.state = "done";
    p.ended = Date.now();
    p.now = "done";
    p.seen = [...p.seen.filter((x) => x !== "done"), "done"];
    p.reply = ev.message;
  } else if (ev.kind === "question" || ev.kind === "permission" || ev.kind === "waiting") {
    p.state = "waiting";
  } else if (ev.kind === "ended" && p.state !== "done") {
    p.state = "done";
    p.ended = Date.now();
  }
  progress = { ...p };
  for (const fn of progressFns) fn(progress);
}

export function handleClaude(ev: ClaudeEvent, host: AlertHost) {
  track(ev);
  // A step of the task only feeds the progress page.
  if (ev.kind === "tool") return;
  const prefs = settings().claude;
  if (ev.kind === "working") {
    working.add(ev.session);
    host.busy(prefs.working);
    // Claude moved on: an old question for this session no longer applies.
    if (shownSession === ev.session) host.hide();
    return;
  }
  working.delete(ev.session);
  host.busy(prefs.working && working.size > 0);
  if (ev.kind === "ended") {
    if (shownSession === ev.session) host.hide();
    return;
  }
  const wanted = ev.kind === "done" ? prefs.done : ev.kind === "question" ? prefs.question : prefs.permission;
  if (!wanted) return;
  shownSession = ev.session;
  host.show(card(ev, host), ev.kind !== "done");
  host.react(ev.kind);
  chime(ev.kind);
}

export function startClaude(host: AlertHost) {
  void on<ClaudeEvent>("claude-event", (ev) => handleClaude(ev, host));
  // In a plain browser, ?claude=done|question|permission shows a pretend notice.
  const demo = !IN_APP ? new URLSearchParams(location.search).get("claude") : null;
  if (demo === "progress") return demoProgress(host);
  if (demo) {
    window.setTimeout(() => handleClaude({
      kind: demo as ClaudeEvent["kind"],
      session: "demo",
      project: "Komori",
      message: demo === "done"
        ? "Listo: terminé los cambios de la fase 5 y la app ya está instalada. ¿Sigo con la siguiente fase?"
        : "Claude necesita tu permiso para usar Bash",
      questions: demo === "question"
        ? [{ header: "Color", question: "¿Qué color prefieres para la mascota?", options: ["Fucsia", "Menta", "Lavanda"] },
           { header: "Peinado", question: "¿Y qué peinado?", options: ["Largo", "Coletas"] }]
        : [],
    }, host), 1200);
  }
}

/** Browser only (?claude=progress): a pretend task going through its steps. */
function demoProgress(host: AlertHost) {
  const base = { session: "demo", project: "tienda-web", message: "", questions: [] };
  const steps: [number, Partial<ClaudeEvent>][] = [
    [300, { kind: "working" }],
    [900, { kind: "tool", tool: "Grep", message: "calcularTotal" }],
    [1800, { kind: "tool", tool: "Read", message: "carrito.ts", snippet: { kind: "read", file: "carrito.ts", path: "src/carrito.ts" } }],
    [3200, { kind: "tool", tool: "Edit", message: "carrito.ts", snippet: { kind: "edit", file: "carrito.ts", path: "src/carrito.ts", line: 12,
      before: ["import { Producto } from './tipos';", "", ""], old: ["const IVA = 0.12;"], new: ["const IVA = 0.15; // desde 2026"],
      after: ["", "export function total(items: Producto[]) {", "  const suma = items.reduce((s, i) => s + i.precio, 0);", "  return suma * (1 + IVA);"] } }],
    [4600, { kind: "tool", tool: "Bash", message: "npm test", snippet: { kind: "command", command: ["npm test"], about: "Correr las pruebas" } }],
  ];
  // ?hold stops at the edit (to look at it).
  if (new URLSearchParams(location.search).has("hold")) steps.pop();
  for (const [at, e] of steps) window.setTimeout(() => handleClaude({ ...base, ...e } as ClaudeEvent, host), at);
  if (new URLSearchParams(location.search).has("done")) {
    window.setTimeout(() => handleClaude({ ...base, kind: "done",
      message: "Listo: el total ahora suma el IVA correctamente y pasan las 48 pruebas." }, host), 6000);
  }
}

/** A notice of Komori's own (a timer, a reminder), in the same card style. */
export interface Notice {
  title: string;
  message: string;
  /** Stays until closed. */
  sticky?: boolean;
  /** A button that does something (instead of only "Entendido"). */
  action?: { label: string; run: () => void };
}

export function showNotice(n: Notice, host: AlertHost) {
  shownSession = null;
  const card = h("div", { class: "alert-card done" },
    h("div", { class: "alert-head" },
      h("span", { class: "alert-icon" }, icon(SPARK, 16)),
      h("div", { class: "alert-titles" }, h("b", { text: n.title }), h("span", { text: "Komori" })),
      h("button", { class: "alert-x", title: "Cerrar", onclick: () => host.hide() }, icon(I.close, 13)),
    ),
    n.message ? h("div", { class: "alert-body" }, h("p", { class: "alert-msg", text: n.message })) : null,
    h("div", { class: "alert-actions" }, n.action
      ? h("button", { class: "alert-open", onclick: () => { host.hide(); n.action!.run(); } }, n.action.label)
      : h("button", { class: "alert-open", onclick: () => host.hide() }, "Entendido")),
  );
  host.show(card, !!n.sticky);
  host.react("done");
  chime("done", true);
}

/** Forget which session the card belonged to (it was closed). */
export function alertClosed() {
  shownSession = null;
}
