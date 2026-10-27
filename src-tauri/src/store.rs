// Where Komori keeps its files: %APPDATA%\Komori on Windows, ~/.config/komori
// elsewhere. Preferences are one JSON document owned by the front end; Rust
// only reads the few keys it acts on. Secrets never land here.

use std::path::PathBuf;

use serde_json::{Map, Value};

pub fn data_dir() -> PathBuf {
    #[cfg(windows)]
    let base = std::env::var_os("APPDATA").map(PathBuf::from);
    #[cfg(not(windows))]
    let base = std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config"));
    let name = if cfg!(windows) { "Komori" } else { "komori" };
    base.unwrap_or_else(|| PathBuf::from(".")).join(name)
}

fn settings_path() -> PathBuf {
    data_dir().join("settings.json")
}

pub fn load() -> Map<String, Value> {
    std::fs::read(settings_path())
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

pub fn save(settings: &Map<String, Value>) -> std::io::Result<()> {
    std::fs::create_dir_all(data_dir())?;
    let json = serde_json::to_vec_pretty(settings)?;
    // Write next to the file and swap, so a crash never leaves half a file.
    let tmp = settings_path().with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(tmp, settings_path())
}

pub fn flag(settings: &Map<String, Value>, key: &str, default: bool) -> bool {
    settings.get(key).and_then(Value::as_bool).unwrap_or(default)
}
