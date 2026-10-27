// Komori — app wiring and the commands the pages call.

mod ai;
mod apps;
mod claude;
mod github;
mod idle;
mod island;
mod media;
mod notes;
mod secrets;
mod store;
mod sysmon;
mod tray;
mod update;

use std::sync::Mutex;

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

pub struct Shared {
    pub settings: Mutex<Map<String, Value>>,
}

/// Passed by the sign-in entry so a start at sign-in can wait for the desktop.
const AUTOSTART_ARG: &str = "--autostart";

// ── Settings ──────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_settings(shared: State<Shared>) -> Map<String, Value> {
    shared.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(app: AppHandle, shared: State<Shared>, settings: Map<String, Value>) -> Result<(), String> {
    let autostart_before = store::flag(&shared.settings.lock().unwrap(), "autostart", false);
    let autostart_now = store::flag(&settings, "autostart", false);
    store::save(&settings).map_err(|e| e.to_string())?;
    *shared.settings.lock().unwrap() = settings.clone();
    if autostart_before != autostart_now {
        let launcher = app.autolaunch();
        let result = if autostart_now { launcher.enable() } else { launcher.disable() };
        result.map_err(|e| e.to_string())?;
    }
    // Both pages follow the same preferences.
    let _ = app.emit("settings-changed", settings);
    Ok(())
}

#[tauri::command]
fn data_folder() -> String {
    store::data_dir().to_string_lossy().to_string()
}

// ── Windows ───────────────────────────────────────────────────────────────────

/// The island asks for the size it needs; the window follows, centred at the top.
#[tauri::command]
fn place_island(app: AppHandle, width: f64, height: f64) {
    island::place(&app, width, height);
}

/// First paint is ready: only now show the window, so it never flashes empty.
#[tauri::command]
fn island_ready(app: AppHandle) {
    if let Some(win) = island::window(&app) {
        let _ = win.show();
    }
}

/// Opens the settings, optionally at one section ("apps", "notes"…).
/// Where the mouse is, in logical pixels from the island window's top-left
/// (it can be outside the window). The big pet looks at it.
#[tauri::command]
fn cursor_rel(app: AppHandle) -> Option<(f64, f64)> {
    let win = island::window(&app)?;
    let pos = win.inner_position().ok()?;
    let scale = win.scale_factor().ok()?;
    let (x, y) = idle::cursor()?;
    Some(((x - pos.x) as f64 / scale, (y - pos.y) as f64 / scale))
}

#[tauri::command]
fn open_settings(app: AppHandle, section: Option<String>) {
    show_settings(&app);
    if let Some(section) = section {
        let _ = app.emit_to("settings", "settings-goto", section);
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

pub fn show_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Created hidden at launch and only shown/hidden afterwards; closing it hides it.
fn create_settings_window(app: &AppHandle) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Komori — Ajustes")
        .inner_size(980.0, 660.0)
        .min_inner_size(780.0, 520.0)
        .visible(false)
        .center()
        .build()?;
    let hidden = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = hidden.hide();
        }
    });
    Ok(())
}

// ── Entry ─────────────────────────────────────────────────────────────────────

pub fn run() {
    // Called by Claude Code as a hook: pass the notice on and leave.
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == "--hook") {
        claude::run_hook(args.get(i + 1).map(String::as_str).unwrap_or(""));
    }

    // Started by Windows at sign-in: let the desktop and WebView2 come up first.
    if std::env::args().any(|a| a == AUTOSTART_ARG) {
        std::thread::sleep(std::time::Duration::from_secs(6));
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = app.emit_to(island::LABEL, "open-island", ());
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![AUTOSTART_ARG])))
        .manage(Shared { settings: Mutex::new(store::load()) })
        .manage(media::Media::new())
        .manage(sysmon::SysMon::new())
        .manage(claude::Sessions::new())
        .manage(ai::Chats::new())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            data_folder,
            place_island,
            cursor_rel,
            island_ready,
            open_settings,
            quit_app,
            media::media_now,
            media::media_cover,
            media::media_control,
            sysmon::system_stats,
            apps::list_start_apps,
            apps::launch,
            apps::app_icons,
            notes::notes_list,
            notes::note_read,
            notes::note_write,
            notes::note_create,
            notes::note_rename,
            notes::note_delete,
            notes::open_notes_folder,
            notes::save_drawing,
            notes::open_drawings_folder,
            claude::claude_focus,
            claude::claude_test,
            claude::claude_hooks_status,
            claude::claude_hooks_set,
            secrets::secret_set,
            secrets::secret_has,
            secrets::secret_delete,
            secrets::secret_coucou_has,
            secrets::secret_from_coucou,
            ai::ai_models,
            ai::ai_chat,
            ai::ai_stop,
            github::github_user,
            github::github_summary,
            github::github_mark_read,
            github::github_open,
            update::update_check,
            update::update_download,
            update::update_install,
            update::open_project,
            update::open_kofi,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            create_settings_window(&handle)?;
            idle::start(handle.clone());
            media::start(handle.clone());
            claude::start(handle.clone());
            // A missing tray icon (the taskbar not ready yet) must not stop the app.
            if let Err(err) = tray::build(&handle) {
                eprintln!("[komori] tray: {err}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|err| {
            eprintln!("[komori] could not start: {err}");
            std::process::exit(1);
        });
}
