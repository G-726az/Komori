// Komori's wardrobe: two slots per pet — head and face/neck — drawn in code,
// with a little volume (light from above, a soft outline, a gloss).
// Every item is placed from the pet's anchor points, so the same hat sits right
// on any pet. Original designs.

import { type EarStyle, fillSolid, gloss, heart, roundRect, shade, star, volume } from "./paint";

export { heart };

export type Slot = "head" | "face";

/** Where things go on a pet, in the pet's own drawing coordinates. */
export interface Anchor {
  cx: number;
  /** Top of the head (where a hat sits). */
  top: number;
  /** Half the head's width at hat height. */
  headW: number;
  eyeY: number;
  eyeGap: number;
  /** Where a scarf or a bow tie goes. */
  neckY: number;
  /** Half the body's width at the neck. */
  neckW: number;
  /** Sides of the head, where you would listen: ± earX at earY. */
  earX: number;
  earY: number;
  /** Middle of the mouth (a face mask covers it). */
  mouthY: number;
  /** The pet's own ears, which a hood copies. */
  earStyle: EarStyle;
  /** Pets with ears on top draw them over a hat, through "holes". */
  ears?: () => void;
  /** Pet size, for line widths. */
  s: number;
}

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  /** Covers the top of the head: hides Bou's sprout; ears come out through it. */
  covers?: boolean;
  /** Brings its own ears (a hood, a cap with ears): the pet's are hidden. */
  hidesEars?: boolean;
  draw(ctx: CanvasRenderingContext2D, a: Anchor): void;
}

export interface Outfit {
  head?: string;
  face?: string;
}

const lw = (a: Anchor, k: number) => Math.max(0.6, a.s * k);

// ── Head ──────────────────────────────────────────────────────────────────────

const beanie: Item = {
  id: "beanie", name: "Gorro de lana", slot: "head", covers: true,
  draw(ctx, a) {
    const w = a.headW * 0.98;
    const y = a.top + a.s * 0.06;
    ctx.beginPath();
    ctx.ellipse(a.cx, y, w, w * 0.8, 0, Math.PI, 0);
    ctx.closePath();
    fillSolid(ctx, "#ff8f8f", y - w * 0.8, y, a.s);
    ctx.strokeStyle = "rgba(150, 40, 50, 0.22)";
    ctx.lineWidth = lw(a, 0.012);
    for (const k of [-0.55, -0.18, 0.18, 0.55]) {
      ctx.beginPath();
      ctx.moveTo(a.cx + k * w, y - a.s * 0.02);
      ctx.quadraticCurveTo(a.cx + k * w * 0.85, y - w * 0.5, a.cx + k * w * 0.45, y - w * 0.74);
      ctx.stroke();
    }
    roundRect(ctx, a.cx - w * 1.06, y - a.s * 0.045, w * 2.12, a.s * 0.09, a.s * 0.045);
    fillSolid(ctx, "#f06a75", y - a.s * 0.045, y + a.s * 0.045, a.s);
    ctx.beginPath();
    ctx.arc(a.cx, y - w * 0.82, a.s * 0.075, 0, Math.PI * 2);
    fillSolid(ctx, "#fff6ef", y - w * 0.9, y - w * 0.74, a.s);
    gloss(ctx, a.cx - w * 0.35, y - w * 0.45, w * 0.35, 0.35);
  },
};

const crown: Item = {
  id: "crown", name: "Corona", slot: "head", covers: true,
  draw(ctx, a) {
    const w = a.headW * 0.72;
    const base = a.top + a.s * 0.04;
    const h = a.s * 0.22;
    ctx.beginPath();
    ctx.moveTo(a.cx - w, base);
    ctx.lineTo(a.cx - w, base - h * 0.6);
    ctx.lineTo(a.cx - w * 0.5, base - h * 0.25);
    ctx.lineTo(a.cx, base - h);
    ctx.lineTo(a.cx + w * 0.5, base - h * 0.25);
    ctx.lineTo(a.cx + w, base - h * 0.6);
    ctx.lineTo(a.cx + w, base);
    ctx.closePath();
    fillSolid(ctx, "#ffd25e", base - h, base, a.s);
    roundRect(ctx, a.cx - w, base - h * 0.2, w * 2, h * 0.2, h * 0.06);
    fillSolid(ctx, "#e9a93a", base - h * 0.2, base, a.s, false);
    for (const [k, c] of [[0, "#ff6f91"], [-0.62, "#6fd0ff"], [0.62, "#6fd0ff"]] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(a.cx + k * w, base - h * (k ? 0.32 : 0.45), a.s * (k ? 0.017 : 0.025), 0, Math.PI * 2);
      ctx.fill();
    }
    gloss(ctx, a.cx - w * 0.4, base - h * 0.45, w * 0.35, 0.5);
  },
};

const witch: Item = {
  id: "witch", name: "Sombrero de bruja", slot: "head", covers: true,
  draw(ctx, a) {
    const w = a.headW * 1.22;
    const y = a.top + a.s * 0.05;
    ctx.beginPath();
    ctx.ellipse(a.cx, y, w, a.s * 0.05, 0, 0, Math.PI * 2);
    fillSolid(ctx, "#5b3fa3", y - a.s * 0.05, y + a.s * 0.05, a.s);
    ctx.beginPath();
    ctx.moveTo(a.cx - w * 0.5, y);
    ctx.quadraticCurveTo(a.cx - w * 0.2, y - a.s * 0.26, a.cx + w * 0.15, y - a.s * 0.38);
    ctx.quadraticCurveTo(a.cx + w * 0.55, y - a.s * 0.41, a.cx + w * 0.42, y - a.s * 0.33);
    ctx.quadraticCurveTo(a.cx + w * 0.3, y - a.s * 0.19, a.cx + w * 0.5, y);
    ctx.closePath();
    fillSolid(ctx, "#7c5cc9", y - a.s * 0.4, y, a.s);
    ctx.fillStyle = "#ffcf5c";
    ctx.fillRect(a.cx - w * 0.47, y - a.s * 0.065, w * 0.94, a.s * 0.045);
    star(ctx, a.cx + w * 0.05, y - a.s * 0.17, a.s * 0.035, "#ffe9a0");
  },
};

const party: Item = {
  id: "party", name: "Gorro de fiesta", slot: "head", covers: true,
  draw(ctx, a) {
    const y = a.top + a.s * 0.03;
    const bx = a.cx + a.headW * 0.12;
    const w = a.headW * 0.5;
    const tipX = bx + a.s * 0.07;
    const tipY = y - a.s * 0.33;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx - w, y);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(bx + w, y);
    ctx.closePath();
    fillSolid(ctx, "#7fd8f5", tipY, y, a.s);
    ctx.clip();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = lw(a, 0.03);
    for (let i = 0; i < 4; i++) {
      const yy = y - (i + 0.5) * a.s * 0.085;
      ctx.beginPath();
      ctx.moveTo(bx - w, yy + a.s * 0.04);
      ctx.lineTo(bx + w, yy - a.s * 0.04);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(tipX, tipY, a.s * 0.05, 0, Math.PI * 2);
    fillSolid(ctx, "#ff8fb1", tipY - a.s * 0.05, tipY + a.s * 0.05, a.s);
  },
};

/** Little ears sewn onto a cap, a hood or a headband. */
function sewnEars(ctx: CanvasRenderingContext2D, a: Anchor, x: number, baseY: number, h: number, style: EarStyle, color: string, inner: string) {
  const tall = style === "bat" ? 1.35 : 1;
  for (const sx of [-1, 1]) {
    const bx = a.cx + sx * x;
    ctx.beginPath();
    if (style === "bunny") {
      ctx.ellipse(bx + sx * a.s * 0.02, baseY - h * 1.1, h * 0.38, h * 1.15, sx * 0.18, 0, Math.PI * 2);
    } else {
      ctx.moveTo(bx - sx * h * 0.75, baseY + h * 0.1);
      ctx.quadraticCurveTo(bx + sx * h * 0.05, baseY - h * tall * 1.1, bx + sx * h * 0.45, baseY - h * tall);
      ctx.quadraticCurveTo(bx + sx * h * 0.65, baseY - h * 0.3, bx + sx * h * 0.55, baseY + h * 0.25);
      ctx.closePath();
    }
    fillSolid(ctx, color, baseY - h * 1.3, baseY, a.s);
    ctx.fillStyle = inner;
    ctx.beginPath();
    if (style === "bunny") {
      ctx.ellipse(bx + sx * a.s * 0.02, baseY - h * 1.05, h * 0.18, h * 0.8, sx * 0.18, 0, Math.PI * 2);
    } else {
      ctx.moveTo(bx - sx * h * 0.35, baseY);
      ctx.quadraticCurveTo(bx + sx * h * 0.12, baseY - h * tall * 0.85, bx + sx * h * 0.38, baseY - h * tall * 0.75);
      ctx.quadraticCurveTo(bx + sx * h * 0.45, baseY - h * 0.25, bx + sx * h * 0.35, baseY + h * 0.08);
      ctx.closePath();
    }
    ctx.fill();
  }
}

const capEars: Item = {
  id: "capears", name: "Gorra con orejitas", slot: "head", covers: true, hidesEars: true,
  draw(ctx, a) {
    const w = a.headW * 1.02;
    const y = a.top + a.s * 0.08;
    const color = "#f4f5f9";
    sewnEars(ctx, a, w * 0.62, y - w * 0.55, a.s * 0.1, "cat", color, "#c9ccd8");
    ctx.beginPath();
    ctx.ellipse(a.cx, y, w, w * 0.72, 0, Math.PI, 0);
    ctx.closePath();
    fillSolid(ctx, color, y - w * 0.72, y, a.s);
    ctx.strokeStyle = "rgba(120, 125, 145, 0.35)";
    ctx.lineWidth = lw(a, 0.012);
    ctx.beginPath();
    ctx.moveTo(a.cx, y - w * 0.72);
    ctx.lineTo(a.cx, y);
    ctx.stroke();
    // Visor towards the viewer.
    ctx.beginPath();
    ctx.ellipse(a.cx, y + a.s * 0.005, w * 1.08, a.s * 0.05, 0, 0, Math.PI);
    ctx.closePath();
    fillSolid(ctx, shade(color, -0.06), y, y + a.s * 0.05, a.s);
    gloss(ctx, a.cx - w * 0.4, y - w * 0.42, w * 0.32, 0.45);
  },
};

const backCap: Item = {
  id: "backcap", name: "Gorra hacia atrás", slot: "head", covers: true,
  draw(ctx, a) {
    const w = a.headW * 1.0;
    const y = a.top + a.s * 0.07;
    // The visor peeks out behind, on one side.
    ctx.beginPath();
    ctx.ellipse(a.cx + w * 0.75, y - w * 0.18, w * 0.5, a.s * 0.04, -0.35, 0, Math.PI * 2);
    fillSolid(ctx, "#c7343f", y - w * 0.3, y, a.s);
    ctx.beginPath();
    ctx.ellipse(a.cx, y, w, w * 0.72, 0, Math.PI, 0);
    ctx.closePath();
    fillSolid(ctx, "#e5484d", y - w * 0.72, y, a.s);
    // The strap opening at the front (it's on backwards).
    roundRect(ctx, a.cx - w * 0.28, y - a.s * 0.075, w * 0.56, a.s * 0.06, a.s * 0.03);
    ctx.fillStyle = shade("#e5484d", -0.35);
    ctx.fill();
    gloss(ctx, a.cx - w * 0.4, y - w * 0.42, w * 0.32, 0.4);
  },
};

const hood: Item = {
  id: "hood", name: "Capucha con orejas", slot: "head", covers: true, hidesEars: true,
  draw(ctx, a) {
    const color = "#e9eaf1";
    const w = a.headW * 1.3;
    const top = a.top - a.s * 0.04;
    const bottom = a.neckY + a.s * 0.02;
    const faceY = a.eyeY + a.s * 0.02;
    const style = a.earStyle === "none" ? "cat" : a.earStyle;
    sewnEars(ctx, a, w * 0.62, top + a.s * 0.07, a.s * (style === "bunny" ? 0.13 : 0.12), style, color, "#a9adbd");
    // A soft shell with an opening for the face (evenodd).
    ctx.beginPath();
    ctx.moveTo(a.cx - w, bottom);
    ctx.bezierCurveTo(a.cx - w * 1.12, top + (bottom - top) * 0.25, a.cx - w * 0.6, top, a.cx, top);
    ctx.bezierCurveTo(a.cx + w * 0.6, top, a.cx + w * 1.12, top + (bottom - top) * 0.25, a.cx + w, bottom);
    ctx.quadraticCurveTo(a.cx, bottom + a.s * 0.05, a.cx - w, bottom);
    ctx.closePath();
    const ow = Math.max(a.eyeGap * 2.05, a.headW * 0.8);
    const oh = Math.max((bottom - faceY) * 0.95, ow * 0.85);
    // A fresh subpath, so no stray line joins the shell to the opening.
    ctx.moveTo(a.cx + ow, faceY + oh * 0.15);
    ctx.ellipse(a.cx, faceY + oh * 0.15, ow, oh, 0, 0, Math.PI * 2);
    ctx.fillStyle = volume(ctx, color, top, bottom);
    ctx.fill("evenodd");
    ctx.strokeStyle = shade(color, -0.35);
    ctx.lineWidth = lw(a, 0.012);
    ctx.stroke();
    ctx.strokeStyle = "#b9bdcc";
    ctx.lineWidth = lw(a, 0.025);
    ctx.beginPath();
    ctx.ellipse(a.cx, faceY + oh * 0.15, ow, oh, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    // A tiny stitched ω on top.
    ctx.strokeStyle = "rgba(110, 115, 135, 0.7)";
    ctx.lineWidth = lw(a, 0.012);
    const fy = top + a.s * 0.075;
    ctx.beginPath();
    ctx.arc(a.cx - a.s * 0.016, fy, a.s * 0.016, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.arc(a.cx + a.s * 0.016, fy, a.s * 0.016, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = "#c9ccd8";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(a.cx + sx * ow * 0.5, bottom - a.s * 0.01);
      ctx.lineTo(a.cx + sx * ow * 0.45, bottom + a.s * 0.07);
      ctx.stroke();
    }
    gloss(ctx, a.cx - w * 0.5, top + (bottom - top) * 0.25, w * 0.35, 0.35);
  },
};

const bow: Item = {
  id: "bow", name: "Lazo", slot: "head",
  draw(ctx, a) {
    const x = a.cx + a.headW * 0.6;
    const y = a.top + a.s * 0.06;
    const r = a.s * 0.13;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sx * r * 1.4, y - r * 1.1, x + sx * r * 1.2, y + r * 0.1);
      ctx.quadraticCurveTo(x + sx * r * 1.3, y + r * 1.0, x, y);
      fillSolid(ctx, "#ff7aa8", y - r, y + r, a.s);
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
    fillSolid(ctx, "#f2558c", y - r * 0.4, y + r * 0.4, a.s);
  },
};

const flower: Item = {
  id: "flower", name: "Flor", slot: "head",
  draw(ctx, a) {
    const x = a.cx - a.headW * 0.6;
    const y = a.top + a.s * 0.07;
    const r = a.s * 0.075;
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * r, y + Math.sin(ang) * r, r * 0.8, 0, Math.PI * 2);
      fillSolid(ctx, "#fff2a8", y - r * 1.6, y + r * 1.6, a.s, false);
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
    fillSolid(ctx, "#ffb347", y - r * 0.7, y + r * 0.7, a.s);
  },
};

const headphones: Item = {
  id: "headphones", name: "Auriculares de gato", slot: "head",
  draw(ctx, a) {
    const x = a.earX + a.s * 0.025;
    const y = a.earY;
    const glow = "#8ff0b8";
    ctx.strokeStyle = "#2f3340";
    ctx.lineWidth = lw(a, 0.05);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.cx - x, y - a.s * 0.03);
    ctx.bezierCurveTo(a.cx - x, a.top - a.s * 0.17, a.cx + x, a.top - a.s * 0.17, a.cx + x, y - a.s * 0.03);
    ctx.stroke();
    // Two little cat ears on the band.
    sewnEars(ctx, a, x * 0.55, a.top - a.s * 0.06, a.s * 0.075, "cat", "#2f3340", glow);
    for (const sx of [-1, 1]) {
      const cxp = a.cx + sx * x;
      ctx.beginPath();
      ctx.ellipse(cxp, y, a.s * 0.075, a.s * 0.1, 0, 0, Math.PI * 2);
      fillSolid(ctx, "#2f3340", y - a.s * 0.1, y + a.s * 0.1, a.s);
      ctx.strokeStyle = glow;
      ctx.lineWidth = lw(a, 0.02);
      ctx.beginPath();
      ctx.ellipse(cxp, y, a.s * 0.045, a.s * 0.065, 0, 0, Math.PI * 2);
      ctx.stroke();
      gloss(ctx, cxp - a.s * 0.025, y - a.s * 0.04, a.s * 0.04, 0.4);
    }
  },
};

const earmuffs: Item = {
  id: "earmuffs", name: "Orejeras", slot: "head",
  draw(ctx, a) {
    const x = a.earX + a.s * 0.02;
    const y = a.earY;
    ctx.strokeStyle = "#e9c7d6";
    ctx.lineWidth = lw(a, 0.035);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.cx - x, y);
    ctx.bezierCurveTo(a.cx - x, a.top - a.s * 0.14, a.cx + x, a.top - a.s * 0.14, a.cx + x, y);
    ctx.stroke();
    for (const sx of [-1, 1]) {
      const cxp = a.cx + sx * x;
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cxp + Math.cos(ang) * a.s * 0.06, y + Math.sin(ang) * a.s * 0.06, a.s * 0.045, 0, Math.PI * 2);
        fillSolid(ctx, "#fde7f0", y - a.s * 0.11, y + a.s * 0.11, a.s, false);
      }
      ctx.beginPath();
      ctx.arc(cxp, y, a.s * 0.07, 0, Math.PI * 2);
      fillSolid(ctx, "#ffd6e6", y - a.s * 0.07, y + a.s * 0.07, a.s, false);
      gloss(ctx, cxp - a.s * 0.03, y - a.s * 0.035, a.s * 0.05, 0.5);
    }
  },
};

const earbuds: Item = {
  id: "earbuds", name: "Audífonos de teléfono", slot: "head",
  draw(ctx, a) {
    const x = a.earX;
    const y = a.earY + a.s * 0.02;
    const jackY = a.neckY + a.s * 0.06;
    ctx.strokeStyle = "#f3f3f7";
    ctx.lineWidth = lw(a, 0.014);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(a.cx + sx * x, y);
      ctx.quadraticCurveTo(a.cx + sx * x * 1.05, jackY - a.s * 0.08, a.cx, jackY);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(a.cx, jackY);
    ctx.lineTo(a.cx, jackY + a.s * 0.06);
    ctx.stroke();
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(a.cx + sx * x, y, a.s * 0.042, a.s * 0.034, 0, 0, Math.PI * 2);
      fillSolid(ctx, "#ffffff", y - a.s * 0.034, y + a.s * 0.034, a.s);
      ctx.fillStyle = "#c9ccd6";
      ctx.beginPath();
      ctx.arc(a.cx + sx * x, y, a.s * 0.016, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

// ── Face / neck ───────────────────────────────────────────────────────────────

const glasses: Item = {
  id: "glasses", name: "Gafas redondas", slot: "face",
  draw(ctx, a) {
    const r = a.s * 0.085;
    ctx.strokeStyle = "#5a3d2b";
    ctx.lineWidth = lw(a, 0.022);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(a.cx + sx * a.eyeGap, a.eyeY, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(200, 230, 255, 0.22)";
      ctx.fill();
      ctx.stroke();
      gloss(ctx, a.cx + sx * a.eyeGap - r * 0.4, a.eyeY - r * 0.4, r * 0.45, 0.55);
    }
    ctx.beginPath();
    ctx.moveTo(a.cx - a.eyeGap + r, a.eyeY - r * 0.2);
    ctx.quadraticCurveTo(a.cx, a.eyeY - r * 0.7, a.cx + a.eyeGap - r, a.eyeY - r * 0.2);
    ctx.stroke();
  },
};

const hearts: Item = {
  id: "hearts", name: "Gafas de corazón", slot: "face",
  draw(ctx, a) {
    const r = a.s * 0.095;
    for (const sx of [-1, 1]) {
      heart(ctx, a.cx + sx * a.eyeGap, a.eyeY + r * 0.1, r, "rgba(255, 92, 140, 0.88)");
      gloss(ctx, a.cx + sx * a.eyeGap - r * 0.35, a.eyeY - r * 0.25, r * 0.4, 0.6);
    }
    ctx.strokeStyle = "#ff5c8c";
    ctx.lineWidth = lw(a, 0.016);
    ctx.beginPath();
    ctx.moveTo(a.cx - a.eyeGap + r * 0.8, a.eyeY - r * 0.4);
    ctx.lineTo(a.cx + a.eyeGap - r * 0.8, a.eyeY - r * 0.4);
    ctx.stroke();
  },
};

const mask: Item = {
  id: "mask", name: "Mascarilla", slot: "face",
  draw(ctx, a) {
    const w = a.eyeGap * 1.45;
    const top = a.eyeY + a.s * 0.045;
    const bottom = a.mouthY + a.s * 0.075;
    ctx.strokeStyle = "rgba(235, 245, 255, 0.9)";
    ctx.lineWidth = lw(a, 0.012);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(a.cx + sx * w, top + a.s * 0.01);
      ctx.quadraticCurveTo(a.cx + sx * a.earX * 1.05, (top + a.earY) / 2, a.cx + sx * a.earX, a.earY + a.s * 0.02);
      ctx.moveTo(a.cx + sx * w, bottom - a.s * 0.01);
      ctx.quadraticCurveTo(a.cx + sx * a.earX * 1.1, bottom - a.s * 0.02, a.cx + sx * a.earX, a.earY + a.s * 0.04);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(a.cx - w, top + a.s * 0.012);
    ctx.quadraticCurveTo(a.cx, top - a.s * 0.02, a.cx + w, top + a.s * 0.012);
    ctx.lineTo(a.cx + w * 0.92, bottom - a.s * 0.012);
    ctx.quadraticCurveTo(a.cx, bottom + a.s * 0.03, a.cx - w * 0.92, bottom - a.s * 0.012);
    ctx.closePath();
    fillSolid(ctx, "#bfe3f7", top, bottom, a.s);
    ctx.strokeStyle = "rgba(90, 150, 190, 0.45)";
    ctx.lineWidth = lw(a, 0.01);
    for (const k of [0.3, 0.55, 0.8]) {
      const y = top + (bottom - top) * k;
      ctx.beginPath();
      ctx.moveTo(a.cx - w * 0.8, y);
      ctx.quadraticCurveTo(a.cx, y + a.s * 0.012, a.cx + w * 0.8, y);
      ctx.stroke();
    }
  },
};

const scarf: Item = {
  id: "scarf", name: "Bufanda", slot: "face",
  draw(ctx, a) {
    const w = a.neckW * 1.04;
    const y = a.neckY;
    const h = a.s * 0.08;
    roundRect(ctx, a.cx - w, y - h / 2, w * 2, h, h / 2);
    fillSolid(ctx, "#6fb7ff", y - h / 2, y + h / 2, a.s);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    for (const k of [-0.5, 0, 0.5]) ctx.fillRect(a.cx + k * w - a.s * 0.01, y - h / 2, a.s * 0.02, h);
    roundRect(ctx, a.cx + w * 0.35, y, a.s * 0.075, a.s * 0.14, a.s * 0.025);
    fillSolid(ctx, "#5aa4f0", y, y + a.s * 0.14, a.s);
  },
};

const bowtie: Item = {
  id: "bowtie", name: "Pajarita", slot: "face",
  draw(ctx, a) {
    const x = a.cx;
    const y = a.neckY;
    const r = a.s * 0.075;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + sx * r * 1.4, y - r * 0.8);
      ctx.lineTo(x + sx * r * 1.4, y + r * 0.8);
      ctx.closePath();
      fillSolid(ctx, "#e05666", y - r, y + r, a.s);
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    fillSolid(ctx, "#b8394a", y - r * 0.35, y + r * 0.35, a.s);
  },
};

const bandana: Item = {
  id: "bandana", name: "Pañuelo", slot: "face",
  draw(ctx, a) {
    const w = a.neckW * 0.85;
    const y = a.neckY - a.s * 0.02;
    ctx.beginPath();
    ctx.moveTo(a.cx - w, y);
    ctx.lineTo(a.cx + w, y);
    ctx.lineTo(a.cx, y + a.s * 0.13);
    ctx.closePath();
    fillSolid(ctx, "#ffb44d", y, y + a.s * 0.13, a.s);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    for (const [dx, dy] of [[-0.35, 0.03], [0.3, 0.035], [0, 0.07]]) {
      ctx.beginPath();
      ctx.arc(a.cx + dx * w, y + a.s * dy, a.s * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

export const ITEMS: Item[] = [
  beanie, capEars, backCap, hood, crown, witch, party, bow, flower, headphones, earmuffs, earbuds,
  glasses, hearts, mask, scarf, bowtie, bandana,
];

export function item(id: string | undefined): Item | null {
  return ITEMS.find((x) => x.id === id) ?? null;
}
