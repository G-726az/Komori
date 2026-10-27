// One WebGL renderer for every pet on the page. Each pet has its own scene;
// each place it shows (the pill, the header, a big Home card, the settings…)
// is a plain 2D canvas: the scene is rendered into a corner of the shared
// renderer and copied over. Browsers only allow a handful of WebGL contexts,
// so sharing one keeps any number of pets cheap.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { gpuTier } from "../../shared/gpu";

/** Real cast shadows (an extra drawing pass per frame) only on a strong card. */
export function realShadows(): boolean {
  return gpuTier() === "quality";
}

let renderer: THREE.WebGLRenderer | null = null;
let envMap: THREE.Texture | null = null;
let failed = false;

/** Can this machine draw the 3D pets? */
export function webglOk(): boolean {
  if (failed) return false;
  if (renderer) return true;
  try {
    const probe = document.createElement("canvas");
    const ok = !!(probe.getContext("webgl2") || probe.getContext("webgl"));
    if (!ok) failed = true;
    return ok;
  } catch {
    failed = true;
    return false;
  }
}

export function shared(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: gpuTier() !== "eco", alpha: true, premultipliedAlpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = realShadows();
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setScissorTest(true);
  // A soft studio to reflect: what makes the vinyl look real.
  const pmrem = new THREE.PMREMGenerator(renderer);
  envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return renderer;
}

export function environment(): THREE.Texture | null {
  shared();
  return envMap;
}

/** Draw `scene` through `camera` into a 2D canvas of w × h device pixels. */
export function drawInto(target: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
  const r = shared();
  const size = r.getSize(new THREE.Vector2());
  // Grow the shared drawing area when a bigger pet shows up (never shrink).
  if (size.x < w || size.y < h) r.setSize(Math.max(size.x, w), Math.max(size.y, h), false);
  const full = r.getSize(new THREE.Vector2());
  r.setViewport(0, 0, w, h);
  r.setScissor(0, 0, w, h);
  r.clear();
  r.render(scene, camera);
  const ctx = target.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  // WebGL counts rows from the bottom: our corner is the bottom-left one.
  ctx.drawImage(r.domElement, 0, full.y - h, w, h, 0, 0, target.width, target.height);
}
