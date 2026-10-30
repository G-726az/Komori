// The island window: always on top, no taskbar button, glued to the top centre
// of the main display. The window is resized to fit whatever the island shows
// (a small pill, or the open panel), so nothing outside it ever takes a click.

use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

pub const LABEL: &str = "island";

pub fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Sizes the window (logical pixels) and keeps it centred at the top.
pub fn place(app: &AppHandle, width: f64, height: f64) {
    let Some(win) = window(app) else { return };
    let monitor = win
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| win.current_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };

    let scale = monitor.scale_factor();
    let _ = win.set_size(LogicalSize::new(width, height));
    let screen = monitor.size();
    let origin = monitor.position();
    let w = (width * scale).round() as i32;
    let x = origin.x + (screen.width as i32 - w) / 2;
    let _ = win.set_position(PhysicalPosition::new(x, origin.y));
    // Moving between displays can rescale the window: ask for the size again.
    let _ = win.set_size(LogicalSize::new(width, height));
    let _ = win.set_always_on_top(true);
}

/// How big the island's contents are drawn (1.0 = 100 %). "auto" picks one
/// from how much room the main display has; returns the scale used.
#[tauri::command]
pub fn island_zoom(app: AppHandle, scale: String) -> f64 {
    let value = match scale.as_str() {
        "auto" => auto_scale(&app),
        s => s.parse::<f64>().unwrap_or(1.0),
    }
    .clamp(0.8, 1.6);
    if let Some(win) = window(&app) {
        let _ = win.set_zoom(value);
    }
    value
}

/// Small screens keep 100 %; wide ones get a bigger island.
fn auto_scale(app: &AppHandle) -> f64 {
    let Some(win) = window(app) else { return 1.0 };
    let Some(monitor) = win.primary_monitor().ok().flatten() else { return 1.0 };
    let width = monitor.size().width as f64 / monitor.scale_factor();
    if width >= 2300.0 {
        1.25
    } else if width >= 1800.0 {
        1.1
    } else {
        1.0
    }
}
