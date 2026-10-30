// Song lyrics from LRCLIB (lrclib.net): free, no account, synced lines in LRC
// format when there are any. Only the artist, title, album and length of what
// is playing are sent. The pages keep a cache, so a song is asked for once.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

const API: &str = "https://lrclib.net/api";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    /// LRC text: "[mm:ss.xx] line" per line.
    pub synced: Option<String>,
    pub plain: Option<String>,
    pub instrumental: bool,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(10))
        .user_agent(&format!("Komori/{} (https://github.com/G-726az/Komori)", env!("CARGO_PKG_VERSION")))
        .build()
}

/// Players add noise to titles: "(Official Video)", "[Lyrics]", "feat. …", "- Remastered 2011".
fn clean(title: &str) -> String {
    let mut out = String::new();
    let mut depth = 0;
    for c in title.chars() {
        match c {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = (depth - 1).max(0),
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    let lower = out.to_lowercase();
    let mut cut = out.len();
    // Byte positions only match when lowercasing kept the length (it nearly always does).
    if lower.len() == out.len() {
        for marker in [" feat.", " ft.", " - remaster", " - live", " | "] {
            if let Some(i) = lower.find(marker) {
                cut = cut.min(i);
            }
        }
    }
    out[..cut].trim().trim_matches('-').trim().to_string()
}

fn pick(v: &Value) -> Option<Lyrics> {
    let synced = v["syncedLyrics"].as_str().filter(|s| !s.trim().is_empty()).map(str::to_string);
    let plain = v["plainLyrics"].as_str().filter(|s| !s.trim().is_empty()).map(str::to_string);
    let instrumental = v["instrumental"].as_bool().unwrap_or(false);
    (synced.is_some() || plain.is_some() || instrumental).then_some(Lyrics { synced, plain, instrumental })
}

fn get(artist: &str, title: &str, album: &str, duration: f64) -> Option<Lyrics> {
    let a = agent();
    let mut req = a.get(&format!("{API}/get")).query("artist_name", artist).query("track_name", title);
    if !album.is_empty() {
        req = req.query("album_name", album);
    }
    if duration > 0.0 {
        req = req.query("duration", &format!("{}", duration.round() as i64));
    }
    if let Ok(r) = req.call() {
        if let Ok(v) = r.into_json::<Value>() {
            if let Some(l) = pick(&v) {
                return Some(l);
            }
        }
    }
    // Not found exactly: search, prefer synced lyrics and the closest length.
    let q = format!("{artist} {title}");
    let list: Value = a.get(&format!("{API}/search")).query("q", q.trim()).call().ok()?.into_json().ok()?;
    let mut best: Option<(f64, &Value)> = None;
    for item in list.as_array()? {
        let has_sync = item["syncedLyrics"].as_str().map_or(false, |s| !s.is_empty());
        let off = if duration > 0.0 { (item["duration"].as_f64().unwrap_or(0.0) - duration).abs() } else { 0.0 };
        if duration > 0.0 && off > 8.0 {
            continue;
        }
        let score = off + if has_sync { 0.0 } else { 30.0 };
        if best.map_or(true, |(s, _)| score < s) {
            best = Some((score, item));
        }
    }
    best.and_then(|(_, v)| pick(v))
}

#[tauri::command]
pub async fn lyrics_get(artist: String, title: String, album: String, duration: f64) -> Result<Option<Lyrics>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut artist = artist.trim().to_string();
        let mut title = clean(&title);
        // Videos often carry "Artist - Song" in the title and the channel as the artist.
        if let Some((a, t)) = title.split_once(" - ") {
            if artist.is_empty() || artist.to_lowercase().contains("topic") || artist.to_lowercase().contains("vevo") {
                artist = a.trim().to_string();
                title = t.trim().to_string();
            }
        }
        let artist = artist.trim_end_matches(" - Topic").to_string();
        if title.is_empty() {
            return None;
        }
        get(&artist, &title, &album, duration)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::clean;

    #[test]
    fn cleans_titles() {
        assert_eq!(clean("Yellow (Official Video)"), "Yellow");
        assert_eq!(clean("Song [Lyrics] feat. Someone"), "Song");
        assert_eq!(clean("Here Comes the Sun - Remastered 2009"), "Here Comes the Sun");
    }
}
