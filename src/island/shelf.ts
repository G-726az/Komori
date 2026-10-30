// The shelf: drag files onto the island and decide what to do with them —
// keep them on the shelf for a while, open them, show them in their folder,
// copy their path, or copy them to the Desktop or Downloads. The shelf only
// remembers paths (nothing is moved). Komori's own design.

import { Bridge, IN_APP, type FileInfo } from "../shared/bridge";
import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import type { ModuleView } from "./modules";

export const TRAY = "M4 13h4.5l1.5 2.5h4l1.5-2.5H20v6H4v-6zm1.6-8h12.8L21 11.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8.5L5.6 5zm1.2 2-1.9 4.5h4.7l1.5 2.5h1.8l1.5-2.5h4.7L17.2 7H6.8z";
const DROP = "M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3V3zM4 18h16v2H4v-2z";
const FOLDER = "M3 5h6l2 2h10v12H3V5z";
const LINK = "M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zM8 17a3 3 0 0 1-2.1-5.1l2-2 1.4 1.4-2 2A1 1 0 0 0 8.7 15l2-2 1.4 1.4-2 2A3 3 0 0 1 8 17zm8-3.9-1.4-1.4 2-2a1 1 0 0 0-1.4-1.4l-2 2-1.4-1.4 2-2A3 3 0 0 1 18 11.1l-2 2z";
const OPEN = "M14 3h7v7h-2V6.4l-7.3 7.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z";
const COPY = "M8 3h11a2 2 0 0 1 2 2v11h-2V5H8V3zM4 7h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1 2v10h9V9H5z";
const PIN = "M5 4h14v2h-1.6l-1 6 2.6 2.5V16h-6v5l-1 1-1-1v-5H5v-1.5L7.6 12l-1-6H5V4z";

const KEY = "komori-shelf";

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let items: string[] = load();
/** Just dropped, waiting for a decision. */
let pending: string[] | null = null;
let dragging = false;
let said = "";
let saidTimer = 0;
const fns = new Set<() => void>();

function changed() {
  for (const fn of fns) fn();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-60)));
  } catch {
    // Storage full: the shelf still works until Komori closes.
  }
}

function say(text: string) {
  said = text;
  window.clearTimeout(saidTimer);
  saidTimer = window.setTimeout(() => {
    said = "";
    changed();
  }, 3200);
  changed();
}

export function shelfCount(): number {
  return items.length;
}

export function shelfPending(): boolean {
  return !!pending;
}

/** A file is being dragged over the island right now: it should stay open. */
export function shelfBusy(): boolean {
  return dragging;
}

/** Files are being dragged over the island (or left again). */
export function shelfDrag(on: boolean) {
  if (dragging === on) return;
  dragging = on;
  changed();
}

/** Files were dropped: ask what to do with them. */
export function shelfDrop(paths: string[]) {
  dragging = false;
  pending = paths.length ? [...new Set(paths)] : null;
  changed();
}

// ── File details and icons, asked once per path ──────────────────────────────

const infos = new Map<string, FileInfo>();
const icons = new Map<string, string | null>();

async function lookUp(paths: string[]) {
  const missing = paths.filter((p) => !infos.has(p));
  if (!missing.length) return;
  const found = IN_APP ? await Bridge.shelfInfo(missing) : missing.map((p) => demoInfo(p));
  for (const f of found ?? []) infos.set(f.path, f);
  const ic = IN_APP ? await Bridge.appIcons(missing) : null;
  missing.forEach((p, i) => icons.set(p, ic?.[i] ?? null));
  changed();
}

function demoInfo(path: string): FileInfo {
  const name = path.split(/[\\/]/).pop() ?? path;
  return { path, name, size: name.length * 41_000, isDir: !name.includes("."), exists: true };
}

function size(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

function fileIcon(path: string, px: number): HTMLElement {
  const src = icons.get(path);
  const info = infos.get(path);
  if (src) return h("img", { class: "sh-ic", src, alt: "", width: String(px), height: String(px) });
  return h("span", { class: "sh-ic none" }, icon(info?.isDir ? FOLDER : I.note, px * 0.7));
}

const nameOf = (p: string) => infos.get(p)?.name ?? p.split(/[\\/]/).pop() ?? p;

// ── What to do with dropped files ────────────────────────────────────────────

async function act(kind: string, paths: string[]) {
  const n = paths.length;
  const files = n === 1 ? "el archivo" : `los ${n} archivos`;
  try {
    if (kind === "keep") {
      items = [...items.filter((p) => !paths.includes(p)), ...paths];
      save();
      say(n === 1 ? "Guardado en el estante" : `${n} archivos en el estante`);
    } else if (kind === "open") {
      for (const p of paths.slice(0, 5)) await Bridge.launch(p);
    } else if (kind === "reveal") {
      await Bridge.shelfReveal(paths[0]);
    } else if (kind === "path") {
      await navigator.clipboard.writeText(paths.join("\n"));
      say(n === 1 ? "Ruta copiada" : "Rutas copiadas");
    } else if (kind === "desktop" || kind === "downloads") {
      const out = await Bridge.shelfCopyTo(paths, kind);
      say(out.length ? `Copié ${files} ${kind === "desktop" ? "al Escritorio" : "a Descargas"}` : "Las carpetas no se copian");
    }
    pending = null;
    changed();
  } catch (e) {
    say(e instanceof Error ? e.message : "No se pudo");
  }
}

// ── The page ─────────────────────────────────────────────────────────────────

export function shelfPage(): { el: HTMLElement; update: () => void; stop: () => void } {
  const el = h("div", { class: "sh" });

  const draw = () => {
    el.classList.toggle("dragging", dragging);
    if (dragging) {
      el.replaceChildren(h("div", { class: "sh-zone active" },
        h("span", { class: "sh-zone-ic" }, icon(DROP, 24)),
        h("b", { text: "Suéltalo aquí" }),
        h("span", { text: "Luego eliges qué hacer con él" })));
      return;
    }
    const top = h("div", { class: "sh-top" });
    if (pending) {
      const p = pending;
      void lookUp(p);
      const dirsOnly = p.every((x) => infos.get(x)?.isDir);
      const btn = (kind: string, ic: string, text: string, disabled = false) =>
        h("button", { class: kind === "keep" ? "sh-act main" : "sh-act", disabled, onclick: () => void act(kind, p) }, icon(ic, 14), text);
      el.replaceChildren(
        h("div", { class: "sh-ask" },
          h("b", { class: "sh-q", text: p.length === 1 ? "¿Qué hago con esto?" : `¿Qué hago con estos ${p.length}?` }),
          h("div", { class: "sh-chips" }, ...p.slice(0, 12).map((x) => h("span", { class: "sh-chip", title: x }, fileIcon(x, 16), h("span", { text: nameOf(x) })))),
          h("div", { class: "sh-acts" },
            btn("keep", PIN, "Guardar en el estante"),
            btn("open", OPEN, "Abrir"),
            btn("reveal", FOLDER, "Mostrar en carpeta"),
            btn("path", LINK, "Copiar ruta"),
            btn("desktop", COPY, "Copiar al Escritorio", dirsOnly),
            btn("downloads", COPY, "Copiar a Descargas", dirsOnly),
            h("button", { class: "sh-act ghost", onclick: () => { pending = null; changed(); } }, "Cancelar"),
          ),
        ),
      );
      return;
    }

    // The shelf itself.
    void lookUp(items);
    top.append(h("span", { class: "sh-count", text: items.length ? `${items.length} en el estante` : "Estante" }));
    if (said) top.append(h("span", { class: "sh-said", text: said }));
    if (items.length) top.append(h("button", { class: "sh-clear", onclick: () => { items = []; save(); changed(); } }, "Vaciar"));
    if (!items.length) {
      el.replaceChildren(top, h("div", { class: "sh-zone" },
        h("span", { class: "sh-zone-ic" }, icon(TRAY, 22)),
        h("b", { text: "Arrastra archivos a la isla" }),
        h("span", { text: "Te pregunto qué hacer: guardarlos aquí, abrirlos, copiarlos…" })));
      return;
    }
    const row = h("div", { class: "sh-row" }, ...items.slice().reverse().map((p) => {
      const info = infos.get(p);
      const gone = info && !info.exists;
      return h("div", { class: gone ? "sh-tile gone" : "sh-tile", title: gone ? `${p}\n(ya no está ahí)` : p },
        h("button", { class: "sh-open", onclick: () => !gone && void Bridge.launch(p) },
          fileIcon(p, 32),
          h("span", { class: "sh-name", text: nameOf(p) }),
          h("span", { class: "sh-size", text: gone ? "Ya no está" : info ? (info.isDir ? "Carpeta" : size(info.size)) : "" })),
        h("div", { class: "sh-tools" },
          h("button", { title: "Mostrar en carpeta", disabled: !!gone, onclick: () => void Bridge.shelfReveal(p) }, icon(FOLDER, 12)),
          h("button", { title: "Copiar ruta", onclick: () => void act("path", [p]) }, icon(LINK, 12)),
          h("button", { title: "Quitar del estante", onclick: () => { items = items.filter((x) => x !== p); save(); changed(); } }, icon(I.close, 12))),
      );
    }));
    // A vertical wheel scrolls the row sideways.
    row.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        row.scrollLeft += e.deltaY;
        e.stopPropagation();
      }
    }, { passive: true });
    el.replaceChildren(top, row);
  };

  fns.add(draw);
  draw();
  return { el, update: () => {}, stop: () => fns.delete(draw) };
}

/** The same page as a tab of the full island. */
export function shelfModule(): ModuleView {
  const page = shelfPage();
  return { el: h("div", { class: "sh-full" }, page.el) };
}

// Browser only: ?shelf=drop pretends some files were just dropped.
if (!IN_APP && new URLSearchParams(location.search).get("shelf") === "drop") {
  pending = ["C:\\Users\\demo\\Documents\\Informe trimestral.pdf", "C:\\Users\\demo\\Pictures\\atardecer.jpg", "C:\\Users\\demo\\Proyectos"];
}
