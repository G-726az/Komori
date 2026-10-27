// Claude Code notices on the island: when a task is done, when Claude asks
// something or needs a permission. Komori can't answer for Claude (that stays
// in Claude), so every notice has "Abrir Claude", which brings forward the very
// window the session runs in.

import { Bridge, IN_APP, on } from "../shared/bridge";
import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { settings } from "../shared/settings";

export interface ClaudeEvent {
  kind: "working" | "done" | "question" | "permission" | "waiting" | "ended";
  session: string;
  project: string;
  message: string;
  questions: { header: string; question: string; options: string[] }[];
}

const SPARK = "M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z";

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
  return h("div", { class: `alert-card ${ev.kind}` },
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

export function handleClaude(ev: ClaudeEvent, host: AlertHost) {
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
