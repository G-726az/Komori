// Watches the mouse: once it has stayed still for the minutes set in the
// settings, the island is told so the pet can rest; the first movement wakes it.
// One cheap cursor read per second — nothing else.

use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use crate::{island, store, Shared};

#[cfg(windows)]
pub fn cursor() -> Option<(i32, i32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x, p.y))
}

#[cfg(not(windows))]
pub fn cursor() -> Option<(i32, i32)> {
    None
}

/// (enabled, minutes) from the current preferences.
fn rule(app: &AppHandle) -> (bool, u64) {
    let Some(shared) = app.try_state::<Shared>() else { return (false, 5) };
    let settings = shared.settings.lock().unwrap();
    let enabled = store::flag(&settings, "idleAnimation", true);
    let minutes = settings
        .get("idleMinutes")
        .and_then(|v| v.as_f64())
        .unwrap_or(5.0)
        .clamp(1.0, 60.0) as u64;
    (enabled, minutes)
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_pos = cursor();
        let mut still_since = Instant::now();
        let mut resting = false;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let pos = cursor();
            if pos != last_pos {
                last_pos = pos;
                still_since = Instant::now();
                if resting {
                    resting = false;
                    let _ = app.emit_to(island::LABEL, "idle-changed", false);
                }
                continue;
            }
            let (enabled, minutes) = rule(&app);
            let due = still_since.elapsed() >= Duration::from_secs(minutes * 60);
            if enabled && due && !resting {
                resting = true;
                let _ = app.emit_to(island::LABEL, "idle-changed", true);
            } else if !enabled && resting {
                resting = false;
                let _ = app.emit_to(island::LABEL, "idle-changed", false);
            }
        }
    });
}
