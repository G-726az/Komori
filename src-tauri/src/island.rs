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
