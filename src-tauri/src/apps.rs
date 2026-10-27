// Shortcuts for the island: list what's installed (the Start menu, Store apps
// included), get a crisp icon for anything Windows can show, and open it.

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartApp {
    pub name: String,
    /// What to open: shell:AppsFolder\<id>, which works for every kind of app.
    pub target: String,
}

/// Everything in the Start menu, by name. Asks PowerShell's Get-StartApps,
/// which already merges classic programs and Store apps.
#[tauri::command]
pub async fn list_start_apps() -> Result<Vec<StartApp>, String> {
    tauri::async_runtime::spawn_blocking(start_apps).await.map_err(|e| e.to_string())?
}

fn start_apps() -> Result<Vec<StartApp>, String> {
    #[derive(serde::Deserialize)]
    struct Row {
        #[serde(rename = "Name")]
        name: String,
        #[serde(rename = "AppID")]
        id: String,
    }
    let script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress";
    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout);
    let text = text.trim().trim_start_matches('\u{feff}');
    if text.is_empty() {
        return Ok(vec![]);
    }
    // A single result comes back as an object, several as a list.
    let rows: Vec<Row> = if text.starts_with('[') {
        serde_json::from_str(text).map_err(|e| e.to_string())?
    } else {
        vec![serde_json::from_str(text).map_err(|e| e.to_string())?]
    };
    let mut apps: Vec<StartApp> = rows
        .into_iter()
        .filter(|r| !r.name.trim().is_empty() && !r.id.trim().is_empty())
        // Uninstallers, help files and web links in the Start menu are noise here.
        .filter(|r| {
            let n = r.name.to_lowercase();
            let id = r.id.to_lowercase();
            !(n.contains("uninstall") || n.contains("desinstalar") || id.ends_with(".url") || id.ends_with(".chm") || id.ends_with(".txt") || id.ends_with(".pdf") || id.ends_with(".html"))
        })
        .map(|r| StartApp { name: r.name.trim().to_string(), target: format!("shell:AppsFolder\\{}", r.id.trim()) })
        .collect();
    apps.sort_by_key(|a| a.name.to_lowercase());
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    Ok(apps)
}

/// Opens a program, Store app, file, folder or web page.
#[tauri::command]
pub fn launch(target: String) -> Result<(), String> {
    let target = target.trim();
    if target.is_empty() || target.len() > 2048 {
        return Err("Destino vacío".into());
    }
    open(target)
}

#[cfg(windows)]
pub fn open(target: &str) -> Result<(), String> {
    use windows::core::{w, HSTRING};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let file = HSTRING::from(target);
    let result = unsafe { ShellExecuteW(None, w!("open"), &file, None, None, SW_SHOWNORMAL) };
    // Values above 32 mean it worked.
    if result.0 as usize > 32 {
        Ok(())
    } else {
        Err(format!("Windows no pudo abrir «{target}»"))
    }
}

#[cfg(not(windows))]
pub fn open(_target: &str) -> Result<(), String> {
    Err("Solo en Windows".into())
}

/// Icons for several targets at once, as PNG data: URLs (None where Windows
/// has nothing to show, like web pages).
#[tauri::command]
pub async fn app_icons(targets: Vec<String>) -> Vec<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        unsafe {
            use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        targets.iter().take(200).map(|t| icon(t, 64)).collect()
    })
    .await
    .unwrap_or_default()
}

#[cfg(windows)]
fn icon(target: &str, size: i32) -> Option<String> {
    use base64::Engine;
    use windows::core::HSTRING;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_ICONONLY};

    let lower = target.to_lowercase();
    if lower.starts_with("http:") || lower.starts_with("https:") {
        return None;
    }
    unsafe {
        let factory: IShellItemImageFactory = SHCreateItemFromParsingName(&HSTRING::from(target), None).ok()?;
        let hbm = factory.GetImage(SIZE { cx: size, cy: size }, SIIGBF_ICONONLY).ok()?;
        let mut bm = BITMAP::default();
        GetObjectW(HGDIOBJ(hbm.0), std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _));
        let (w, h) = (bm.bmWidth, bm.bmHeight);
        let mut pixels = vec![0u8; (w * h * 4).max(0) as usize];
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                // Negative: rows from the top down.
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let dc = CreateCompatibleDC(None);
        let lines = GetDIBits(dc, hbm, 0, h as u32, Some(pixels.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
        let _ = DeleteDC(dc);
        let _ = DeleteObject(HGDIOBJ(hbm.0));
        if lines == 0 || w <= 0 || h <= 0 {
            return None;
        }
        // BGRA (premultiplied) → straight RGBA. No alpha at all means an opaque picture.
        let has_alpha = pixels.chunks(4).any(|p| p[3] != 0);
        for p in pixels.chunks_mut(4) {
            p.swap(0, 2);
            if !has_alpha {
                p[3] = 255;
            } else if p[3] > 0 && p[3] < 255 {
                let a = p[3] as u32;
                for c in &mut p[..3] {
                    *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
                }
            }
        }
        let mut png_bytes = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut png_bytes, w as u32, h as u32);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            let mut writer = enc.write_header().ok()?;
            writer.write_image_data(&pixels).ok()?;
        }
        Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png_bytes)))
    }
}

#[cfg(not(windows))]
fn icon(_target: &str, _size: i32) -> Option<String> {
    None
}
