// A pet as a real 3D model: its own little studio (lights, a floor that takes
// soft shadows, a camera), the same moods as always — happy hop, poke squash,
// pout, dizzy with orbiting stars, a coffee break, rest — and eyes and head
// that turn toward where it's told to look.

import * as THREE from "three";
import { settings, type PetId } from "../../shared/settings";
import { item, type Outfit } from "../wardrobe";
import { drawInto, environment, realShadows } from "./engine";
import { heartShape, letter, mesh, puffy, showEye, sphere, starShape, tube, v, vinyl, type EyeMode } from "./kit";
import { buildPet, type Rig } from "./models";
import { OUTFITS_3D, fitFor } from "./outfits";
import type { Pet } from "../pet";
import { petSound } from "../sfx";

const HEADROOM = 0.3;
const DPR = Math.min(2, window.devicePixelRatio || 1);
const POUT_S = 2.2;
const DIZZY_S = 2.8;
const COFFEE_S = 5;

interface Surface {
  canvas: HTMLCanvasElement;
  size: number;
  seen?: boolean;
  last: number;
}

function surface(size: number): Surface {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size * DPR);
  canvas.height = Math.round(size * (1 + HEADROOM) * DPR);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size * (1 + HEADROOM)}px`;
  return { canvas, size, last: 0 };
}

/** A studio: soft key light with shadows, a cool rim from behind, sky fill, a shadow-catching floor. */
function studio(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera; blob: THREE.Mesh | null } {
  const real = realShadows();
  const scene = new THREE.Scene();
  scene.environment = environment();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f655f, 0.6));
  const key = new THREE.DirectionalLight(0xfff4e8, 1.45);
  key.position.set(-2.4, 4.2, 3.6);
  key.castShadow = real;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = -2.2;
  key.shadow.camera.right = 2.2;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -1;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe7ff, 0.9);
  rim.position.set(2.6, 2.2, -3);
  scene.add(rim);
  // A strong card draws the real shadow; others get a soft painted one under
  // the pet (no extra pass), which shrinks when it hops.
  let blob: THREE.Mesh | null = null;
  if (real) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.28 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
  } else {
    blob = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.005;
    scene.add(blob);
  }
  const camera = new THREE.PerspectiveCamera(25, 1 / (1 + HEADROOM), 0.1, 50);
  camera.position.set(0, 1.9, 7.6);
  camera.lookAt(0, 1.12, 0);
  return { scene, camera, blob };
}

let blobMap: THREE.Texture | null = null;
/** A soft round shadow, dark in the middle and fading out. */
function blobTexture(): THREE.Texture {
  if (blobMap) return blobMap;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.42)");
  g.addColorStop(0.45, "rgba(0,0,0,0.26)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  blobMap = new THREE.CanvasTexture(c);
  return blobMap;
}

export function createPet3D(size = 30): Pet {
  const surfaces: Surface[] = [surface(size)];
  const { scene, camera, blob } = studio();
  let kind: PetId = "bou";
  let color = "#eaf7f1";
  let style = "";
  let outfit: Outfit = {};
  let rig: Rig = buildPet(kind, color, style);
  scene.add(rig.root);
  let worn = new THREE.Group();
  rig.head.add(worn);

  // Things that appear with moods.
  const fx = new THREE.Group();
  scene.add(fx);
  const zs = [0, 1, 2].map(() => {
    const z = letter("z", "#a8c8ff");
    z.scale.setScalar(0.28);
    fx.add(z);
    return z;
  });
  const heart = puffy(heartShape(0.13), 0.03, vinyl("#ff6f91", 0.3, 0.6));
  fx.add(heart);
  const stars = [0, 1, 2].map(() => {
    const s = puffy(starShape(0.09), 0.02, vinyl("#ffd84d", 0.3, 0.6));
    fx.add(s);
    return s;
  });
  const mug = new THREE.Group();
  const cup = mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.24, 28), vinyl("#fbf7f0", 0.3, 0.6));
  const coffee = mesh(new THREE.CircleGeometry(0.115, 24), vinyl("#8c5a3a", 0.2, 0.8));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.1;
  const handle = mesh(new THREE.TorusGeometry(0.07, 0.022, 10, 20, Math.PI * 1.3), vinyl("#fbf7f0", 0.3, 0.6));
  handle.position.x = 0.14;
  handle.rotation.z = -Math.PI * 0.65;
  const cupHeart = puffy(heartShape(0.035), 0.006, vinyl("#ff8fb3", 0.3, 0.6));
  cupHeart.position.set(0, 0, 0.12);
  mug.add(cup, coffee, handle, cupHeart);
  const steam = [0, 1].map((k) => {
    const s = tube(Array.from({ length: 6 }, (_, i) => v((k ? 0.04 : -0.04) + Math.sin(i * 1.2) * 0.02, 0.16 + i * 0.05, 0)), 0.012,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }), 16);
    mug.add(s);
    return s;
  });
  fx.add(mug);
  const puffs = [0, 1, 2].map((i) => {
    const p = sphere(0.05 + i * 0.02, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    fx.add(p);
    return p;
  });

  let nextBlink = performance.now() + 2500;
  let blinkStart = -1;
  let shown = false;
  let last = performance.now();
  let restTarget = 0;
  let rest = 0;
  let curiousTarget = 0;
  let curious = 0;
  let happyAt = -1e9;
  let pokeAt = -1e9;
  let wakeAt = -1e9;
  let poutAt = -1e9;
  let dizzyAt = -1e9;
  let coffeeAt = -1e9;
  let pokes: number[] = [];
  const lookTarget = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  const since = (at: number, now: number) => (now - at) / 1000;

  function rebuild() {
    scene.remove(rig.root);
    rig = buildPet(kind, color, style);
    scene.add(rig.root);
    dress();
  }

  function dress() {
    worn.removeFromParent();
    worn = new THREE.Group();
    const head = item(outfit.head);
    const face = item(outfit.face);
    if (head || face) {
      // Measured once per pet and look, then every item hugs that shape.
      const fit = fitFor(rig, `${kind}:${style}`);
      for (const it of [head, face]) {
        const build = it ? OUTFITS_3D[it.id] : undefined;
        if (build) worn.add(build(fit));
      }
    }
    rig.head.add(worn);
    for (const t of rig.tops) t.visible = !head?.covers;
    for (const e of rig.ears) e.visible = !head?.hidesEars;
  }

  /** Shown right now: on the page, not hidden, not faded out, the window not minimised. */
  const visible = (c: HTMLCanvasElement) =>
    c.isConnected && document.visibilityState === "visible" &&
    (typeof c.checkVisibility !== "function" || c.checkVisibility({ opacityProperty: true, visibilityProperty: true }));

  /** Something is moving on purpose (a reaction, a turn of the head): draw smooth. */
  function lively(now: number): boolean {
    return Math.abs(lookTarget.x - look.x) + Math.abs(lookTarget.y - look.y) > 0.01 ||
      Math.abs(restTarget - rest) > 0.01 || Math.abs(curiousTarget - curious) > 0.01 ||
      since(happyAt, now) < 1.2 || since(pokeAt, now) < 0.8 || since(wakeAt, now) < 1.5 ||
      since(poutAt, now) < POUT_S || since(dizzyAt, now) < DIZZY_S || since(coffeeAt, now) < COFFEE_S;
  }

  let drawnAt = 0;
  /** Next tick: every frame while someone can see the pet, a slow peek otherwise. */
  function schedule(seen: boolean, wait = 0) {
    if (!seen) window.setTimeout(() => frame(performance.now()), 400);
    // Waiting for the next allowed frame: a timer, not a frame request every
    // screen refresh (those alone keep the graphics card busy).
    else if (wait > 6) window.setTimeout(() => requestAnimationFrame(frame), wait - 4);
    else requestAnimationFrame(frame);
  }

  function frame(now: number) {
    const live = surfaces.some((x) => x.canvas.isConnected);
    if (live) shown = true;
    else if (shown) return;
    for (let i = surfaces.length - 1; i > 0; i--) {
      const sf = surfaces[i];
      if (sf.canvas.isConnected) sf.seen = true;
      else if (sf.seen) surfaces.splice(i, 1);
    }
    // Nobody can see it: no animating, no drawing.
    const seen = surfaces.filter((x) => visible(x.canvas));
    if (!seen.length) {
      last = now;
      schedule(false);
      return;
    }
    // Breathing only: as many frames as the settings allow. Reacting: 30.
    const fps = lively(now) ? 30 : (settings().perf?.petFps ?? 20);
    if (now - drawnAt < 1000 / fps - 2) {
      schedule(true, 1000 / fps - (now - drawnAt));
      return;
    }
    drawnAt = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    rest += (restTarget - rest) * Math.min(1, dt * 2.2);
    curious += (curiousTarget - curious) * Math.min(1, dt * 8);
    look.x += (lookTarget.x - look.x) * Math.min(1, dt * 8);
    look.y += (lookTarget.y - look.y) * Math.min(1, dt * 8);

    if (rest < 0.3 && blinkStart < 0 && now > nextBlink) blinkStart = now;
    let blink = 0;
    if (blinkStart >= 0) {
      const k = (now - blinkStart) / 150;
      blink = k < 1 ? k : k < 2 ? 2 - k : 0;
      if (k >= 2) {
        blinkStart = -1;
        nextBlink = now + 2200 + Math.random() * 3500;
      }
    }
    const tHappy = since(happyAt, now);
    const tPoke = since(pokeAt, now);
    const tWake = since(wakeAt, now);
    const tPout = since(poutAt, now);
    const tDizzy = since(dizzyAt, now);
    const tCoffee = since(coffeeAt, now);
    const dizzy = tDizzy < DIZZY_S;
    const pout = !dizzy && tPout < POUT_S;
    const sip = tCoffee < COFFEE_S ? Math.max(0, Math.min(1, tCoffee * 3, (COFFEE_S - tCoffee) * 3)) : 0;
    let mode: EyeMode = "open";
    if (rest > 0.5) mode = "closed";
    else if (dizzy) mode = "dizzy";
    else if (pout) mode = "pout";
    else if (sip > 0.3 || tHappy < 1.3 || tPoke < 1.1 || (tWake > 0.5 && tWake < 1.4)) mode = "happy";

    // Face.
    for (const e of rig.eyes) showEye(e, mode, blink, t);
    const reacting = dizzy || pout;
    // The chick keeps its beak; other mouths give way to the reaction mouth.
    if (rig.mouth) rig.mouth.visible = kind === "chick" || !reacting;
    rig.pouty.visible = pout;
    rig.wobbly.visible = dizzy;
    for (const c of rig.cheeks) {
      const k = pout ? 1.35 : 1;
      c.scale.set(k, 0.62 * k, 1);
      (c.material as THREE.MeshBasicMaterial).opacity = pout ? 0.7 : 0.45;
    }

    // Body.
    const breath = (Math.sin(now / (700 + rest * 900)) + 1) / 2;
    let sx = 1 - breath * 0.012;
    let sy = 1 + breath * 0.022 - rest * 0.07;
    let hop = 0;
    let roll = -curious * 0.14;
    if (tHappy < 0.55) hop += Math.sin((tHappy / 0.55) * Math.PI) * 0.22;
    if (tPoke < 0.6) {
      const k = Math.sin((tPoke / 0.6) * Math.PI * 2) * Math.exp(-tPoke * 4);
      sx *= 1 + k * 0.16;
      sy *= 1 - k * 0.16;
    }
    if (tWake < 0.7) {
      const k = Math.sin((tWake / 0.7) * Math.PI);
      sy *= 1 + k * 0.14;
      sx *= 1 - k * 0.06;
    }
    if (pout) roll += Math.sin(tPout * 14) * 0.05 * Math.max(0, 1 - tPout / POUT_S);
    if (dizzy) roll += Math.sin(tDizzy * 9) * 0.16 * Math.max(0.2, 1 - tDizzy / DIZZY_S);
    rig.body.scale.set(sx, sy, sx);
    rig.root.position.y = hop;
    rig.root.rotation.z = roll;
    // A bat rests upside down.
    if (kind === "bat") {
      rig.root.rotation.z += Math.PI * easeInOut(rest);
      rig.root.position.y += easeInOut(rest) * 1.75;
    }
    if (blob) {
      // Higher up, smaller and fainter.
      const k = 1 / (1 + Math.max(0, rig.root.position.y) * 1.4);
      blob.scale.set(0.95 * k, 0.6 * k, 1);
      (blob.material as THREE.MeshBasicMaterial).opacity = k;
    }
    // Turning to look (and a slow idle sway so it reads as 3D).
    const idle = Math.sin(t * 0.55) * 0.12 * (1 - rest);
    rig.head.rotation.y = look.x * 0.6 + idle;
    rig.head.rotation.x = look.y * 0.28;
    rig.move(t, rest);

    // Arms (or wings) that join in every gesture.
    const bell = (x: number, len: number) => (x >= 0 && x < len ? Math.sin((x / len) * Math.PI) : 0);
    for (const arm of rig.arms) {
      let lift = Math.sin(t * 1.4 + arm.side) * 0.05 * (1 - rest);
      // Happy: both up in a little cheer, waving.
      lift += bell(tHappy, 1.2) * (1.6 + Math.sin(tHappy * 14) * 0.25);
      // Poked: a startled flail.
      lift += bell(tPoke, 0.8) * (0.8 + Math.sin(tPoke * 30 + arm.side) * 0.35);
      // Waking up: a stretch.
      lift += bell(tWake, 1.4) * 1.9;
      // Pout: arms folded in front.
      if (pout) lift -= 0.55 * Math.min(1, tPout * 5, (POUT_S - tPout) * 5);
      // Dizzy: loose and wobbly.
      if (dizzy) lift += Math.sin(tDizzy * 9 + arm.side * 1.7) * 0.7 * Math.max(0.2, 1 - tDizzy / DIZZY_S);
      // Coffee: the right one holds the mug up.
      if (arm.side > 0) lift += sip * 1.25;
      // Curious: a small wave hello with the left one.
      if (arm.side < 0) lift += curious * (0.7 + Math.sin(t * 9) * 0.3);
      // Asleep: hanging limp.
      lift -= rest * 0.2;
      arm.pivot.rotation.z = arm.side * (arm.rest + lift);
      // Folding in (pout) also brings them forward.
      arm.pivot.rotation.x = pout ? -0.5 * Math.min(1, tPout * 5, (POUT_S - tPout) * 5) : 0;
    }

    // Effects.
    const a = rig.anchors;
    // Anchors live in the head's space (which may be moved and scaled): to the scene.
    rig.root.updateMatrixWorld(true);
    const toScene = (p: THREE.Vector3) => rig.head.localToWorld(p.clone());
    const headScale = rig.head.getWorldScale(new THREE.Vector3()).x;
    const headTop = toScene(v(a.head.x, a.top, a.head.z)).y;
    zs.forEach((z, i) => {
      const ph = ((t + i * 0.8) % 2.4) / 2.4;
      z.visible = rest > 0.5;
      z.position.set(0.7 + ph * 0.35, headTop - 0.1 + ph * 0.6, 0.2);
      (z.material as THREE.SpriteMaterial).opacity = Math.sin(ph * Math.PI) * (rest - 0.5) * 2;
    });
    heart.visible = tPoke < 1.1 && !pout && !dizzy;
    heart.position.set(0.75, headTop - 0.1 + tPoke * 0.5, 0.3);
    heart.rotation.y = tPoke * 4;
    heart.scale.setScalar(Math.max(0.01, 1 - tPoke / 1.1));
    stars.forEach((s, i) => {
      const ang = t * 3 + (i / 3) * Math.PI * 2;
      s.visible = dizzy;
      s.position.set(Math.cos(ang) * a.hw * 0.95 * headScale, headTop + 0.08 + Math.sin(ang * 2) * 0.03, Math.sin(ang) * a.hd * 0.95 * headScale);
      s.rotation.y = t * 4;
    });
    mug.visible = sip > 0 && rest < 0.3;
    if (mug.visible) {
      const lift = Math.max(0, Math.sin(t * 2.2)) * sip;
      const m = toScene(a.face(0, a.mouth.y).p);
      mug.position.set(0.05, m.y - 0.18 + lift * 0.1, m.z + 0.22);
      mug.rotation.z = lift * 0.35;
      mug.scale.setScalar(Math.min(1, sip * 1.5));
      steam.forEach((s, i) => ((s.material as THREE.MeshBasicMaterial).opacity = 0.5 * sip * (0.6 + Math.sin(t * 4 + i) * 0.4)));
    }
    puffs.forEach((p, i) => {
      p.visible = pout;
      p.position.set(0.72 + i * 0.12, headTop - 0.05 + i * 0.1 + tPout * 0.06, 0.2);
      (p.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - tPout / POUT_S) * 0.8;
    });

    // Draw every place this pet shows where it can be seen.
    for (const sf of seen) {
      sf.last = now;
      drawInto(sf.canvas, scene, camera, sf.canvas.width, sf.canvas.height);
    }
    schedule(true, 1000 / fps);
  }
  requestAnimationFrame(frame);

  const pet: Pet = {
    el: surfaces[0].canvas,
    clone(s = 26) {
      const extra = surface(s);
      surfaces.push(extra);
      return extra.canvas;
    },
    setKind(next, nextColor, nextStyle) {
      const c = nextColor && /^#[0-9a-f]{6}$/i.test(nextColor) ? nextColor : DEFAULT_COLORS[next] ?? "#eaf7f1";
      const st = nextStyle ?? "";
      if (next === kind && c === color && st === style) return;
      kind = next;
      color = c;
      style = st;
      rebuild();
    },
    setOutfit(next) {
      const o = next ?? {};
      if (o.head === outfit.head && o.face === outfit.face) return;
      outfit = o;
      dress();
    },
    happy() {
      if (restTarget > 0) return;
      happyAt = performance.now();
      petSound("happy");
    },
    poke() {
      const now = performance.now();
      if (restTarget > 0) pet.setSleeping(false);
      pokes = [...pokes.filter((x) => now - x < 3000), now];
      if (pokes.length >= 8) {
        dizzyAt = now;
        pokes = [];
        petSound("dizzy");
      } else if (pokes.length >= 4) {
        poutAt = now;
        petSound("pout");
      } else {
        pokeAt = now;
        petSound("poke");
      }
    },
    react(what) {
      const now = performance.now();
      if (what === "pout") poutAt = now;
      else if (what === "dizzy") dizzyAt = now;
      else coffeeAt = now;
      petSound(what);
    },
    coffee() {
      if (pet.busy) return;
      coffeeAt = performance.now();
      petSound("coffee");
    },
    setCurious(on) {
      curiousTarget = on ? 1 : 0;
    },
    setSleeping(on) {
      if (on === restTarget > 0) return;
      restTarget = on ? 1 : 0;
      if (!on) wakeAt = performance.now();
      // Waking up is heard; falling asleep happens when nobody is around.
      if (!on) petSound("wake");
    },
    get busy() {
      const now = performance.now();
      return restTarget > 0 || since(dizzyAt, now) < DIZZY_S || since(poutAt, now) < POUT_S || since(coffeeAt, now) < COFFEE_S;
    },
    setLook(x, y) {
      lookTarget.x = Math.max(-1, Math.min(1, x));
      lookTarget.y = Math.max(-1, Math.min(1, y));
    },
  };
  return pet;
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** Same default colours as the 2D pets (kept here to avoid a loop of imports). */
const DEFAULT_COLORS: Record<string, string> = {
  bou: "#eaf7f1", ghost: "#eef1ff", cat: "#f8cfa4", bat: "#b39ae0", neko: "#e64ca8", chick: "#ffd84d", bunny: "#f7b7c8",
};
