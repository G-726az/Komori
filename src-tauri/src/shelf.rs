//! The shelf: files dropped on the island. Komori keeps only their paths; here
//! it looks them up, shows them in their folder, and copies them somewhere.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub exists: bool,
}

fn info(path: &str) -> FileInfo {
    let p = Path::new(path);
    let meta = std::fs::metadata(p).ok();
    FileInfo {
        path: path.to_string(),
        name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| path.to_string()),
        size: meta.as_ref().filter(|m| m.is_file()).map(|m| m.len()).unwrap_or(0),
        is_dir: meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
        exists: meta.is_some(),
    }
}

#[tauri::command]
pub fn shelf_info(paths: Vec<String>) -> Vec<FileInfo> {
    paths.iter().take(200).map(|p| info(p)).collect()
}

/// Opens Explorer with the file selected.
#[tauri::command]
pub fn shelf_reveal(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err("Ya no está ahí".into());
    }
    let mut cmd = std::process::Command::new("explorer.exe");
    cmd.arg(format!("/select,{}", path));
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn known_folder(place: &str) -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Desktop, FOLDERID_Documents, FOLDERID_Downloads, SHGetKnownFolderPath, KF_FLAG_DEFAULT};
    let id = match place {
        "desktop" => &FOLDERID_Desktop,
        "downloads" => &FOLDERID_Downloads,
        "documents" => &FOLDERID_Documents,
        _ => return None,
    };
    unsafe {
        let p = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
        let out = p.to_string().ok().map(PathBuf::from);
        CoTaskMemFree(Some(p.0 as *const _));
        out
    }
}

#[cfg(not(windows))]
fn known_folder(_place: &str) -> Option<PathBuf> {
    None
}

/// "name.ext", or "name (2).ext" … if that one is taken.
fn free_name(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let p = Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..1000).map(|n| dir.join(format!("{stem} ({n}){ext}"))).find(|c| !c.exists()).unwrap_or(first)
}

/// Copies files to the Desktop, Downloads or Documents. Returns the new paths.
#[tauri::command]
pub async fn shelf_copy_to(paths: Vec<String>, place: String) -> Result<Vec<String>, String> {
    let dir = known_folder(&place).ok_or("No encuentro esa carpeta")?;
    let mut out = vec![];
    for path in paths.iter().take(200) {
        let src = Path::new(path);
        if !src.is_file() {
            continue; // Folders stay where they are.
        }
        let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let dest = free_name(&dir, &name);
        std::fs::copy(src, &dest).map_err(|e| format!("No pude copiar «{name}»: {e}"))?;
        out.push(dest.to_string_lossy().to_string());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    #[test]
    fn free_name_counts_up() {
        let dir = std::env::temp_dir().join("komori-shelf-test");
        let _ = std::fs::create_dir_all(&dir);
        std::fs::write(dir.join("a.txt"), "x").unwrap();
        assert_eq!(super::free_name(&dir, "a.txt").file_name().unwrap(), "a (2).txt");
        assert_eq!(super::free_name(&dir, "b.txt").file_name().unwrap(), "b.txt");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
