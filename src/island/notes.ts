// The "Notas" tab: plain .txt notes. The list on the left, the note on the
// right; it saves itself as you type and the title is the file's name.

import { Bridge, IN_APP, type NoteInfo } from "../shared/bridge";
import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";

const PLUS = "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z";
const TRASH = "M9 3h6l1 2h4v2H4V5h4l1-2zm-3 5h12l-1 13H7L6 8zm4 2v9h1.6v-9H10zm2.4 0v9H14v-9h-1.6z";
const FOLDER = "M3 5.5A1.5 1.5 0 0 1 4.5 4h5l2 2h8A1.5 1.5 0 0 1 21 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-13z";

// ── Where notes live: Rust in the app, memory in a plain browser ─────────────

const fake = new Map<string, { text: string; modified: number }>([
  ["Ideas para Komori", { text: "Recordatorios con la mascota avisando.\nMás peinados para la neko.", modified: Date.now() - 3600_000 }],
  ["Lista de compras", { text: "Café\nPan\nLeche", modified: Date.now() - 86400_000 * 2 }],
]);

const api = IN_APP
  ? {
      list: async () => (await Bridge.notesList()) ?? [],
      read: async (n: string) => (await Bridge.noteRead(n)) ?? "",
      write: (n: string, t: string) => Bridge.noteWrite(n, t),
      create: async () => (await Bridge.noteCreate()) ?? null,
      rename: async (n: string, t: string) => (await Bridge.noteRename(n, t)) ?? n,
      remove: (n: string) => Bridge.noteDelete(n),
    }
  : {
      list: async (): Promise<NoteInfo[]> =>
        [...fake].map(([name, v]) => ({ name, modified: v.modified, preview: v.text.replace(/\s+/g, " ").slice(0, 140) }))
          .sort((a, b) => b.modified - a.modified),
      read: async (n: string) => fake.get(n)?.text ?? "",
      write: async (n: string, t: string) => void fake.set(n, { text: t, modified: Date.now() }),
      create: async () => {
        let name = "Nota";
        for (let i = 2; fake.has(name); i++) name = `Nota ${i}`;
        fake.set(name, { text: "", modified: Date.now() });
        return name;
      },
      rename: async (n: string, t: string) => {
        const v = fake.get(n);
        const name = t.trim() || "Nota";
        if (v) {
          fake.delete(n);
          fake.set(name, v);
        }
        return name;
      },
      remove: async (n: string) => void fake.delete(n),
    };

// ── Saving a little after the last key ───────────────────────────────────────

let current: string | null = null;
let pending: { name: string; text: string } | null = null;
let timer: number | undefined;

async function flush() {
  window.clearTimeout(timer);
  const p = pending;
  pending = null;
  if (p) await api.write(p.name, p.text);
}

function when(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "ahora";
  if (diff < 3600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  }
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "ayer";
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

export function notesModule() {
  const list = h("div", { class: "notes-list" });
  const side = h("aside", { class: "notes-side" },
    h("div", { class: "notes-head" },
      h("b", { text: "Notas" }),
      h("button", { class: "notes-btn", title: "Nueva nota", onclick: () => void create() }, icon(PLUS, 16)),
    ),
    list,
    h("button", { class: "notes-folder", onclick: () => void Bridge.openNotesFolder() }, icon(FOLDER, 14), "Abrir carpeta"),
  );
  const editor = h("div", { class: "notes-editor" });
  const el = h("section", { class: "module notes" }, side, editor);

  /** Redraw the list; returns false when there are no notes. */
  async function drawList(): Promise<boolean> {
    const notes = await api.list();
    if (!current || !notes.some((n) => n.name === current)) current = notes[0]?.name ?? null;
    list.replaceChildren();
    for (const n of notes) {
      const b = h("button", { class: n.name === current ? "note on" : "note" },
        h("span", { class: "note-top" }, h("b", { text: n.name }), h("span", { class: "note-when", text: when(n.modified) })),
        h("span", { class: "note-preview", text: n.preview || "Vacía" }),
      );
      b.addEventListener("click", () => void refresh(n.name));
      list.append(b);
    }
    return notes.length > 0;
  }

  async function refresh(select?: string) {
    await flush();
    if (select !== undefined) current = select;
    const any = await drawList();
    await open(any ? current : null);
  }

  async function create() {
    const name = await api.create();
    if (name) {
      await refresh(name);
      (editor.querySelector(".note-title") as HTMLInputElement | null)?.select();
    }
  }

  async function open(name: string | null) {
    editor.replaceChildren();
    if (!name) {
      editor.append(h("div", { class: "notes-empty" },
        h("span", { class: "music-empty-icon" }, icon(I.note, 30)),
        h("h3", { text: "Sin notas todavía" }),
        h("p", { text: "Se guardan como archivos .txt en la carpeta de Komori." }),
        h("button", { class: "notes-new", onclick: () => void create() }, icon(PLUS, 14), "Crear una nota"),
      ));
      return;
    }
    const text = await api.read(name);
    const title = h("input", { class: "note-title", value: name, maxlength: "80", spellcheck: "false", "aria-label": "Título" }) as HTMLInputElement;
    const body = h("textarea", { class: "note-body", placeholder: "Escribe aquí…", spellcheck: "true" }) as HTMLTextAreaElement;
    body.value = text;
    const status = h("span", { class: "note-status", text: "Guardado" });
    const count = h("span", { class: "note-count" });
    const showCount = () => (count.textContent = `${body.value.length} caracteres`);
    showCount();

    body.addEventListener("input", () => {
      pending = { name: current!, text: body.value };
      status.textContent = "Guardando…";
      showCount();
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        await flush();
        status.textContent = "Guardado";
        // Keep the preview in the list fresh.
        const row = list.querySelector(".note.on .note-preview");
        if (row) row.textContent = body.value.replace(/\s+/g, " ").slice(0, 140) || "Vacía";
      }, 500);
    });
    body.addEventListener("blur", () => void flush());

    const rename = async () => {
      const wanted = title.value.trim();
      if (!wanted || wanted === current) {
        title.value = current!;
        return;
      }
      await flush();
      const got = await api.rename(current!, wanted);
      // Only the list changes: the editor (and where you're typing) stays.
      current = got;
      // Keys typed while renaming belong to the new file.
      if (pending) pending.name = got;
      title.value = got;
      await drawList();
    };
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        body.focus();
      }
    });
    title.addEventListener("change", () => void rename());

    // Deleting asks twice: the first click arms the button for a few seconds.
    const del = h("button", { class: "note-del", title: "Enviar a la papelera" }, icon(TRASH, 14), h("span", { text: "Borrar" }));
    let armed = 0;
    del.addEventListener("click", async () => {
      if (!armed) {
        del.classList.add("armed");
        (del.lastChild as HTMLElement).textContent = "¿Seguro?";
        armed = window.setTimeout(() => {
          armed = 0;
          del.classList.remove("armed");
          (del.lastChild as HTMLElement).textContent = "Borrar";
        }, 3000);
        return;
      }
      window.clearTimeout(armed);
      pending = null;
      await api.remove(current!);
      current = null;
      await refresh();
    });

    editor.append(title, body, h("div", { class: "note-foot" }, status, count, h("span", { class: "spacer" }), del));
  }

  void refresh();
  return { el };
}
