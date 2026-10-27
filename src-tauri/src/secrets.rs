// API keys and tokens live in the Windows Credential Manager ("Komori/<name>"),
// never in a file. The pages can save, check and remove a key, but never read
// it back: only Rust uses it, when it talks to the service.

const ALLOWED: [&str; 3] = ["anthropic", "openai", "github"];

fn target(name: &str) -> Result<String, String> {
    if ALLOWED.contains(&name) {
        Ok(format!("Komori/{name}"))
    } else {
        Err("Nombre de clave desconocido".into())
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 4096 {
        return Err("Clave vacía o demasiado larga".into());
    }
    write(&target(&name)?, value)
}

#[tauri::command]
pub fn secret_has(name: String) -> bool {
    target(&name).ok().and_then(|t| read(&t)).is_some()
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    delete(&target(&name)?)
}

/// Where Coucou keeps the same kind of key (its keyring entries), if it has one.
fn coucou_target(name: &str) -> Option<&'static str> {
    match name {
        "anthropic" => Some("anthropic-api-key.fr.louisraille.coucou"),
        "github" => Some("github-token.fr.louisraille.coucou"),
        _ => None,
    }
}

/// Coucou's keyring stores text as UTF-16; older entries may be UTF-8.
fn read_coucou(name: &str) -> Option<String> {
    let bytes = read_bytes(coucou_target(name)?)?;
    let text = if bytes.len() % 2 == 0 && bytes.len() >= 2 && bytes[1] == 0 {
        let wide: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16(&wide).ok()?
    } else {
        String::from_utf8(bytes).ok()?
    };
    let text = text.trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// Is there a key of this kind saved by Coucou?
#[tauri::command]
pub fn secret_coucou_has(name: String) -> bool {
    target(&name).is_ok() && read_coucou(&name).is_some()
}

/// Copies Coucou's key into Komori's place, without it ever reaching a page.
#[tauri::command]
pub fn secret_from_coucou(name: String) -> Result<(), String> {
    let t = target(&name)?;
    let value = read_coucou(&name).ok_or("Coucou no tiene esa clave guardada")?;
    write(&t, &value)
}

/// For Rust only.
pub fn get(name: &str) -> Option<String> {
    read(&target(name).ok()?)
}

#[cfg(windows)]
fn write(target: &str, value: &str) -> Result<(), String> {
    use windows::core::PWSTR;
    use windows::Win32::Security::Credentials::{CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};
    let mut name: Vec<u16> = target.encode_utf16().chain([0]).collect();
    let mut user: Vec<u16> = "Komori".encode_utf16().chain([0]).collect();
    let mut blob = value.as_bytes().to_vec();
    let cred = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(name.as_mut_ptr()),
        UserName: PWSTR(user.as_mut_ptr()),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..Default::default()
    };
    unsafe { CredWriteW(&cred, 0) }.map_err(|e| e.to_string())
}

fn read(target: &str) -> Option<String> {
    String::from_utf8(read_bytes(target)?).ok().filter(|s| !s.is_empty())
}

#[cfg(windows)]
fn read_bytes(target: &str) -> Option<Vec<u8>> {
    use windows::core::HSTRING;
    use windows::Win32::Security::Credentials::{CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC};
    let mut ptr: *mut CREDENTIALW = std::ptr::null_mut();
    unsafe {
        CredReadW(&HSTRING::from(target), CRED_TYPE_GENERIC, None, &mut ptr).ok()?;
        let cred = &*ptr;
        let bytes = std::slice::from_raw_parts(cred.CredentialBlob, cred.CredentialBlobSize as usize).to_vec();
        CredFree(ptr as *const _);
        Some(bytes)
    }
}

#[cfg(windows)]
fn delete(target: &str) -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};
    match unsafe { CredDeleteW(&HSTRING::from(target), CRED_TYPE_GENERIC, None) } {
        Ok(()) => Ok(()),
        // Nothing saved: already gone.
        Err(_) if read(target).is_none() => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(not(windows))]
fn write(_target: &str, _value: &str) -> Result<(), String> {
    Err("Solo en Windows".into())
}
#[cfg(not(windows))]
fn read_bytes(_target: &str) -> Option<Vec<u8>> {
    None
}
#[cfg(not(windows))]
fn delete(_target: &str) -> Result<(), String> {
    Ok(())
}
