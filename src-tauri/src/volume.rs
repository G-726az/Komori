//! The Windows master volume (the default speakers), for the music page:
//! read it, set it, mute it. Core Audio, nothing else.

use serde::Serialize;

#[derive(Serialize)]
pub struct Volume {
    /// 0.0 – 1.0
    pub level: f32,
    pub muted: bool,
}

#[cfg(windows)]
mod win {
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};

    pub fn endpoint() -> windows::core::Result<IAudioEndpointVolume> {
        unsafe {
            // Already initialised on this thread is fine.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let speakers = devices.GetDefaultAudioEndpoint(eRender, eConsole)?;
            speakers.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
        }
    }
}

#[cfg(windows)]
fn read() -> Result<Volume, String> {
    let ep = win::endpoint().map_err(|e| e.to_string())?;
    unsafe {
        let level = ep.GetMasterVolumeLevelScalar().map_err(|e| e.to_string())?;
        let muted = ep.GetMute().map_err(|e| e.to_string())?.as_bool();
        Ok(Volume { level, muted })
    }
}

#[cfg(not(windows))]
fn read() -> Result<Volume, String> {
    Err("Solo en Windows".into())
}

#[tauri::command]
pub async fn volume_get() -> Result<Volume, String> {
    read()
}

#[tauri::command]
pub async fn volume_set(level: f32) -> Result<Volume, String> {
    #[cfg(windows)]
    {
        let ep = win::endpoint().map_err(|e| e.to_string())?;
        unsafe {
            ep.SetMasterVolumeLevelScalar(level.clamp(0.0, 1.0), std::ptr::null())
                .map_err(|e| e.to_string())?;
            // Moving the slider up means "I want to hear it".
            if level > 0.0 {
                let _ = ep.SetMute(false, std::ptr::null());
            }
        }
    }
    #[cfg(not(windows))]
    let _ = level;
    read()
}

#[tauri::command]
pub async fn volume_mute(muted: bool) -> Result<Volume, String> {
    #[cfg(windows)]
    {
        let ep = win::endpoint().map_err(|e| e.to_string())?;
        unsafe {
            ep.SetMute(muted, std::ptr::null()).map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(windows))]
    let _ = muted;
    read()
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn reads_the_volume() {
        // Machines without speakers have no default endpoint: just don't panic.
        let _ = super::read();
    }
}

// ── The sound level, for things that move with the music ─────────────────────

static WATCHING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static STARTED: std::sync::Once = std::sync::Once::new();

/// Start or stop sending "audio-level" (0–1, the speakers' peak right now, from
/// whatever is playing: music, a video, a game) about 30 times a second.
#[tauri::command]
pub fn meter_watch(app: tauri::AppHandle, on: bool) {
    WATCHING.store(on, std::sync::atomic::Ordering::Relaxed);
    if on {
        STARTED.call_once(|| {
            std::thread::spawn(move || meter_loop(app));
        });
    }
}

#[cfg(windows)]
fn meter_loop(app: tauri::AppHandle) {
    use std::time::{Duration, Instant};
    use tauri::Emitter;
    use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};

    let open = || -> Option<IAudioMeterInformation> {
        unsafe {
            let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let speakers = devices.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
            speakers.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None).ok()
        }
    };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let mut meter: Option<IAudioMeterInformation> = None;
    let mut opened = Instant::now();
    let mut last = -1.0f32;
    loop {
        if !WATCHING.load(std::sync::atomic::Ordering::Relaxed) {
            meter = None;
            std::thread::sleep(Duration::from_millis(250));
            continue;
        }
        // The default speakers can change (headphones plugged in): look again now and then.
        if meter.is_none() || opened.elapsed() > Duration::from_secs(5) {
            meter = open();
            opened = Instant::now();
        }
        let level = meter.as_ref().and_then(|m| unsafe { m.GetPeakValue().ok() }).unwrap_or(0.0);
        // Silence stays silent: no events while nothing changes.
        if (level - last).abs() > 0.004 {
            last = level;
            let _ = app.emit_to(crate::island::LABEL, "audio-level", level);
        }
        std::thread::sleep(Duration::from_millis(33));
    }
}

#[cfg(not(windows))]
fn meter_loop(_app: tauri::AppHandle) {}
