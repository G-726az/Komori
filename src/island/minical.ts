// The calendar for the minimal island: one week as a strip of days (weather
// and a dot for days with plans), and the chosen day's sky and agenda, with a
// small form to add something. Fits the compact island; Komori's own layout.

import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { settings, updateSettings, type CalEvent } from "../shared/settings";
import { deg, describe, skyIcon, weather } from "../shared/weather";
import { formatHm, fromYmd, sortedEvents, ymd } from "./calendar";

const LEFT = "M15 5.5 8.5 12l6.5 6.5-1.6 1.5L5.4 12l8-8 1.6 1.5z";
const RIGHT = "M9 5.5 15.5 12 9 18.5l1.6 1.5 8-8-8-8L9 5.5z";
const PLUS = "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z";

/** Kept between builds (the panel is built again after every change). */
let chosen = ymd(new Date());
let weekOf = chosen;
let adding = false;

/** Monday of the week that holds `day`. */
function monday(day: string): Date {
  const d = fromYmd(day);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function calendarPage(): { el: HTMLElement; update: () => void; stop: () => void } {
  const el = h("div", { class: "mk" });

  const draw = () => {
    const today = ymd(new Date());
    const events = settings().events;
    const w = weather();
    const start = monday(weekOf);

    const shift = (weeks: number) => {
      const d = new Date(start);
      d.setDate(d.getDate() + weeks * 7);
      weekOf = ymd(d);
      draw();
    };
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const id = ymd(d);
      const sky = w?.days.find((x) => x.date === id);
      return h("button", {
        class: ["mk-day", id === chosen ? "on" : "", id === today ? "today" : ""].join(" ").trim(),
        title: new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(d),
        onclick: () => {
          chosen = id;
          adding = false;
          draw();
        },
      },
        h("span", { class: "mk-wd", text: new Intl.DateTimeFormat("es", { weekday: "short" }).format(d).replace(".", "") }),
        h("b", { text: String(d.getDate()) }),
        sky ? skyIcon(sky.code, true, 16) : h("i", { class: "mk-nosky" }),
        events.some((e) => e.date === id) ? h("i", { class: "mk-dot" }) : h("i", { class: "mk-dot off" }),
      );
    });
    const week = h("div", { class: "mk-week" },
      h("button", { class: "mk-arrow", title: "Semana anterior", onclick: () => shift(-1) }, icon(LEFT, 14)),
      ...days,
      h("button", { class: "mk-arrow", title: "Semana siguiente", onclick: () => shift(1) }, icon(RIGHT, 14)),
    );

    // The chosen day: its weather…
    const sky = w?.days.find((x) => x.date === chosen);
    const label = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(fromYmd(chosen));
    const dayBox = h("div", { class: "mk-sky" },
      h("span", { class: "ms-label", text: chosen === today ? "Hoy" : label }),
      sky
        ? h("div", { class: "mk-sky-row" }, skyIcon(sky.code, true, 30), h("div", {},
            h("b", { text: `${deg(sky.max)} / ${deg(sky.min)}` }),
            h("span", { text: `${describe(sky.code).text}${sky.rain != null ? ` · lluvia ${sky.rain}%` : ""}` })))
        : h("span", { class: "mt-dim", text: "Sin pronóstico para ese día" }),
    );

    // …and its plans.
    const mine = sortedEvents(events.filter((e) => e.date === chosen));
    const list = h("div", { class: "mk-list" });
    if (adding) list.append(form());
    else {
      if (!mine.length) list.append(h("p", { class: "mk-empty", text: "Nada para este día." }));
      for (const e of mine) {
        list.append(h("div", { class: "mk-ev" },
          h("span", { class: "mk-time", text: e.time ? formatHm(e.time) : "Todo el día" }),
          h("b", { text: e.title, title: e.place ? `${e.title} · ${e.place}` : e.title }),
          h("button", { class: "mk-del", title: "Quitar", onclick: () =>
            void updateSettings({ events: settings().events.filter((x) => x.id !== e.id) }) }, icon(I.close, 11)),
        ));
      }
    }
    const add = adding ? null : h("button", { class: "mk-add", onclick: () => {
      adding = true;
      draw();
    } }, icon(PLUS, 13), "Agregar");

    el.replaceChildren(week, h("div", { class: "mk-bottom" }, dayBox, h("div", { class: "mk-agenda" }, list, add)));
  };

  function form(): HTMLElement {
    const title = h("input", { class: "mk-in grow", placeholder: "¿Qué hay?", maxlength: "80" }) as HTMLInputElement;
    const time = h("input", { class: "mk-in", type: "time", title: "Hora (opcional)" }) as HTMLInputElement;
    const save = () => {
      if (!title.value.trim()) return title.focus();
      const ev: CalEvent = { id: crypto.randomUUID(), date: chosen, title: title.value.trim() };
      if (time.value) ev.time = time.value;
      adding = false;
      void updateSettings({ events: [...settings().events, ev] });
    };
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
      if (e.key === "Escape") {
        e.stopPropagation();
        adding = false;
        draw();
      }
    });
    window.setTimeout(() => title.focus(), 30);
    return h("div", { class: "mk-form" }, title, time,
      h("button", { class: "mk-save", onclick: save }, "Guardar"),
      h("button", { class: "mk-cancel", title: "Cancelar", onclick: () => {
        adding = false;
        draw();
      } }, icon(I.close, 12)));
  }

  draw();
  return { el, update: () => {}, stop: () => {} };
}
