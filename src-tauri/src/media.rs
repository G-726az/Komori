// What's playing, from Windows' own media controls (the ones behind the volume
// flyout): Spotify, browsers, the Media Player… One thread owns the WinRT
// objects; it looks once a second and tells the island only when something
// changed. Buttons from the island are sent to the same thread.

use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub app: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    /// Seconds into the track, and its length (0 when unknown).
    pub position: f64,
    pub duration: f64,
    pub can_prev: bool,
    pub can_next: bool,
    pub can_seek: bool,
    /// Changes when the cover does; empty when there is none. The picture
    /// itself is fetched with `media_cover`, so updates stay small.
    pub cover_key: String,
}

pub enum Action {
    PlayPause,
    Next,
    Prev,
    Seek(f64),
}

/// The latest state and the way to the media thread.
pub struct Media {
    pub now: Mutex<Option<MediaState>>,
    /// The cover as a data: URL.
    pub cover: Mutex<Option<String>>,
    pub tx: Mutex<Option<Sender<Action>>>,
}

impl Media {
    pub fn new() -> Self {
        Self { now: Mutex::new(None), cover: Mutex::new(None), tx: Mutex::new(None) }
    }
}

#[tauri::command]
pub fn media_cover(media: tauri::State<Media>) -> Option<String> {
    media.cover.lock().unwrap().clone()
}

/// Only the clock moved, as expected: no need to tell anyone.
fn just_ticking(last: &MediaState, now: &MediaState, elapsed: f64) -> bool {
    let expected = if last.playing { last.position + elapsed } else { last.position };
    let same = MediaState { position: last.position, ..now.clone() } == *last;
    same && (now.position - expected).abs() <= 2.0
}

#[tauri::command]
pub fn media_now(media: tauri::State<Media>) -> Option<MediaState> {
    media.now.lock().unwrap().clone()
}

#[tauri::command]
pub fn media_control(media: tauri::State<Media>, action: String, position: Option<f64>) {
    let act = match action.as_str() {
        "playpause" => Action::PlayPause,
        "next" => Action::Next,
        "prev" => Action::Prev,
        "seek" => Action::Seek(position.unwrap_or(0.0)),
        _ => return,
    };
    if let Some(tx) = media.tx.lock().unwrap().as_ref() {
        let _ = tx.send(act);
    }
}

/// Friendlier names for the usual players (Windows gives app ids).
fn app_name(id: &str) -> String {
    let lower = id.to_lowercase();
    let known = [
        ("spotify", "Spotify"),
        ("msedge", "Edge"),
        ("chrome", "Chrome"),
        ("firefox", "Firefox"),
        ("308046b0af4a39cb", "Firefox"),
        ("opera", "Opera"),
        ("brave", "Brave"),
        ("zunemusic", "Reproductor multimedia"),
        ("zunevideo", "Películas y TV"),
        ("vlc", "VLC"),
        ("applemusic", "Apple Music"),
        ("deezer", "Deezer"),
        ("tidal", "TIDAL"),
        ("youtube", "YouTube Music"),
    ];
    for (needle, name) in known {
        if lower.contains(needle) {
            return name.to_string();
        }
    }
    // "Something.exe" or "Publisher.App_xyz!App" → "Something" / "App".
    let base = id.rsplit(['\\', '!']).next().unwrap_or(id);
    let base = base.trim_end_matches(".exe");
    let base = base.split('_').next().unwrap_or(base);
    base.rsplit('.').next().unwrap_or(base).to_string()
}

pub fn start(app: AppHandle) {
    let (tx, rx) = channel::<Action>();
    if let Some(media) = app.try_state::<Media>() {
        *media.tx.lock().unwrap() = Some(tx);
    }
    std::thread::spawn(move || {
        #[cfg(windows)]
        unsafe {
            use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        let mut watcher = win::Watcher::default();
        let mut last: Option<MediaState> = None;
        let mut sent_at = Instant::now();
        loop {
            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(action) => {
                    watcher.act(action);
                    // Let the player catch up before reading again.
                    std::thread::sleep(Duration::from_millis(250));
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            let now = watcher.read();
            let quiet = match (&last, &now) {
                (Some(a), Some(b)) => just_ticking(a, b, sent_at.elapsed().as_secs_f64()),
                (None, None) => true,
                _ => false,
            };
            if let Some(media) = app.try_state::<Media>() {
                *media.now.lock().unwrap() = now.clone();
                *media.cover.lock().unwrap() = watcher.cover();
            }
            if !quiet {
                let _ = app.emit("media-changed", now.clone());
                last = now;
                sent_at = Instant::now();
            }
        }
    });
}

#[cfg(windows)]
mod win {
    use base64::Engine;
    use windows::core::Result;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as SessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::Storage::Streams::DataReader;

    use super::{app_name, Action, MediaState};

    #[derive(Default)]
    pub struct Watcher {
        manager: Option<SessionManager>,
        /// The cover is only read again when the track changes.
        cover_key: String,
        cover: Option<String>,
    }

    /// TimeSpan / DateTime ticks are 100 ns.
    const TICKS: f64 = 10_000_000.0;

    impl Watcher {
        fn session(&mut self) -> Option<Session> {
            if self.manager.is_none() {
                self.manager = SessionManager::RequestAsync().ok()?.get().ok();
            }
            match self.manager.as_ref()?.GetCurrentSession() {
                Ok(s) => Some(s),
                Err(_) => None,
            }
        }

        pub fn read(&mut self) -> Option<MediaState> {
            let session = self.session()?;
            match self.describe(&session) {
                Ok(state) => Some(state),
                Err(_) => {
                    // The manager can go stale (e.g. Explorer restarted): rebuild next time.
                    self.manager = None;
                    None
                }
            }
        }

        fn describe(&mut self, s: &Session) -> Result<MediaState> {
            let props = s.TryGetMediaPropertiesAsync()?.get()?;
            let info = s.GetPlaybackInfo()?;
            let controls = info.Controls()?;
            let timeline = s.GetTimelineProperties()?;
            let playing = info.PlaybackStatus()? == Status::Playing;

            let start = timeline.StartTime()?.Duration as f64 / TICKS;
            let end = timeline.EndTime()?.Duration as f64 / TICKS;
            let mut position = timeline.Position()?.Duration as f64 / TICKS - start;
            // The position is a snapshot from LastUpdatedTime: move it to now.
            if playing {
                let updated = timeline.LastUpdatedTime()?.UniversalTime;
                if updated > 0 {
                    let now = now_ticks();
                    let ahead = (now - updated) as f64 / TICKS;
                    if (0.0..86_400.0).contains(&ahead) {
                        position += ahead;
                    }
                }
            }
            let duration = (end - start).max(0.0);
            if duration > 0.0 {
                position = position.clamp(0.0, duration);
            }

            let title = props.Title()?.to_string();
            let artist = props.Artist()?.to_string();
            let key = format!("{title}\u{1}{artist}");
            if key != self.cover_key {
                self.cover_key = key;
                self.cover = cover(&props).ok().flatten();
            }

            Ok(MediaState {
                app: app_name(&s.SourceAppUserModelId()?.to_string()),
                title,
                artist,
                album: props.AlbumTitle()?.to_string(),
                playing,
                // Whole seconds: the island counts between updates itself.
                position: position.floor(),
                duration: duration.round(),
                can_prev: controls.IsPreviousEnabled()?,
                can_next: controls.IsNextEnabled()?,
                can_seek: controls.IsPlaybackPositionEnabled()? && duration > 0.0,
                cover_key: if self.cover.is_some() { self.cover_key.clone() } else { String::new() },
            })
        }

        pub fn cover(&self) -> Option<String> {
            self.cover.clone()
        }

        pub fn act(&mut self, action: Action) {
            let Some(s) = self.session() else { return };
            let _ = match action {
                Action::PlayPause => s.TryTogglePlayPauseAsync().and_then(|op| op.get()),
                Action::Next => s.TrySkipNextAsync().and_then(|op| op.get()),
                Action::Prev => s.TrySkipPreviousAsync().and_then(|op| op.get()),
                Action::Seek(secs) => {
                    let start = s.GetTimelineProperties().and_then(|t| t.StartTime()).map(|t| t.Duration).unwrap_or(0);
                    s.TryChangePlaybackPositionAsync(start + (secs.max(0.0) * TICKS) as i64).and_then(|op| op.get())
                }
            };
        }
    }

    /// Now, in Windows FILETIME ticks (100 ns since 1601), like LastUpdatedTime.
    fn now_ticks() -> i64 {
        use windows::Win32::System::SystemInformation::GetSystemTimeAsFileTime;
        let ft = unsafe { GetSystemTimeAsFileTime() };
        ((ft.dwHighDateTime as i64) << 32) | ft.dwLowDateTime as i64
    }

    fn cover(props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties) -> Result<Option<String>> {
        let Ok(thumb) = props.Thumbnail() else { return Ok(None) };
        let stream = thumb.OpenReadAsync()?.get()?;
        let size = stream.Size()? as u32;
        // Keep it reasonable: a cover is a few hundred KB at most.
        if size == 0 || size > 4_000_000 {
            return Ok(None);
        }
        let mime = stream.ContentType().map(|m| m.to_string()).unwrap_or_default();
        let reader = DataReader::CreateDataReader(&stream)?;
        reader.LoadAsync(size)?.get()?;
        let mut bytes = vec![0u8; size as usize];
        reader.ReadBytes(&mut bytes)?;
        let mime = if mime.starts_with("image/") { mime } else { "image/png".to_string() };
        Ok(Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))))
    }
}

#[cfg(not(windows))]
mod win {
    use super::{Action, MediaState};

    #[derive(Default)]
    pub struct Watcher;

    impl Watcher {
        pub fn read(&mut self) -> Option<MediaState> {
            None
        }
        pub fn cover(&self) -> Option<String> {
            None
        }
        pub fn act(&mut self, _action: Action) {}
    }
}
