// Gato: a soft bun with pointy ears, stripes and a tail.

import * as THREE from "three";
import { ink, pointyEar, sphere, stick, tint, tube, v, vinyl } from "../kit";
import { addFace, base, boxFace, bunAnchors, bunBody, BUN, type Rig, nubArm, type PetFit } from "../parts";

/** How the wardrobe sits on el Gato: a wide, flat-topped bun with ears up top. */
const FIT: PetFit = {
  // Under the mouth at the front, over the little arms at the sides.
  scarf: { up: 0.17, bump: 0.26 },
  beanie: { seat: 0.5 },
  capears: { seat: 0.42 },
  backcap: { seat: 0.42 },
  hood: { seat: 1.1 },
  crown: { seat: 0.1 },
  witch: { seat: 0.16 },
};

export function cat(color: string): Rig {
  const { root, body } = base();
  const skin = bunBody(color);
  body.add(skin);
  const face = boxFace(BUN.w, BUN.h, BUN.d, BUN.r, BUN.cy);
  const parts = addFace(body, { face, eyeY: 0.78, gap: 0.33, r: 0.085, cheekY: 0.62, cheekGap: 0.56, cheekR: 0.11, mouthY: 0.56 });
  const furMat = vinyl(color);
  const ears: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const ear = pointyEar(0.52, 0.3, furMat, "#ffb3c4");
    ear.position.set(side * 0.52, BUN.cy + BUN.h / 2 - 0.12, 0.05);
    ear.rotation.z = -side * 0.28;
    body.add(ear);
    ears.push(ear);
  }
  const stripeMat = vinyl(tint(color, -0.25).getStyle());
  const stripes = new THREE.Group();
  for (const x of [-0.12, 0.12]) {
    const a = face(x, 1.3);
    const b = face(x * 0.8, 1.14);
    stripes.add(tube([a.p.clone().addScaledVector(a.n, 0.005), b.p.clone().addScaledVector(b.n, 0.005)], 0.03, stripeMat, 8));
  }
  body.add(stripes);
  const nose = sphere(0.045, vinyl("#ff8fa6", 0.3, 0.6), [1.2, 0.8, 0.8]);
  const np = face(0, 0.66);
  stick(nose, np.p, np.n, 0.02);
  body.add(nose);
  const mouth = new THREE.Group();
  const mp = face(0, 0.6);
  mouth.add(tube([v(-0.1, 0.02, 0), v(-0.05, -0.03, 0), v(0, 0.01, 0), v(0.05, -0.03, 0), v(0.1, 0.02, 0)], 0.014, ink(), 24));
  stick(mouth, mp.p, mp.n, 0.008);
  body.add(mouth);
  const whiskerMat = new THREE.MeshStandardMaterial({ color: 0x6b5048, roughness: 0.6 });
  for (const side of [-1, 1]) {
    for (const dy of [0, -0.06]) {
      const a = face(side * 0.5, 0.62 + dy);
      const b = face(side * 0.8, 0.64 + dy);
      body.add(tube([a.p.clone().addScaledVector(a.n, 0.01), b.p.clone().addScaledVector(b.n, 0.06)], 0.009, whiskerMat, 6));
    }
  }
  const tail = tube([v(0.5, 0.3, -0.6), v(1.0, 0.45, -0.55), v(1.08, 0.95, -0.4), v(0.92, 1.25, -0.3)], 0.09, vinyl(tint(color, -0.15).getStyle()));
  body.add(tail);
  const limbMat = vinyl(color);
  const arms = [-1, 1].map((side) => nubArm(v(side * (BUN.w / 2 - 0.04), 0.5, 0.18), side as -1 | 1, 0.2, 0.095, limbMat, 0.25));
  for (const arm of arms) body.add(arm.pivot);
  for (const side of [-1, 1]) {
    const foot = sphere(0.15, limbMat, [1.1, 0.6, 1.25]);
    foot.position.set(side * 0.36, 0.06, 0.52);
    body.add(foot);
  }
  return {
    skin: [skin], fit: FIT, arms,
    root, body, head: body, ...parts, mouth, ears, tops: [stripes],
    anchors: bunAnchors(face, "cat", 0.78, 0.33, 0.58),
    move(t, rest) {
      tail.rotation.y = Math.sin(t * 2) * 0.12 * (1 - rest);
      for (const [i, ear] of ears.entries()) ear.rotation.z = -(i ? 1 : -1) * (0.28 + rest * 0.5);
    },
  };
}
