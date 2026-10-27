// Small painting helpers shared by the pets and the wardrobe: colour mixing and
// the "3D" look — a light-to-shade gradient, a soft outline and a highlight.

export function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Mix a colour with white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex);
  const target = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const c = (x: number) => Math.round(x + (target - x) * k);
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

export function isDark(hex: string): boolean {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

/** Lit from the top: lighter above, a touch darker below. */
export function volume(ctx: CanvasRenderingContext2D, color: string, y0: number, y1: number, light = 0.3, dark = 0.18) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(color, light));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -dark));
  return g;
}

/** Fill the current path with volume, then a soft darker outline. With the
 *  shape's left and right edges (x), it's lit like a round 3D body: light from
 *  the top left, shade toward the far edge, a little shadow underneath and a
 *  rim of light along the bottom right. */
export function fillSolid(ctx: CanvasRenderingContext2D, color: string, y0: number, y1: number, s: number, outline = true, x?: [number, number]) {
  if (x) {
    sphere(ctx, color, x[0], y0, x[1], y1);
  } else {
    ctx.fillStyle = volume(ctx, color, y0, y1);
    ctx.fill();
  }
  if (outline) {
    ctx.strokeStyle = shade(color, -0.38);
    ctx.lineWidth = Math.max(0.6, s * 0.012);
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

/** A glossy spot of light. */
export function gloss(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.7);
  ctx.bezierCurveTo(x - r * 1.3, y - r * 0.1, x - r * 0.6, y - r * 1.0, x, y - r * 0.35);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.0, x + r * 1.3, y - r * 0.1, x, y + r * 0.7);
  ctx.fill();
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(ang) * rr;
    const py = y + Math.sin(ang) * rr;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** Ear shapes, shared by the pets and by the hood that copies their ears. */
export type EarStyle = "cat" | "bat" | "bunny" | "none";

/** Round-body lighting for the current path (see fillSolid). */
function sphere(ctx: CanvasRenderingContext2D, color: string, x0: number, y0: number, x1: number, y1: number) {
  const w = x1 - x0;
  const h = y1 - y0;
  const g = ctx.createRadialGradient(x0 + w * 0.34, y0 + h * 0.26, 0, x0 + w * 0.46, y0 + h * 0.44, Math.max(w, h) * 0.78);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.32, shade(color, 0.14));
  g.addColorStop(0.72, color);
  g.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Soft shadow where the body turns away underneath.
  const under = ctx.createLinearGradient(0, y0 + h * 0.55, 0, y1);
  under.addColorStop(0, "rgba(0, 0, 0, 0)");
  under.addColorStop(1, "rgba(0, 0, 0, 0.18)");
  ctx.fillStyle = under;
  ctx.fillRect(x0 - 2, y0, w + 4, h + 2);
  // A soft shine near the top left, kept inside the shape.
  const shine = ctx.createRadialGradient(x0 + w * 0.3, y0 + h * 0.24, 0, x0 + w * 0.3, y0 + h * 0.24, Math.min(w, h) * 0.3);
  shine.addColorStop(0, "rgba(255, 255, 255, 0.55)");
  shine.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = shine;
  ctx.fillRect(x0 - 2, y0, w + 4, h + 2);
  // Light bouncing back on the lower right edge.
  const rim = ctx.createRadialGradient(x1 - w * 0.08, y1 - h * 0.1, 0, x1 - w * 0.08, y1 - h * 0.1, w * 0.42);
  rim.addColorStop(0, "rgba(255, 255, 255, 0.18)");
  rim.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = rim;
  ctx.fillRect(x0 - 2, y0, w + 4, h + 2);
  ctx.restore();
}
