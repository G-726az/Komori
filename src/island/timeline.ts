// The song's progress line, in six looks (the same thumb and the same click to
// seek in all of them). Drawn in SVG, stretched to the width; only the played
// part (a clip) and the thumb move, so a tick costs almost nothing.

import "./timeline.css";
import { h } from "../shared/dom";

export type TimelineStyle = "clasica" | "latido" | "glitch" | "regla" | "guiones" | "flecha";

export const TIMELINES: { id: TimelineStyle; name: string }[] = [
  { id: "clasica", name: "Clásica" },
  { id: "latido", name: "Latido" },
  { id: "glitch", name: "Glitch" },
  { id: "regla", name: "Regla" },
  { id: "guiones", name: "Guiones" },
  { id: "flecha", name: "Flecha" },
];

const NS = "http://www.w3.org/2000/svg";
const W = 1000;
const H = 24;
const MID = H / 2;

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** A hand-drawn wobble: a few squiggles at both ends, flat in between. */
function heartbeatPath(): string {
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 6) {
    const edge = Math.min(x, W - x);
    const amp = edge < 90 ? 5 * Math.sin(x / 9) * (1 - edge / 90) : 0;
    pts.push(`${x},${(MID + amp).toFixed(1)}`);
  }
  return `M${pts.join("L")}`;
}

/** A gently waving line (the glitch look draws two, offset in colour). */
function wavePath(phase: number, amp: number): string {
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 8) pts.push(`${x},${(MID + Math.sin(x / 23 + phase) * amp).toFixed(1)}`);
  return `M${pts.join("L")}`;
}

/**
 * Build one look. `set(ratio)` moves the thumb and fills the played part.
 * The SVG stretches with `preserveAspectRatio="none"`; strokes keep their width.
 */
export function timeline(style: TimelineStyle) {
  const root = h("div", { class: `tl tl-${style}` });
  const art = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", class: "tl-svg", "aria-hidden": "true" }) as SVGSVGElement;
  // The played part is the same drawing again, clipped from the left.
  const clipId = `tl-clip-${Math.random().toString(36).slice(2, 8)}`;
  const defs = svg("defs", {});
  const clip = svg("clipPath", { id: clipId });
  const clipRect = svg("rect", { x: 0, y: -10, width: 0, height: H + 20 });
  clip.append(clipRect);
  defs.append(clip);
  art.append(defs);
  const track = svg("g", { class: "tl-track" });
  const played = svg("g", { class: "tl-played", "clip-path": `url(#${clipId})` });
  art.append(track, played);

  const both = (make: () => SVGElement) => {
    track.append(make());
    played.append(make());
  };
  switch (style) {
    case "latido":
      both(() => svg("path", { d: heartbeatPath(), class: "tl-line" }));
      break;
    case "glitch":
      // Two waving lines, red and cyan, a hair apart: they shiver while playing.
      track.append(svg("path", { d: wavePath(0, 2.5), class: "tl-line" }));
      played.append(svg("path", { d: wavePath(0.6, 2.5), class: "tl-line tl-red" }), svg("path", { d: wavePath(0, 2.5), class: "tl-line tl-cyan" }));
      break;
    case "regla": {
      const ticks = (cls: string) => {
        const g = svg("g", { class: cls });
        g.append(svg("line", { x1: 0, y1: MID, x2: W, y2: MID, class: "tl-line" }));
        for (let i = 0; i <= 40; i++) {
          const x = (i / 40) * W;
          const tall = i % 5 === 0 ? 7 : 4;
          g.append(svg("line", { x1: x, y1: MID - tall, x2: x, y2: MID + tall, class: "tl-tick" }));
        }
        return g;
      };
      track.append(ticks(""));
      played.append(ticks(""));
      break;
    }
    case "guiones":
      both(() => svg("line", { x1: 0, y1: MID, x2: W, y2: MID, class: "tl-line tl-dash" }));
      break;
    case "flecha": {
      const arrow = () => {
        const g = svg("g", {});
        g.append(svg("line", { x1: 18, y1: MID, x2: W - 6, y2: MID, class: "tl-line" }));
        // Fletching at the start, a head at the end.
        for (const dx of [0, 9]) g.append(svg("path", { d: `M${dx},${MID - 6} L${dx + 9},${MID} L${dx},${MID + 6}`, class: "tl-line" }));
        g.append(svg("path", { d: `M${W - 18},${MID - 6} L${W - 4},${MID} L${W - 18},${MID + 6}`, class: "tl-line" }));
        return g;
      };
      track.append(arrow());
      played.append(arrow());
      break;
    }
    default:
      both(() => svg("line", { x1: 0, y1: MID, x2: W, y2: MID, class: "tl-line" }));
  }

  // The thumb lives outside the stretched SVG so it stays round.
  const thumb = h("i", { class: "tl-thumb" });
  if (style === "flecha") {
    const heart = svg("svg", { viewBox: "0 0 24 24", class: "tl-heart" });
    heart.append(svg("path", { d: "M12 21s-7.5-4.6-9.6-9.2C.9 8.5 2.9 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.8 0 5.8 4 4.3 7.3C19.5 16.4 12 21 12 21z" }));
    thumb.append(heart);
    thumb.classList.add("heart");
  }
  root.append(art, thumb);

  let last = -1;
  return {
    el: root,
    set(ratio: number) {
      const r = Math.max(0, Math.min(1, ratio));
      if (Math.abs(r - last) < 0.0005) return;
      last = r;
      clipRect.setAttribute("width", String(r * W));
      thumb.style.left = `${(r * 100).toFixed(2)}%`;
    },
  };
}
