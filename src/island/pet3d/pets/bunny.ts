// Pelu: a plush bunny bun, one ear up and one flopped, a stitched heart.

import * as THREE from "three";
import { cloth, heartShape, longEar, puffy, stick, tint, tube, v, vinyl, sphere } from "../kit";
import { addFace, base, boxFace, bunAnchors, bunBody, BUN, type Rig, nubArm, type PetFit } from "../parts";

/** How the wardrobe sits on Pelu: a plush bun; the ears stand where a hat goes. */
const FIT: PetFit = {
  // Under the mouth at the front, over the little arms at the sides.
  scarf: { up: 0.15, bump: 0.26 },
  beanie: { seat: 0.48 },
  capears: { seat: 0.4 },
  backcap: { seat: 0.4 },
  hood: { seat: 1.1 },
  crown: { seat: 0.1 },
  witch: { seat: 0.16 },
};

export function bunny(color: string): Rig {
  const { root, body } = base();
  const bun = bunBody(color);
  bun.scale.set(0.92, 0.88, 0.92);
  body.add(bun);
  const w = BUN.w * 0.92;
  const h = BUN.h * 0.88;
  const d = BUN.d * 0.92;
  const face = boxFace(w, h, d, BUN.r * 0.9, BUN.cy);
  const parts = addFace(body, { face, eyeY: 0.72, gap: 0.3, r: 0.085, cheekY: 0.58, cheekGap: 0.52, cheekR: 0.1, mouthY: 0.54 });
  const fur = cloth(color);
  const ears: THREE.Object3D[] = [];
  const up = longEar(0.62, 0.17, fur, tint(color, 0.45).getStyle());
  up.position.set(-0.32, BUN.cy + h / 2 - 0.1, 0);
  up.rotation.z = 0.12;
  const flop = longEar(0.58, 0.17, fur, tint(color, 0.45).getStyle());
  flop.position.set(0.32, BUN.cy + h / 2 - 0.08, 0);
  flop.rotation.z = -1.25;
  body.add(up, flop);
  ears.push(up, flop);
  const thread = vinyl(tint(color, -0.4).getStyle(), 0.6, 0);
  const seam = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = face(0, 1.32 - i * 0.07);
    seam.add(tube([a.p.clone().addScaledVector(a.n, 0.006).add(v(0, 0.022, 0)), a.p.clone().addScaledVector(a.n, 0.006).add(v(0, -0.022, 0))], 0.012, thread, 4));
  }
  body.add(seam);
  const patch = puffy(heartShape(0.11), 0.02, vinyl("#ff7aa6", 0.35, 0.5));
  const pp = face(0.42, 0.36);
  stick(patch, pp.p, pp.n, 0.03);
  body.add(patch);
  const mouth = new THREE.Group();
  const mp = face(0, 0.56);
  mouth.add(tube([v(-0.035, 0.03, 0), v(0.035, -0.03, 0)], 0.012, thread, 4), tube([v(0.035, 0.03, 0), v(-0.035, -0.03, 0)], 0.012, thread, 4));
  stick(mouth, mp.p, mp.n, 0.008);
  body.add(mouth);
  const limbMat = fur;
  const arms = [-1, 1].map((side) => nubArm(v(side * (w / 2 - 0.04), 0.5, 0.18), side as -1 | 1, 0.2, 0.095, limbMat, 0.25));
  for (const arm of arms) body.add(arm.pivot);
  for (const side of [-1, 1]) {
    const foot = sphere(0.15, limbMat, [1.1, 0.6, 1.25]);
    foot.position.set(side * 0.36, 0.06, 0.52);
    body.add(foot);
  }
  return {
    skin: [bun], fit: FIT, arms,
    root, body, head: body, ...parts, mouth, ears, tops: [seam],
    anchors: { ...bunAnchors(face, "bunny", 0.72, 0.3, 0.54), hw: w / 2, hh: h / 2, hd: d / 2, top: BUN.cy + h / 2, earL: v(-w / 2, BUN.cy + 0.1, 0), earR: v(w / 2, BUN.cy + 0.1, 0) },
    move(t, rest) {
      flop.rotation.z = -1.25 - rest * 0.3 + Math.sin(t * 1.8) * 0.04;
      up.rotation.z = 0.12 + rest * 0.5;
    },
  };
}
