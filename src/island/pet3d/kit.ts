// Building blocks for the 3D pets: materials, smooth tubes, eyes with all
// their expressions, cheeks, ears and little shapes (hearts, stars).

import * as THREE from "three";
import { environment } from "./engine";

export type V = THREE.Vector3;
export const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ── Materials ────────────────────────────────────────────────────────────────

/** Soft vinyl: a bit glossy, like a designer toy. */
export function vinyl(color: THREE.ColorRepresentation, rough = 0.42, coat = 0.35): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: rough, metalness: 0, clearcoat: coat, clearcoatRoughness: 0.35,
    sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff), envMap: environment(), envMapIntensity: 0.8,
  });
}

/** Fabric and hair: matte with a soft sheen. */
export function cloth(color: THREE.ColorRepresentation): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.75, metalness: 0, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff),
    envMap: environment(), envMapIntensity: 0.5,
  });
}

/** Glossy ink for eyes and mouths. */
export const ink = () => new THREE.MeshPhysicalMaterial({ color: 0x1e1a20, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMap: environment(), envMapIntensity: 1.2 });
export const shine = () => new THREE.MeshBasicMaterial({ color: 0xffffff });
export const metal = (color: THREE.ColorRepresentation) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.9, envMap: environment(), envMapIntensity: 1.4 });
export const glow = (color: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4 });

/** A mesh that casts and receives shadows. */
export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** A smooth round tube through points (mouths, whiskers, stems, cables…). */
export function tube(points: V[], radius: number, mat: THREE.Material, segments = 32): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segments, radius, 10, false);
  const m = mesh(geo, mat);
  // Round the ends.
  const cap = new THREE.SphereGeometry(radius, 10, 8);
  for (const p of [points[0], points[points.length - 1]]) {
    const c = new THREE.Mesh(cap, mat);
    c.position.copy(p);
    m.add(c);
  }
  return m;
}

/** A body turned on a lathe from a side profile (x = radius, y = height). */
export function lathe(profile: [number, number][], mat: THREE.Material, segments = 64): THREE.Mesh {
  return mesh(new THREE.LatheGeometry(smoothProfile(profile), segments), mat);
}

/** A few profile points → a smooth curve through them (no facets on the silhouette). */
export function smoothProfile(profile: [number, number][], steps = 56): THREE.Vector2[] {
  const curve = new THREE.SplineCurve(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  return curve.getPoints(steps).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
}

export function sphere(r: number, mat: THREE.Material, scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
  const m = mesh(new THREE.SphereGeometry(r, 40, 28), mat);
  m.scale.set(...scale);
  return m;
}

/** Put an object on a surface point, facing out along the normal. */
export function stick(obj: THREE.Object3D, p: V, n: V, lift = 0.004) {
  obj.position.copy(p).addScaledVector(n, lift);
  obj.lookAt(p.clone().add(n));
}

export function heartShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -r * 0.9);
  s.bezierCurveTo(-r * 1.4, r * 0.1, -r * 0.7, r * 1.1, 0, r * 0.45);
  s.bezierCurveTo(r * 0.7, r * 1.1, r * 1.4, r * 0.1, 0, -r * 0.9);
  return s;
}

export function starShape(r: number, points = 5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * 0.48 : r;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i) s.lineTo(x, y);
    else s.moveTo(x, y);
  }
  s.closePath();
  return s;
}

/** A puffy 3D version of a flat shape. */
export function puffy(shape: THREE.Shape, depth: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.8, bevelSize: depth * 0.8, bevelSegments: 4, curveSegments: 16 });
  geo.center();
  return mesh(geo, mat);
}

// ── Eyes ─────────────────────────────────────────────────────────────────────

export type EyeMode = "open" | "happy" | "closed" | "pout" | "dizzy";

export interface Eye {
  root: THREE.Group;
  open: THREE.Object3D;
  modes: Record<Exclude<EyeMode, "open">, THREE.Object3D>;
  /** The dizzy spiral spins. */
  spiral: THREE.Object3D;
}

function shapeLines(points: [number, number][], r: number, mat: THREE.Material) {
  return tube(points.map(([x, y]) => v(x * r, y * r, 0.02)), r * 0.2, mat, 24);
}

/** One eye: a glossy bead (or a custom open look) plus line drawings for the other moods. */
export function eye(r: number, side: -1 | 1, openLook?: THREE.Object3D): Eye {
  const root = new THREE.Group();
  const lineMat = ink();
  let open = openLook;
  if (!open) {
    const g = new THREE.Group();
    g.add(sphere(r, ink(), [1, 1.15, 0.5]));
    const hl = sphere(r * 0.32, shine());
    hl.position.set(-r * 0.32, r * 0.42, r * 0.45);
    g.add(hl);
    const hl2 = sphere(r * 0.14, shine());
    hl2.position.set(r * 0.32, -r * 0.35, r * 0.45);
    g.add(hl2);
    open = g;
  }
  root.add(open);
  const arc = (from: number, to: number, cy: number, rad: number): [number, number][] =>
    Array.from({ length: 13 }, (_, i) => {
      const a = from + ((to - from) * i) / 12;
      return [Math.cos(a) * rad, cy + Math.sin(a) * rad];
    });
  const happy = shapeLines(arc(Math.PI * 0.15, Math.PI * 0.85, -0.35, 0.85), r, lineMat);
  const closed = shapeLines(arc(-Math.PI * 0.15, -Math.PI * 0.85, 0.3, 0.85), r, lineMat);
  const d = side < 0 ? 1 : -1;
  const pout = shapeLines([[-d * 0.75, 0.7], [d * 0.65, 0], [-d * 0.75, -0.7]], r, lineMat);
  const spiralPts: [number, number][] = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 39) * Math.PI * 4;
    const rr = (i / 39) * 1.05;
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  });
  const spiral = shapeLines(spiralPts, r * 0.8, lineMat);
  const modes = { happy, closed, pout, dizzy: spiral };
  for (const m of Object.values(modes)) {
    m.visible = false;
    root.add(m);
  }
  return { root, open, modes, spiral };
}

export function showEye(e: Eye, mode: EyeMode, blink: number, t: number) {
  e.open.visible = mode === "open";
  e.open.scale.y = 1 - blink * 0.88;
  for (const [k, m] of Object.entries(e.modes)) m.visible = k === mode;
  e.spiral.rotation.z = t * 6;
}

// ── Cheeks ───────────────────────────────────────────────────────────────────

export function cheek(r: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 32),
    new THREE.MeshBasicMaterial({ color: 0xff7f9c, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  m.scale.set(1, 0.62, 1);
  return m;
}

// ── Ears ─────────────────────────────────────────────────────────────────────

/** A soft pointed ear (cat, bat, neko): a rounded cone with a pink inside. */
export function pointyEar(h: number, r: number, mat: THREE.Material, inner: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  const prof: [number, number][] = [[0, h], [r * 0.1, h * 0.97], [r * 0.55, h * 0.6], [r * 0.9, h * 0.25], [r, 0.02], [0, 0]];
  const outer = lathe(prof, mat, 32);
  outer.scale.z = 0.55;
  g.add(outer);
  const inside = lathe(prof.map(([x, y]) => [x * 0.62, y * 0.8] as [number, number]), cloth(inner), 24);
  inside.scale.z = 0.3;
  inside.position.set(0, h * 0.06, r * 0.22);
  g.add(inside);
  return g;
}

/** A long bunny ear: a capsule with a lighter inside. */
export function longEar(len: number, r: number, mat: THREE.Material, inner: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  const outer = mesh(new THREE.CapsuleGeometry(r, len, 8, 20), mat);
  outer.scale.z = 0.55;
  outer.position.y = len / 2 + r;
  g.add(outer);
  const inside = mesh(new THREE.CapsuleGeometry(r * 0.55, len * 0.8, 8, 16), cloth(inner));
  inside.scale.z = 0.25;
  inside.position.set(0, len / 2 + r, r * 0.38);
  g.add(inside);
  return g;
}

// ── Little shapes ────────────────────────────────────────────────────────────

/** A text sprite (the "z" of sleep). */
export function letter(ch: string, color: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.font = "800 52px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
}

/** Lighter or darker version of a colour (amount -1…1). */
export function tint(color: string, amount: number): THREE.Color {
  const c = new THREE.Color(color);
  const target = amount > 0 ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0);
  return c.lerp(target, Math.abs(amount));
}
