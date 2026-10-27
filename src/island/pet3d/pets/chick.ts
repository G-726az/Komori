// Pollito: a round ball with wings, a beak and a tuft.

import * as THREE from "three";
import { mesh, sphere, tint, tube, v, vinyl } from "../kit";
import { addFace, base, sphereFace, type Rig, type Arm, type PetFit } from "../parts";

/** How the wardrobe sits on the Pollito: a ball, so hats sit on the crown. */
const FIT: PetFit = {
  // Under the beak; the wings rest over it.
  scarf: { up: 0.07 },
  beanie: { seat: 0.55 },
  hood: { seat: 1.15 },
  crown: { seat: 0.18 },
  witch: { seat: 0.24 },
};

export function chick(color: string): Rig {
  const { root, body } = base();
  const R = 0.82;
  const c = v(0, 0.92, 0);
  const ball = sphere(R, vinyl(color, 0.5, 0.25));
  // Measured for the wardrobe.
  const skin = ball;
  ball.position.copy(c);
  body.add(ball);
  const face = sphereFace(c, R);
  const parts = addFace(body, { face, eyeY: 1.0, gap: 0.27, r: 0.08, cheekY: 0.86, cheekGap: 0.5, cheekR: 0.1, mouthY: 0.78 });
  const wingMat = vinyl(tint(color, -0.12).getStyle(), 0.55, 0.2);
  // The wings are its arms: they lift with every gesture.
  const arms: Arm[] = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.76, 1.02, -0.02);
    const wing = sphere(0.24, wingMat, [0.5, 1, 0.8]);
    wing.position.set(side * 0.05, -0.18, 0);
    pivot.add(wing);
    body.add(pivot);
    return { pivot, side: side as -1 | 1, rest: 0.45 };
  });
  const beak = mesh(new THREE.ConeGeometry(0.1, 0.2, 24), vinyl("#ff9f43", 0.35, 0.5));
  const bp = face(0, 0.86);
  beak.position.copy(bp.p).addScaledVector(bp.n, 0.06);
  beak.rotation.x = Math.PI / 2;
  beak.scale.set(1.2, 1, 0.8);
  body.add(beak);
  const feetMat = vinyl("#f29a38", 0.5, 0.2);
  for (const side of [-1, 1]) {
    const x = side * 0.28;
    for (const dx of [-0.07, 0, 0.07]) body.add(tube([v(x, 0.12, 0.2), v(x + dx, 0.02, 0.36)], 0.025, feetMat, 6));
  }
  const tuft = new THREE.Group();
  const tuftMat = vinyl(tint(color, -0.1).getStyle(), 0.5, 0.2);
  for (const [dx, k] of [[-0.06, -0.12], [0, 0], [0.06, 0.12]]) {
    tuft.add(tube([v(dx, 1.7, 0), v(dx + k * 0.6, 1.86, 0), v(dx + k * 1.4, 1.93, 0)], 0.03, tuftMat, 8));
  }
  body.add(tuft);
  return {
    root, body, head: body, ...parts, mouth: beak, ears: [], tops: [tuft], skin: [skin], fit: FIT, arms,
    anchors: {
      head: c, hw: R, hh: R, hd: R, top: c.y + R, eyeY: 1.0, eyeGap: 0.27, mouth: v(0, 0.82, R),
      neckY: 0.55, neckR: 0.78, earL: v(-R, 1.0, 0), earR: v(R, 1.0, 0), earStyle: "none", face,
    },
    move(t, rest) {
      void t;
      void rest;
    },
  };
}
