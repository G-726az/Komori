// The "Chat" tab: talk to Claude (your key), any OpenAI-compatible server, or
// a local Ollama. The answer streams in as it is written. The conversation
// lives only in memory: closing Komori forgets it.

import { Bridge, IN_APP, on } from "../shared/bridge";
import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { PROVIDER_NAMES, settings, type Provider } from "../shared/settings";

type Line = { role: "user" | "assistant"; content: string; error?: boolean; note?: string };

const SEND = "M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z";
const STOP = "M7 7h10v10H7z";
const NEW = "M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.8-4.3L14 10h6V4l-2.3 2.3A8 8 0 0 0 12 4z";

// ── The conversation, shared by every rebuild of the tab ─────────────────────

const lines: Line[] = [];
let running: string | null = null;
let redraw: (() => void) | null = null;

function pet(mood: "curious" | "happy" | "calm") {
  window.dispatchEvent(new CustomEvent("komori-pet", { detail: mood }));
}

function modelOf(provider: Provider): { model: string; base?: string } {
  const a = settings().ai;
  if (provider === "anthropic") return { model: a.anthropicModel };
  if (provider === "openai") return { model: a.openaiModel, base: a.openaiBase };
  return { model: a.ollamaModel, base: a.ollamaBase };
}

void on<{ id: string; text: string }>("chat-chunk", ({ id, text }) => {
  if (id !== running) return;
  const last = lines[lines.length - 1];
  if (last?.role === "assistant") last.content += text;
  redraw?.();
});
void on<{ id: string; reason: string }>("chat-done", ({ id, reason }) => {
  if (id !== running) return;
  running = null;
  const last = lines[lines.length - 1];
  if (last?.role === "assistant") {
    if (reason === "stopped") last.note = "Detenido";
    else if (reason === "length") last.note = "La respuesta llegó a su largo máximo";
    else if (reason === "refusal") last.note = "El modelo no quiso responder a esto";
    if (!last.content && !last.note) last.note = "Sin respuesta";
  }
  pet("happy");
  redraw?.();
});
void on<{ id: string; message: string }>("chat-error", ({ id, message }) => {
  if (id !== running) return;
  running = null;
  const last = lines[lines.length - 1];
  if (last?.role === "assistant" && !last.content) lines.pop();
  lines.push({ role: "assistant", content: message, error: true });
  pet("calm");
  redraw?.();
});

async function send(text: string) {
  const provider = settings().ai.provider;
  const { model, base } = modelOf(provider);
  if (!model) {
    lines.push({ role: "assistant", content: "Elige un modelo en Ajustes → IA.", error: true });
    redraw?.();
    return;
  }
  lines.push({ role: "user", content: text });
  // Only real turns go to the model (not error lines).
  const history = lines.filter((l) => !l.error).map((l) => ({ role: l.role, content: l.content }));
  lines.push({ role: "assistant", content: "" });
  running = crypto.randomUUID();
  pet("curious");
  redraw?.();
  if (!IN_APP) return demoReply(running);
  try {
    await Bridge.aiChat({ id: running, provider, model, base, system: settings().ai.system, messages: history });
  } catch (err) {
    running = null;
    lines.pop();
    lines.push({ role: "assistant", content: (err as Error).message, error: true });
    redraw?.();
  }
}

/** In a plain browser: a pretend answer, to work on the looks. */
function demoReply(id: string) {
  const words = "¡Hola! Soy una respuesta de **prueba**. Así se ve una lista:\n\n- Primer punto\n- Segundo punto\n\nY un poco de código:\n\n```ts\nconst hola = \"mundo\";\n```".split(/(?<= )/);
  let i = 0;
  const step = () => {
    if (id !== running) return;
    if (i >= words.length) {
      running = null;
      pet("happy");
      redraw?.();
      return;
    }
    lines[lines.length - 1].content += words[i++];
    redraw?.();
    window.setTimeout(step, 40);
  };
  step();
}

// ── A small, safe Markdown: code, bold, italics, lists, headings ─────────────

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return escape(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1");
}

export function markdown(text: string): string {
  const out: string[] = [];
  const parts = text.split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      // A code block: drop the language name on the first line.
      const body = part.replace(/^[\w+-]*\n/, "");
      out.push(`<pre><code>${escape(body.replace(/\n$/, ""))}</code></pre>`);
      return;
    }
    let list: "ul" | "ol" | null = null;
    const close = () => {
      if (list) out.push(`</${list}>`);
      list = null;
    };
    for (const raw of part.split("\n")) {
      const line = raw.trimEnd();
      const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
      const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      const head = /^#{1,6}\s+(.*)$/.exec(line);
      if (bullet || num) {
        const kind = bullet ? "ul" : "ol";
        if (list !== kind) {
          close();
          out.push(`<${kind}>`);
          list = kind;
        }
        out.push(`<li>${inline((bullet ?? num)![1])}</li>`);
        continue;
      }
      close();
      if (head) out.push(`<p class="md-h">${inline(head[1])}</p>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
    close();
  });
  return out.join("");
}

// ── The tab ──────────────────────────────────────────────────────────────────

export function chatModule() {
  const provider = settings().ai.provider;
  const { model } = modelOf(provider);
  const list = h("div", { class: "chat-list" });
  const input = h("textarea", { class: "chat-input", rows: "1", placeholder: "Escribe un mensaje…  (Shift + Enter: nueva línea)" }) as HTMLTextAreaElement;
  const go = h("button", { class: "chat-send", title: "Enviar" }) as HTMLButtonElement;
  const el = h("section", { class: "module chat" },
    h("div", { class: "chat-head" },
      h("button", { class: "chat-model", title: "Cambiar en Ajustes → IA", onclick: () => void Bridge.openSettings("ai") },
        icon(I.sparkle, 13), h("b", { text: PROVIDER_NAMES[provider] }), h("span", { text: model || "sin modelo" })),
      h("span", { class: "spacer" }),
      h("button", { class: "chat-new", title: "Nueva conversación", onclick: () => {
        if (running) void Bridge.aiStop(running);
        running = null;
        lines.length = 0;
        draw();
        input.focus();
      } }, icon(NEW, 14), "Nueva"),
    ),
    list,
    h("div", { class: "chat-compose" }, input, go),
  );

  const fit = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(120, input.scrollHeight)}px`;
  };
  const submit = () => {
    const text = input.value.trim();
    if (running) {
      void Bridge.aiStop(running);
      return;
    }
    if (!text) return;
    input.value = "";
    fit();
    void send(text);
  };
  input.addEventListener("input", fit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  go.addEventListener("click", submit);

  function draw() {
    // A newer copy of the tab took over.
    if (redraw !== draw) return;
    go.replaceChildren(icon(running ? STOP : SEND, 16));
    go.title = running ? "Detener" : "Enviar";
    go.classList.toggle("stop", !!running);
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    list.replaceChildren();
    if (!lines.length) {
      list.append(h("div", { class: "chat-empty" },
        h("span", { class: "music-empty-icon" }, icon(I.chat, 28)),
        h("h3", { text: "¿En qué te ayudo?" }),
        h("p", { text: `Hablas con ${PROVIDER_NAMES[provider]}${model ? ` · ${model}` : ""}.` }),
        h("div", { class: "chat-ideas" },
          ...["Resume este texto:", "Ayúdame a escribir un correo para…", "Explícame esto como si tuviera 10 años:"].map((idea) =>
            h("button", { class: "chip", text: idea, onclick: () => {
              input.value = `${idea} `;
              fit();
              input.focus();
            } })),
        ),
      ));
      return;
    }
    lines.forEach((l, i) => {
      const last = i === lines.length - 1;
      const bubble = h("div", { class: `msg ${l.role}${l.error ? " error" : ""}` });
      if (l.role === "assistant" && !l.error) {
        bubble.innerHTML = markdown(l.content);
        if (last && running) bubble.append(h("span", { class: "caret" }));
      } else {
        bubble.textContent = l.content;
      }
      if (l.note) bubble.append(h("span", { class: "msg-note", text: l.note }));
      list.append(bubble);
    });
    if (atBottom || running) list.scrollTop = list.scrollHeight;
  }

  redraw = draw;
  draw();

  // No key yet for Claude: say where to put it.
  if (IN_APP && provider === "anthropic") {
    void Bridge.secretHas("anthropic").then((has) => {
      if (has || lines.length) return;
      list.replaceChildren(h("div", { class: "chat-empty" },
        h("span", { class: "music-empty-icon" }, icon(I.chat, 28)),
        h("h3", { text: "Falta tu clave de Claude" }),
        h("p", { text: "Agrégala en Ajustes → IA. También puedes usar un servidor compatible con OpenAI o un modelo local con Ollama." }),
        h("button", { class: "notes-new", onclick: () => void Bridge.openSettings("ai") }, icon(I.gear, 14), "Abrir ajustes"),
      ));
    });
  }
  window.setTimeout(() => input.focus(), 50);
  return { el };
}
