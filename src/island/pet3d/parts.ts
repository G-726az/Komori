// Pieces every pet is built from: where clothes go (anchors), faces stuck on
// a surface, the rounded "bun" body, limbs, hair. Each pet lives in its own
// file under pets/, so its shape, limbs and how the wardrobe sits on it can be
// tuned for that character alone.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { cheek, eye, ink, mesh, smoothProfile, stick, tube, v, vinyl, type Eye, type V } from "./kit";

export type EarStyle = "cat" | "bat" | "bunny" | "none";

/** Where clothes go, in the head's own space. */
export interface Anchors {
  /** Centre and half sizes of the head. */
  head: V;
  hw: number;
  hh: number;
  hd: number;
  /** Top of the head. */
  top: number;
  eyeY: number;
  eyeGap: number;
  /** Middle of the mouth, and where the neck is (y, half width). */
  mouth: V;
  neckY: number;
  neckR: number;
  /** Sides of the head, where you'd hear. */
  earL: V;
  earR: V;
  earStyle: EarStyle;
  /** A point on the face surface, with its outward normal. */
  face: (x: number, y: number) => { p: V; n: V };
}

export interface Rig {
  root: THREE.Group;
  /** Squashes and stretches (pivot on the floor). */
  body: THREE.Group;
  /** Turns to look (everything that is "the head"). */
  head: THREE.Group;
  eyes: Eye[];
  cheeks: THREE.Mesh[];
  mouth: THREE.Object3D | null;
  /** Mouths for a pout and for dizziness. */
  pouty: THREE.Object3D;
  wobbly: THREE.Object3D;
  /** The pet's own ears (hidden under a hood); droop when resting. */
  ears: THREE.Object3D[];
  /** Things on top of the head that a hat covers (sprout, tuft…). */
  tops: THREE.Object3D[];
  anchors: Anchors;
  /** The surface clothes rest on (skull, hair, body): measured to fit the wardrobe. */
  skin: THREE.Object3D[];
  /** How each wardrobe item sits on this pet (nudges on top of the measured fit). */
  fit: PetFit;
  /** Little arms (or wings) that move with the gestures; pivot at the shoulder. */
  arms: Arm[];
  /** Per-pet motion: wings, tail, floating… */
  move(t: number, rest: number): void;
}

/** An arm: turning `pivot.rotation.z` by `side * angle` raises it outward. */
export interface Arm {
  pivot: THREE.Object3D;
  side: -1 | 1;
  /** Angle while just standing. */
  rest: number;
}

/**
 * Per item, how it sits on one pet. All optional; units are the pet's own.
 * seat: how far down a hat goes from the top of the head, as a share of the head's half width.
 * lift: extra gap off the surface. scale: size. up/x/z: a nudge. tilt: a turn (radians).
 */
export interface ItemFit {
  seat?: number;
  lift?: number;
  scale?: number;
  up?: number;
  x?: number;
  z?: number;
  tilt?: number;
  /** Scarf: how much higher it goes at the sides (over the shoulders) than at the front. */
  bump?: number;
}
export type PetFit = Record<string, ItemFit>;

/** A small round arm hanging from a point on the body, pointing down and out. */
export function nubArm(at: V, side: -1 | 1, len: number, r: number, mat: THREE.Material, rest = 0.35): Arm {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  const arm = mesh(new THREE.CapsuleGeometry(r, len, 8, 16), mat);
  arm.position.y = -len / 2;
  pivot.add(arm);
  pivot.rotation.z = side * rest;
  return { pivot, side, rest };
}

// ── Shared pieces ────────────────────────────────────────────────────────────

/** Face surface of a lathe body: radius from the profile at each height. */
export function latheFace(profile: [number, number][], cy = 0) {
  const radiusAt = (y: number) => {
    for (let i = 1; i < profile.length; i++) {
      const [r0, y0] = profile[i - 1];
      const [r1, y1] = profile[i];
      if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) {
        const k = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
        return r0 + (r1 - r0) * k;
      }
    }
    return profile[profile.length - 1][0];
  };
  return (x: number, y: number) => {
    const r = radiusAt(y + cy);
    const z = Math.sqrt(Math.max(0.0001, r * r - x * x));
    const slope = (radiusAt(y + cy + 0.02) - radiusAt(y + cy - 0.02)) / 0.04;
    return { p: v(x, y, z), n: v(x / r, -slope * 0.6, z / r).normalize() };
  };
}

/** Face surface of a rounded box (the "bun" bodies). */
export function boxFace(w: number, h: number, d: number, rad: number, cy: number) {
  return (x: number, y: number) => {
    const ex = Math.max(0, Math.abs(x) - (w / 2 - rad));
    const ey = Math.max(0, Math.abs(y - cy) - (h / 2 - rad));
    const z = d / 2 - (rad - Math.sqrt(Math.max(0, rad * rad - ex * ex))) - (rad - Math.sqrt(Math.max(0, rad * rad - ey * ey)));
    return { p: v(x, y, z), n: v((Math.sign(x) * ex) / rad, (Math.sign(y - cy) * ey) / rad, 1).normalize() };
  };
}

export function sphereFace(c: V, r: number) {
  return (x: number, y: number) => {
    const dy = y - c.y;
    const z = Math.sqrt(Math.max(0.0001, r * r - x * x - dy * dy));
    const p = v(x, y, c.z + z);
    return { p, n: p.clone().sub(c).normalize() };
  };
}

export interface FaceOpts {
  face: Anchors["face"];
  eyeY: number;
  gap: number;
  r: number;
  cheekY: number;
  cheekGap: number;
  cheekR: number;
  mouthY: number;
  /** Custom open eyes (the neko's). */
  openLook?: (side: -1 | 1) => THREE.Object3D;
}

/** Eyes, cheeks and the reaction mouths, stuck on a face. */
export function addFace(into: THREE.Object3D, o: FaceOpts) {
  const eyes: Eye[] = [];
  for (const side of [-1, 1] as const) {
    const e = eye(o.r, side, o.openLook?.(side));
    const { p, n } = o.face(side * o.gap, o.eyeY);
    stick(e.root, p, n, 0.01);
    into.add(e.root);
    eyes.push(e);
  }
  const cheeks: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const c = cheek(o.cheekR);
    const { p, n } = o.face(side * o.cheekGap, o.cheekY);
    stick(c, p, n, 0.012);
    c.scale.set(1, 0.62, 1);
    into.add(c);
    cheeks.push(c);
  }
  // Reaction mouths.
  const m = o.face(0, o.mouthY);
  const pouty = new THREE.Group();
  pouty.add(tube([v(-0.07, -0.01, 0), v(0, 0.035, 0), v(0.07, -0.01, 0)], 0.016, ink(), 16));
  stick(pouty, m.p, m.n, 0.01);
  const wobbly = new THREE.Group();
  wobbly.add(tube(Array.from({ length: 9 }, (_, i) => v(-0.09 + i * 0.0225, Math.sin(i * 1.4) * 0.018, 0)), 0.013, ink(), 24));
  stick(wobbly, m.p, m.n, 0.01);
  pouty.visible = wobbly.visible = false;
  into.add(pouty, wobbly);
  return { eyes, cheeks, pouty, wobbly };
}

export function base(): { root: THREE.Group; body: THREE.Group } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return { root, body };
}

export const BUN = { w: 1.72, h: 1.4, d: 1.42, r: 0.55, cy: 0.72 };

export function bunBody(color: string) {
  const geo = new RoundedBoxGeometry(BUN.w, BUN.h, BUN.d, 7, BUN.r);
  const m = mesh(geo, vinyl(color));
  m.position.y = BUN.cy;
  return m;
}

export function bunAnchors(face: Anchors["face"], earStyle: EarStyle, eyeY: number, eyeGap: number, mouthY: number): Anchors {
  return {
    head: v(0, BUN.cy, 0), hw: BUN.w / 2, hh: BUN.h / 2, hd: BUN.d / 2, top: BUN.cy + BUN.h / 2, eyeY, eyeGap,
    mouth: v(0, mouthY, BUN.d / 2), neckY: 0.25, neckR: 0.88, earL: v(-BUN.w / 2, BUN.cy + 0.1, 0), earR: v(BUN.w / 2, BUN.cy + 0.1, 0),
    earStyle, face,
  };
}

export function animeEye(color: string, side: -1 | 1): THREE.Object3D {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 176;
  const g = c.getContext("2d")!;
  const iris = new THREE.Color(color).lerp(new THREE.Color(0, 0, 0), 0.1);
  const css = (k: number) => `#${iris.clone().lerp(k > 0 ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0), Math.abs(k)).getHexString()}`;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.ellipse(64, 92, 54, 78, 0, 0, Math.PI * 2);
  g.fill();
  const grad = g.createLinearGradient(0, 18, 0, 170);
  grad.addColorStop(0, css(-0.55));
  grad.addColorStop(0.55, css(0));
  grad.addColorStop(1, css(0.45));
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(64, 98, 47, 70, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = css(-0.7);
  g.beginPath();
  g.ellipse(64, 96, 22, 36, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.ellipse(46, 62, 17, 13, -0.3, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(84, 132, 7, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#2b1a24";
  g.lineCap = "round";
  g.lineWidth = 13;
  g.beginPath();
  g.ellipse(64, 96, 58, 80, 0, Math.PI * 1.1, Math.PI * 1.9);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  card.scale.x = side === -1 ? 1 : -1;
  return card;
}

/** A capsule from point a to point b (arms, legs). */
export function limb(a: V, b: V, r: number, mat: THREE.Material): THREE.Mesh {
  const dir = b.clone().sub(a);
  const m = mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, dir.length()), 8, 18), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(v(0, 1, 0), dir.normalize());
  return m;
}

/** A pleated skirt: a flared tube, open at the hem, with soft folds all around. */
export function pleatedSkirt(top: number, hem: number, rTop: number, rHem: number, mat: THREE.Material): THREE.Mesh {
  const prof: [number, number][] = [[rTop, top], [rTop * 1.04, top - (top - hem) * 0.2], [(rTop + rHem) / 2, (top + hem) / 2], [rHem, hem]];
  const geo = new THREE.LatheGeometry(smoothProfile(prof, 24), 96);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const k = (top - y) / (top - hem); // 0 at the waist, 1 at the hem
    const a = Math.atan2(x, z);
    const fold = 1 + Math.abs(Math.sin(a * 9)) * 0.07 * k;
    pos.setX(i, x * fold);
    pos.setZ(i, z * fold);
  }
  geo.computeVertexNormals();
  mat.side = THREE.DoubleSide;
  return mesh(geo, mat);
}

/** How far the end of the long hair falls to the side. */
export const HAIR_SWAY = 0.5;

/** A long sheet of hair seen from behind: wide at the head, falling and narrowing to a tie. */
export function hairSheet(mat: THREE.Material, topY: number, tieY: number, wTop: number, wTie: number): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-wTop / 2, topY);
  s.bezierCurveTo(-wTop * 0.62, topY - (topY - tieY) * 0.35, -wTop * 0.45, tieY + (topY - tieY) * 0.25, -wTie / 2, tieY);
  s.lineTo(wTie / 2, tieY);
  s.bezierCurveTo(wTop * 0.45, tieY + (topY - tieY) * 0.25, wTop * 0.62, topY - (topY - tieY) * 0.35, wTop / 2, topY);
  s.quadraticCurveTo(0, topY + 0.25, -wTop / 2, topY);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 5, curveSegments: 28 });
  // Wrap it around the back a little, and let the lower part sway out to one side
  // (so the long fall shows beside the body, not only behind it).
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const down = Math.max(0, Math.min(1, (topY - pos.getY(i)) / (topY - tieY)));
    pos.setZ(i, pos.getZ(i) - pos.getX(i) ** 2 * 0.55);
    pos.setX(i, pos.getX(i) + down ** 1.6 * HAIR_SWAY);
  }
  geo.computeVertexNormals();
  return mesh(geo, mat);
}

/** A tapered lock of hair through points (front locks, the tuft under the tie). */
export function lock(points: V[], r0: number, r1: number, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 40, 1, 12, false);
  // Scale each ring from r0 to r1 along the lock.
  const pos = geo.attributes.position;
  const rings = 41;
  const per = pos.count / rings;
  for (let ri = 0; ri < rings; ri++) {
    const t = ri / (rings - 1);
    const c = curve.getPoint(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j < per; j++) {
      const i = ri * per + j;
      const p = v(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
  return mesh(geo, mat);
}

