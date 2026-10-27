// The pets as 3D models — Komori's own designs. Each one lives in its own file
// under pets/ (shape, limbs, wardrobe fit); this picks one by id.
// Units: about 1.8 wide, standing on the floor (y = 0), looking at +z.
//
// The pet files are found at build time: a pet whose file is missing (the neko
// is kept out of the public repository while it is being remade) simply isn't
// offered, and anyone who had chosen it gets Bou.

import type { PetId } from "../../shared/settings";
import type { Rig } from "./parts";

export type { Anchors, EarStyle, Rig } from "./parts";

type Builder = (color: string, style: string) => Rig;

const files = import.meta.glob<Record<string, Builder>>("./pets/*.ts", { eager: true });

const BUILDERS: Partial<Record<PetId, Builder>> = {};
for (const [path, mod] of Object.entries(files)) {
  const id = path.replace(/^.*\/(\w+)\.ts$/, "$1") as PetId;
  const build = mod[id];
  if (typeof build === "function") BUILDERS[id] = build;
}

/** Is this pet part of this build? */
export function hasPet(kind: PetId): boolean {
  return kind in BUILDERS;
}

export function buildPet(kind: PetId, color: string, style: string): Rig {
  const build = BUILDERS[kind] ?? BUILDERS.bou!;
  return build(color, kind === "neko" ? style || "long" : style);
}
