// The "Música" tab: whatever is playing in Windows, with its cover, progress
// and the three buttons.

import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { control, media, onMedia, seek, type Media } from "./media";
import { settings } from "../shared/settings";
import { timeline } from "./timeline";
import { onPulse } from "./beat";

export const PLAY = "M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z";
export const PAUSE = "M7 4.5h3.2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zm6.8 0H17a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-3.2a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z";
const NEXT = "M5 6.2v11.6a.9.9 0 0 0 1.4.75L15 12.75v4.75a1 1 0 0 0 2 0v-11a1 1 0 0 0-2 0v4.75L6.4 5.45A.9.9 0 0 0 5 6.2z";
const PREV = "M19 6.2v11.6a.9.9 0 0 1-1.4.75L9 12.75v4.75a1 1 0 0 1-2 0v-11a1 1 0 0 1 2 0v4.75l8.6-5.8a.9.9 0 0 1 1.4.75z";

export function clock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h_ = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h_ ? `${h_}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/**
 * The art box: the cover, the cover with its record sliding out, or the record
 * alone with the cover as its label (Ajustes → Música → Carátula). The record
 * turns while music plays.
 */
export function artBox(m: Media): HTMLElement {
  const look = settings().music?.art ?? "sleeve";
  const sleeve = m.cover
    ? h("img", { class: "music-sleeve", src: m.cover, alt: "" })
    : h("div", { class: "music-sleeve none" }, icon(I.music, 54));
  const record = h("div", { class: "music-record" },
    h("div", { class: "music-label", style: m.cover ? { backgroundImage: `url("${m.cover}")` } : {} }));
  return h("div", { class: `music-cover${m.playing ? " playing" : ""}`, "data-art": look }, record, sleeve);
}

export function musicModule() {
  const el = h("section", { class: "module music" });
  // Nothing drawn yet: even "nothing playing" must be drawn once.
  let shownKey: string | null = null;
  // Parts that change every second.
  let line: ReturnType<typeof timeline> | null = null;
  let at: HTMLElement | null = null;
  let playBtn: HTMLButtonElement | null = null;
  let offPulse: (() => void) | null = null;

  function draw(m: Media | null) {
    el.replaceChildren();
    offPulse?.();
    offPulse = null;
    line = null;
    at = playBtn = null;
    if (!m) {
      el.append(h("div", { class: "music-empty" },
        h("span", { class: "music-empty-icon" }, icon(I.music, 30)),
        h("h3", { text: "No suena nada" }),
        h("p", { text: "Pon música en Spotify, YouTube o cualquier reproductor y aparecerá aquí." }),
      ));
      return;
    }
    // The cover, the cover with its record sliding out, or the record alone with
    // the cover as its label. The record turns while music plays.
    const cover = artBox(m);
    const backdrop = m.cover ? h("div", { class: "music-backdrop", style: { backgroundImage: `url("${m.cover}")` } }) : null;

    line = timeline(settings().music?.timeline ?? "clasica");
    if (m.playing) {
      const l = line;
      offPulse = onPulse((p) => {
        // Gone with the panel: let go.
        if (!el.isConnected) {
          offPulse?.();
          offPulse = null;
          return;
        }
        l.pulse(p.beat, p.level);
      });
    }
    at = h("span", {});
    const bar = h("div", { class: `music-bar${m.canSeek ? " seekable" : ""}${m.playing ? " playing" : ""}` }, line.el);
    if (m.canSeek) {
      bar.addEventListener("click", (e) => {
        const now = media();
        if (!now?.duration) return;
        const r = bar.getBoundingClientRect();
        seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * now.duration);
      });
    }
    playBtn = h("button", { class: "music-play", title: m.playing ? "Pausa" : "Reproducir", onclick: () => control("playpause") },
      icon(m.playing ? PAUSE : PLAY, 24));
    const prev = h("button", { class: "music-skip", title: "Anterior", onclick: () => control("prev") }, icon(PREV, 20));
    const next = h("button", { class: "music-skip", title: "Siguiente", onclick: () => control("next") }, icon(NEXT, 20));
    prev.disabled = !m.canPrev;
    next.disabled = !m.canNext;

    el.append(
      h("div", { class: "music-card" },
        backdrop,
        cover,
        h("div", { class: "music-info" },
          h("span", { class: "music-app" }, h("i", { class: m.playing ? "live on" : "live" }), m.app || "Reproductor"),
          h("h3", { class: "music-title", text: m.title || "Sin título", title: m.title }),
          m.artist ? h("p", { class: "music-artist", text: m.artist }) : null,
          m.album && m.album !== m.title ? h("p", { class: "music-album", text: m.album }) : null,
          h("div", { class: "music-time" },
            bar,
            h("div", { class: "music-clock" }, at, h("span", { text: m.duration ? clock(m.duration) : "En vivo" })),
          ),
          h("div", { class: "music-buttons" }, prev, playBtn, next),
        ),
      ),
    );
    progress(m);
  }

  function progress(m: Media | null) {
    if (!m || !line || !at) return;
    line.set(m.duration > 0 ? m.position / m.duration : 0);
    at.textContent = clock(m.position);
  }

  // Redraw when the track, cover or play state changes; otherwise just tick.
  const keyOf = (m: Media | null) =>
    m ? [m.title, m.artist, m.album, m.app, m.playing, m.cover ? m.cover.length : 0, m.canPrev, m.canNext, m.canSeek, m.duration, settings().music?.art, settings().music?.timeline].join("\u0001") : "";
  const update = (m: Media | null) => {
    const key = keyOf(m);
    if (key !== shownKey) {
      shownKey = key;
      draw(m);
    } else {
      progress(m);
    }
  };
  update(media());
  const off = onMedia((m) => {
    if (!el.isConnected) off();
    else update(m);
  });
  return {
    el,
    tick() {
      progress(media());
    },
  };
}
