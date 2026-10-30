// The calls the pages make into Rust. Outside the app (plain `npm run dev` in a
// browser) every call is a harmless no-op, so the visuals can be worked on alone.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const IN_APP = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IN_APP) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[komori] ${cmd}`, err);
    return null;
  }
}

/** What's playing, as Windows reports it. */
export interface MediaState {
  app: string;
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  canPrev: boolean;
  canNext: boolean;
  canSeek: boolean;
  /** Changes with the cover; "" when there is none. */
  coverKey: string;
}

export interface Stats {
  cpu: number;
  cores: number[];
  cpuName: string;
  memTotal: number;
  memUsed: number;
  disks: { mount: string; label: string; total: number; used: number; removable: boolean }[];
  /** Bytes per second. */
  down: number;
  up: number;
  battery: { percent: number; charging: boolean; plugged: boolean } | null;
  /** Seconds since Windows started. */
  uptime: number;
}

export type SecretName = "anthropic" | "openai" | "github";

export interface ChatRequest {
  id: string;
  provider: string;
  model: string;
  base?: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface GithubItem {
  id: string;
  title: string;
  repo: string;
  kind: string;
  reason: string;
  url: string;
  updated: string;
}

export interface GithubSummary {
  login: string;
  notifications: GithubItem[];
  reviews: GithubItem[];
  mine: GithubItem[];
}

/** Like call(), but the error message reaches the page (to show it). */
async function callOrThrow<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!IN_APP) throw new Error("Solo en la app");
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw new Error(typeof err === "string" ? err : String(err));
  }
}

/** A version on GitHub Releases. */
export interface Release {
  current: string;
  latest: string;
  available: boolean;
  name: string;
  notes: string;
  url: string;
  asset: { name: string; size: number; url: string } | null;
}

/** Lyrics from LRCLIB: synced LRC text, plain text, or a note that it's instrumental. */
export interface FileInfo {
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  exists: boolean;
}

export interface VolumeState {
  /** 0 – 1 */
  level: number;
  muted: boolean;
}

export interface LyricsResult {
  synced: string | null;
  plain: string | null;
  instrumental: boolean;
}

export interface NoteInfo {
  name: string;
  /** ms since 1970 */
  modified: number;
  preview: string;
}

export const Bridge = {
  getSettings: () => call<Record<string, unknown>>("get_settings"),
  saveSettings: (settings: Record<string, unknown>) => call<void>("save_settings", { settings }),
  dataFolder: () => call<string>("data_folder"),
  placeIsland: (width: number, height: number) => call<void>("place_island", { width, height }),
  /** The mouse, in px from the island window's corner (also outside it). */
  cursorRel: () => call<[number, number]>("cursor_rel"),
  islandReady: () => call<void>("island_ready"),
  openSettings: (section?: string) => call<void>("open_settings", { section }),
  quit: () => call<void>("quit_app"),
  mediaNow: () => call<MediaState | null>("media_now"),
  mediaCover: () => call<string | null>("media_cover"),
  mediaControl: (action: "playpause" | "next" | "prev" | "seek", position?: number) =>
    call<void>("media_control", { action, position }),
  systemStats: () => call<Stats>("system_stats"),
  listStartApps: () => call<{ name: string; target: string }[]>("list_start_apps"),
  launch: (target: string) => call<void>("launch", { target }),
  appIcons: (targets: string[]) => call<(string | null)[]>("app_icons", { targets }),
  notesList: () => call<NoteInfo[]>("notes_list"),
  noteRead: (name: string) => call<string>("note_read", { name }),
  noteWrite: (name: string, text: string) => call<void>("note_write", { name, text }),
  noteCreate: (title?: string) => call<string>("note_create", { title }),
  noteRename: (name: string, title: string) => call<string>("note_rename", { name, title }),
  noteDelete: (name: string) => call<void>("note_delete", { name }),
  openNotesFolder: () => call<void>("open_notes_folder"),
  saveDrawing: (dataUrl: string) => call<string>("save_drawing", { dataUrl }),
  openDrawingsFolder: () => call<void>("open_drawings_folder"),
  claudeFocus: (session: string) => call<void>("claude_focus", { session }),
  claudeTest: (kind: string) => call<void>("claude_test", { kind }),
  claudeHooksStatus: () => call<boolean>("claude_hooks_status"),
  claudeHooksSet: (on: boolean) => call<boolean>("claude_hooks_set", { on }),
  secretSet: (name: SecretName, value: string) => call<void>("secret_set", { name, value }),
  secretHas: (name: SecretName) => call<boolean>("secret_has", { name }),
  secretDelete: (name: SecretName) => call<void>("secret_delete", { name }),
  secretCoucouHas: (name: SecretName) => call<boolean>("secret_coucou_has", { name }),
  secretFromCoucou: (name: SecretName) => callOrThrow<void>("secret_from_coucou", { name }),
  aiModels: (provider: string, base?: string) => callOrThrow<string[]>("ai_models", { provider, base }),
  aiChat: (request: ChatRequest) => callOrThrow<void>("ai_chat", { request }),
  aiStop: (id: string) => call<void>("ai_stop", { id }),
  githubUser: () => callOrThrow<string>("github_user"),
  githubSummary: () => callOrThrow<GithubSummary>("github_summary"),
  githubMarkRead: (id: string) => call<void>("github_mark_read", { id }),
  githubOpen: (url: string) => call<void>("github_open", { url }),
  updateCheck: () => callOrThrow<Release>("update_check"),
  updateDownload: (url: string, name: string) => callOrThrow<string>("update_download", { url, name }),
  updateInstall: (path: string) => callOrThrow<void>("update_install", { path }),
  openProject: () => call<void>("open_project"),
  openKofi: () => call<void>("open_kofi"),
  lyricsGet: (artist: string, title: string, album: string, duration: number) =>
    call<LyricsResult | null>("lyrics_get", { artist, title, album, duration }),
  shelfInfo: (paths: string[]) => call<FileInfo[]>("shelf_info", { paths }),
  shelfReveal: (path: string) => call<void>("shelf_reveal", { path }),
  shelfCopyTo: (paths: string[], place: "desktop" | "downloads" | "documents") =>
    callOrThrow<string[]>("shelf_copy_to", { paths, place }),
  islandZoom: (scale: string) => call<number>("island_zoom", { scale }),
  meterWatch: (on: boolean) => call<void>("meter_watch", { on }),
  volumeGet: () => call<VolumeState>("volume_get"),
  volumeSet: (level: number) => call<VolumeState>("volume_set", { level }),
  volumeMute: (muted: boolean) => call<VolumeState>("volume_mute", { muted }),
};

export async function on<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (!IN_APP) return () => {};
  return listen<T>(event, (e) => handler(e.payload));
}

/** Files dragged over the island. */
export type DragDrop =
  | { type: "enter"; paths: string[] }
  | { type: "over" }
  | { type: "drop"; paths: string[] }
  | { type: "leave" };

type WebView2 = { postMessageWithAdditionalObjects(message: unknown, objects: ArrayLike<unknown>): void };

/**
 * The page takes the drag like a browser would (enter, leave, drop); the
 * dropped files go to WebView2, which gives Rust their real paths, and those
 * come back as a "file-drag" drop (file_drop.rs).
 */
export async function onDragDrop(fn: (e: DragDrop) => void): Promise<() => void> {
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  // Enter and leave fire for every element the cursor crosses (and the panel is
  // rebuilt mid-drag): it is "in" from the first enter until it leaves the page.
  let inside = false;
  const enter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (!inside) {
      inside = true;
      fn({ type: "enter", paths: [] });
    }
  };
  const over = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
    if (!inside) enter(e);
  };
  const leave = (e: DragEvent) => {
    if (!hasFiles(e) || e.relatedTarget) return;
    inside = false;
    fn({ type: "leave" });
  };
  const drop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    inside = false;
    const files = e.dataTransfer!.files;
    const webview = (window as unknown as { chrome?: { webview?: WebView2 } }).chrome?.webview;
    if (webview && files.length) webview.postMessageWithAdditionalObjects("komori-file-drop", files);
    // In a plain browser there are no paths: the names stand in for them.
    else if (!IN_APP) fn({ type: "drop", paths: [...files].map((f) => f.name) });
  };
  window.addEventListener("dragenter", enter);
  window.addEventListener("dragover", over);
  window.addEventListener("dragleave", leave);
  window.addEventListener("drop", drop);
  const off = await on<DragDrop>("file-drag", fn);
  return () => {
    off();
    window.removeEventListener("dragenter", enter);
    window.removeEventListener("dragover", over);
    window.removeEventListener("dragleave", leave);
    window.removeEventListener("drop", drop);
  };
}
