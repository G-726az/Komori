// The pets, drawn in code â€” original designs for Komori, all "chibi" cute:
// soft bodies with a little volume, glossy eyes, pink cheeks.
//   Bou    â€” a round drop with a sprout on top.
//   Ghost  â€” a floating dome with a wavy hem.
//   Cat    â€” a soft bun with pointy ears, a Ï‰ mouth and whiskers.
//   Bat    â€” a soft bun with pointy ears, little wings and tiny fangs.
//   Neko   â€” a chibi girl with cat ears and long hair.
//   Chick  â€” a round chick with a tuft.
//   Pelu   â€” a plush bunny with one floppy ear and a stitched heart.
//
// Moods: happy (âˆ©âˆ© and a hop), curious (a tilt), a poke (squash and a heart),
// a pout after too many pokes (> <), dizzy if it goes on (spirals and stars),
// a coffee break now and then, and rest â€” each pet its own way.

import { settings, type PetId } from "../shared/settings";
import { fillSolid, heart, isDark, roundRect, shade, star } from "./paint";
import { item, type Anchor, type Outfit } from "./wardrobe";
import { createPet3D } from "./pet3d/pet3d";
import { hasPet } from "./pet3d/models";
import { webglOk } from "./pet3d/engine";
import { petSound } from "./sfx";

export interface Pet {
  el: HTMLCanvasElement;
  /** Another canvas showing the same pet (e.g. in the panel header). */
  clone(size?: number): HTMLCanvasElement;
  setKind(kind: PetId, color?: string, style?: string): void;
  setOutfit(outfit: Outfit | undefined): void;
  /** âˆ©âˆ© eyes and a little hop. */
  happy(): void;
  /** A poke: squash and a heart; too many in a row â†’ a pout, then dizzy. */
  poke(): void;
  /** Play a reaction directly (settings preview). */
  react(kind: "pout" | "dizzy" | "coffee"): void;
  /** A little coffee break, unless busy. */
  coffee(): void;
  setCurious(on: boolean): void;
  /** Rest (the idle animation) or wake up with a stretch. */
  setSleeping(on: boolean): void;
  /** Resting or in the middle of a reaction. */
  readonly busy: boolean;
  /** Where to look, -1…1 each way (0, 0 = straight ahead). */
  setLook(x: number, y: number): void;
}

export const PET_COLORS: Record<PetId, string> = {
  bou: "#eaf7f1",
  ghost: "#eef1ff",
  cat: "#f8cfa4",
  bat: "#b39ae0",
  neko: "#e64ca8",
  chick: "#ffd84d",
  bunny: "#f7b7c8",
};

/** Looks a pet can switch between (the first is the default). */
export const PET_STYLES: Partial<Record<PetId, { id: string; name: string }[]>> = {
  neko: [
    { id: "long", name: "Largo" },
    { id: "bob", name: "Corto" },
    { id: "twintails", name: "Coletas" },
    { id: "bun", name: "Moño" },
  ],
};

/** Swatches offered in the settings for every pet. */
export const PET_SWATCHES = [
  "#eaf7f1", "#eef1ff", "#fff3d6", "#e64ca8", "#f3c48f", "#f8cfa4", "#ffd84d", "#ffd1dc", "#f7b7c8",
  "#c9f0d8", "#cfe3ff", "#9fd3c7", "#b39ae0", "#8f7fd6", "#d6c2a8", "#8b8fa3", "#4a4458",
];

const DPR = Math.min(2, window.devicePixelRatio || 1);

type EyeMode = "open" | "happy" | "closed" | "pout" | "dizzy";

interface Pose {
  breath: number;
  blink: number;
  t: number;
  eye: EyeMode;
  /** 0 awake â€¦ 1 fully resting. */
  rest: number;
  /** A hat covers the top of the head (ears come out through it). */
  hatted: boolean;
  /** The hat brings its own ears: don't draw the pet's. */
  earsHidden: boolean;
  /** The face shows a reaction instead of the usual mouth. */
  reacting: boolean;
  /** Where the eyes look, -1…1 each way. */
  look: { x: number; y: number };
  /** Hairstyle (or other look) for pets that have them. */
  style: string;
}

// â”€â”€ Shared features â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Eyes for every mode except the pet's own open look; false means "draw yours". */
function eyeMode(ctx: CanvasRenderingContext2D, x: number, cy: number, r: number, side: number, p: Pose, ink: string): boolean {
  if (p.eye === "open" && p.blink <= 0.7) return false;
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * 0.55;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (p.eye === "happy") {
    ctx.arc(x, cy + r * 0.45, r * 0.85, 1.15 * Math.PI, 1.85 * Math.PI);
  } else if (p.eye === "pout") {
    // > <
    const d = side < 0 ? 1 : -1;
    ctx.moveTo(x - d * r * 0.8, cy - r * 0.75);
    ctx.lineTo(x + d * r * 0.7, cy);
    ctx.lineTo(x - d * r * 0.8, cy + r * 0.75);
  } else if (p.eye === "dizzy") {
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 4 + p.t * 6 * side;
      const rr = (i / 28) * r * 1.1;
      const px = x + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.lineWidth = r * 0.35;
  } else {
    ctx.arc(x, cy - r * 0.2, r * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
  }
  ctx.stroke();
  return true;
}

/** Glossy dot eyes with a shine. */
function eyes(ctx: CanvasRenderingContext2D, cx: number, cy: number, gap: number, r: number, p: Pose, light = false) {
  const ink = light ? "#f4eefa" : "#2a2226";
  const ey = cy + p.look.y * r * 0.45;
  for (const sx of [-1, 1]) {
    const x = cx + sx * gap + p.look.x * r * 0.6;
    if (eyeMode(ctx, x, ey, r, sx, p, ink)) continue;
    const squash = 1 - p.blink * 0.8;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(x, ey, r, r * 1.15 * squash, 0, 0, Math.PI * 2);
    ctx.fill();
    if (squash > 0.5) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(x - r * 0.32, ey - r * 0.38 * squash, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function cheeks(ctx: CanvasRenderingContext2D, cx: number, cy: number, gap: number, r: number, p: Pose) {
  // A pout puffs them up.
  const puff = p.eye === "pout" ? 1.35 : 1;
  ctx.fillStyle = p.eye === "pout" ? "rgba(255, 110, 140, 0.6)" : "rgba(255, 128, 156, 0.42)";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx * gap, cy, r * puff, r * 0.62 * puff, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The reaction mouth: a pouty curve or a dizzy squiggle. */
function reactionMouth(ctx: CanvasRenderingContext2D, cx: number, y: number, s: number, p: Pose, light: boolean) {
  ctx.strokeStyle = light ? "rgba(245, 235, 250, 0.9)" : "rgba(60, 40, 50, 0.8)";
  ctx.lineWidth = s * 0.018;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (p.eye === "pout") {
    ctx.moveTo(cx - s * 0.035, y + s * 0.012);
    ctx.quadraticCurveTo(cx, y - s * 0.025, cx + s * 0.035, y + s * 0.012);
  } else {
    for (let i = 0; i <= 12; i++) {
      const x = cx - s * 0.05 + (i / 12) * s * 0.1;
      const yy = y + Math.sin(i * 1.3 + p.t * 8) * s * 0.008;
      if (i) ctx.lineTo(x, yy);
      else ctx.moveTo(x, yy);
    }
  }
  ctx.stroke();
}

/** A soft, very rounded square â€” the cat's, the bat's and Pelu's body. */
function bun(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, color: string, s: number) {
  const n = 3.2;
  ctx.beginPath();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const x = cx + w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = cy + h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / (sn > 0 ? n + 1.2 : n));
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  fillSolid(ctx, color, cy - h, cy + h, s, true, [cx - w, cx + w]);
}

/** Pointy ears on top of a head (cat, bat, neko). */
function pointyEars(ctx: CanvasRenderingContext2D, cx: number, baseY: number, spread: number, h: number, tall: number, color: string, inner: string, s: number, droop: number) {
  for (const sx of [-1, 1]) {
    const bx = cx + sx * spread;
    const tipX = bx + sx * h * (0.35 + droop * 0.25);
    const tipY = baseY - h * tall * (1 - droop * 0.25);
    ctx.beginPath();
    ctx.moveTo(bx - sx * h * 0.75, baseY + h * 0.15);
    ctx.quadraticCurveTo(bx - sx * h * 0.05, tipY + h * 0.1, tipX, tipY);
    ctx.quadraticCurveTo(bx + sx * h * 0.75, baseY - h * 0.35, bx + sx * h * 0.55, baseY + h * 0.3);
    ctx.closePath();
    fillSolid(ctx, color, tipY, baseY, s);
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.moveTo(bx - sx * h * 0.35, baseY + h * 0.05);
    ctx.quadraticCurveTo(bx + sx * h * 0.05, tipY + h * 0.35, tipX - sx * h * 0.05, tipY + h * 0.28);
    ctx.quadraticCurveTo(bx + sx * h * 0.45, baseY - h * 0.25, bx + sx * h * 0.35, baseY + h * 0.15);
    ctx.closePath();
    ctx.fill();
  }
}

/** Draw the ears now, later over a hat (returned), or not at all (the hat has its own). */
function placeEars(p: Pose, draw: () => void): (() => void) | undefined {
  if (p.earsHidden) return undefined;
  if (p.hatted) return draw;
  draw();
  return undefined;
}

// â”€â”€ Bou â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function drawBou(ctx: CanvasRenderingContext2D, s: number, p: Pose, color: string): Anchor {
  const cx = s / 2;
  const base = s * 0.9;
  const w = s * 0.4 * (1 + p.breath * 0.03);
  const top = s * 0.24 - p.breath * s * 0.015 + p.rest * s * 0.06;
  ctx.beginPath();
  ctx.moveTo(cx - w, base);
  ctx.bezierCurveTo(cx - w * 1.15, base - s * 0.34, cx - w * 0.7, top, cx, top);
  ctx.bezierCurveTo(cx + w * 0.7, top, cx + w * 1.15, base - s * 0.34, cx + w, base);
  ctx.quadraticCurveTo(cx, base + s * 0.04, cx - w, base);
  ctx.closePath();
  fillSolid(ctx, color, top, base, s, true, [cx - w * 1.1, cx + w * 1.1]);
  if (!p.hatted) {
    ctx.strokeStyle = "#5fbf95";
    ctx.lineWidth = s * 0.045;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, top + s * 0.01);
    const lean = s * 0.06 + p.rest * s * 0.05;
    ctx.quadraticCurveTo(cx + s * 0.02, top - s * 0.08 + p.rest * s * 0.04, cx + lean, top - s * 0.11 + p.rest * s * 0.07);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx + lean + s * 0.03, top - s * 0.12 + p.rest * s * 0.08, s * 0.06, s * 0.03, -0.5 + p.rest * 0.9, 0, Math.PI * 2);
    fillSolid(ctx, "#7fd8ad", top - s * 0.15, top - s * 0.09, s);
  }
  const light = isDark(color);
  const eyeY = s * 0.6 + p.rest * s * 0.03;
  eyes(ctx, cx, eyeY, s * 0.1, s * 0.04, p, light);
  cheeks(ctx, cx, eyeY + s * 0.09, s * 0.19, s * 0.05, p);
  if (p.reacting) reactionMouth(ctx, cx, eyeY + s * 0.1, s, p, light);
  return {
    cx, top: top + s * 0.02, headW: w * 0.78, eyeY, eyeGap: s * 0.1, neckY: s * 0.79, neckW: w * 0.98,
    earX: w * 0.98, earY: s * 0.52 + p.rest * s * 0.03, mouthY: eyeY + s * 0.1, earStyle: "none", s,
  };
}

// â”€â”€ Ghost â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function drawGhost(ctx: CanvasRenderingContext2D, s: number, p: Pose, color: string): Anchor {
  const cx = s / 2;
  const float = Math.sin(p.t * 1.6) * s * 0.025 * (1 - p.rest * 0.7) + p.rest * s * 0.06;
  const top = s * 0.16 + float;
  const w = s * 0.32;
  const hem = s * 0.8 + float;
  ctx.fillStyle = "rgba(180, 190, 255, 0.2)";
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.95, s * 0.22 - float * 0.5, s * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - w, hem);
  ctx.lineTo(cx - w, top + w);
  ctx.arc(cx, top + w, w, Math.PI, 0);
  ctx.lineTo(cx + w, hem);
  const sway = Math.sin(p.t * 3) * s * 0.012;
  for (let i = 0; i < 3; i++) {
    const x0 = cx + w - (2 * w * i) / 3;
    const x1 = cx + w - (2 * w * (i + 1)) / 3;
    ctx.quadraticCurveTo((x0 + x1) / 2 + sway, hem + s * 0.09, x1, hem);
  }
  ctx.closePath();
  fillSolid(ctx, color, top, hem, s, true, [cx - w, cx + w]);
  const light = isDark(color);
  const eyeY = top + w * 1.05;
  eyes(ctx, cx, eyeY, s * 0.1, s * 0.042, p, light);
  cheeks(ctx, cx, eyeY + s * 0.09, s * 0.19, s * 0.05, p);
  if (p.reacting) reactionMouth(ctx, cx, eyeY + s * 0.1, s, p, light);
  else {
    ctx.fillStyle = "rgba(60, 40, 70, 0.75)";
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + s * 0.1, s * 0.022, s * 0.028 * (1 - p.rest * 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return {
    cx, top: top + s * 0.01, headW: w * 0.98, eyeY, eyeGap: s * 0.1, neckY: eyeY + s * 0.18, neckW: w,
    earX: w * 1.02, earY: top + w * 0.8, mouthY: eyeY + s * 0.1, earStyle: "none", s,
  };
}

// â”€â”€ Cat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function drawCat(ctx: CanvasRenderingContext2D, s: number, p: Pose, color: string): Anchor {
  const cx = s / 2;
  const cy = s * 0.6 + p.rest * s * 0.07;
  const w = s * 0.37 * (1 + p.breath * 0.02) * (1 + p.rest * 0.1);
  const h = s * 0.3 * (1 - p.breath * 0.015) * (1 - p.rest * 0.18);
  const dark = shade(color, -0.22);
  const tail = (front: boolean) => {
    ctx.strokeStyle = dark;
    ctx.lineWidth = s * 0.07;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (front) {
      ctx.moveTo(cx + w * 0.95, cy + h * 0.55);
      ctx.quadraticCurveTo(cx + w * 0.2, cy + h * 1.25, cx - w * 0.55, cy + h * 0.78);
    } else {
      ctx.moveTo(cx + w * 0.7, cy + h * 0.6);
      ctx.quadraticCurveTo(cx + w * 1.35, cy + h * 0.5, cx + w * 1.18, cy - h * 0.25 + Math.sin(p.t * 2) * s * 0.02);
    }
    ctx.stroke();
  };
  if (p.rest < 0.5) tail(false);
  const ears = placeEars(p, () => pointyEars(ctx, cx, cy - h * 0.72, w * 0.62, h * 0.62, 1.45, shade(color, 0.08), "#ffb3c4", s, p.rest));
  bun(ctx, cx, cy, w, h, color, s);
  if (!p.hatted) {
    ctx.strokeStyle = shade(color, -0.18);
    ctx.lineWidth = s * 0.028;
    ctx.lineCap = "round";
    for (const dx of [-0.06, 0.06]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * s, cy - h * 0.88);
      ctx.lineTo(cx + dx * s * 0.75, cy - h * 0.62);
      ctx.stroke();
    }
  }
  const light = isDark(color);
  const eyeY = cy - h * 0.05;
  eyes(ctx, cx, eyeY, s * 0.12, s * 0.04, p, light);
  cheeks(ctx, cx, eyeY + s * 0.085, s * 0.22, s * 0.05, p);
  const ny = eyeY + s * 0.055;
  ctx.fillStyle = "#ff8fa6";
  ctx.beginPath();
  ctx.ellipse(cx, ny, s * 0.022, s * 0.015, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.reacting) reactionMouth(ctx, cx, ny + s * 0.04, s, p, light);
  else {
    ctx.strokeStyle = "rgba(70, 45, 40, 0.75)";
    ctx.lineWidth = s * 0.018;
    ctx.beginPath();
    ctx.arc(cx - s * 0.025, ny + s * 0.02, s * 0.025, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.arc(cx + s * 0.025, ny + s * 0.02, s * 0.025, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(70, 45, 40, 0.4)";
  ctx.lineWidth = s * 0.014;
  for (const sx of [-1, 1]) {
    for (const dy of [0, 0.035]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * w * 0.62, ny + s * dy);
      ctx.lineTo(cx + sx * w * 0.98, ny + s * (dy - 0.012));
      ctx.stroke();
    }
  }
  if (p.rest >= 0.5) tail(true);
  return {
    cx, top: cy - h, headW: w * 0.96, eyeY, eyeGap: s * 0.12, neckY: cy + h * 0.72, neckW: w * 0.85,
    earX: w * 1.0, earY: cy - h * 0.2, mouthY: ny + s * 0.03, earStyle: "cat", ears, s,
  };
}

// â”€â”€ Bat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function drawBat(ctx: CanvasRenderingContext2D, s: number, p: Pose, color: string): Anchor {
  const cx = s / 2;
  const cy = s * 0.6;
  const w = s * 0.3 * (1 + p.breath * 0.02);
  const h = s * 0.27 * (1 - p.breath * 0.015);
  const fold = p.rest;
  const flap = Math.sin(p.t * 2.4) * 0.12 * (1 - fold);
  const wing = shade(color, -0.3);
  for (const sx of [-1, 1]) {
    const reach = 1 - fold * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx + sx * w * 0.8, cy - h * 0.35);
    ctx.quadraticCurveTo(cx + sx * w * 1.8 * reach, cy - h * (1.15 + flap), cx + sx * w * 1.95 * reach, cy + h * 0.05);
    ctx.quadraticCurveTo(cx + sx * w * 1.72 * reach, cy - h * 0.02, cx + sx * w * 1.58 * reach, cy + h * 0.38);
    ctx.quadraticCurveTo(cx + sx * w * 1.36 * reach, cy + h * 0.2, cx + sx * w * 1.18 * reach, cy + h * 0.55);
    ctx.quadraticCurveTo(cx + sx * w * 1.02, cy + h * 0.35, cx + sx * w * 0.85, cy + h * 0.5);
    ctx.closePath();
    fillSolid(ctx, wing, cy - h * 1.2, cy + h * 0.6, s);
  }
  const ears = placeEars(p, () => pointyEars(ctx, cx, cy - h * 0.75, w * 0.55, h * 0.6, 1.9, shade(color, -0.08), "#ffb3c4", s, 0));
  bun(ctx, cx, cy, w, h, color, s);
  if (!p.hatted) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.03, cy - h * 0.92);
    ctx.quadraticCurveTo(cx, cy - h * 1.3, cx + s * 0.05, cy - h * 1.15);
    ctx.quadraticCurveTo(cx + s * 0.02, cy - h * 1.0, cx + s * 0.03, cy - h * 0.9);
    ctx.closePath();
    ctx.fillStyle = shade(color, -0.12);
    ctx.fill();
  }
  const light = isDark(color);
  const eyeY = cy - h * 0.08;
  eyes(ctx, cx, eyeY, s * 0.1, s * 0.04, p, light);
  cheeks(ctx, cx, eyeY + s * 0.085, s * 0.19, s * 0.045, p);
  const my = eyeY + s * 0.075;
  if (p.reacting) reactionMouth(ctx, cx, my, s, p, light);
  else {
    ctx.strokeStyle = light ? "rgba(245, 235, 250, 0.85)" : "rgba(60, 40, 70, 0.75)";
    ctx.lineWidth = s * 0.018;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, my - s * 0.02, s * 0.045, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * s * 0.012, my + s * 0.012);
      ctx.lineTo(cx + sx * s * 0.036, my + s * 0.008);
      ctx.lineTo(cx + sx * s * 0.024, my + s * 0.045);
      ctx.closePath();
      ctx.fill();
    }
  }
  return {
    cx, top: cy - h, headW: w * 0.96, eyeY, eyeGap: s * 0.1, neckY: cy + h * 0.72, neckW: w * 0.85,
    earX: w * 1.0, earY: cy - h * 0.25, mouthY: my, earStyle: "bat", ears, s,
  };
}

// â”€â”€ Neko â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The usual chibi build: a big head, wide at the cheeks with a small chin; big
// eyes set low with a thick upper lash; a tiny mouth; a small body. The hair is
// the pet colour, and its shine is the same hue, lighter.

function drawNeko(ctx: CanvasRenderingContext2D, s: number, p: Pose, color: string): Anchor {
  const cx = s / 2;
  const R = s * 0.33;
  const hy = s * 0.47 + p.rest * s * 0.02;
  const X = (k: number) => cx + k * R;
  const skin = "#ffe6d6";
  const shine = shade(color, 0.55);
  const deep = shade(color, -0.1);
  const chinY = hy + R * 0.95;
  const sway = Math.sin(p.t * 1.4) * R * 0.03;

  // Hair behind the head: darker near the roots, lighter at the tips.
  const hairFill = (y0: number, y1: number) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, deep);
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, 0.28));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = shade(color, -0.38);
    ctx.lineWidth = Math.max(0.6, s * 0.012);
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  const style = p.style;
  const tieY = hy - R * 0.45;
  if (style === "twintails") {
    // Two tails, tied high on the sides of the head.
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(X(sx * 0.98), tieY - R * 0.12);
      ctx.quadraticCurveTo(X(sx * 1.62), hy + R * 0.15, X(sx * 1.3) + sway, s * 0.97);
      ctx.lineTo(X(sx * 1.2), s * 0.9);
      ctx.lineTo(X(sx * 1.08) + sway, s * 0.95);
      ctx.quadraticCurveTo(X(sx * 1.12), hy + R * 0.5, X(sx * 0.95), tieY + R * 0.14);
      ctx.closePath();
      hairFill(tieY, s);
    }
  }
  if (style === "bun" && !p.hatted) {
    // A round bun on top, half hidden by the hair in front.
    ctx.beginPath();
    ctx.arc(cx, hy - R * 1.02, R * 0.36, 0, Math.PI * 2);
    hairFill(hy - R * 1.4, hy - R * 0.66);
    ctx.strokeStyle = shine;
    ctx.lineWidth = R * 0.05;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, hy - R * 1.02, R * 0.22, 1.1 * Math.PI, 1.7 * Math.PI);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(X(0), hy - R * 1.02);
  if (style === "long") {
    // Long, past the shoulders, with pointed ends.
    ctx.bezierCurveTo(X(-1.15), hy - R * 1.02, X(-1.3), hy - R * 0.1, X(-1.2), hy + R * 0.9);
    ctx.quadraticCurveTo(X(-1.18), s * 0.9, X(-1.02) + sway, s * 0.985);
    ctx.lineTo(X(-0.92), s * 0.9);
    ctx.lineTo(X(-0.78) + sway, s * 0.99);
    ctx.lineTo(X(-0.6), s * 0.92);
    ctx.lineTo(X(0.6), s * 0.92);
    ctx.lineTo(X(0.78) + sway, s * 0.99);
    ctx.lineTo(X(0.92), s * 0.9);
    ctx.lineTo(X(1.02) + sway, s * 0.985);
    ctx.quadraticCurveTo(X(1.18), s * 0.9, X(1.2), hy + R * 0.9);
    ctx.bezierCurveTo(X(1.3), hy - R * 0.1, X(1.15), hy - R * 1.02, X(0), hy - R * 1.02);
  } else {
    // Short, down to the chin, the ends curling in a little.
    ctx.bezierCurveTo(X(-1.15), hy - R * 1.02, X(-1.3), hy - R * 0.2, X(-1.2), hy + R * 0.5);
    ctx.quadraticCurveTo(X(-1.2), chinY, X(-1.06) + sway, chinY + R * 0.18);
    ctx.lineTo(X(-0.95), chinY - R * 0.02);
    ctx.lineTo(X(-0.82) + sway, chinY + R * 0.1);
    ctx.lineTo(X(-0.7), chinY - R * 0.1);
    ctx.lineTo(X(0.7), chinY - R * 0.1);
    ctx.lineTo(X(0.82) + sway, chinY + R * 0.1);
    ctx.lineTo(X(0.95), chinY - R * 0.02);
    ctx.lineTo(X(1.06) + sway, chinY + R * 0.18);
    ctx.quadraticCurveTo(X(1.2), chinY, X(1.2), hy + R * 0.5);
    ctx.bezierCurveTo(X(1.3), hy - R * 0.2, X(1.15), hy - R * 1.02, X(0), hy - R * 1.02);
  }
  ctx.closePath();
  hairFill(hy - R, style === "long" ? s : chinY + R * 0.2);

  // A small body: neck, a dress with a round white collar and a little bow.
  ctx.fillStyle = shade(skin, -0.08);
  ctx.fillRect(X(-0.14), chinY - R * 0.1, R * 0.28, R * 0.25);
  ctx.beginPath();
  ctx.moveTo(X(-0.28), chinY + R * 0.08);
  ctx.quadraticCurveTo(X(-0.64), chinY + R * 0.12, X(-0.7), s * 0.97);
  ctx.lineTo(X(0.7), s * 0.97);
  ctx.quadraticCurveTo(X(0.64), chinY + R * 0.12, X(0.28), chinY + R * 0.08);
  ctx.closePath();
  fillSolid(ctx, "#4b4566", chinY, s, s);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx * R * 0.18, chinY + R * 0.18, R * 0.2, R * 0.12, sx * 0.45, 0, Math.PI * 2);
    fillSolid(ctx, "#fbf8ff", chinY + R * 0.06, chinY + R * 0.3, s);
  }
  const bowY = chinY + R * 0.2;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx, bowY);
    ctx.quadraticCurveTo(cx + sx * R * 0.2, bowY - R * 0.13, cx + sx * R * 0.17, bowY + R * 0.04);
    ctx.quadraticCurveTo(cx + sx * R * 0.18, bowY + R * 0.14, cx, bowY);
    fillSolid(ctx, shade(color, 0.15), bowY - R * 0.12, bowY + R * 0.12, s);
  }
  ctx.beginPath();
  ctx.arc(cx, bowY, R * 0.045, 0, Math.PI * 2);
  ctx.fillStyle = shade(color, -0.1);
  ctx.fill();

  // Big cat ears on the top corners of the head; the hair covers their base.
  const droop = p.rest * 0.5;
  const ears = placeEars(p, () => {
    for (const sx of [-1, 1]) {
      const tx = X(sx * (0.92 + droop * 0.25));
      const ty = hy - R * (1.55 - droop * 0.35);
      ctx.beginPath();
      ctx.moveTo(X(sx * 0.3), hy - R * 0.98);
      ctx.quadraticCurveTo(X(sx * 0.6), hy - R * 1.35, tx, ty);
      ctx.quadraticCurveTo(X(sx * 1.08), hy - R * 1.0, X(sx * 1.0), hy - R * 0.5);
      ctx.closePath();
      fillSolid(ctx, color, ty, hy - R * 0.5, s);
      // Inner ear with a bit of fluff.
      ctx.beginPath();
      ctx.moveTo(X(sx * 0.48), hy - R * 0.98);
      ctx.quadraticCurveTo(X(sx * 0.68), hy - R * 1.28, tx - sx * R * 0.06, ty + R * 0.14);
      ctx.quadraticCurveTo(X(sx * 0.95), hy - R * 0.95, X(sx * 0.9), hy - R * 0.7);
      ctx.closePath();
      ctx.fillStyle = "#fff1ec";
      ctx.fill();
      ctx.strokeStyle = shade(color, 0.35);
      ctx.lineWidth = s * 0.008;
      ctx.lineCap = "round";
      for (const k of [0, 1]) {
        ctx.beginPath();
        ctx.moveTo(X(sx * (0.66 + k * 0.1)), hy - R * (0.92 - k * 0.04));
        ctx.lineTo(X(sx * (0.74 + k * 0.08)), hy - R * (1.12 - k * 0.06));
        ctx.stroke();
      }
    }
  });

  // Face: wide cheeks, a small soft chin.
  ctx.beginPath();
  ctx.moveTo(X(-0.94), hy - R * 0.2);
  ctx.bezierCurveTo(X(-1.0), hy + R * 0.55, X(-0.5), chinY, X(0), chinY);
  ctx.bezierCurveTo(X(0.5), chinY, X(1.0), hy + R * 0.55, X(0.94), hy - R * 0.2);
  ctx.quadraticCurveTo(X(0), hy - R * 1.1, X(-0.94), hy - R * 0.2);
  ctx.closePath();
  fillSolid(ctx, skin, hy - R, chinY, s, true, [cx - R, cx + R]);

  // Hair on top, ending in pointed bangs â€” one strand between the eyes.
  ctx.beginPath();
  ctx.moveTo(X(-1.02), hy + R * 0.15);
  ctx.bezierCurveTo(X(-1.08), hy - R * 1.42, X(1.08), hy - R * 1.42, X(1.02), hy + R * 0.15);
  const bangs: [number, number][] = [
    [0.8, -0.25], [0.72, 0.18], [0.55, -0.3], [0.42, 0.08], [0.3, -0.32], [0.12, 0.26],
    [0.0, -0.22], [-0.1, 0.34], [-0.22, -0.3], [-0.4, 0.1], [-0.55, -0.32], [-0.72, 0.16],
    [-0.82, -0.25], [-1.02, 0.15],
  ];
  let px = 1.02;
  let py = 0.15;
  for (const [bx, by] of bangs) {
    ctx.quadraticCurveTo(X((px + bx) / 2 + 0.05), hy + R * ((py + by) / 2), X(bx), hy + R * by);
    px = bx;
    py = by;
  }
  ctx.closePath();
  fillSolid(ctx, color, hy - R * 1.03, hy + R * 0.3, s, true, [cx - R * 1.05, cx + R * 1.05]);
  // A few strand lines.
  ctx.strokeStyle = shade(color, -0.18);
  ctx.lineWidth = s * 0.006;
  for (const [fx, tx, ty] of [[-0.2, -0.38, 0.0], [0.15, 0.1, 0.12], [0.45, 0.62, 0.0]]) {
    ctx.beginPath();
    ctx.moveTo(X(fx), hy - R * 0.85);
    ctx.quadraticCurveTo(X((fx + tx) / 2 + 0.08), hy - R * 0.35, X(tx), hy + R * ty);
    ctx.stroke();
  }
  // The shine: a broken ring, the same hue as the hair but lighter.
  ctx.strokeStyle = shine;
  ctx.lineWidth = R * 0.075;
  ctx.lineCap = "round";
  for (const [a0, a1] of [[1.17, 1.3], [1.36, 1.47], [1.53, 1.66], [1.72, 1.83]]) {
    ctx.beginPath();
    ctx.ellipse(cx, hy - R * 0.08, R * 0.84, R * 0.6, 0, a0 * Math.PI, a1 * Math.PI);
    ctx.stroke();
  }

  // Side locks in front of the face.
  const lockY = style === "bob" ? chinY + R * 0.02 : chinY + R * 0.35;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(X(sx * 1.04), hy - R * 0.15);
    ctx.quadraticCurveTo(X(sx * 1.12), hy + R * 0.6, X(sx * 0.92) + sway, lockY);
    ctx.quadraticCurveTo(X(sx * 0.93), hy + R * 0.5, X(sx * 0.82), hy + R * 0.05);
    ctx.closePath();
    fillSolid(ctx, color, hy - R * 0.15, lockY, s);
    ctx.strokeStyle = shine;
    ctx.lineWidth = R * 0.04;
    ctx.beginPath();
    ctx.moveTo(X(sx * 1.0), hy + R * 0.1);
    ctx.quadraticCurveTo(X(sx * 1.05), hy + R * 0.4, X(sx * 1.0), hy + R * 0.6);
    ctx.stroke();
  }

  if (style === "twintails") {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(X(sx * 1.02), tieY, R * 0.09, R * 0.13, sx * 0.4, 0, Math.PI * 2);
      fillSolid(ctx, shade(color, 0.15), tieY - R * 0.13, tieY + R * 0.13, s);
    }
  }

  // Big eyes, set low: white, a gradient iris, pupil, two highlights, a thick lash.
  const eyeY0 = hy + R * 0.4;
  const eyeY = eyeY0;
  const gap = R * 0.44;
  const iris = shade(color, -0.12);
  for (const sx of [-1, 1]) {
    const x = cx + sx * gap + p.look.x * R * 0.08;
    const eyeY = eyeY0 + p.look.y * R * 0.06;
    if (eyeMode(ctx, x, eyeY, R * 0.16, sx, p, "#2b1a24")) continue;
    const ew = R * 0.23;
    const eh = R * 0.32 * (1 - p.blink * 0.9);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x, eyeY, ew * 1.06, eh * 1.02, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, eyeY - eh, 0, eyeY + eh);
    g.addColorStop(0, shade(iris, -0.5));
    g.addColorStop(0.55, iris);
    g.addColorStop(1, shade(iris, 0.45));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, eyeY + eh * 0.05, ew * 0.92, eh * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(iris, -0.65);
    ctx.beginPath();
    ctx.ellipse(x, eyeY + eh * 0.02, ew * 0.42, eh * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (eh > R * 0.15) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.ellipse(x - ew * 0.32, eyeY - eh * 0.38, ew * 0.36, eh * 0.26, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + ew * 0.38, eyeY + eh * 0.42, ew * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#2b1a24";
    ctx.lineCap = "round";
    ctx.lineWidth = R * 0.05;
    ctx.beginPath();
    if (sx < 0) ctx.ellipse(x, eyeY + eh * 0.05, ew * 1.1, eh * 1.08, 0, Math.PI * 1.08, Math.PI * 1.9);
    else ctx.ellipse(x, eyeY + eh * 0.05, ew * 1.1, eh * 1.08, 0, Math.PI * 1.1, Math.PI * 1.92);
    ctx.stroke();
    // The outer corner: a thicker wing.
    ctx.fillStyle = "#2b1a24";
    ctx.beginPath();
    ctx.moveTo(x + sx * ew * 0.55, eyeY - eh * 0.95);
    ctx.quadraticCurveTo(x + sx * ew * 1.15, eyeY - eh * 0.85, x + sx * ew * 1.42, eyeY - eh * 0.35);
    ctx.quadraticCurveTo(x + sx * ew * 1.05, eyeY - eh * 0.6, x + sx * ew * 0.6, eyeY - eh * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = R * 0.025;
    ctx.beginPath();
    ctx.moveTo(x + sx * ew * 0.6, eyeY + eh * 0.92);
    ctx.lineTo(x + sx * ew * 1.0, eyeY + eh * 0.6);
    ctx.stroke();
  }

  // Blush, a tiny nose, a tiny mouth.
  cheeks(ctx, cx, eyeY + R * 0.38, R * 0.56, R * 0.14, p);
  ctx.fillStyle = "rgba(200, 120, 110, 0.55)";
  ctx.beginPath();
  ctx.arc(cx, eyeY + R * 0.28, s * 0.005, 0, Math.PI * 2);
  ctx.fill();
  const mouthY = hy + R * 0.76;
  if (p.reacting) reactionMouth(ctx, cx, mouthY, s * 0.6, p, false);
  else if (p.eye === "happy") {
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.07, mouthY - R * 0.02);
    ctx.quadraticCurveTo(cx, mouthY + R * 0.13, cx + R * 0.07, mouthY - R * 0.02);
    ctx.closePath();
    ctx.fillStyle = "#c2475f";
    ctx.fill();
  } else {
    ctx.strokeStyle = "rgba(130, 70, 70, 0.85)";
    ctx.lineWidth = s * 0.009;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, mouthY - R * 0.035, R * 0.045, 0.3 * Math.PI, 0.7 * Math.PI);
    ctx.stroke();
  }
  return {
    cx, top: hy - R * 1.0, headW: R * 0.95, eyeY, eyeGap: gap, neckY: chinY + R * 0.12, neckW: R * 0.5,
    earX: R * 1.0, earY: hy + R * 0.12, mouthY, earStyle: "cat", ears, s,
  };
}

// â”€â”€ Chick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function drawChick(ctx: CanvasRenderingContext2D, s: number, p: Pose, color: string): Anchor {
  const cx = s / 2;
  const cy = s * 0.6 + p.rest * s * 0.03;
  const r = s * 0.31 * (1 + p.breath * 0.025);
  const flap = Math.sin(p.t * 6) * 0.2 * (1 - p.rest);
  // Feet.
  ctx.strokeStyle = "#f29a38";
  ctx.lineWidth = s * 0.025;
  ctx.lineCap = "round";
  for (const sx of [-1, 1]) {
    const fx = cx + sx * r * 0.35;
    ctx.beginPath();
    ctx.moveTo(fx, cy + r * 0.92);
    ctx.lineTo(fx - s * 0.03, cy + r * 1.08);
    ctx.moveTo(fx, cy + r * 0.92);
    ctx.lineTo(fx + s * 0.03, cy + r * 1.08);
    ctx.stroke();
  }
  // Wings.
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + sx * r * 0.92, cy + r * 0.05);
    ctx.rotate(sx * (0.5 + flap));
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.2, r * 0.36, 0, 0, Math.PI * 2);
    fillSolid(ctx, shade(color, -0.1), -r * 0.36, r * 0.36, s);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  fillSolid(ctx, color, cy - r, cy + r, s, true, [cx - r, cx + r]);
  if (!p.hatted) {
    // Tuft.
    ctx.strokeStyle = shade(color, -0.15);
    ctx.lineWidth = s * 0.03;
    for (const [dx, k] of [[-0.06, -0.5], [0, 0], [0.06, 0.5]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * s * 0.4, cy - r * 0.96);
      ctx.quadraticCurveTo(cx + dx * s, cy - r * 1.3, cx + dx * s + k * s * 0.05, cy - r * (1.32 - p.rest * 0.2));
      ctx.stroke();
    }
  }
  const eyeY = cy - r * 0.15;
  eyes(ctx, cx, eyeY, s * 0.1, s * 0.038, p, isDark(color));
  cheeks(ctx, cx, eyeY + s * 0.075, s * 0.19, s * 0.045, p);
  // Beak.
  const by = eyeY + s * 0.06;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.04, by);
  ctx.quadraticCurveTo(cx, by - s * 0.03, cx + s * 0.04, by);
  ctx.quadraticCurveTo(cx, by + s * 0.05, cx - s * 0.04, by);
  ctx.closePath();
  fillSolid(ctx, "#ff9f43", by - s * 0.03, by + s * 0.04, s);
  return {
    cx, top: cy - r, headW: r * 0.82, eyeY, eyeGap: s * 0.1, neckY: cy + r * 0.48, neckW: r * 0.86,
    earX: r * 0.98, earY: cy - r * 0.28, mouthY: by + s * 0.01, earStyle: "none", s,
  };
}

// â”€â”€ Pelu, the plush bunny â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function drawBunny(ctx: CanvasRenderingContext2D, s: number, p: Pose, color: string): Anchor {
  const cx = s / 2;
  const cy = s * 0.64 + p.rest * s * 0.04;
  const w = s * 0.33 * (1 + p.breath * 0.02);
  const h = s * 0.27 * (1 - p.breath * 0.015);
  const inner = shade(color, 0.45);
  const ears = placeEars(p, () => {
    // One ear up, one flopped over.
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.42, cy - h * 1.55, w * 0.2, h * 0.75, -0.12, 0, Math.PI * 2);
    fillSolid(ctx, color, cy - h * 2.3, cy - h * 0.8, s);
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.42, cy - h * 1.5, w * 0.09, h * 0.52, -0.12, 0, Math.PI * 2);
    ctx.fill();
    const droop = 0.9 + p.rest * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.25, cy - h * 0.85);
    ctx.quadraticCurveTo(cx + w * 0.35, cy - h * 1.9, cx + w * 0.75, cy - h * 1.75);
    ctx.quadraticCurveTo(cx + w * 1.25, cy - h * 1.55, cx + w * 1.2, cy - h * (1.55 - droop));
    ctx.quadraticCurveTo(cx + w * 1.0, cy - h * 1.3, cx + w * 0.6, cy - h * 0.8);
    ctx.closePath();
    fillSolid(ctx, color, cy - h * 1.9, cy - h * 0.6, s);
  });
  bun(ctx, cx, cy, w, h, color, s);
  // Stitched seam down the head.
  ctx.strokeStyle = shade(color, -0.3);
  ctx.lineWidth = s * 0.012;
  ctx.setLineDash([s * 0.02, s * 0.018]);
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.98);
  ctx.lineTo(cx, cy - h * 0.45);
  ctx.stroke();
  ctx.setLineDash([]);
  // Stitched heart patch.
  heart(ctx, cx + w * 0.55, cy + h * 0.5, s * 0.06, "#ff8fb3");
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = s * 0.008;
  ctx.setLineDash([s * 0.012, s * 0.01]);
  ctx.beginPath();
  ctx.arc(cx + w * 0.55, cy + h * 0.47, s * 0.048, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const light = isDark(color);
  const eyeY = cy - h * 0.1;
  eyes(ctx, cx, eyeY, s * 0.1, s * 0.04, p, light);
  cheeks(ctx, cx, eyeY + s * 0.08, s * 0.19, s * 0.045, p);
  const my = eyeY + s * 0.07;
  if (p.reacting) reactionMouth(ctx, cx, my, s, p, light);
  else {
    // A stitched little x for a mouth.
    ctx.strokeStyle = shade(color, -0.45);
    ctx.lineWidth = s * 0.014;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.016, my - s * 0.014);
    ctx.lineTo(cx + s * 0.016, my + s * 0.014);
    ctx.moveTo(cx + s * 0.016, my - s * 0.014);
    ctx.lineTo(cx - s * 0.016, my + s * 0.014);
    ctx.stroke();
  }
  return {
    cx, top: cy - h, headW: w * 0.96, eyeY, eyeGap: s * 0.1, neckY: cy + h * 0.72, neckW: w * 0.85,
    earX: w * 1.0, earY: cy - h * 0.2, mouthY: my, earStyle: "bunny", ears, s,
  };
}

const DRAW: Record<PetId, (ctx: CanvasRenderingContext2D, s: number, p: Pose, color: string) => Anchor> = {
  bou: drawBou,
  ghost: drawGhost,
  cat: drawCat,
  bat: drawBat,
  neko: drawNeko,
  chick: drawChick,
  bunny: drawBunny,
};

// â”€â”€ Coffee and dizzy stars (drawn on top, in the pet's coordinates) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function drawCoffee(ctx: CanvasRenderingContext2D, a: Anchor, sip: number, t: number) {
  const s = a.s;
  const lift = Math.max(0, Math.sin(t * 2.2)) * sip;
  const x = a.cx + s * 0.02;
  const y = a.mouthY + s * 0.11 - lift * s * 0.05;
  ctx.save();
  ctx.globalAlpha = Math.min(1, sip * 1.5);
  ctx.translate(x, y);
  ctx.rotate(-lift * 0.35);
  ctx.strokeStyle = "#e9e3d8";
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.arc(s * 0.07, 0, s * 0.03, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  roundRect(ctx, -s * 0.065, -s * 0.06, s * 0.13, s * 0.11, s * 0.025);
  fillSolid(ctx, "#fbf7f0", -s * 0.06, s * 0.05, s);
  ctx.fillStyle = "#8c5a3a";
  ctx.fillRect(-s * 0.055, -s * 0.055, s * 0.11, s * 0.018);
  heart(ctx, 0, -s * 0.002, s * 0.022, "#ff8fb3");
  ctx.restore();
  // Little paws holding it.
  ctx.save();
  ctx.globalAlpha = Math.min(1, sip * 1.5);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + sx * s * 0.075, y + s * 0.01, s * 0.028, 0, Math.PI * 2);
    fillSolid(ctx, "#fff1e6", y - s * 0.02, y + s * 0.04, s);
  }
  // Steam.
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * sip})`;
  ctx.lineWidth = s * 0.012;
  ctx.lineCap = "round";
  for (const k of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const yy = y - s * 0.08 - i * s * 0.012;
      const xx = x + k * s * 0.025 + Math.sin(i * 0.9 + t * 4 + k) * s * 0.012;
      if (i) ctx.lineTo(xx, yy);
      else ctx.moveTo(xx, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawDizzyStars(ctx: CanvasRenderingContext2D, a: Anchor, t: number) {
  for (let i = 0; i < 3; i++) {
    const ang = t * 3 + (i / 3) * Math.PI * 2;
    const x = a.cx + Math.cos(ang) * a.headW * 0.95;
    const y = a.top - a.s * 0.03 + Math.sin(ang) * a.s * 0.05;
    star(ctx, x, y, a.s * 0.045, "#ffd84d");
  }
}

// â”€â”€ The animated canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Extra room above the pet, for hats â€” the pet itself never shrinks. */
export const HEADROOM = 0.3;

interface Surface {
  canvas: HTMLCanvasElement;
  size: number;
  /** Was on screen once: when it's gone again, it's dropped. */
  seen?: boolean;
}

function surface(size: number): Surface {
  const canvas = document.createElement("canvas");
  const height = size * (1 + HEADROOM);
  canvas.width = Math.round(size * DPR);
  canvas.height = Math.round(height * DPR);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${height}px`;
  return { canvas, size };
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const POUT_S = 2.2;
const DIZZY_S = 2.8;
const COFFEE_S = 5;

/**
 * The 3D choice, read before Settings load so the first pet is already the right
 * kind. Settings keep it here too; a change reloads the page (see wantPet3D).
 */
const PET3D_KEY = "komori-pet3d";

export function pet3dStored(): boolean {
  try {
    return localStorage.getItem(PET3D_KEY) !== "0";
  } catch {
    return true;
  }
}

/** What this page's pets were built as. */
const BUILT_3D = pet3dStored();

/** Remember the 3D choice; true when it differs from what this page was built with. */
export function wantPet3D(on: boolean): boolean {
  try {
    localStorage.setItem(PET3D_KEY, on ? "1" : "0");
  } catch {
    return false;
  }
  return BUILT_3D !== on;
}

/** A pet: a real 3D model when it is turned on and the machine can draw one, the drawn 2D pet otherwise. */
export function createPet(size = 30): Pet {
  const pet = pet3dStored() && webglOk() ? createPet3D(size) : createPet2D(size);
  // A pet left out of this build (see pet3d/models.ts) shows up as Bou.
  const setKind = pet.setKind.bind(pet);
  pet.setKind = (kind, color, style) => (hasPet(kind) ? setKind(kind, color, style) : setKind("bou", undefined, undefined));
  return pet;
}

/** The pets this build offers. */
export { hasPet };

function createPet2D(size = 30): Pet {
  const surfaces: Surface[] = [surface(size)];
  let kind: PetId = "bou";
  let color = PET_COLORS.bou;
  let style = "";
  let outfit: Outfit = {};

  let nextBlink = performance.now() + 2500;
  let blinkStart = -1;
  let shown = false;
  let last = performance.now();

  let restTarget = 0;
  let rest = 0;
  let curiousTarget = 0;
  let curious = 0;
  let happyAt = -1e9;
  let pokeAt = -1e9;
  let wakeAt = -1e9;
  let poutAt = -1e9;
  let dizzyAt = -1e9;
  let coffeeAt = -1e9;
  let pokes: number[] = [];
  const lookTarget = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };

  const since = (at: number, now: number) => (now - at) / 1000;
  let drawnAt = 0;

  function frame(now: number) {
    const live = surfaces.some((x) => x.canvas.isConnected);
    if (live) shown = true;
    else if (shown) return;
    // Copies that were shown and are gone (an old panel) are let go.
    for (let i = surfaces.length - 1; i > 0; i--) {
      const sf = surfaces[i];
      if (sf.canvas.isConnected) sf.seen = true;
      else if (sf.seen) surfaces.splice(i, 1);
    }
    // Nobody can see it (island hidden, window minimised): look again in a bit.
    if (!surfaces.some((x) => x.canvas.isConnected && document.visibilityState === "visible" &&
      (typeof x.canvas.checkVisibility !== "function" || x.canvas.checkVisibility({ opacityProperty: true, visibilityProperty: true })))) {
      last = now;
      window.setTimeout(() => frame(performance.now()), 400);
      return;
    }
    // Breathing only: as many frames as the settings allow. Reacting: 30.
    const lively = Math.abs(lookTarget.x - look.x) + Math.abs(lookTarget.y - look.y) > 0.01 ||
      Math.abs(restTarget - rest) > 0.01 || Math.abs(curiousTarget - curious) > 0.01 ||
      since(happyAt, now) < 1.2 || since(pokeAt, now) < 1.2 || since(wakeAt, now) < 1.5 ||
      since(poutAt, now) < POUT_S || since(dizzyAt, now) < DIZZY_S || since(coffeeAt, now) < COFFEE_S;
    const fps = lively ? 30 : (settings().perf?.petFps ?? 20);
    if (now - drawnAt < 1000 / fps - 2) {
      // Wait on a timer rather than asking for every screen refresh.
      const wait = 1000 / fps - (now - drawnAt);
      if (wait > 6) window.setTimeout(() => requestAnimationFrame(frame), wait - 4);
      else requestAnimationFrame(frame);
      return;
    }
    drawnAt = now;

    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    rest += (restTarget - rest) * Math.min(1, dt * 2.2);
    curious += (curiousTarget - curious) * Math.min(1, dt * 8);
    look.x += (lookTarget.x - look.x) * Math.min(1, dt * 10);
    look.y += (lookTarget.y - look.y) * Math.min(1, dt * 10);

    if (rest < 0.3 && blinkStart < 0 && now > nextBlink) blinkStart = now;
    let blink = 0;
    if (blinkStart >= 0) {
      const t = (now - blinkStart) / 150;
      blink = t < 1 ? t : t < 2 ? 2 - t : 0;
      if (t >= 2) {
        blinkStart = -1;
        nextBlink = now + 2200 + Math.random() * 3500;
      }
    }

    const tHappy = since(happyAt, now);
    const tPoke = since(pokeAt, now);
    const tWake = since(wakeAt, now);
    const tPout = since(poutAt, now);
    const tDizzy = since(dizzyAt, now);
    const tCoffee = since(coffeeAt, now);
    const dizzy = tDizzy < DIZZY_S;
    const pout = !dizzy && tPout < POUT_S;
    const sip = tCoffee < COFFEE_S ? clamp01(Math.min(tCoffee * 3, (COFFEE_S - tCoffee) * 3)) : 0;

    let eye: EyeMode = "open";
    if (rest > 0.5) eye = "closed";
    else if (dizzy) eye = "dizzy";
    else if (pout) eye = "pout";
    else if (sip > 0.3 || tHappy < 1.3 || tPoke < 1.1 || (tWake > 0.5 && tWake < 1.4)) eye = "happy";

    const head = item(outfit.head);
    const pose: Pose = {
      breath: (Math.sin(now / (700 + rest * 900)) + 1) / 2,
      blink,
      t: now / 1000,
      eye,
      rest: ease(clamp01(rest)),
      hatted: !!head?.covers,
      earsHidden: !!head?.hidesEars,
      reacting: dizzy || pout,
      style,
      look: rest > 0.5 ? { x: 0, y: 0 } : { x: look.x, y: look.y },
    };

    for (const { canvas, size: s } of surfaces) {
      if (!canvas.isConnected) continue;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, s, s * (1 + HEADROOM));
      // The pet lives in the bottom square; the strip above is for hats.
      ctx.translate(0, s * HEADROOM);

      // Whole-body motion.
      let dy = 0;
      let sx = 1;
      let sy = 1;
      let rot = -curious * 0.14;
      if (tHappy < 0.55) dy -= Math.sin((tHappy / 0.55) * Math.PI) * s * 0.09;
      if (tPoke < 0.6) {
        const k = Math.sin((tPoke / 0.6) * Math.PI * 2) * Math.exp(-tPoke * 4);
        sx *= 1 + k * 0.16;
        sy *= 1 - k * 0.16;
      }
      if (tWake < 0.7) {
        const k = Math.sin((tWake / 0.7) * Math.PI);
        sy *= 1 + k * 0.14;
        sx *= 1 - k * 0.06;
      }
      if (pout) {
        // A little huff, side to side.
        rot += Math.sin(tPout * 14) * 0.05 * Math.max(0, 1 - tPout / POUT_S);
        sx *= 1.04;
      }
      if (dizzy) rot += Math.sin(tDizzy * 9) * 0.16 * Math.max(0.2, 1 - tDizzy / DIZZY_S);

      // A soft shadow on the ground, for depth (the ghost draws its own).
      if (kind !== "ghost") {
        ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
        ctx.beginPath();
        ctx.ellipse(s / 2, s * 0.965, s * 0.27 + dy * 0.6, s * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(s / 2, s + dy);
      ctx.scale(sx, sy);
      ctx.rotate(rot);
      ctx.translate(-s / 2, -s);
      if (kind === "bat" && pose.rest > 0) {
        ctx.translate(s / 2, s * 0.55);
        ctx.rotate(Math.PI * pose.rest);
        ctx.translate(-s / 2, -s * 0.55);
      }
      if (kind === "ghost") ctx.globalAlpha = 1 - pose.rest * 0.35;

      const anchor = DRAW[kind](ctx, s, pose, color);
      item(outfit.face)?.draw(ctx, anchor);
      head?.draw(ctx, anchor);
      anchor.ears?.();
      if (sip > 0 && pose.rest < 0.3) drawCoffee(ctx, anchor, sip, pose.t);
      if (dizzy) drawDizzyStars(ctx, anchor, pose.t);
      ctx.restore();

      if (pose.rest > 0.5) {
        ctx.fillStyle = `rgba(160, 200, 255, ${(pose.rest - 0.5) * 1.6})`;
        for (let i = 0; i < 3; i++) {
          const ph = ((now / 1000 + i * 0.8) % 2.4) / 2.4;
          const fs = s * (0.14 + i * 0.03);
          ctx.globalAlpha = Math.sin(ph * Math.PI);
          ctx.font = `700 ${fs}px system-ui, sans-serif`;
          ctx.fillText("z", s * (0.74 + ph * 0.12), s * (0.36 - ph * 0.3));
        }
        ctx.globalAlpha = 1;
      }
      if (tPoke < 1.1 && !pout && !dizzy) {
        ctx.globalAlpha = 1 - tPoke / 1.1;
        heart(ctx, s * 0.78, s * (0.3 - tPoke * 0.2), s * 0.09, "#ff6f91");
        ctx.globalAlpha = 1;
      }
      if (pout) {
        // A little puff: "hmph".
        ctx.globalAlpha = Math.max(0, 1 - tPout / POUT_S);
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(s * (0.82 + i * 0.05), s * (0.25 - i * 0.05 - tPout * 0.03), s * (0.025 + i * 0.01), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const pet: Pet = {
    el: surfaces[0].canvas,
    clone(s = 26) {
      const extra = surface(s);
      surfaces.push(extra);
      return extra.canvas;
    },
    setKind(next, nextColor, nextStyle) {
      kind = DRAW[next] ? next : "bou";
      color = nextColor && /^#[0-9a-f]{6}$/i.test(nextColor) ? nextColor : PET_COLORS[kind];
      const styles = PET_STYLES[kind] ?? [];
      style = styles.find((x) => x.id === nextStyle)?.id ?? styles[0]?.id ?? "";
    },
    setLook(x, y) {
      lookTarget.x = Math.max(-1, Math.min(1, x));
      lookTarget.y = Math.max(-1, Math.min(1, y));
    },
    setOutfit(next) {
      outfit = next ?? {};
    },
    happy() {
      if (restTarget > 0) return;
      happyAt = performance.now();
      petSound("happy");
    },
    poke() {
      const now = performance.now();
      if (restTarget > 0) pet.setSleeping(false);
      pokes = [...pokes.filter((x) => now - x < 3000), now];
      if (pokes.length >= 8) {
        dizzyAt = now;
        pokes = [];
        petSound("dizzy");
      } else if (pokes.length >= 4) {
        poutAt = now;
        petSound("pout");
      } else {
        pokeAt = now;
        petSound("poke");
      }
    },
    react(what) {
      const now = performance.now();
      if (what === "pout") poutAt = now;
      else if (what === "dizzy") dizzyAt = now;
      else coffeeAt = now;
      petSound(what);
    },
    coffee() {
      if (pet.busy) return;
      coffeeAt = performance.now();
      petSound("coffee");
    },
    setCurious(on) {
      curiousTarget = on ? 1 : 0;
    },
    setSleeping(on) {
      if (on === restTarget > 0) return;
      restTarget = on ? 1 : 0;
      if (!on) wakeAt = performance.now();
      // Waking up is heard; falling asleep happens when nobody is around.
      if (!on) petSound("wake");
    },
    get busy() {
      const now = performance.now();
      return restTarget > 0 || since(dizzyAt, now) < DIZZY_S || since(poutAt, now) < POUT_S || since(coffeeAt, now) < COFFEE_S;
    },
  };
  return pet;
}
