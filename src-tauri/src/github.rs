// GitHub on the island, with the user's own token (Credential Manager):
// unread notifications, pull requests waiting for your review, and your own
// open pull requests. Read-only, except marking a notification as read.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use crate::secrets;

const API: &str = "https://api.github.com";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    /// Notification thread id (empty for pull requests).
    pub id: String,
    pub title: String,
    pub repo: String,
    /// "PullRequest", "Issue", "Release", "Discussion"…
    pub kind: String,
    /// Why it showed up ("review_requested", "mention"…).
    pub reason: String,
    pub url: String,
    pub updated: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub login: String,
    pub notifications: Vec<Item>,
    pub reviews: Vec<Item>,
    pub mine: Vec<Item>,
}

fn get(path: &str, token: &str) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).build();
    agent
        .get(&format!("{API}{path}"))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .set("User-Agent", "Komori")
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(401, _) => "El token de GitHub no es válido o caducó.".to_string(),
            ureq::Error::Status(403, _) => "GitHub negó el acceso: revisa los permisos del token.".to_string(),
            ureq::Error::Status(code, _) => format!("GitHub respondió con un error ({code})."),
            ureq::Error::Transport(t) => format!("No pude conectar con GitHub: {t}"),
        })?
        .into_json()
        .map_err(|e| e.to_string())
}

fn s(v: &Value, ptr: &str) -> String {
    v.pointer(ptr).and_then(|x| x.as_str()).unwrap_or_default().to_string()
}

/// An API address of an issue or pull request → the page in the browser.
fn web_url(api_url: &str, fallback: &str) -> String {
    if api_url.is_empty() {
        return fallback.to_string();
    }
    api_url.replacen("https://api.github.com/repos/", "https://github.com/", 1).replacen("/pulls/", "/pull/", 1)
}

fn token() -> Result<String, String> {
    secrets::get("github").ok_or_else(|| "Falta el token de GitHub: agrégalo en Ajustes → GitHub.".to_string())
}

/// Who the token belongs to (also checks that it works).
#[tauri::command]
pub async fn github_user() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(s(&get("/user", &token()?)?, "/login")))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn github_summary() -> Result<Summary, String> {
    tauri::async_runtime::spawn_blocking(summary).await.map_err(|e| e.to_string())?
}

fn summary() -> Result<Summary, String> {
    let token = token()?;
    let login = s(&get("/user", &token)?, "/login");

    // Notifications need a classic token with the "notifications" scope; if
    // the token can't read them, show the rest anyway.
    let notifications = get("/notifications?per_page=30", &token)
        .ok()
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
        .iter()
        .map(|n| Item {
            id: s(n, "/id"),
            title: s(n, "/subject/title"),
            repo: s(n, "/repository/full_name"),
            kind: s(n, "/subject/type"),
            reason: s(n, "/reason"),
            url: web_url(&s(n, "/subject/url"), &s(n, "/repository/html_url")),
            updated: s(n, "/updated_at"),
        })
        .collect();

    let search = |q: &str| -> Vec<Item> {
        get(&format!("/search/issues?per_page=20&sort=updated&q={q}"), &token)
            .ok()
            .and_then(|v| v["items"].as_array().cloned())
            .unwrap_or_default()
            .iter()
            .map(|i| Item {
                id: String::new(),
                title: s(i, "/title"),
                repo: s(i, "/repository_url").rsplitn(3, '/').take(2).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("/"),
                kind: "PullRequest".into(),
                reason: String::new(),
                url: s(i, "/html_url"),
                updated: s(i, "/updated_at"),
            })
            .collect()
    };
    let reviews = search("is:pr+is:open+review-requested:@me+archived:false");
    let mine = search("is:pr+is:open+author:@me+archived:false");
    Ok(Summary { login, notifications, reviews, mine })
}

#[tauri::command]
pub async fn github_mark_read(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
            return Err("Aviso no válido".to_string());
        }
        let token = token()?;
        ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(15))
            .build()
            .request("PATCH", &format!("{API}/notifications/threads/{id}"))
            .set("Authorization", &format!("Bearer {token}"))
            .set("Accept", "application/vnd.github+json")
            .set("User-Agent", "Komori")
            .call()
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens a GitHub page in the browser (only github.com addresses).
#[tauri::command]
pub fn github_open(url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/") {
        return Err("Dirección no permitida".into());
    }
    crate::apps::open(&url)
}
