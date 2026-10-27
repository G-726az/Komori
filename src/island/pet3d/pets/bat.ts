// Murciélago: a smaller bun with big ears, wings and fangs.

import * as THREE from "three";
import { ink, mesh, pointyEar, shine, stick, tint, tube, v, vinyl } from "../kit";
import { addFace, base, boxFace, bunAnchors, bunBody, BUN, type Rig, type PetFit, type Arm } from "../parts";

/** How the wardrobe sits on el Murciélago: a smaller bun with big ears and wings (they are its arms). */
const FIT: PetFit = {
  // Under the mouth, and below where the wings start.
  scarf: { up: 0.17, bump: 0.08 },
  beanie: { seat: 0.5 },
  capears: { seat: 0.42 },
  backcap: { seat: 0.42 },
  hood: { seat: 1.1 },
  crown: { seat: 0.1 },
  witch: { seat: 0.16 },
};

export function bat(color: string): Rig {
  const { root, body } = base();
  const bun = bunBody(color);
  bun.scale.set(0.86, 0.9, 0.9);
  body.add(bun);
  const w = BUN.w * 0.86;
  const h = BUN.h * 0.9;
  const d = BUN.d * 0.9;
  const face = boxFace(w, h, d, BUN.r * 0.9, BUN.cy);
  const parts = addFace(body, { face, eyeY: 0.74, gap: 0.27, r: 0.08, cheekY: 0.6, cheekGap: 0.48, cheekR: 0.1, mouthY: 0.56 });
  const furMat = vinyl(tint(color, -0.05).getStyle());
  const ears: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const ear = pointyEar(0.68, 0.26, furMat, "#ffb3c4");
    ear.position.set(side * 0.4, BUN.cy + h / 2 - 0.12, 0);
    ear.rotation.z = -side * 0.18;
    body.add(ear);
    ears.push(ear);
  }
  const wingMat = vinyl(tint(color, -0.35).getStyle(), 0.5, 0.2);
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.25);
    shape.quadraticCurveTo(0.55, 0.75, 0.95, 0.45);
    shape.quadraticCurveTo(0.82, 0.25, 0.86, 0.02);
    shape.quadraticCurveTo(0.66, 0.12, 0.6, -0.12);
    shape.quadraticCurveTo(0.45, 0.0, 0.32, -0.2);
    shape.quadraticCurveTo(0.2, -0.02, 0, -0.08);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 18 });
    const wing = mesh(geo, wingMat);
    const pivot = new THREE.Group();
    pivot.position.set(side * (w / 2 - 0.06), BUN.cy + 0.08, -0.1);
    wing.scale.x = side;
    pivot.add(wing);
    body.add(pivot);
    wings.push(pivot);
  }
  const tuft = mesh(new THREE.ConeGeometry(0.07, 0.18, 16), furMat);
  tuft.position.set(0.03, BUN.cy + h / 2 + 0.05, 0.1);
  tuft.rotation.z = -0.4;
  body.add(tuft);
  const mouth = new THREE.Group();
  const mp = face(0, 0.58);
  mouth.add(tube([v(-0.08, 0.02, 0), v(0, -0.03, 0), v(0.08, 0.02, 0)], 0.013, ink(), 16));
  for (const side of [-1, 1]) {
    const fang = mesh(new THREE.ConeGeometry(0.022, 0.06, 12), shine());
    fang.rotation.x = Math.PI;
    fang.position.set(side * 0.035, -0.035, 0.01);
    mouth.add(fang);
  }
  stick(mouth, mp.p, mp.n, 0.008);
  body.add(mouth);
  const arms: Arm[] = [];
  return {
    skin: [bun], fit: FIT, arms,
    root, body, head: body, ...parts, mouth, ears, tops: [tuft],
    anchors: { ...bunAnchors(face, "bat", 0.74, 0.27, 0.56), hw: w / 2, hh: h / 2, hd: d / 2, top: BUN.cy + h / 2, earL: v(-w / 2, BUN.cy + 0.1, 0), earR: v(w / 2, BUN.cy + 0.1, 0) },
    move(t, rest) {
      const flap = Math.sin(t * 2.4) * 0.35 * (1 - rest);
      wings.forEach((wg, i) => {
        const side = i ? 1 : -1;
        wg.rotation.y = side * (0.25 + flap) * (1 - rest) + side * rest * 1.2;
        wg.scale.setScalar(1 - rest * 0.35);
      });
    },
  };
}
