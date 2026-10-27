// The "GitHub" tab: unread notifications, pull requests waiting for your
// review, and your own open pull requests. A click opens the page in the
// browser. It looks again every 10 minutes while Komori runs (only with a token).

import { Bridge, IN_APP, type GithubItem, type GithubSummary } from "../shared/bridge";
import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { settings } from "../shared/settings";

export const BRANCH = "M7 3a3 3 0 0 0-1 5.83v6.34A3 3 0 1 0 8 15.2V13a2 2 0 0 1 2-2h4a4 4 0 0 0 4-4v-.17a3 3 0 1 0-2 0V7a2 2 0 0 1-2 2h-4c-.73 0-1.41.2-2 .54V8.83A3 3 0 0 0 7 3zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm10 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM7 17a1 1 0 1 1 0 2 1 1 0 0 1 0-2z";
const CHECK = "M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z";
const REFRESH = "M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.3L13 11h7V4l-2.3 2.3z";
const EVERY_MS = 10 * 60 * 1000;

let data: GithubSummary | null = null;
let error = "";
let at = 0;
let loading = false;
const listeners = new Set<() => void>();

/** Unread notifications, for the badge on the closed island. */
export function githubCount(): number {
  return settings().github.notifications ? (data?.notifications.length ?? 0) : 0;
}

/** The last summary (null without a token or before the first answer). */
export function githubData(): GithubSummary | null {
  return data;
}

export function onGithub(fn: () => void) {
  listeners.add(fn);
}

export async function refreshGithub(force = false) {
  if (loading || !IN_APP) return;
  if (!force && Date.now() - at < 60_000) return;
  if (!(await Bridge.secretHas("github"))) {
    data = null;
    error = "";
    for (const fn of listeners) fn();
    return;
  }
  loading = true;
  for (const fn of listeners) fn();
  try {
    data = await Bridge.githubSummary();
    error = "";
  } catch (err) {
    error = (err as Error).message;
  }
  loading = false;
  at = Date.now();
  for (const fn of listeners) fn();
}

export function startGithub() {
  void refreshGithub(true);
  window.setInterval(() => void refreshGithub(true), EVERY_MS);
}

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (!t) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return `${hrs} h`;
  return `${Math.floor(hrs / 24)} d`;
}

const REASONS: Record<string, string> = {
  review_requested: "te piden revisión",
  mention: "te mencionaron",
  team_mention: "mencionaron a tu equipo",
  assign: "te lo asignaron",
  author: "lo creaste tú",
  comment: "nuevo comentario",
  state_change: "cambió de estado",
  ci_activity: "CI",
  subscribed: "sigues el repo",
  manual: "lo sigues",
};

function row(item: GithubItem, onRead?: () => void) {
  const b = h("div", { class: "gh-item" },
    h("button", { class: "gh-open", onclick: () => void Bridge.githubOpen(item.url) },
      h("b", { text: item.title }),
      h("span", { text: [item.repo, REASONS[item.reason] ?? "", ago(item.updated)].filter(Boolean).join(" · ") }),
    ),
    onRead ? h("button", { class: "gh-read", title: "Marcar como leída", onclick: onRead }, icon(CHECK, 14)) : null,
  );
  return b;
}

export function githubModule() {
  const el = h("section", { class: "module github" });

  function draw() {
    if (!el.isConnected && el.childElementCount) {
      // An older copy of the tab: stop following.
      listeners.delete(draw);
      return;
    }
    el.replaceChildren();
    if (!IN_APP || (!data && !error && !loading)) {
      el.append(h("div", { class: "music-empty" },
        h("span", { class: "music-empty-icon" }, icon(BRANCH, 28)),
        h("h3", { text: "Conecta tu GitHub" }),
        h("p", { text: "Agrega un token en Ajustes → GitHub para ver tus notificaciones y pull requests." }),
        h("button", { class: "notes-new", onclick: () => void Bridge.openSettings("github") }, icon(I.gear, 14), "Abrir ajustes"),
      ));
      return;
    }
    const prefs = settings().github;
    const head = h("div", { class: "gh-head" },
      h("b", { text: data?.login ? `@${data.login}` : "GitHub" }),
      h("span", { class: "gh-when", text: loading ? "Actualizando…" : at ? `Actualizado ${ago(new Date(at).toISOString())}` : "" }),
      h("span", { class: "spacer" }),
      h("button", { class: "chat-new", onclick: () => void refreshGithub(true) }, icon(REFRESH, 14), "Actualizar"),
    );
    el.append(head);
    if (error) el.append(h("p", { class: "gh-error", text: error }));
    const cols = h("div", { class: "gh-cols" });
    const column = (title: string, items: GithubItem[], empty: string, read = false) => {
      const box = h("div", { class: "gh-col" }, h("div", { class: "gh-col-head" }, h("b", { text: title }), h("span", { class: "gh-count", text: String(items.length) })));
      const list = h("div", { class: "gh-list" });
      if (!items.length) list.append(h("p", { class: "gh-empty", text: empty }));
      for (const it of items) {
        list.append(row(it, read ? async () => {
          await Bridge.githubMarkRead(it.id);
          if (data) data = { ...data, notifications: data.notifications.filter((n) => n.id !== it.id) };
          for (const fn of listeners) fn();
        } : undefined));
      }
      box.append(list);
      cols.append(box);
    };
    if (prefs.notifications) column("Notificaciones", data?.notifications ?? [], "Todo leído.", true);
    if (prefs.reviews) column("Esperan tu revisión", data?.reviews ?? [], "Nada pendiente.");
    if (prefs.mine) column("Tus pull requests", data?.mine ?? [], "No tienes PRs abiertos.");
    el.append(cols);
  }

  listeners.add(draw);
  draw();
  void refreshGithub();
  return { el };
}
