// Quick notes: plain .txt files in %APPDATA%\Komori\notas, so they open in any
// editor and are easy to back up. The file name is the note's title. Deleted
// notes go to the Recycle Bin.

use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::store;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInfo {
    pub name: String,
    /// Last change, ms since 1970.
    pub modified: u64,
    pub preview: String,
}

fn dir() -> Result<PathBuf, String> {
    let d = store::data_dir().join("notas");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// A safe file name from a title: no path parts, no characters Windows rejects.
fn clean(title: &str) -> String {
    let mut s: String = title
        .chars()
        .filter(|c| !c.is_control() && !"<>:\"/\\|?*".contains(*c))
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .trim()
        .to_string();
    if s.chars().count() > 80 {
        s = s.chars().take(80).collect::<String>().trim().to_string();
    }
    let reserved = ["con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "lpt1", "lpt2", "lpt3"];
    if s.is_empty() || reserved.contains(&s.to_lowercase().as_str()) {
        s = "Nota".into();
    }
    s
}

/// The file for a note that must already exist (no tricks with names).
fn existing(name: &str) -> Result<PathBuf, String> {
    let d = dir()?;
    if clean(name) != name {
        return Err("Nombre no válido".into());
    }
    let path = d.join(format!("{name}.txt"));
    if !path.is_file() {
        return Err("La nota ya no existe".into());
    }
    Ok(path)
}

/// "Nota", "Nota 2", "Nota 3"… whichever is free.
fn free_name(base: &str) -> Result<String, String> {
    let d = dir()?;
    let base = clean(base);
    let mut name = base.clone();
    let mut n = 2;
    while d.join(format!("{name}.txt")).exists() {
        name = format!("{base} {n}");
        n += 1;
    }
    Ok(name)
}

fn read_text(path: &PathBuf) -> String {
    let bytes = std::fs::read(path).unwrap_or_default();
    let text = String::from_utf8_lossy(&bytes).to_string();
    text.trim_start_matches('\u{feff}').to_string()
}

#[tauri::command]
pub fn notes_list() -> Result<Vec<NoteInfo>, String> {
    let mut notes = Vec::new();
    for entry in std::fs::read_dir(dir()?).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("txt")) != Some(true) {
            continue;
        }
        let Some(name) = path.file_stem().map(|s| s.to_string_lossy().to_string()) else { continue };
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let text = read_text(&path);
        let preview: String = text.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(140).collect();
        notes.push(NoteInfo { name, modified, preview });
    }
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(notes)
}

#[tauri::command]
pub fn note_read(name: String) -> Result<String, String> {
    Ok(read_text(&existing(&name)?))
}

#[tauri::command]
pub fn note_write(name: String, text: String) -> Result<(), String> {
    let path = existing(&name)?;
    let tmp = path.with_extension("txt.tmp");
    std::fs::write(&tmp, text.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn note_create(title: Option<String>) -> Result<String, String> {
    let name = free_name(title.as_deref().unwrap_or("Nota"))?;
    std::fs::write(dir()?.join(format!("{name}.txt")), b"").map_err(|e| e.to_string())?;
    Ok(name)
}

/// Renames a note; returns the name it really got (it may need a number).
#[tauri::command]
pub fn note_rename(name: String, title: String) -> Result<String, String> {
    let from = existing(&name)?;
    let wanted = clean(&title);
    if wanted == name {
        return Ok(name);
    }
    // Only changing upper/lower case: Windows sees the same file.
    let next = if wanted.eq_ignore_ascii_case(&name) { wanted } else { free_name(&wanted)? };
    std::fs::rename(&from, dir()?.join(format!("{next}.txt"))).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
pub fn note_delete(name: String) -> Result<(), String> {
    let path = existing(&name)?;
    recycle(&path)
}

#[tauri::command]
pub fn open_notes_folder() -> Result<(), String> {
    crate::apps::open(&dir()?.to_string_lossy())
}

#[cfg(windows)]
fn recycle(path: &PathBuf) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE, SHFILEOPSTRUCTW,
    };
    // The list of files ends with two NULs.
    let mut from: Vec<u16> = path.to_string_lossy().encode_utf16().collect();
    from.extend([0, 0]);
    let mut op = SHFILEOPSTRUCTW {
        wFunc: FO_DELETE,
        pFrom: PCWSTR(from.as_ptr()),
        fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI).0 as u16,
        ..Default::default()
    };
    let code = unsafe { SHFileOperationW(&mut op) };
    if code == 0 {
        Ok(())
    } else {
        Err(format!("No se pudo enviar a la papelera ({code})"))
    }
}

#[cfg(not(windows))]
fn recycle(path: &PathBuf) -> Result<(), String> {
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

/// Saves a drawing from the board (a PNG data: URL) in %APPDATA%\Komori\dibujos
/// and returns the file's path.
#[tauri::command]
pub fn save_drawing(data_url: String) -> Result<String, String> {
    use base64::Engine;
    let b64 = data_url.strip_prefix("data:image/png;base64,").ok_or("Imagen no válida")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    if bytes.len() > 30_000_000 || !bytes.starts_with(b"\x89PNG") {
        return Err("Imagen no válida".into());
    }
    let dir = store::data_dir().join("dibujos");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let path = dir.join(format!("dibujo-{stamp}.png"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_drawings_folder() -> Result<(), String> {
    let dir = store::data_dir().join("dibujos");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    crate::apps::open(&dir.to_string_lossy())
}
