// Themes are a few CSS variables on <html>. Dark ones are glassy and quiet; light
// ones get a dark outline so the island still stands out over bright windows.

export interface Theme {
  id: string;
  name: string;
  light: boolean;
  bg: string;     // island glass
  panel: string;  // cards
  ink: string;    // text
  dim: string;    // secondary text
  line: string;   // "r, g, b" for hairlines and washes
  accent: string; // suggested accent
}

export const THEMES: Theme[] = [
  { id: "mint", name: "Noche menta", light: false, bg: "#0c1412", panel: "#141f1c", ink: "#e6f2ee", dim: "#8ea59e", line: "220, 255, 240", accent: "#8fe3c0" },
  { id: "ink", name: "Tinta", light: false, bg: "#0b0b0d", panel: "#17171b", ink: "#f1f1f4", dim: "#9696a0", line: "255, 255, 255", accent: "#a5b4fc" },
  { id: "dusk", name: "Atardecer", light: false, bg: "#1a1220", panel: "#261a2e", ink: "#f6ecf5", dim: "#b39ab0", line: "255, 230, 250", accent: "#f9a8d4" },
  { id: "deep", name: "Abismo", light: false, bg: "#08111f", panel: "#101c30", ink: "#e8f0ff", dim: "#8a9cbc", line: "210, 230, 255", accent: "#7dd3fc" },
  { id: "paper", name: "Papel", light: true, bg: "#f6f4ef", panel: "#ffffff", ink: "#1d1b17", dim: "#6f6a60", line: "40, 35, 25", accent: "#0f766e" },
  { id: "sakura", name: "Sakura", light: true, bg: "#fdf0f3", panel: "#ffffff", ink: "#2a1820", dim: "#86606d", line: "70, 20, 40", accent: "#db2777" },
];

export const ACCENTS = ["#8fe3c0", "#a5b4fc", "#f9a8d4", "#7dd3fc", "#fcd34d", "#fca5a5", "#c4b5fd", "#0f766e", "#db2777"];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function applyTheme(id: string, accent: string) {
  const t = themeById(id);
  const root = document.documentElement;
  const vars: Record<string, string> = {
    "--bg": t.bg,
    "--panel": t.panel,
    "--ink": t.ink,
    "--dim": t.dim,
    "--line": t.line,
    "--accent": /^#[0-9a-f]{6}$/i.test(accent) ? accent : t.accent,
    "--edge": t.light ? t.ink : "transparent",
    "--edge-w": "1.5px",
    // The curved shoulders of the "glued" shape draw the edge as a ring.
    "--edge-ring": t.light ? t.ink : t.bg,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.classList.toggle("light", t.light);
  root.style.colorScheme = t.light ? "light" : "dark";
}

/** The island's own border (Ajustes → Apariencia): on top of the theme's. */
export function applyBorder(border: { on: boolean; color: string; width: number } | undefined, accent: string) {
  if (!border?.on) return;
  const root = document.documentElement;
  const color = /^#[0-9a-f]{6}$/i.test(border.color) ? border.color : accent;
  root.style.setProperty("--edge", color);
  root.style.setProperty("--edge-ring", color);
  root.style.setProperty("--edge-w", `${Math.max(1, Math.min(4, border.width || 2))}px`);
}
