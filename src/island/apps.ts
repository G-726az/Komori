// The "Apps" tab: your shortcuts as a grid of icons. A click opens it and the
// island folds away. Icons are asked from Windows once and kept in the settings.

import { Bridge, IN_APP } from "../shared/bridge";
import { h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { settings, updateSettings, type AppItem } from "../shared/settings";

const PLUS = "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z";
const GLOBE = "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3zm.8 2h3a15.7 15.7 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.4-3.6C8.9 5.5 8.4 6.7 8.1 8zM12 20c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.2 5.6c.6-1.1 1.1-2.3 1.4-3.6h3a8 8 0 0 1-4.4 3.6zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4z";

export const isWeb = (t: string) => /^https?:\/\//i.test(t.trim());

/** The picture for a shortcut: its icon, a globe for web pages, or its initial. */
export function appFace(app: AppItem, size: number): HTMLElement {
  if (app.icon) return h("img", { class: "app-img", src: app.icon, alt: "", width: size, height: size });
  if (isWeb(app.target)) return h("span", { class: "app-letter web", style: { width: `${size}px`, height: `${size}px` } }, icon(GLOBE, size * 0.6));
  return h("span", { class: "app-letter", style: { width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.45}px` }, text: (app.name.trim()[0] ?? "?").toUpperCase() });
}

let asking = false;
// Targets Windows had no picture for: don't keep asking.
const tried = new Set<string>();

/** Fetch the icons that are missing and keep them. */
export async function fillIcons() {
  if (asking || !IN_APP) return;
  const missing = settings().apps.filter((a) => !a.icon && !isWeb(a.target) && !tried.has(a.target));
  if (!missing.length) return;
  for (const a of missing) tried.add(a.target);
  asking = true;
  const icons = (await Bridge.appIcons(missing.map((a) => a.target))) ?? [];
  asking = false;
  const found = new Map<string, string>();
  missing.forEach((a, i) => {
    if (icons[i]) found.set(a.id, icons[i]!);
  });
  if (!found.size) return;
  await updateSettings({ apps: settings().apps.map((a) => (found.has(a.id) ? { ...a, icon: found.get(a.id) } : a)) });
}

export function appsModule() {
  const apps = settings().apps;
  const grid = h("div", { class: "apps-grid" });
  for (const app of apps) {
    const b = h("button", { class: "app", title: app.name },
      h("span", { class: "app-face" }, appFace(app, 40)),
      h("span", { class: "app-name", text: app.name }),
    );
    b.addEventListener("click", async () => {
      b.classList.add("opening");
      await Bridge.launch(app.target);
      window.dispatchEvent(new Event("komori-close"));
    });
    grid.append(b);
  }
  grid.append(h("button", { class: "app add", title: "Agregar accesos", onclick: () => void Bridge.openSettings("apps") },
    h("span", { class: "app-face" }, icon(PLUS, 26)),
    h("span", { class: "app-name", text: "Agregar" }),
  ));
  void fillIcons();
  const el = h("section", { class: "module apps" },
    apps.length ? null : h("p", { class: "apps-hint" }, icon(I.apps, 14), "Agrega programas, carpetas o webs desde Ajustes."),
    grid,
  );
  return { el };
}
