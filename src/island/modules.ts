// The panel's tabs. Each module builds its own view.

import { I } from "../shared/icons";
import type { ModuleId } from "../shared/settings";
import { settings } from "../shared/settings";
import { calendarModule } from "./calendar";
import { homeModule } from "./home";
import type { Pet } from "./pet";
import { musicModule } from "./music";
import { systemModule } from "./system";
import { appsModule } from "./apps";
import { notesModule } from "./notes";
import { chatModule } from "./chat";
import { BRANCH, githubModule } from "./github";
import { TOOLS_ICON, toolsModule } from "./tools";

import { SPARK } from "./claude";
import { claudeModule } from "./claudepage";
import { TRAY, shelfModule } from "./shelf";

export interface ModuleView {
  el: HTMLElement;
  /** Called while the panel is open and this tab is showing. */
  tick?(now: Date): void;
  /** Lets the tab colour the whole island (the music's cover, Claude's warmth). */
  tintWith?(set: (color: string | null) => void): void;
}

export const MODULES: Record<ModuleId, { label: string; icon: string; phase: number }> = {
  home: { label: "Inicio", icon: I.home, phase: 1 },
  claude: { label: "Claude Code", icon: SPARK, phase: 7 },
  music: { label: "Música", icon: I.music, phase: 4 },
  calendar: { label: "Calendario y clima", icon: I.calendar, phase: 3 },
  system: { label: "Sistema", icon: I.chip, phase: 4 },
  apps: { label: "Apps", icon: I.apps, phase: 5 },
  notes: { label: "Notas", icon: I.note, phase: 5 },
  shelf: { label: "Estante", icon: TRAY, phase: 7 },
  tools: { label: "Herramientas", icon: TOOLS_ICON, phase: 6 },
  chat: { label: "Chat", icon: I.chat, phase: 6 },
  github: { label: "GitHub", icon: BRANCH, phase: 6 },
};

export function formatTime(d: Date, withSeconds = false): string {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: settings().hour12,
  }).format(d);
}

export function buildModule(id: ModuleId, go: (id: ModuleId) => void, pet?: Pet): ModuleView {
  if (id === "home") return homeModule({ go, modules: MODULES, pet });
  if (id === "calendar") return calendarModule();
  if (id === "music") return musicModule();
  if (id === "claude") return claudeModule(pet);
  if (id === "system") return systemModule();
  if (id === "apps") return appsModule();
  if (id === "notes") return notesModule();
  if (id === "shelf") return shelfModule();
  if (id === "chat") return chatModule();
  if (id === "tools") return toolsModule();
  return githubModule();
}
