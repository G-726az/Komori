// New versions from the project's GitHub Releases: look for one, download the
// installer (only from this repository's release downloads) and run it. Nothing
// is installed without the user saying so.

use std::io::{Read, Write};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

/// owner/name of the repository on GitHub.
pub const REPO: &str = "G-726az/Komori";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub name: String,
    pub size: u64,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub current: String,
    pub latest: String,
    pub available: bool,
    pub name: String,
    pub notes: String,
    pub url: String,
    pub asset: Option<Asset>,
}

#[derive(Clone, Serialize)]
struct Progress {
    got: u64,
    total: u64,
}

/// "1.2.10" > "1.2.9"; a leading "v" is fine.
fn newer(a: &str, b: &str) -> bool {
    let parts = |s: &str| -> Vec<u64> {
        s.trim_start_matches('v').split('.').map(|x| x.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0)).collect()
    };
    let (x, y) = (parts(a), parts(b));
    for i in 0..3 {
        let (p, q) = (x.get(i).copied().unwrap_or(0), y.get(i).copied().unwrap_or(0));
        if p != q {
            return p > q;
        }
    }
    false
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(Duration::from_secs(25)).user_agent(&format!("Komori/{}", env!("CARGO_PKG_VERSION"))).build()
}

fn check() -> Result<Release, String> {
    let res = agent()
        .get(&format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .set("Accept", "application/vnd.github+json")
        .call();
    let j: Value = match res {
        Ok(r) => r.into_json().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(404, _)) => return Err("Todavía no hay versiones publicadas en GitHub.".into()),
        Err(ureq::Error::Status(code, _)) => return Err(format!("GitHub respondió {code}")),
        Err(_) => return Err("Sin conexión con GitHub.".into()),
    };
    let tag = j["tag_name"].as_str().unwrap_or("").to_string();
    let current = env!("CARGO_PKG_VERSION").to_string();
    let asset = j["assets"].as_array().and_then(|list| {
        list.iter().find(|a| {
            let n = a["name"].as_str().unwrap_or("").to_lowercase();
            n.ends_with(".exe") && n.contains("setup")
        })
    });
    Ok(Release {
        available: newer(&tag, &current),
        latest: tag.trim_start_matches('v').to_string(),
        current,
        name: j["name"].as_str().unwrap_or(&tag).to_string(),
        notes: j["body"].as_str().unwrap_or("").to_string(),
        url: j["html_url"].as_str().unwrap_or("").to_string(),
        asset: asset.map(|a| Asset {
            name: a["name"].as_str().unwrap_or("Komori-setup.exe").to_string(),
            size: a["size"].as_u64().unwrap_or(0),
            url: a["browser_download_url"].as_str().unwrap_or("").to_string(),
        }),
    })
}

#[tauri::command]
pub async fn update_check() -> Result<Release, String> {
    tauri::async_runtime::spawn_blocking(check).await.map_err(|e| e.to_string())?
}

fn download(app: &AppHandle, url: &str, name: &str) -> Result<String, String> {
    let allowed = format!("https://github.com/{REPO}/releases/download/");
    if !url.starts_with(&allowed) {
        return Err("Descarga no permitida".into());
    }
    let res = agent().get(url).call().map_err(|_| "No se pudo descargar".to_string())?;
    let total: u64 = res.header("content-length").and_then(|x| x.parse().ok()).unwrap_or(0);
    let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' }).collect();
    let safe = if safe.to_lowercase().ends_with(".exe") { safe } else { "Komori-setup.exe".into() };
    let dest = std::env::temp_dir().join(safe);
    let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut body = res.into_reader();
    let mut buf = vec![0u8; 64 * 1024];
    let mut got = 0u64;
    let mut told = Instant::now();
    loop {
        let n = body.read(&mut buf).map_err(|_| "La descarga se cortó".to_string())?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        got += n as u64;
        if told.elapsed() > Duration::from_millis(200) {
            told = Instant::now();
            let _ = app.emit("update-progress", Progress { got, total });
        }
    }
    let _ = app.emit("update-progress", Progress { got, total });
    Ok(dest.to_string_lossy().into_owned())
}

/// Downloads the installer to the temp folder; returns its path.
#[tauri::command]
pub async fn update_download(app: AppHandle, url: String, name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || download(&app, &url, &name)).await.map_err(|e| e.to_string())?
}

/// Runs a downloaded installer and closes Komori so it can be replaced.
#[tauri::command]
pub fn update_install(app: AppHandle, path: String) -> Result<(), String> {
    let file = std::path::PathBuf::from(&path);
    // Only an installer this module saved in the temp folder.
    let temp = std::env::temp_dir().canonicalize().map_err(|e| e.to_string())?;
    let in_temp = file.canonicalize().ok().and_then(|f| f.parent().map(|p| p == temp)).unwrap_or(false);
    if !in_temp || !file.is_file() || !path.to_lowercase().ends_with(".exe") {
        return Err("Instalador no encontrado".into());
    }
    // Through the shell, so an installer that asks for permission can do so.
    crate::apps::open(&file.to_string_lossy())?;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        handle.exit(0);
    });
    let _ = app.get_webview_window("settings").map(|w| w.hide());
    Ok(())
}

/// The author's Ko-fi page, for anyone who wants to support the project.
pub const KOFI: &str = "https://ko-fi.com/gls726";

#[tauri::command]
pub fn open_kofi() -> Result<(), String> {
    crate::apps::open(KOFI)
}

/// The project's page on GitHub.
#[tauri::command]
pub fn open_project() -> Result<(), String> {
    crate::apps::open(&format!("https://github.com/{REPO}"))
}

#[cfg(test)]
mod tests {
    use super::newer;

    #[test]
    fn versions() {
        assert!(newer("v0.2.0", "0.1.0"));
        assert!(newer("1.2.10", "1.2.9"));
        assert!(!newer("0.1.0", "0.1.0"));
        assert!(!newer("v0.0.9", "0.1.0"));
    }
}
