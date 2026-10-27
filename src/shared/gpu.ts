// How hard Komori may lean on the graphics card. "auto" looks at the card:
// a dedicated one gets everything, an integrated one (Intel/AMD in a laptop)
// gets the light version of the 3D shadows, a software renderer gets no
// filters at all. The choice is mirrored in localStorage so the 3D renderer,
// built before Settings load, starts right; a change reloads the page.

export type GpuMode = "auto" | "quality" | "balanced" | "eco";
export type GpuTier = Exclude<GpuMode, "auto">;

const KEY = "komori-gpu";
const MODES: GpuMode[] = ["auto", "quality", "balanced", "eco"];

let detected: { name: string; tier: GpuTier } | null = null;

/** The card's name as the browser reports it, and the tier "auto" picks for it. */
export function detectGpu(): { name: string; tier: GpuTier } {
  if (detected) return detected;
  let raw = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      raw = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    // No WebGL at all: the lightest tier.
  }
  const name = raw
    .replace(/^ANGLE \(|\)$/g, "")
    .replace(/,? ?Direct3D.*$|,? ?D3D1\d.*$|,? ?OpenGL.*$|,? ?vs_\d.*$/i, "")
    .replace(/^(Intel|NVIDIA|AMD|Google|Microsoft),\s*/i, "")
    .replace(/\s*\(0x[0-9A-F]+\)/gi, "")
    .trim();
  let tier: GpuTier = "balanced";
  if (!raw || /swiftshader|llvmpipe|basic render|software/i.test(raw)) tier = "eco";
  else if (/nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|arc\(tm\) a\d|arc a\d/i.test(raw)) tier = "quality";
  detected = { name: name || raw || "—", tier };
  return detected;
}

function stored(): GpuMode {
  try {
    const v = localStorage.getItem(KEY) as GpuMode | null;
    return v && MODES.includes(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

/** What this page was built with. */
const BUILT: GpuMode = stored();

export function tierOf(mode: GpuMode): GpuTier {
  return mode === "auto" ? detectGpu().tier : mode;
}

/** The tier this page runs with (fixed until it reloads). */
export function gpuTier(): GpuTier {
  return tierOf(BUILT);
}

/** Remember the choice; true when it differs from what this page was built with. */
export function wantGpu(mode: GpuMode): boolean {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    return false;
  }
  return mode !== BUILT;
}
