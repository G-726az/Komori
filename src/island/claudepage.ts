// The Claude Code page: the task Claude is on — its project, how long it has
// been at it, the steps it went through (Leer, Editar, Probar, Listo), what it
// is touching now, and its answer when it's done. Fed by the hooks (claude.ts).

import { Bridge, IN_APP } from "../shared/bridge";
import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { SPARK, STEPS, claudeProgress, onClaudeProgress, type Progress } from "./claude";
import type { ModuleView } from "./modules";

/** Claude's warm colour, for the island's tint while a task is on. */
const CLAUDE_TINT = "#6e3420";

function elapsed(p: Progress): string {
  const s = Math.max(0, Math.round(((p.ended ?? Date.now()) - p.started) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

function stateText(p: Progress): string {
  if (p.state === "done") return "Listo · terminó la tarea";
  if (p.state === "waiting") return "Te espera en Claude";
  const step = STEPS.find((s) => s.id === p.now);
  const last = p.log[p.log.length - 1];
  return step ? `${step.doing}${last?.what ? ` · ${last.what}` : ""}` : "Pensando…";
}

export function claudePage(tint: (c: string | null) => void = () => {}): { el: HTMLElement; update: () => void; stop: () => void } {
  const el = h("div", { class: "mc" });
  // null: nothing drawn yet (so "no task" is drawn too, not mistaken for "unchanged").
  let drawnFor: string | null = null;
  let time: HTMLElement | null = null;

  const empty = () => {
    tint(null);
    const hint = h("span", { class: "mc-hint", text: "Cuando Claude Code trabaje en algo, aquí verás sus pasos." });
    const box = h("div", { class: "mc-empty" }, h("span", { class: "mc-mark" }, icon(SPARK, 22)), h("b", { text: "Sin tareas de Claude Code" }), hint);
    el.replaceChildren(box);
    // Not connected yet: say where to turn it on.
    if (IN_APP) {
      void Bridge.claudeHooksStatus().then((on) => {
        if (on === false) {
          hint.textContent = "Conecta Komori con Claude Code para ver sus pasos.";
          box.append(h("button", { class: "mc-open", onclick: () => void Bridge.openSettings("claude") }, icon(I.gear, 13), "Abrir ajustes"));
        }
      });
    }
  };

  const draw = (p: Progress | null) => {
    if (!p) return empty();
    tint(CLAUDE_TINT);
    time = h("b", { class: "mc-time", text: elapsed(p) });
    const said = p.state === "done" && p.reply
      ? h("p", { class: "mc-said", text: p.reply })
      : h("ol", { class: "mc-log" }, ...p.log.slice().reverse().map((x, i) => h("li", { class: i === 0 ? "now" : "" },
          h("span", { text: STEPS.find((s) => s.id === x.step)?.label ?? "Otro" }), x.what)));
    el.replaceChildren(
      h("div", { class: "mc-top" },
        h("div", { class: "mc-left" },
          h("span", { class: "mc-proj" }, h("i", {}, icon(SPARK, 13)), p.project || "Claude Code"),
          time,
          h("span", { class: "mc-state", text: stateText(p) }),
        ),
        h("div", { class: "mc-right" }, said,
          h("button", { class: "mc-open", title: "Traer la ventana de Claude", onclick: () => void Bridge.claudeFocus(p.session) }, icon(SPARK, 13), "Abrir Claude")),
      ),
      h("div", { class: `mc-steps ${p.state}` }, ...STEPS.map((s) => h("div", {
        class: ["mc-step", p.seen.includes(s.id) ? "seen" : "", p.now === s.id ? "now" : ""].join(" ").trim(),
      }, h("i", {}), h("span", { text: s.label })))),
    );
  };

  const update = () => {
    const p = claudeProgress();
    const key = p ? JSON.stringify([p.session, p.started, p.state, p.seen, p.now, p.log, p.reply]) : "";
    if (key !== drawnFor) {
      drawnFor = key;
      draw(p);
    }
    if (p && time) time.textContent = elapsed(p);
  };
  const off = onClaudeProgress(() => update());
  update();
  return { el, update, stop: off };
}

// ── The full island's Claude Code tab ────────────────────────────────────────
// Left: the pet, the project, the time and the steps as a checklist. Right: what
// Claude is touching — the change to a file (removed lines red, added green),
// the command it runs, the file it reads — and its answer once it is done.

const CHECK = "M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z";
const TERM = "M3 5h18v14H3V5zm2 2v10h14V7H5zm1.6 1.6L10 12l-3.4 3.4-1.1-1.1L7.8 12 5.5 9.7l1.1-1.1zM11 14h6v1.6h-6V14z";

/** A small coloured tag for the kind of file (its extension). */
const LANGS: [RegExp, string, string][] = [
  [/\.tsx?$/i, "TS", "#3178c6"],
  [/\.jsx?$|\.mjs$/i, "JS", "#c9a400"],
  [/\.rs$/i, "RS", "#c46a3a"],
  [/\.py$/i, "PY", "#3572a5"],
  [/\.css$|\.scss$/i, "CSS", "#7a4fc4"],
  [/\.html?$/i, "HTML", "#e34c26"],
  [/\.json$/i, "JSON", "#6e8f2f"],
  [/\.md$/i, "MD", "#5a6b7a"],
  [/\.(cs|java|kt|go|php|rb|swift)$/i, "", "#5a6b7a"],
];

function langTag(file: string): HTMLElement {
  const found = LANGS.find(([re]) => re.test(file));
  const ext = (found?.[1] || file.split(".").pop() || "").slice(0, 4).toUpperCase();
  const tag = h("span", { class: "cc-lang", text: ext || "·" });
  tag.style.background = found?.[2] ?? "#5a6b7a";
  return tag;
}

/** The face is a copy of the pet; one for the whole session. */
let face: HTMLElement | null = null;

function viewOf(p: Progress): HTMLElement {
  const sn = p.snippet;
  // Done: the answer, plainly.
  if (p.state === "done" && p.reply) {
    return h("div", { class: "cc-view" },
      h("div", { class: "cc-tab" }, h("span", { class: "cc-ok" }, icon(CHECK, 13)), h("b", { text: "Terminado" })),
      h("p", { class: "cc-reply", text: p.reply }));
  }
  if (sn?.kind === "edit") {
    const rows: HTMLElement[] = [];
    const n = Math.max(1, sn.line || 1);
    const ctx = (t: string, num: number) => h("div", { class: "cc-ln" }, h("i", { text: String(num) }), h("s", { text: " " }), h("code", { text: t || " " }));
    const before = sn.line ? sn.before ?? [] : [];
    before.forEach((t, i) => rows.push(ctx(t, n - before.length + i)));
    sn.old.forEach((t, i) => rows.push(h("div", { class: "cc-ln del" },
      h("i", { text: String(n + i) }), h("s", { text: "-" }), h("code", { text: t || " " }))));
    sn.new.forEach((t, i) => rows.push(h("div", { class: "cc-ln add" },
      h("i", { text: String(n + i) }), h("s", { text: "+" }), h("code", { text: t || " " }))));
    const lastAdded = rows[rows.length - 1];
    if (p.state === "working" && lastAdded) lastAdded.classList.add("typing");
    if (sn.line) (sn.after ?? []).forEach((t, i) => rows.push(ctx(t, n + sn.new.length + i)));
    return h("div", { class: "cc-view" },
      h("div", { class: "cc-tab" }, langTag(sn.file), h("b", { text: sn.file }), h("i", { class: "cc-dirty" }), h("span", { class: "cc-path", text: sn.path })),
      h("div", { class: "cc-code" }, ...rows));
  }
  if (sn?.kind === "command") {
    return h("div", { class: "cc-view" },
      h("div", { class: "cc-tab" }, h("span", { class: "cc-term" }, icon(TERM, 13)), h("b", { text: sn.about || "Terminal" })),
      h("div", { class: "cc-code term" }, ...sn.command.map((t, i) => h("div", { class: "cc-ln" },
        h("s", { text: i === 0 ? "$" : " " }), h("code", { text: t || " " })))));
  }
  if (sn?.kind === "read") {
    return h("div", { class: "cc-view" },
      h("div", { class: "cc-tab" }, langTag(sn.file), h("b", { text: sn.file }), h("span", { class: "cc-path", text: sn.path })),
      h("div", { class: "cc-quiet" }, h("span", { text: "Leyendo el archivo…" })));
  }
  return h("div", { class: "cc-view" }, h("div", { class: "cc-quiet" }, h("span", { text: p.state === "waiting" ? "Te espera en Claude" : "Pensando…" })));
}

/** The same page as a tab of the full island, laid out for its room. */
export function claudeModule(pet?: { clone(size?: number): HTMLCanvasElement }): ModuleView {
  const el = h("div", { class: "cc" });
  let drawn: string | null = null;
  let tint: (c: string | null) => void = () => {};
  let time: HTMLElement | null = null;
  if (!face && pet) face = pet.clone(60);

  const draw = () => {
    const p = claudeProgress();
    const key = p ? JSON.stringify([p.session, p.started, p.state, p.seen, p.now, p.snippet, p.reply]) : "";
    if (key !== drawn) {
      drawn = key;
      tint(p ? CLAUDE_TINT : null);
      if (!p) {
        // Nothing yet: the compact page's empty state says it well.
        const empty = claudePage();
        el.replaceChildren(empty.el);
        time = null;
        return;
      }
      time = h("b", { class: "cc-time", text: elapsed(p) });
      const steps = h("ol", { class: "cc-steps" }, ...STEPS.map((s) => {
        const done = p.seen.includes(s.id) && (p.now !== s.id || s.id === "done");
        const now = p.now === s.id && p.state === "working" && s.id !== "done";
        return h("li", { class: now ? "now" : done ? "done" : "" },
          h("span", { class: "cc-mark" }, done ? icon(CHECK, 12) : null),
          s.label);
      }));
      el.replaceChildren(
        h("div", { class: "cc-who" },
          h("div", { class: `cc-face ${p.state}` }, face ?? h("span", { class: "mc-mark" }, icon(SPARK, 22)), h("span", { class: "cc-badge" })),
          h("b", { class: "cc-proj", text: p.project || "Claude Code" }),
          h("span", { class: "cc-sub", text: "Claude Code" }),
          time,
          steps,
          h("button", { class: "mc-open", title: "Traer la ventana de Claude", onclick: () => void Bridge.claudeFocus(p.session) }, icon(SPARK, 13), "Abrir Claude"),
        ),
        viewOf(p),
      );
    }
    if (p && time) time.textContent = elapsed(p);
  };
  const off = onClaudeProgress(() => {
    if (!el.isConnected && drawn !== null) return off();
    draw();
  });
  draw();
  return {
    el: h("div", { class: "mc-full" }, el),
    tick: () => draw(),
    tintWith(set) {
      tint = set;
      set(claudeProgress() ? CLAUDE_TINT : null);
    },
  };
}
