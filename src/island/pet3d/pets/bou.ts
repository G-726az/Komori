// Bou: a round drop with a sprout.

import * as THREE from "three";
import { lathe, sphere, tube, v, vinyl } from "../kit";
import { addFace, base, latheFace, type Rig, nubArm, type PetFit } from "../parts";

/** How the wardrobe sits on Bou: a tall dome, so hats sit high and small. */
const FIT: PetFit = {
  // Under the mouth at the front, over the little arms at the sides.
  scarf: { up: 0.14, bump: 0.34 },
  beanie: { seat: 0.55 },
  capears: { seat: 0.45 },
  backcap: { seat: 0.45 },
  hood: { seat: 1.05 },
  crown: { seat: 0.16 },
  witch: { seat: 0.22, scale: 0.9 },
  party: { x: 0.05 },
};

export function bou(color: string): Rig {
  const { root, body } = base();
  const prof: [number, number][] = [[0, 0], [0.62, 0.01], [0.86, 0.1], [0.94, 0.32], [0.9, 0.66], [0.74, 1.02], [0.46, 1.3], [0.2, 1.42], [0, 1.45]];
  const skin = lathe(prof, vinyl(color));
  body.add(skin);
  const face = latheFace(prof);
  const parts = addFace(body, { face, eyeY: 0.62, gap: 0.27, r: 0.085, cheekY: 0.5, cheekGap: 0.52, cheekR: 0.11, mouthY: 0.45 });
  const leafMat = vinyl("#6fd3a2", 0.5, 0.2);
  const sprout = new THREE.Group();
  sprout.add(tube([v(0, 1.42, 0), v(0.03, 1.56, 0), v(0.12, 1.68, 0)], 0.035, vinyl("#4fb589", 0.5, 0.2)));
  const leaf = sphere(0.13, leafMat, [1.25, 0.5, 0.75]);
  leaf.position.set(0.24, 1.72, 0);
  leaf.rotation.z = -0.5;
  sprout.add(leaf);
  body.add(sprout);
  const top = 1.45;
  // Little round arms at the sides and two toes peeking out in front.
  const limbMat = vinyl(color);
  const arms = [-1, 1].map((side) => nubArm(v(side * 0.86, 0.52, 0.12), side as -1 | 1, 0.2, 0.09, limbMat, 0.3));
  for (const arm of arms) body.add(arm.pivot);
  for (const side of [-1, 1]) {
    const toe = sphere(0.13, limbMat, [1.1, 0.55, 1.2]);
    toe.position.set(side * 0.32, 0.05, 0.66);
    body.add(toe);
  }
  return {
    root, body, head: body, ...parts, mouth: null, ears: [], tops: [sprout], skin: [skin], fit: FIT, arms,
    anchors: {
      head: v(0, 0.8, 0), hw: 0.86, hh: 0.66, hd: 0.86, top, eyeY: 0.62, eyeGap: 0.27, mouth: v(0, 0.45, 0.9),
      neckY: 0.2, neckR: 0.9, earL: v(-0.9, 0.62, 0), earR: v(0.9, 0.62, 0), earStyle: "none", face,
    },
    move(t, rest) {
      sprout.rotation.z = -0.15 * rest + Math.sin(t * 1.3) * 0.05;
    },
  };
}
