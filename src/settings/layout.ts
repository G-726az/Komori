// Ajustes → Inicio: arrange the Home page. Cards are pills on a 4-column grid
// (3 rows fit one screen). Drop a pill on any cell — empty cells are fine; if
// it lands on others, they step aside to the nearest free place. Pull a corner
// to resize. Everything moves with a little wobble, like jelly. Saved as you go.

import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { settings, updateSettings } from "../shared/settings";
import {
  DEFAULT_HOME, GRID, WIDGETS, WIDGET_GROUPS, freeSpot, newWidget, placeAll, rowsUsed, settle,
  type Placed, type WidgetKind,
} from "../shared/widgets";

const SPRING = "cubic-bezier(.34,1.56,.64,1)";
const RESIZE = "M20 14v6h-6v-2h2.6l-4.3-4.3 1.4-1.4 4.3 4.3V14h2zM10 4v2H7.4l4.3 4.3-1.4 1.4L6 7.4V10H4V4h6z";
const ROW = 78;
const GAP = 8;

let list: Placed[] = [];

export function homeSection(card: (title: string, hint: string | null, ...children: Node[]) => HTMLElement): Node[] {
  list = placeAll(settings().home ?? DEFAULT_HOME);
  const board = h("div", { class: "lay-board" });
  const guide = h("div", { class: "lay-guide" });
  const warn = h("p", { class: "lay-warn" });
  const wrap = h("div", { class: "lay-wrap" }, guide, board);

  const note = () => {
    warn.textContent = rowsUsed(list) > GRID.rows ? "Hay tarjetas más abajo de la primera pantalla: el Inicio tendrá desplazamiento." : "";
  };
  const save = () => {
    void updateSettings({ home: list.map((w) => ({ ...w })) });
    note();
  };

  /** Lay out the board (rows: what's used, at least one screen, plus one spare while dragging). */
  function rows(extra = 0) {
    const n = Math.max(GRID.rows, rowsUsed(list)) + extra;
    board.style.gridTemplateRows = `repeat(${n}, ${ROW}px)`;
    guide.style.gridTemplateRows = `repeat(${n}, ${ROW}px)`;
    guide.replaceChildren(...Array.from({ length: n * GRID.cols }, (_, i) => h("i", { class: i >= GRID.rows * GRID.cols ? "below" : "" })));
  }

  /** Redraw, sliding every pill from where it was to where it lands. */
  function render(jelly?: string, extra = 0, slot?: string) {
    const before = new Map<string, DOMRect>();
    for (const el of board.children) before.set((el as HTMLElement).dataset.id!, el.getBoundingClientRect());
    rows(extra);
    board.replaceChildren(...list.map(pill));
    for (const el of board.children as HTMLCollectionOf<HTMLElement>) {
      if (slot && el.dataset.id === slot) el.classList.add("lay-slot");
      const was = before.get(el.dataset.id!);
      const now = el.getBoundingClientRect();
      if (was && (Math.abs(was.left - now.left) > 1 || Math.abs(was.top - now.top) > 1 || Math.abs(was.width - now.width) > 1 || Math.abs(was.height - now.height) > 1)) {
        el.animate([
          { transformOrigin: "top left", transform: `translate(${was.left - now.left}px, ${was.top - now.top}px) scale(${was.width / now.width}, ${was.height / now.height})` },
          { transformOrigin: "top left", transform: "none" },
        ], { duration: 520, easing: SPRING });
      } else if (!was) {
        el.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 420, easing: SPRING });
      }
      if (jelly && el.dataset.id === jelly) wobble(el);
    }
  }

  function wobble(el: HTMLElement) {
    el.animate([
      { transform: "scale(1, 1)" },
      { transform: "scale(1.08, .92)" },
      { transform: "scale(.95, 1.05)" },
      { transform: "scale(1.03, .98)" },
      { transform: "scale(1, 1)" },
    ], { duration: 520, easing: "ease-out" });
  }

  function pill(w: Placed): HTMLElement {
    const info = WIDGETS[w.kind];
    const el = h("div", { class: "lay-pill", "data-id": w.id, style: { gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` } },
      h("span", { class: "lay-icon" }, icon(info.icon, 16)),
      h("b", { text: info.name }),
      h("span", { class: "lay-size", text: `${w.w} × ${w.h}` }),
      h("button", { class: "lay-x", title: "Quitar", onclick: (e: Event) => {
        e.stopPropagation();
        list = list.filter((x) => x.id !== w.id);
        render();
        save();
      } }, icon(I.close, 11)),
      h("span", { class: "lay-handle", title: "Arrastra para cambiar el tamaño" }, icon(RESIZE, 12)),
    );
    el.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest(".lay-x")) return;
      if ((e.target as HTMLElement).closest(".lay-handle")) startResize(e, w.id);
      else startDrag(e, w.id, el);
    });
    return el;
  }

  /** Board cell size and origin, for turning pixels into cells. */
  function metrics() {
    const r = board.getBoundingClientRect();
    return { left: r.left, top: r.top, cellW: (r.width + GAP) / GRID.cols, cellH: ROW + GAP };
  }

  // ── Moving ──
  function startDrag(e: PointerEvent, id: string, el: HTMLElement) {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const base = list.map((w) => ({ ...w }));
    const me = base.find((w) => w.id === id)!;
    let ghost: HTMLElement | null = null;
    let origin = el.getBoundingClientRect();
    const grab = { x: e.clientX - origin.left, y: e.clientY - origin.top };
    let last = { x: e.clientX, y: e.clientY, t: performance.now() };
    let vel = { x: 0, y: 0 };
    let cell = { x: me.x, y: me.y };

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!ghost) {
        if (Math.hypot(dx, dy) < 5) return;
        // Lift: a floating copy follows the pointer, the target cell shows where it will land.
        origin = el.getBoundingClientRect();
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.classList.add("lay-ghost");
        Object.assign(ghost.style, { left: `${origin.left}px`, top: `${origin.top}px`, width: `${origin.width}px`, height: `${origin.height}px` });
        document.body.append(ghost);
        render(undefined, 1, id);
      }
      // Stretch along the motion, squash across it: the jelly.
      const now = performance.now();
      const dt = Math.max(8, now - last.t);
      vel = { x: vel.x * 0.6 + ((ev.clientX - last.x) / dt) * 0.4, y: vel.y * 0.6 + ((ev.clientY - last.y) / dt) * 0.4 };
      last = { x: ev.clientX, y: ev.clientY, t: now };
      const sx = 1 + Math.min(0.18, Math.abs(vel.x) * 0.12) - Math.min(0.1, Math.abs(vel.y) * 0.06);
      const sy = 1 + Math.min(0.18, Math.abs(vel.y) * 0.12) - Math.min(0.1, Math.abs(vel.x) * 0.06);
      const rot = Math.max(-7, Math.min(7, vel.x * 6));
      ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${sx}, ${sy})`;

      // The cell under the pill's top-left corner: the card goes there, others step aside.
      const m = metrics();
      const x = Math.max(0, Math.min(GRID.cols - me.w, Math.round((ev.clientX - grab.x - m.left) / m.cellW)));
      const y = Math.max(0, Math.min(Math.max(GRID.rows, rowsUsed(base)) + 1 - me.h, Math.round((ev.clientY - grab.y - m.top) / m.cellH)));
      if (x !== cell.x || y !== cell.y) {
        cell = { x, y };
        list = settle(base.map((w) => (w.id === id ? { ...w, x, y } : w)), id);
        render(undefined, 1, id);
      }
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!ghost) return;
      render();
      const slot = board.querySelector<HTMLElement>(`[data-id="${id}"]`);
      slot?.classList.add("lay-slot");
      const end = slot?.getBoundingClientRect() ?? origin;
      const g = ghost;
      // Fly into the cell with a springy landing, then show the real pill.
      const anim = g.animate([
        { transform: g.style.transform },
        { transform: `translate(${end.left - origin.left}px, ${end.top - origin.top}px)`, width: `${end.width}px`, height: `${end.height}px` },
      ], { duration: 380, easing: SPRING, fill: "forwards" });
      anim.onfinish = () => {
        g.remove();
        slot?.classList.remove("lay-slot");
        if (slot) wobble(slot);
      };
      save();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── Resizing ──
  function startResize(e: PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const base = list.map((w) => ({ ...w }));
    const me = base.find((w) => w.id === id)!;
    const start = { x: e.clientX, y: e.clientY };
    const m = metrics();
    const min = WIDGETS[me.kind].min;
    let size = { w: me.w, h: me.h };
    const move = (ev: PointerEvent) => {
      const w = Math.max(min[0], Math.min(GRID.cols, Math.round(me.w + (ev.clientX - start.x) / m.cellW)));
      const hh = Math.max(min[1], Math.min(GRID.rows, Math.round(me.h + (ev.clientY - start.y) / m.cellH)));
      if (w === size.w && hh === size.h) return;
      size = { w, h: hh };
      // Wider than the room on its right: slide left to fit.
      const x = Math.min(me.x, GRID.cols - w);
      list = settle(base.map((it) => (it.id === id ? { ...it, w, h: hh, x } : it)), id);
      render(id);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      save();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── Adding ──
  const palette = h("div", { class: "lay-groups" },
    ...WIDGET_GROUPS.map((group) => h("div", { class: "lay-group" },
      h("span", { class: "lay-group-name", text: group }),
      h("div", { class: "lay-palette" },
        ...(Object.keys(WIDGETS) as WidgetKind[]).filter((kind) => WIDGETS[kind].group === group).map((kind) =>
          h("button", { class: "lay-add", title: `${WIDGETS[kind].w} × ${WIDGETS[kind].h}`, onclick: () => {
            const w = newWidget(kind);
            // The first free place it fits in (below everything if the screen is full).
            const placed = { ...w, ...freeSpot(list, w.w, w.h) } as Placed;
            list.push(placed);
            render(placed.id);
            save();
          } }, icon(WIDGETS[kind].icon, 14), WIDGETS[kind].name))),
    )));

  const reset = h("button", { class: "chip", text: "Restablecer", onclick: () => {
    list = placeAll(DEFAULT_HOME);
    render();
    save();
  } });

  requestAnimationFrame(() => render());
  note();
  return [
    card("Página de inicio", "Lo que ves al abrir la isla. Arrastra una tarjeta a cualquier lugar (puede quedar espacio vacío); si cae sobre otras, se apartan solas. Tira de la esquina para cambiar su tamaño y quítala con la ×.",
      wrap, warn, h("div", { class: "lay-foot" }, h("span", { class: "key-msg", text: "Las tres primeras filas son lo que se ve al abrir la isla." }), reset)),
    card("Agregar tarjetas", "Cada pestaña, entera o por partes. Las partes del calendario siguen conectadas: si eliges un día en el Mes, el clima y la agenda cambian con él.", palette),
  ];
}
