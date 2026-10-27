// Fantasmita: a floating dome with a wavy hem.

import * as THREE from "three";
import { ink, mesh, smoothProfile, sphere, stick, v, vinyl } from "../kit";
import { addFace, base, latheFace, type Rig, nubArm, type PetFit } from "../parts";

/** How the wardrobe sits on Fantasmita: a rounded dome, a little narrower at the top. */
const FIT: PetFit = {
  // Under the mouth at the front, over the little arms at the sides.
  scarf: { up: 0.04, bump: 0.24 },
  beanie: { seat: 0.55 },
  hood: { seat: 1.05 },
  crown: { seat: 0.16 },
  witch: { seat: 0.22, scale: 0.9 },
};

export function ghost(color: string): Rig {
  const { root, body } = base();
  const prof: [number, number][] = [[0.8, 0.22], [0.8, 0.6], [0.79, 0.9], [0.72, 1.18], [0.56, 1.42], [0.3, 1.57], [0, 1.62]];
  const geo = new THREE.LatheGeometry(smoothProfile(prof, 64), 96);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.4) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      pos.setY(i, y + Math.sin(a * 5) * 0.09 * (0.4 - y) / 0.18);
    }
  }
  geo.computeVertexNormals();
  const mat = vinyl(color, 0.35, 0.45);
  mat.side = THREE.DoubleSide;
  mat.transparent = true;
  const skin = mesh(geo, mat);
  body.add(skin);
  // Two little stubby arms that float with it.
  const arms = [-1, 1].map((side) => nubArm(v(side * 0.76, 0.78, 0.12), side as -1 | 1, 0.18, 0.08, mat, 0.45));
  for (const arm of arms) body.add(arm.pivot);
  const face = latheFace(prof);
  const parts = addFace(body, { face, eyeY: 1.05, gap: 0.26, r: 0.085, cheekY: 0.92, cheekGap: 0.48, cheekR: 0.1, mouthY: 0.82 });
  const mouth = sphere(0.05, ink(), [1, 1.2, 0.5]);
  const m = face(0, 0.83);
  stick(mouth, m.p, m.n, 0.005);
  body.add(mouth);
  return {
    root, body, head: body, ...parts, mouth, ears: [], tops: [], skin: [skin], fit: FIT, arms,
    anchors: {
      head: v(0, 1.05, 0), hw: 0.8, hh: 0.58, hd: 0.8, top: 1.62, eyeY: 1.05, eyeGap: 0.26, mouth: v(0, 0.83, 0.8),
      neckY: 0.62, neckR: 0.82, earL: v(-0.8, 0.98, 0), earR: v(0.8, 0.98, 0), earStyle: "none", face,
    },
    move(t, rest) {
      body.position.y = 0.12 + Math.sin(t * 1.6) * 0.05 * (1 - rest * 0.7) - rest * 0.08;
      mat.opacity = 1 - rest * 0.3;
    },
  };
}
