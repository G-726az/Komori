// The wardrobe in 3D. Every pet's head is measured once (rays cast at its real
// surface: skull, hair, body), so a hat is built hugging that very shape instead
// of a guess; then each pet's own file nudges every item (rig.fit). Same items
// (ids, names, slots) as the 2D wardrobe; Komori's own designs.

import * as THREE from "three";
import type { Anchors, ItemFit, Rig } from "./parts";
import { cloth, glow, heartShape, longEar, mesh, metal, pointyEar, puffy, sphere, starShape, tube, v, vinyl, type V } from "./kit";

// ── Measuring a head ─────────────────────────────────────────────────────────

/** Directions around (azimuth, 0 = front) and down from the top (polar). */
const N = 48;
const M = 30;
const POLAR = Math.PI * 0.97;

interface SkinMap {
  c: V;
  /** grid[i][j]: the surface point at azimuth i, polar step j (head space), or null. */
  grid: (V | null)[][];
}

const maps = new Map<string, SkinMap>();

const dirOf = (a: number, th: number) => v(Math.sin(th) * Math.sin(a), Math.cos(th), Math.sin(th) * Math.cos(a));

/** Rays from far outside toward the head's centre; the first thing hit is the outer surface. */
function measure(rig: Rig): SkinMap {
  const a = rig.anchors;
  const c = a.head.clone();
  rig.root.updateMatrixWorld(true);
  const toWorld = rig.head.matrixWorld.clone();
  const toLocal = toWorld.clone().invert();
  const ray = new THREE.Raycaster();
  const grid: (V | null)[][] = [];
  for (let i = 0; i < N; i++) {
    const row: (V | null)[] = [];
    for (let j = 0; j < M; j++) {
      // A hair off the exact angle: rays along a mesh's seam can slip through.
      const d = dirOf((i / N) * Math.PI * 2 + 0.0021, (j / (M - 1)) * POLAR + 0.0013);
      const from = c.clone().addScaledVector(d, 6).applyMatrix4(toWorld);
      const to = c.clone().applyMatrix4(toWorld);
      ray.set(from, to.sub(from).normalize());
      const hit = ray.intersectObjects(rig.skin, true)[0];
      row.push(hit ? hit.point.applyMatrix4(toLocal) : null);
    }
    grid.push(row);
  }
  return { c, grid };
}

/** The measured surface, with the ways clothes ask about it. */
export class Fit {
  constructor(readonly a: Anchors, private map: SkinMap, private nudges: Record<string, ItemFit>) {}

  /** This pet's nudges for an item. */
  of(id: string): ItemFit {
    return this.nudges[id] ?? {};
  }

  get c(): V {
    return this.map.c;
  }

  /** The highest point of the head. */
  get top(): V {
    return this.at(v(0, 1, 0)).p;
  }

  private cell(i: number, j: number): V | null {
    const row = this.map.grid[((i % N) + N) % N];
    return row[Math.max(0, Math.min(M - 1, j))];
  }

  /** Point and outward normal on the surface in a direction from the centre. */
  at(dir: V): { p: V; n: V } {
    const d = dir.clone().normalize();
    const th = Math.acos(Math.max(-1, Math.min(1, d.y)));
    const az = Math.atan2(d.x, d.z);
    const p = this.sample(az, th);
    const e = 0.06;
    const t1 = this.sample(az + e, th).sub(this.sample(az - e, th));
    const t2 = this.sample(az, th + e).sub(this.sample(az, Math.max(0.001, th - e)));
    let n = t1.cross(t2);
    if (n.lengthSq() < 1e-8 || th < 0.08) n = p.clone().sub(this.c);
    n.normalize();
    if (n.dot(p.clone().sub(this.c)) < 0) n.negate();
    return { p, n };
  }

  private sample(az: number, th: number): V {
    const fi = ((az / (Math.PI * 2)) * N + N * 4) % N;
    const fj = Math.max(0, Math.min(M - 1, (th / POLAR) * (M - 1)));
    const i0 = Math.floor(fi);
    const j0 = Math.floor(fj);
    const ti = fi - i0;
    const tj = fj - j0;
    const pick = (i: number, j: number) => this.cell(i, j) ?? this.cell(i, j - 1) ?? this.cell(i, j - 2) ?? this.c;
    const a = pick(i0, j0).clone().lerp(pick(i0 + 1, j0), ti);
    const b = pick(i0, j0 + 1).clone().lerp(pick(i0 + 1, j0 + 1), ti);
    return a.lerp(b, tj);
  }

  /** Going down from the top at azimuth `az`, the path over the surface until height `y`. */
  path(az: number, y: number): V[] {
    const out: V[] = [];
    for (let k = 0; k <= 60; k++) {
      const th = (k / 60) * POLAR;
      const p = this.sample(az, th);
      if (p.y <= y) {
        const prev = out[out.length - 1];
        if (prev) out.push(prev.clone().lerp(p, (prev.y - y) / Math.max(1e-6, prev.y - p.y)));
        else out.push(p);
        return out;
      }
      out.push(p);
    }
    return out;
  }

  /** A point a share `t` of the way along a path (by length). */
  static along(path: V[], t: number): V {
    if (path.length < 2) return path[0].clone();
    const seg: number[] = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const l = path[i].distanceTo(path[i - 1]);
      seg.push(l);
      total += l;
    }
    let want = t * total;
    for (let i = 0; i < seg.length; i++) {
      if (want <= seg[i]) return path[i].clone().lerp(path[i + 1], seg[i] ? want / seg[i] : 0);
      want -= seg[i];
    }
    return path[path.length - 1].clone();
  }

  /** The ring around the head at height y, pushed out by `lift`. */
  ring(y: number, lift: number, count = 56): V[] {
    const out: V[] = [];
    for (let i = 0; i < count; i++) {
      const az = (i / count) * Math.PI * 2;
      const p = Fit.along(this.path(az, y), 1);
      out.push(p.addScaledVector(this.at(p.clone().sub(this.c)).n, lift));
    }
    return out;
  }

  /** Where a hat's edge goes: `seat` half-widths below the top, never over the eyes. */
  hatY(seat: number): number {
    const a = this.a;
    return Math.max(this.top.y - seat * a.hw, a.eyeY + a.hw * 0.2);
  }

  /**
   * A shell over the head down to height y, `lift` off the surface. With a
   * front opening of `gap` radians each side (a hood), it is left open there.
   */
  shell(y: number, lift: number, mat: THREE.Material, gap = 0): THREE.Mesh {
    const cols = 64;
    const rows = 18;
    const pos: number[] = [];
    const idx: number[] = [];
    const span = Math.PI * 2 - gap * 2;
    const open = gap > 0;
    const ncols = open ? cols + 1 : cols;
    for (let ci = 0; ci < ncols; ci++) {
      const az = open ? gap + (ci / cols) * span : (ci / cols) * Math.PI * 2;
      const path = this.path(az, y);
      for (let r = 0; r <= rows; r++) {
        const p = Fit.along(path, r / rows);
        p.addScaledVector(this.at(p.clone().sub(this.c)).n, lift);
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let ci = 0; ci < (open ? cols : cols); ci++) {
      const cn = open ? ci + 1 : (ci + 1) % cols;
      for (let r = 0; r < rows; r++) {
        const a0 = ci * (rows + 1) + r;
        const b0 = cn * (rows + 1) + r;
        idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return mesh(geo, mat);
  }

  /** A soft roll around the head at height y (a hat's cuff). */
  cuff(y: number, lift: number, thick: number, mat: THREE.Material): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(this.ring(y, lift + thick * 0.6), true);
    return mesh(new THREE.TubeGeometry(curve, 96, thick, 14, true), mat);
  }
}

/** The fit of a pet: measured once per kind and look, then shared. */
export function fitFor(rig: Rig, key: string): Fit {
  let map = maps.get(key);
  if (!map) {
    map = measure(rig);
    maps.set(key, map);
  }
  return new Fit(rig.anchors, map, rig.fit);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Put a part on the surface in a direction, facing out, raised by `lift`. */
function onSurface(f: Fit, obj: THREE.Object3D, dir: V, lift: number, spin = 0) {
  const { p, n } = f.at(dir);
  obj.position.copy(p).addScaledVector(n, lift);
  obj.quaternion.setFromUnitVectors(v(0, 1, 0), n);
  if (spin) obj.rotateY(spin);
}

/** Apply the pet's nudges for an item: a shift, a size and a turn around its own spot. */
function nudge(obj: THREE.Object3D, n: ItemFit): THREE.Object3D {
  obj.position.add(v(n.x ?? 0, n.up ?? 0, n.z ?? 0));
  return obj;
}

/** A small item placed in a direction from the head's centre (bows, flowers…). */
/**
 * A small item placed in a direction from the head's centre (bows, flowers…).
 * `lean`: 0 stands it upright facing out; 1 lays it along the surface's slope,
 * so it never sinks into a rounded head.
 */
function small(f: Fit, id: string, build: () => THREE.Object3D, dir: V, lift: number, lean = 0): THREE.Object3D {
  const n = f.of(id);
  const holder = new THREE.Group();
  const it = build();
  it.scale.multiplyScalar(n.scale ?? 1);
  holder.add(it);
  const { p, n: nn } = f.at(dir.clone().add(v(n.x ?? 0, n.up ?? 0, n.z ?? 0)));
  holder.position.copy(p).addScaledVector(nn, lift + (n.lift ?? 0));
  const flat = v(nn.x, 0, nn.z).normalize();
  const facing = flat.lerp(nn, lean).normalize();
  holder.quaternion.setFromUnitVectors(v(0, 0, 1), facing);
  holder.rotateZ(n.tilt ?? 0);
  return holder;
}

/** Like small(), but standing on the surface (its +y along the normal): hats like the party cone. */
function standing(f: Fit, id: string, build: () => THREE.Object3D, dir: V, lift: number): THREE.Object3D {
  const n = f.of(id);
  const holder = new THREE.Group();
  const it = build();
  it.scale.multiplyScalar(n.scale ?? 1);
  holder.add(it);
  const { p, n: nn } = f.at(dir.clone().add(v(n.x ?? 0, n.up ?? 0, n.z ?? 0)));
  holder.position.copy(p).addScaledVector(nn, lift + (n.lift ?? 0));
  holder.quaternion.setFromUnitVectors(v(0, 1, 0), nn);
  holder.rotateZ(n.tilt ?? 0);
  return holder;
}

type Build = (f: Fit) => THREE.Object3D;

// ── Hats ─────────────────────────────────────────────────────────────────────

const beanie: Build = (f) => {
  const n = f.of("beanie");
  const g = new THREE.Group();
  const y = f.hatY(n.seat ?? 0.62);
  const lift = 0.035 + (n.lift ?? 0);
  g.add(f.shell(y, lift, cloth("#ff7a8a")));
  g.add(f.cuff(y + 0.04, lift, 0.075, cloth("#ffb1bb")));
  const pom = sphere(0.15, cloth("#fff4f6"));
  onSurface(f, pom, v(0, 1, 0), lift + 0.13);
  g.add(pom);
  return nudge(g, n);
};

/** A cap's visor: a curved half-disc sticking out from the front (or back) edge. */
function visorAt(f: Fit, y: number, lift: number, az: number, mat: THREE.Material, size: number): THREE.Object3D {
  const p = Fit.along(f.path(az, y), 1);
  const out = v(Math.sin(az), 0, Math.cos(az));
  const shape = new THREE.Shape();
  shape.absarc(0, 0, size, 0, Math.PI, false);
  shape.lineTo(size, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3, curveSegments: 32 });
  const m = mesh(geo, mat);
  const holder = new THREE.Group();
  holder.add(m);
  // Lying flat, its straight edge along the cap's rim, sticking outward.
  m.rotation.x = -Math.PI / 2;
  m.scale.set(1, 0.75, 1);
  holder.position.copy(p).addScaledVector(out, lift - 0.02);
  holder.lookAt(holder.position.clone().add(out));
  holder.rotateY(Math.PI);
  holder.rotateX(-0.18);
  holder.position.y += 0.02;
  return holder;
}

const capears: Build = (f) => {
  const n = f.of("capears");
  const g = new THREE.Group();
  const mat = vinyl("#f4f4f8", 0.5, 0.2);
  const y = f.hatY(n.seat ?? 0.5);
  const lift = 0.03 + (n.lift ?? 0);
  g.add(f.shell(y, lift, mat), f.cuff(y + 0.02, lift, 0.035, mat));
  g.add(visorAt(f, y, lift, 0, mat, f.a.hw * 0.62 * (n.scale ?? 1)));
  for (const side of [-1, 1]) {
    const ear = pointyEar(0.28 * (n.scale ?? 1), 0.16, mat, "#ffc6d2");
    const dir = v(side * 0.55, 0.85, -0.05);
    onSurface(f, ear, dir, lift - 0.02);
    ear.rotateY(-side * 0.2);
    g.add(ear);
  }
  return nudge(g, n);
};

const backcap: Build = (f) => {
  const n = f.of("backcap");
  const g = new THREE.Group();
  const mat = vinyl("#e2525c", 0.45, 0.3);
  const y = f.hatY(n.seat ?? 0.5);
  const lift = 0.03 + (n.lift ?? 0);
  g.add(f.shell(y, lift, mat), f.cuff(y + 0.02, lift, 0.035, vinyl("#c8434c", 0.45, 0.3)));
  g.add(visorAt(f, y, lift, Math.PI, mat, f.a.hw * 0.55 * (n.scale ?? 1)));
  const button = sphere(0.055, mat);
  onSurface(f, button, v(0, 1, 0), lift + 0.03);
  g.add(button);
  return nudge(g, n);
};

const hood: Build = (f) => {
  const n = f.of("hood");
  const g = new THREE.Group();
  const knit = cloth("#e9eaf3");
  const lining = cloth("#cfd2e3");
  lining.side = THREE.BackSide;
  const a = f.a;
  const y = (n.seat != null ? f.top.y - n.seat * a.hw : a.mouth.y - a.hw * 0.2);
  const lift = 0.1 + (n.lift ?? 0);
  const gap = 0.95;
  // Two layers make it thick: the knit outside, a darker lining inside.
  g.add(f.shell(y, lift + 0.06, knit, gap), f.shell(y, lift, lining, gap));
  // A soft rolled edge around the face opening and along the bottom.
  const edge: V[] = [];
  const left = f.path(-gap, y);
  const right = f.path(gap, y);
  for (let k = 0; k <= 24; k++) {
    const p = Fit.along(right, 1 - k / 24);
    edge.push(p.addScaledVector(f.at(p.clone().sub(f.c)).n, lift + 0.03));
  }
  for (let k = 1; k <= 24; k++) {
    const p = Fit.along(left, k / 24);
    edge.push(p.addScaledVector(f.at(p.clone().sub(f.c)).n, lift + 0.03));
  }
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 120, 0.065, 12, false), knit));
  const hem = f.ring(y, lift + 0.03, 72).filter((p) => {
    const az = Math.atan2(p.x - f.c.x, p.z - f.c.z);
    return Math.abs(az) >= gap;
  });
  hem.sort((p, q) => {
    const ap = (Math.atan2(p.x - f.c.x, p.z - f.c.z) + Math.PI * 2) % (Math.PI * 2);
    const aq = (Math.atan2(q.x - f.c.x, q.z - f.c.z) + Math.PI * 2) % (Math.PI * 2);
    return ap - aq;
  });
  if (hem.length > 3) g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hem), 80, 0.06, 10, false), knit));
  for (const side of [-1, 1]) {
    const ear = sewnEar(a.earStyle, knit);
    ear.scale.setScalar(n.scale ?? 1);
    onSurface(f, ear, v(side * 0.5, 0.85, 0), lift + 0.02);
    g.add(ear);
  }
  // A stitched ω on the brow and two drawstrings with little bells.
  const thread = vinyl("#9aa0b5", 0.6, 0);
  const omega = tube([v(-0.07, 0.02, 0), v(-0.035, -0.025, 0), v(0, 0.005, 0), v(0.035, -0.025, 0), v(0.07, 0.02, 0)], 0.012, thread, 16);
  const brow = f.at(v(0, 0.75, 0.66));
  omega.position.copy(brow.p).addScaledVector(brow.n, lift + 0.065);
  omega.lookAt(omega.position.clone().add(brow.n));
  g.add(omega);
  for (const side of [-1, 1]) {
    const s = Fit.along(side < 0 ? left : right, 0.97);
    const top = s.addScaledVector(f.at(s.clone().sub(f.c)).n, lift + 0.05);
    const end = top.clone().add(v(side * 0.02, -0.24, 0.05));
    g.add(tube([top, end], 0.016, thread, 6));
    const bead = sphere(0.035, cloth("#ffc6d2"));
    bead.position.copy(end);
    g.add(bead);
  }
  return nudge(g, n);
};

function sewnEar(style: string, mat: THREE.Material): THREE.Object3D {
  if (style === "bunny") return longEar(0.42, 0.13, mat, "#ffd3df");
  if (style === "bat") return pointyEar(0.5, 0.2, mat, "#ffd3df");
  return pointyEar(0.34, 0.2, mat, "#ffd3df");
}

const crown: Build = (f) => {
  const n = f.of("crown");
  const g = new THREE.Group();
  const gold = metal("#f4c542");
  gold.side = THREE.DoubleSide;
  const y = f.top.y - (n.seat ?? 0.2) * f.a.hw;
  const lift = 0.015 + (n.lift ?? 0);
  // A band that follows the head where it sits, with straight sides.
  const ring = f.ring(y, lift, 64);
  const h = 0.15 * (n.scale ?? 1);
  const pos: number[] = [];
  const idx: number[] = [];
  ring.forEach((p, i) => {
    const out = v(p.x - f.c.x, 0, p.z - f.c.z).normalize().multiplyScalar(0.025);
    pos.push(p.x, p.y, p.z, p.x + out.x, p.y + h, p.z + out.z);
    const k = (i + 1) % ring.length;
    idx.push(i * 2, k * 2, i * 2 + 1, k * 2, k * 2 + 1, i * 2 + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(mesh(geo, gold));
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring.map((p) => p.clone()), true), 64, 0.025, 8, true), gold));
  for (let i = 0; i < 5; i++) {
    const p = ring[Math.round((i / 5) * ring.length) % ring.length];
    const spike = mesh(new THREE.ConeGeometry(0.055, 0.14, 12), gold);
    spike.position.set(p.x, p.y + h + 0.06, p.z);
    g.add(spike);
    const ball = sphere(0.03, gold);
    ball.position.set(p.x, p.y + h + 0.14, p.z);
    g.add(ball);
    const gem = sphere(0.035, vinyl(["#ff5c8a", "#5cc8ff", "#7dffa8"][i % 3], 0.1, 1));
    const out = v(p.x - f.c.x, 0, p.z - f.c.z).normalize();
    gem.position.set(p.x, p.y + h * 0.45, p.z).addScaledVector(out, 0.035);
    g.add(gem);
  }
  return nudge(g, n);
};

const witch: Build = (f) => {
  const n = f.of("witch");
  const g = new THREE.Group();
  const felt = cloth("#5b3f8f");
  felt.side = THREE.DoubleSide;
  const s = n.scale ?? 1;
  const y = f.top.y - (n.seat ?? 0.3) * f.a.hw;
  const lift = 0.025 + (n.lift ?? 0);
  const ring = f.ring(y, lift, 64);
  const axis = v(f.c.x, y, f.c.z);
  const r0 = ring.reduce((m, p) => m + Math.hypot(p.x - axis.x, p.z - axis.z), 0) / ring.length;

  // The cone: rings from the fitted base up to the tip, around a centre line
  // that rises and then bends over to one side. Never inside the head.
  const H = (0.95 + r0 * 0.4) * s;
  const centre = (t: number) => v(
    axis.x + Math.pow(t, 2.2) * 0.42 * s,
    y + t * H - Math.pow(Math.max(0, t - 0.7) / 0.3, 2) * 0.16 * s,
    axis.z - Math.pow(t, 2) * 0.06,
  );
  const rows = 26;
  const cols = ring.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= rows; k++) {
    const t = k / rows;
    const c = centre(t);
    // Wide at the base, narrowing quickly, then a long thin point.
    const r = r0 * Math.pow(1 - t, 1.35) * (1 + 0.06 * Math.sin(t * 9)) + 0.004;
    for (let i = 0; i < cols; i++) {
      const base = ring[i];
      const az = Math.atan2(base.x - axis.x, base.z - axis.z);
      const out = v(Math.sin(az), 0, Math.cos(az));
      let p = c.clone().addScaledVector(out, r);
      // Near the bottom, follow the fitted ring so it sits snug.
      const snug = Math.max(0, 1 - t / 0.18);
      p.lerp(base, snug);
      // Keep clear of the head where it is still inside the hat.
      if (p.y < f.top.y + lift) {
        const surf = Fit.along(f.path(az, p.y), 1);
        const need = Math.hypot(surf.x - axis.x, surf.z - axis.z) + lift;
        const have = Math.hypot(p.x - axis.x, p.z - axis.z);
        if (have < need) p = v(axis.x + out.x * need, p.y, axis.z + out.z * need);
      }
      pos.push(p.x, p.y, p.z);
      if (k < rows) {
        const a0 = k * cols + i;
        const a1 = k * cols + ((i + 1) % cols);
        idx.push(a0, a1, a0 + cols, a1, a1 + cols, a0 + cols);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(mesh(geo, felt));

  // The brim: wide, soft, gently waving, with a rolled edge.
  const reach = f.a.hw * 0.62 * s;
  const bpos: number[] = [];
  const bidx: number[] = [];
  const edge: V[] = [];
  ring.forEach((p, i) => {
    const az = Math.atan2(p.x - axis.x, p.z - axis.z);
    const out = v(Math.sin(az), 0, Math.cos(az));
    const wave = Math.sin(az * 3 + 0.6) * 0.035 - 0.05 + Math.cos(az) * 0.03;
    const o = p.clone().addScaledVector(out, reach).add(v(0, wave, 0));
    edge.push(o);
    bpos.push(p.x, p.y - 0.005, p.z, o.x, o.y, o.z);
    const k = (i + 1) % ring.length;
    bidx.push(i * 2, k * 2, i * 2 + 1, k * 2, k * 2 + 1, i * 2 + 1);
  });
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute("position", new THREE.Float32BufferAttribute(bpos, 3));
  bgeo.setIndex(bidx);
  bgeo.computeVertexNormals();
  g.add(mesh(bgeo, felt));
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge, true), 96, 0.03, 8, true), felt));

  // A band with a gold buckle, and a little star.
  g.add(f.cuff(y + 0.07, lift, 0.045, cloth("#2d1f47")));
  const front = ring[0];
  const buckle = mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 4), metal("#f4c542"));
  buckle.position.copy(front).add(v(0, 0.07, 0.07));
  buckle.rotation.z = Math.PI / 4;
  g.add(buckle);
  const star = puffy(starShape(0.075), 0.015, vinyl("#ffe066", 0.3, 0.6));
  const sp = centre(0.45);
  star.position.copy(sp).add(v(0.05, 0, r0 * Math.pow(0.55, 1.35) + 0.02));
  g.add(star);
  return nudge(g, n);
};

const party: Build = (f) => {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#ffd166" : "#ef476f";
    ctx.fillRect(0, i * 8, 64, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return standing(f, "party", () => {
    const g = new THREE.Group();
    const cone = mesh(new THREE.ConeGeometry(0.22, 0.52, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    cone.position.y = 0.24;
    const trim = mesh(new THREE.TorusGeometry(0.21, 0.035, 10, 32), cloth("#ffffff"));
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.0;
    const pom = sphere(0.07, cloth("#ffffff"));
    pom.position.y = 0.53;
    g.add(cone, trim, pom);
    return g;
  }, v(0.3, 1, 0.05), 0.0);
};

// ── Small things on the head ────────────────────────────────────────────────

const bow: Build = (f) =>
  small(f, "bow", () => {
    const g = new THREE.Group();
    const mat = vinyl("#ff7aa8", 0.35, 0.5);
    for (const side of [-1, 1]) {
      const lobe = sphere(0.1, mat, [1.4, 0.9, 0.55]);
      lobe.position.set(side * 0.12, 0, 0);
      lobe.rotation.z = side * 0.3;
      g.add(lobe);
      const tail = mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 10), mat);
      tail.position.set(side * 0.05, -0.1, 0);
      tail.rotation.z = side * 0.4;
      g.add(tail);
    }
    g.add(sphere(0.06, vinyl("#f2558c", 0.35, 0.5)));
    return g;
  }, v(0.6, 0.75, 0.35), 0.06, 0.5);

const flower: Build = (f) =>
  small(f, "flower", () => {
    const g = new THREE.Group();
    const petal = vinyl("#fff2a8", 0.4, 0.4);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const p = sphere(0.07, petal, [1, 1, 0.5]);
      p.position.set(Math.cos(ang) * 0.08, Math.sin(ang) * 0.08, 0);
      g.add(p);
    }
    g.add(sphere(0.055, vinyl("#ff9f43", 0.4, 0.4)));
    const leaf = sphere(0.06, vinyl("#6fd3a2", 0.5, 0.2), [1.6, 0.6, 0.35]);
    leaf.position.set(0.12, -0.1, -0.03);
    leaf.rotation.z = -0.6;
    g.add(leaf);
    g.scale.setScalar(1.25);
    return g;
  }, v(-0.62, 0.62, 0.55), 0.08, 0.4);

/** Points on both sides of the head at ear height, and the arc over the top between them. */
function overHead(f: Fit, lift: number): { sides: { p: V; n: V }[]; arc: V[] } {
  const a = f.a;
  const sides = [-1, 1].map((side) => {
    const y = (side < 0 ? a.earL : a.earR).y;
    const p = Fit.along(f.path(side * Math.PI / 2, y), 1);
    return { p, n: v(side, 0, 0) };
  });
  const arc: V[] = [];
  const steps = 24;
  for (let k = 0; k <= steps; k++) {
    // From the left side up over the top to the right side, in the x-y plane.
    const t = k / steps;
    const ang = -Math.PI / 2 + t * Math.PI;
    const s = f.at(v(Math.sin(ang), Math.cos(ang), 0));
    const p = s.p.addScaledVector(s.n, lift);
    if (p.y >= sides[0].p.y) arc.push(p);
  }
  return { sides, arc };
}

function overEars(f: Fit, id: string, bandMat: THREE.Material, cup: (side: number) => THREE.Object3D, bandThick: number): THREE.Group {
  const n = f.of(id);
  const g = new THREE.Group();
  const lift = 0.05 + (n.lift ?? 0);
  const { sides, arc } = overHead(f, lift);
  const ends = sides.map((s) => s.p.clone().addScaledVector(s.n, lift + 0.04));
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([ends[0], ...arc, ends[1]]), 64, bandThick, 10, false), bandMat));
  sides.forEach((s, i) => {
    const c = cup(i ? 1 : -1);
    c.scale.setScalar(n.scale ?? 1);
    c.position.copy(s.p).addScaledVector(s.n, 0.05 + (n.lift ?? 0));
    g.add(c);
  });
  return nudge(g, n) as THREE.Group;
}

const headphones: Build = (f) => {
  const dark = vinyl("#3a4252", 0.35, 0.5);
  const g = overEars(f, "headphones", dark, (side) => {
    const c = new THREE.Group();
    const shell = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 32), vinyl("#56c6a8", 0.3, 0.6));
    shell.rotation.z = Math.PI / 2;
    c.add(shell);
    const ring = mesh(new THREE.TorusGeometry(0.15, 0.025, 12, 40), glow("#8ff0b8"));
    ring.rotation.y = Math.PI / 2;
    ring.position.x = side * 0.075;
    c.add(ring);
    return c;
  }, 0.045);
  // Cat ears on the band.
  for (const side of [-1, 1]) {
    const ear = pointyEar(0.24, 0.13, vinyl("#56c6a8", 0.3, 0.6), "#8ff0b8");
    onSurface(f, ear, v(side * 0.5, 0.86, 0), 0.06 + (f.of("headphones").lift ?? 0));
    g.add(ear);
  }
  return g;
};

const earmuffs: Build = (f) =>
  overEars(f, "earmuffs", vinyl("#d9dbe6", 0.4, 0.3), () => sphere(0.2, cloth("#ff9fb8"), [0.7, 1, 1]), 0.03);

const earbuds: Build = (f) => {
  const n = f.of("earbuds");
  const g = new THREE.Group();
  const white = vinyl("#ffffff", 0.2, 0.8);
  const { sides } = overHead(f, 0);
  const chin = f.a.face(0, f.a.mouth.y - 0.12);
  const jack = chin.p.clone().addScaledVector(chin.n, 0.25).add(v(0, -0.25, 0));
  for (const s of sides) {
    const at = s.p.clone().addScaledVector(s.n, 0.03).add(v(0, 0, 0.04));
    const bud = sphere(0.075 * (n.scale ?? 1), white, [0.8, 1, 1]);
    bud.position.copy(at);
    g.add(bud);
    const stem = mesh(new THREE.CapsuleGeometry(0.025, 0.12, 4, 10), white);
    stem.position.copy(at).add(v(0, -0.11, 0.01));
    g.add(stem);
    g.add(tube([at.clone().add(v(0, -0.18, 0.01)), at.clone().add(v(-s.n.x * 0.05, -0.4, 0.2)), jack], 0.011, white, 24));
  }
  g.add(tube([jack, jack.clone().add(v(0, -0.15, 0))], 0.014, white, 4));
  return nudge(g, n);
};

// ── On the face and neck ────────────────────────────────────────────────────

function eyesAt(a: Anchors) {
  return [-1, 1].map((side) => a.face(side * a.eyeGap, a.eyeY));
}

/** Over the head's surface from a point at the front, back along the side to above the ear. */
function templeLine(f: Fit, from: V, side: -1 | 1, lift: number): V[] {
  const az0 = Math.atan2(from.x - f.c.x, from.z - f.c.z);
  const az1 = side * (Math.PI / 2 + 0.45);
  const pts: V[] = [from.clone()];
  for (let k = 1; k <= 14; k++) {
    const t = k / 14;
    const az = az0 + (az1 - az0) * t;
    const y = from.y - 0.03 * t * t;
    const p = Fit.along(f.path(az, y), 1);
    pts.push(p.addScaledVector(f.at(p.clone().sub(f.c)).n, lift));
  }
  // The tip curls down behind the ear.
  const end = pts[pts.length - 1];
  pts.push(end.clone().add(v(0, -0.08, -0.03)));
  return pts;
}

/** A shine streak across a lens. */
function glint(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.22, r * 1.1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  m.position.set(-r * 0.3, r * 0.15, 0.004);
  m.rotation.z = -0.7;
  return m;
}

const glasses: Build = (f) => {
  const a = f.a;
  const n = f.of("glasses");
  const g = new THREE.Group();
  const frame = vinyl("#6b4430", 0.28, 0.7);
  const r = a.eyeGap * 0.66 * (n.scale ?? 1);
  const [l, rr] = eyesAt(a);
  const lift = 0.08 + (n.lift ?? 0);
  const centres: V[] = [];
  for (const e of [l, rr]) {
    const holder = new THREE.Group();
    holder.position.copy(e.p).addScaledVector(e.n, lift);
    holder.lookAt(holder.position.clone().add(e.n));
    // A thick round rim, flattened front to back, with a lighter inner bevel.
    const rim = mesh(new THREE.TorusGeometry(r, 0.032, 14, 48), frame);
    rim.scale.z = 0.7;
    const bevel = mesh(new THREE.TorusGeometry(r - 0.022, 0.01, 8, 48), vinyl("#9a6a4c", 0.3, 0.6));
    bevel.position.z = 0.012;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(r - 0.012, 40), new THREE.MeshPhysicalMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.22, roughness: 0.05, clearcoat: 1 }));
    holder.add(rim, bevel, lens, glint(r));
    g.add(holder);
    centres.push(holder.position.clone());
  }
  // The bridge arches over the nose, with two little pads under it.
  const lp = centres[0].clone().add(v(r * 0.92, 0.03, 0));
  const rp = centres[1].clone().add(v(-r * 0.92, 0.03, 0));
  const mid = v(0, (lp.y + rp.y) / 2 + 0.05, Math.max(lp.z, rp.z) + 0.015);
  g.add(tube([lp, mid, rp], 0.02, frame, 16));
  for (const side of [-1, 1]) {
    const pad = sphere(0.022, vinyl("#f3ece4", 0.2, 0.8), [0.7, 1.2, 0.6]);
    pad.position.copy(mid).add(v(side * 0.06, -0.09, -0.04));
    g.add(pad);
  }
  // Temples: hinges at the outer edge, then back along the head to the ears.
  for (const [c, side] of [[centres[0], -1], [centres[1], 1]] as const) {
    const hinge = c.clone().add(v(side * r * 0.98, 0.02, -0.01));
    const knob = mesh(new THREE.BoxGeometry(0.05, 0.045, 0.06), frame);
    knob.position.copy(hinge);
    g.add(knob);
    g.add(tube(templeLine(f, hinge, side, 0.03), 0.016, frame, 30));
  }
  return nudge(g, n);
};

const hearts: Build = (f) => {
  const a = f.a;
  const n = f.of("hearts");
  const g = new THREE.Group();
  const frame = vinyl("#ff5d8f", 0.25, 0.8);
  const tint = new THREE.MeshPhysicalMaterial({ color: 0xff7aa2, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.55 });
  const [l, r] = eyesAt(a);
  const lift = 0.085 + (n.lift ?? 0);
  const size = a.eyeGap * 0.66 * (n.scale ?? 1);
  const centres: V[] = [];
  for (const e of [l, r]) {
    const holder = new THREE.Group();
    holder.position.copy(e.p).addScaledVector(e.n, lift);
    holder.lookAt(holder.position.clone().add(e.n));
    const lens = puffy(heartShape(size * 0.88), 0.012, tint);
    lens.position.y = -size * 0.15;
    const rim = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(heartShape(size).getSpacedPoints(48).map((p) => v(p.x, p.y, 0)), true), 64, 0.026, 10, true), frame);
    rim.position.y = -size * 0.15;
    holder.add(lens, rim, glint(size * 0.9));
    g.add(holder);
    centres.push(holder.position.clone());
  }
  const lp = centres[0].clone().add(v(size * 0.8, 0.02, 0));
  const rp = centres[1].clone().add(v(-size * 0.8, 0.02, 0));
  g.add(tube([lp, v(0, (lp.y + rp.y) / 2 + 0.04, Math.max(lp.z, rp.z) + 0.015), rp], 0.02, frame, 12));
  for (const [c, side] of [[centres[0], -1], [centres[1], 1]] as const) {
    const hinge = c.clone().add(v(side * size * 0.95, 0.02, -0.01));
    g.add(tube(templeLine(f, hinge, side, 0.03), 0.016, frame, 30));
  }
  return nudge(g, n);
};

const mask: Build = (f) => {
  const a = f.a;
  const n = f.of("mask");
  const g = new THREE.Group();
  const fabric = cloth("#bfe3f7");
  fabric.side = THREE.DoubleSide;
  const trim = cloth("#9fcfea");
  // A patch of the face itself, puffed out in the middle like a real mask,
  // with three soft pleats across it.
  const w = a.eyeGap * 1.5 * (n.scale ?? 1);
  const top = a.mouth.y + 0.14 + (n.up ?? 0);
  const bottom = a.mouth.y - 0.18 + (n.up ?? 0);
  const cols = 28;
  const rows = 18;
  const pos: number[] = [];
  const idx: number[] = [];
  const grid: V[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: V[] = [];
    const vv = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols * 2 - 1;
      // Narrower at the bottom, like a chin cup.
      const x = u * w * (1 - vv * 0.18);
      const y = top + (bottom - top) * vv;
      const s = a.face(x, y);
      const puff = (1 - u * u) * Math.sin(vv * Math.PI) * 0.06;
      const pleat = Math.pow(Math.abs(Math.sin(vv * Math.PI * 3)), 4) * 0.012 * (1 - u * u * 0.5);
      const p = s.p.addScaledVector(s.n, 0.03 + puff + pleat + (n.lift ?? 0));
      row.push(p);
      pos.push(p.x, p.y, p.z);
      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        idx.push(i, i + cols + 1, i + 1, i + 1, i + cols + 1, i + cols + 2);
      }
    }
    grid.push(row);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(mesh(geo, fabric));
  // A sewn border all around, and a nose wire along the top.
  const border = [...grid[0], ...grid.map((row) => row[cols]).slice(1), ...[...grid[rows]].reverse().slice(1), ...grid.map((row) => row[0]).reverse().slice(1, -1)];
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(border, true), 160, 0.018, 8, true), trim));
  g.add(tube(grid[0].slice(Math.round(cols * 0.3), Math.round(cols * 0.7) + 1).map((p) => p.clone().add(v(0, -0.012, 0.012))), 0.01, vinyl("#e8f1f6", 0.3, 0.6), 16));
  // Elastic loops: from the top and bottom corners, around the ear.
  const loop = vinyl("#eef5fa", 0.5, 0);
  for (const side of [-1, 1] as const) {
    const c = side < 0 ? 0 : cols;
    const ear = Fit.along(f.path(side * (Math.PI / 2 + 0.1), (top + bottom) / 2 + 0.05), 1);
    const earOut = ear.addScaledVector(f.at(ear.clone().sub(f.c)).n, 0.04);
    for (const corner of [grid[1][c], grid[rows - 1][c]]) {
      const midAz = side * 1.05;
      const midP = Fit.along(f.path(midAz, (corner.y + earOut.y) / 2), 1);
      const mid = midP.addScaledVector(f.at(midP.clone().sub(f.c)).n, 0.03);
      g.add(tube([corner, mid, earOut], 0.012, loop, 16));
    }
  }
  return nudge(g, n);
};

/**
 * Around the neck: the point on the body at azimuth `az` and height `y`, and
 * its outward normal. Pets without a body there (the neko's slim neck) get a
 * plain round neck of radius neckR.
 */
function neckAt(f: Fit, az: number, y: number): { p: V; n: V } {
  const a = f.a;
  const reach = f.path(0, y);
  const onBody = reach.length > 0 && Math.abs(reach[reach.length - 1].y - y) < 0.05;
  if (onBody) {
    const p = Fit.along(f.path(az, y), 1);
    return { p, n: f.at(p.clone().sub(f.c)).n };
  }
  const n = v(Math.sin(az), 0, Math.cos(az));
  return { p: v(a.head.x, y, a.head.z).addScaledVector(n, a.neckR), n };
}

/**
 * A soft band swept along a closed (or open) line of points: a flattened,
 * rounded cross-section `w` tall and `t` thick, with knit ribs and gentle folds.
 */
function knitBand(line: { p: V; n: V }[], w: number, t: number, mat: THREE.Material, closed: boolean, ribs = true): THREE.Mesh {
  const seg = 18;
  const pos: number[] = [];
  const idx: number[] = [];
  const count = line.length;
  for (let i = 0; i < count; i++) {
    const { p, n } = line[i];
    const prev = line[(i - 1 + count) % count].p;
    const next = line[(i + 1) % count].p;
    const along = (closed || (i > 0 && i < count - 1) ? next.clone().sub(prev) : i === 0 ? next.clone().sub(p) : p.clone().sub(prev)).normalize();
    const out = n.clone().sub(along.clone().multiplyScalar(n.dot(along))).normalize();
    const up = along.clone().cross(out).normalize();
    if (up.y < 0) up.negate();
    const u = i / count;
    // Folds: the band swells and pinches a little along its length.
    const fold = 1 + Math.sin(u * Math.PI * 2 * 7 + 0.8) * 0.12 + Math.sin(u * Math.PI * 2 * 3) * 0.06;
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      // A rounded rectangle (superellipse): flat faces, soft edges.
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const k = 0.45;
      const sx = Math.sign(c) * Math.pow(Math.abs(c), k);
      const sy = Math.sign(sn) * Math.pow(Math.abs(sn), k);
      // Knit ribs: little ridges across the band, on its outer face.
      const rib = ribs ? Math.max(0, Math.sin(u * count * 0.9)) * 0.012 * Math.max(0, sx) : 0;
      const q = p.clone()
        .addScaledVector(out, (sx * t * 0.5 + t * 0.5) * fold + rib)
        .addScaledVector(up, sy * w * 0.5 * (1 + (fold - 1) * 0.6));
      pos.push(q.x, q.y, q.z);
    }
  }
  const rows = closed ? count : count - 1;
  for (let i = 0; i < rows; i++) {
    const i2 = (i + 1) % count;
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      idx.push(i * seg + j, i2 * seg + j, i * seg + j2, i2 * seg + j, i2 * seg + j2, i * seg + j2);
    }
  }
  if (!closed) {
    // Cap both ends.
    for (const i of [0, count - 1]) {
      const centre = pos.length / 3;
      const cx = line[i].p;
      pos.push(cx.x, cx.y, cx.z);
      for (let j = 0; j < seg; j++) idx.push(centre, i * seg + j, i * seg + ((j + 1) % seg));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = mat.clone();
  m.side = THREE.DoubleSide;
  return mesh(geo, m);
}

const scarf: Build = (f) => {
  const a = f.a;
  const n = f.of("scarf");
  const g = new THREE.Group();
  const knit = cloth("#e05666");
  const y = a.neckY + (n.up ?? 0);
  const bump = n.bump ?? 0;
  const lift = 0.025 + (n.lift ?? 0);
  const sz = n.scale ?? 1;
  // Lower at the front and back, higher at the sides (over the shoulders).
  const yAt = (az: number) => y + bump * Math.pow(Math.sin(az), 2);
  const line: { p: V; n: V }[] = [];
  for (let i = 0; i < 96; i++) {
    const az = (i / 96) * Math.PI * 2;
    const s = neckAt(f, az, yAt(az));
    line.push({ p: s.p.addScaledVector(s.n, lift), n: s.n });
  }
  // A wide, thick knitted band (flat, not a tube).
  g.add(knitBand(line, 0.24 * sz, 0.09 * sz, knit, true));
  // The knot and two loose ends hanging in front, a little to one side.
  const at = neckAt(f, 0.28, yAt(0.28));
  const front = at.p.clone().addScaledVector(at.n, lift + 0.08 * sz);
  const knot = sphere(0.1 * sz, knit, [1.25, 0.9, 0.75]);
  knot.position.copy(front);
  g.add(knot);
  for (const [dx, len, swing] of [[-0.05, 0.42, -0.08], [0.07, 0.34, 0.1]] as const) {
    const pts: { p: V; n: V }[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      pts.push({
        p: front.clone().add(v(dx + swing * t * t, -len * t * sz, 0.04 + Math.sin(t * Math.PI) * 0.03)),
        n: at.n.clone(),
      });
    }
    const tail = knitBand(pts, 0.2 * sz, 0.07 * sz, knit, false);
    g.add(tail);
    // Fringe at the end of each tail.
    const tip = pts[pts.length - 1].p;
    for (let k = -2; k <= 2; k++) {
      const strand = mesh(new THREE.CapsuleGeometry(0.014, 0.06, 3, 6), cloth("#f07b88"));
      strand.position.copy(tip).add(v(k * 0.035, -0.05, 0.02));
      g.add(strand);
    }
  }
  return g;
};

function neckFront(a: Anchors, y: number, z = 0): { p: V; n: V } {
  const s = a.face(0, y);
  if (s.p.z - a.head.z > a.neckR * 0.6) return s;
  return { p: v(a.head.x, y, a.head.z + a.neckR + z), n: v(0, 0, 1) };
}

const bowtie: Build = (f) => {
  const a = f.a;
  const n = f.of("bowtie");
  const g = new THREE.Group();
  const mat = vinyl("#e05666", 0.35, 0.5);
  for (const side of [-1, 1]) {
    const wing = mesh(new THREE.ConeGeometry(0.1, 0.18, 4), mat);
    wing.rotation.z = side * Math.PI / 2;
    wing.position.x = side * 0.09;
    g.add(wing);
  }
  g.add(sphere(0.045, mat));
  g.scale.setScalar(n.scale ?? 1);
  const p = neckFront(a, a.neckY + 0.05 + (n.up ?? 0), n.z ?? 0);
  g.position.copy(p.p).addScaledVector(p.n, 0.06 + (n.lift ?? 0));
  g.lookAt(g.position.clone().add(p.n));
  return g;
};

const bandana: Build = (f) => {
  const a = f.a;
  const n = f.of("bandana");
  const g = new THREE.Group();
  const red = cloth("#d94a4a");
  red.side = THREE.DoubleSide;
  const sz = n.scale ?? 1;
  // Where the neck is on this pet: the same line the scarf takes, unless told otherwise.
  const sc = f.of("scarf");
  const y = a.neckY + (n.up ?? sc.up ?? 0.14);
  const bumpY = n.bump ?? sc.bump ?? 0;
  const lift = 0.02 + (n.lift ?? 0);
  const reach = f.path(0, y);
  const onBody = reach.length > 0 && Math.abs(reach[reach.length - 1].y - y) < 0.05;
  // The fold around the neck: a slim band.
  const line: { p: V; n: V }[] = [];
  for (let i = 0; i < 80; i++) {
    const az = (i / 80) * Math.PI * 2;
    const s = neckAt(f, az, y + Math.pow(Math.sin(az), 2) * bumpY);
    line.push({ p: s.p.addScaledVector(s.n, lift), n: s.n });
  }
  g.add(knitBand(line, 0.09 * sz, 0.04 * sz, red, true, false));
  // The triangle: hangs from the band over the chest and follows its shape,
  // with soft folds; the tip falls a little to one side.
  const half = 0.85 * sz;
  // Long enough to read, never down to the feet.
  const drop = (onBody ? Math.max(0.16, Math.min(0.36, y * 0.55)) : 0.42) * sz;
  const rows = 14;
  const cols = 22;
  const pos: number[] = [];
  const idx: number[] = [];
  const pts: V[][] = [];
  for (let r = 0; r <= rows; r++) {
    const k = r / rows;
    const row: V[] = [];
    for (let c = 0; c <= cols; c++) {
      const u = c / cols - 0.5;
      const az = u * 2 * half * (1 - k) + k * 0.08;
      const yy = y + bumpY * Math.pow(Math.sin(az), 2) * (1 - k) - 0.02 - drop * k - Math.abs(u) * 0.05 * (1 - k);
      const s = neckAt(f, az, yy);
      const fold = Math.sin(u * Math.PI * 5 + k * 2) * 0.012 * (1 - k) + k * 0.03;
      const p = s.p.addScaledVector(s.n, lift + 0.025 + fold);
      row.push(p);
      pos.push(p.x, p.y, p.z);
      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        idx.push(i, i + cols + 1, i + 1, i + 1, i + cols + 1, i + cols + 2);
      }
    }
    pts.push(row);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(mesh(geo, red));
  // A rolled hem along both slanted edges gives the cloth some body.
  for (const side of [0, cols]) {
    const edge = pts.map((row) => row[side]);
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 40, 0.018 * sz, 8, false), red));
  }
  // White dots printed on it.
  const dot = new THREE.MeshBasicMaterial({ color: 0xfff4ea });
  for (const [rr, cc] of [[2, 5], [2, 11], [2, 17], [5, 8], [5, 14], [8, 11], [3, 2], [3, 20]]) {
    const row = pts[rr];
    if (!row || !row[cc]) continue;
    const d = sphere(0.02 * sz, dot, [1, 1, 0.3]);
    d.position.copy(row[cc]);
    const nn = neckAt(f, 0, y).n;
    d.position.addScaledVector(nn, 0.012);
    g.add(d);
  }
  // A small knot at the back.
  const back = neckAt(f, Math.PI, y);
  const knot = sphere(0.07 * sz, red, [1.3, 0.9, 0.8]);
  knot.position.copy(back.p).addScaledVector(back.n, lift + 0.05);
  g.add(knot);
  return g;
};

export const OUTFITS_3D: Record<string, Build> = {
  beanie, capears, backcap, hood, crown, witch, party, bow, flower, headphones, earmuffs, earbuds,
  glasses, hearts, mask, scarf, bowtie, bandana,
};
