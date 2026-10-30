// Claude Code notices. Claude Code can run a command on certain moments
// ("hooks"); Komori registers itself as that command. Each time, a short-lived
// `komori.exe --hook <Event>` reads what Claude Code sends on stdin, adds the
// chain of processes it was started from, and hands it to the running Komori
// over a local socket (127.0.0.1, random port, secret token). It never answers
// for Claude and never makes Claude wait: it only tells.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::{island, store};

/// Where the running Komori listens; read by the hook process.
#[derive(Serialize, Deserialize)]
struct Door {
    port: u16,
    token: String,
}

fn door_path() -> PathBuf {
    store::data_dir().join("claude-hook.json")
}

/// The notice the island gets.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeEvent {
    /// "working", "tool", "done", "question", "permission", "waiting", "ended"
    pub kind: String,
    /// For "tool": which tool Claude is about to use (Read, Edit, Bash…).
    pub tool: String,
    /// For "tool": what it works on, to show it (a change to a file, a command).
    pub snippet: Option<Value>,
    pub session: String,
    /// The project folder's name.
    pub project: String,
    pub message: String,
    /// For questions: each question with its options.
    pub questions: Vec<Question>,
}

#[derive(Clone, Serialize)]
pub struct Question {
    pub header: String,
    pub question: String,
    pub options: Vec<String>,
}

/// Process chains per session, to find the window it runs in.
pub struct Sessions(Mutex<Vec<(String, Vec<u32>)>>);

impl Sessions {
    pub fn new() -> Self {
        Self(Mutex::new(Vec::new()))
    }
}

// ── The hook process ─────────────────────────────────────────────────────────

/// `komori.exe --hook <Event>`: pass the event on and leave at once.
/// Always exits quietly: a notice must never get in Claude's way.
pub fn run_hook(event: &str) -> ! {
    let mut raw = Vec::new();
    let _ = std::io::stdin().take(4_000_000).read_to_end(&mut raw);
    // UTF-8 normally; accept UTF-16 and a BOM too, whatever pipes it in.
    let input = if raw.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = raw[2..].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(&raw).trim_start_matches('\u{feff}').to_string()
    };
    let _ = send(event, &input);
    std::process::exit(0);
}

fn send(event: &str, input: &str) -> Option<()> {
    let door: Door = serde_json::from_str(&std::fs::read_to_string(door_path()).ok()?).ok()?;
    let mut payload: Value = serde_json::from_str(input).unwrap_or_else(|_| json!({}));
    let obj = payload.as_object_mut()?;
    obj.insert("komoriEvent".into(), json!(event));
    obj.insert("komoriParents".into(), json!(parents()));
    let body = serde_json::to_vec(&payload).ok()?;
    let addr = SocketAddr::from(([127, 0, 0, 1], door.port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800)).ok()?;
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok()?;
    let head = format!(
        "POST /claude HTTP/1.0\r\nX-Komori-Token: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        door.token,
        body.len()
    );
    stream.write_all(head.as_bytes()).ok()?;
    stream.write_all(&body).ok()?;
    Some(())
}

/// Our ancestors, nearest first (Claude Code, then whatever started it…).
#[cfg(windows)]
fn parents() -> Vec<u32> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    let mut parent_of = std::collections::HashMap::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return vec![] };
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                parent_of.insert(entry.th32ProcessID, entry.th32ParentProcessID);
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
    }
    let mut chain = Vec::new();
    let mut pid = std::process::id();
    while let Some(&parent) = parent_of.get(&pid) {
        if parent == 0 || chain.contains(&parent) || chain.len() > 12 {
            break;
        }
        chain.push(parent);
        pid = parent;
    }
    chain
}

#[cfg(not(windows))]
fn parents() -> Vec<u32> {
    vec![]
}

// ── The listener in the running app ──────────────────────────────────────────

fn token() -> String {
    let mut out = String::new();
    for _ in 0..2 {
        let mut h = RandomState::new().build_hasher();
        h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        h.write_u32(std::process::id());
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

pub fn start(app: AppHandle) {
    // Registered by an older Komori (or from another folder): bring the entries up to date.
    if claude_hooks_status() {
        let _ = claude_hooks_set(true);
    }
    let Ok(listener) = TcpListener::bind(("127.0.0.1", 0)) else { return };
    let Ok(port) = listener.local_addr().map(|a| a.port()) else { return };
    let door = Door { port, token: token() };
    if let Ok(text) = serde_json::to_string(&door) {
        let _ = std::fs::create_dir_all(store::data_dir());
        let _ = std::fs::write(door_path(), text);
    }
    let secret = door.token;
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            if let Some(payload) = receive(stream, &secret) {
                handle(&app, payload);
            }
        }
    });
}

fn receive(mut stream: TcpStream, secret: &str) -> Option<Value> {
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    let mut data = Vec::new();
    let mut buf = [0u8; 16 * 1024];
    let mut head_end = None;
    // Read the head, then exactly Content-Length bytes (at most 4 MB).
    loop {
        let n = stream.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&buf[..n]);
        if head_end.is_none() {
            head_end = data.windows(4).position(|w| w == b"\r\n\r\n").map(|p| p + 4);
        }
        if let Some(end) = head_end {
            let head = String::from_utf8_lossy(&data[..end]).to_lowercase();
            let len: usize = head
                .lines()
                .find_map(|l| l.strip_prefix("content-length:").map(|v| v.trim().parse().unwrap_or(0)))
                .unwrap_or(0);
            if len > 4_000_000 {
                return None;
            }
            if data.len() >= end + len {
                let ok = head.lines().any(|l| l.strip_prefix("x-komori-token:").map(|v| v.trim() == secret).unwrap_or(false));
                let _ = stream.write_all(b"HTTP/1.0 204 No Content\r\n\r\n");
                return if ok { serde_json::from_slice(&data[end..end + len]).ok() } else { None };
            }
        }
        if data.len() > 4_100_000 {
            return None;
        }
    }
    None
}

fn text(v: &Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or_default().to_string()
}

fn handle(app: &AppHandle, p: Value) {
    let event = text(&p, "komoriEvent");
    let session = text(&p, "session_id");
    let cwd = text(&p, "cwd");
    let project = cwd.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or("").to_string();

    if let Some(parents) = p.get("komoriParents").and_then(|v| v.as_array()) {
        let chain: Vec<u32> = parents.iter().filter_map(|x| x.as_u64().map(|n| n as u32)).collect();
        if let Some(s) = app.try_state::<Sessions>() {
            let mut list = s.0.lock().unwrap();
            list.retain(|(id, _)| id != &session);
            list.push((session.clone(), chain));
            if list.len() > 20 {
                list.remove(0);
            }
        }
    }

    let mut ev = ClaudeEvent { kind: String::new(), tool: String::new(), snippet: None, session, project, message: String::new(), questions: vec![] };
    match event.as_str() {
        "UserPromptSubmit" => ev.kind = "working".into(),
        "Stop" => {
            ev.kind = "done".into();
            ev.message = last_reply(&text(&p, "transcript_path"));
        }
        "SessionEnd" => ev.kind = "ended".into(),
        "Notification" => {
            let kind = text(&p, "notification_type");
            ev.message = text(&p, "message");
            ev.kind = if kind.contains("permission") || ev.message.to_lowercase().contains("permission") {
                "permission".into()
            } else {
                "waiting".into()
            };
        }
        "PreToolUse" if text(&p, "tool_name") == "AskUserQuestion" => {
            ev.kind = "question".into();
            if let Some(qs) = p.pointer("/tool_input/questions").and_then(|v| v.as_array()) {
                ev.questions = qs
                    .iter()
                    .take(6)
                    .map(|q| Question {
                        header: text(q, "header"),
                        question: text(q, "question"),
                        options: q
                            .get("options")
                            .and_then(|o| o.as_array())
                            .map(|o| o.iter().take(6).map(|x| text(x, "label")).collect())
                            .unwrap_or_default(),
                    })
                    .collect();
            }
        }
        "PreToolUse" => {
            // Any other tool: a step of the task (for the progress page).
            ev.kind = "tool".into();
            ev.tool = text(&p, "tool_name");
            ev.message = tool_detail(&p);
            ev.snippet = snippet(&ev.tool, &p);
        }
        _ => return,
    }
    let _ = app.emit_to(island::LABEL, "claude-event", ev);
}

/// At most `n` lines of `text`, each cut to a readable length.
fn lines(text: &str, n: usize) -> Vec<String> {
    text.lines()
        .take(n)
        .map(|l| {
            let l = l.replace('\t', "  ");
            if l.chars().count() > 140 { format!("{}…", l.chars().take(139).collect::<String>()) } else { l }
        })
        .collect()
}

/// What the page shows for a step: the change to a file (with the line where it
/// starts, read from the file before it changes) or the command being run.
fn snippet(tool: &str, p: &Value) -> Option<Value> {
    let input = p.get("tool_input")?;
    let path = text(input, "file_path");
    let file = path.rsplit(['\\', '/']).next().unwrap_or("").to_string();
    let rel = {
        let cwd = text(p, "cwd").replace('\\', "/");
        let full = path.replace('\\', "/");
        full.strip_prefix(&format!("{}/", cwd.trim_end_matches('/'))).map(str::to_string).unwrap_or(full)
    };
    match tool {
        "Edit" | "MultiEdit" => {
            let (old, new) = if tool == "Edit" {
                (text(input, "old_string"), text(input, "new_string"))
            } else {
                let first = input.get("edits")?.as_array()?.first()?;
                (text(first, "old_string"), text(first, "new_string"))
            };
            // Where the change starts, counted in the file as it is now, and a few
            // unchanged lines around it for context.
            let body = std::fs::read_to_string(&path).unwrap_or_default();
            let (line, before, after) = match body.find(&old).filter(|_| !old.is_empty()) {
                Some(at) => {
                    let start = body[..at].matches('\n').count() + 1;
                    let all: Vec<&str> = body.lines().collect();
                    let first = start.saturating_sub(3).max(1);
                    let before = lines(&all[first - 1..start - 1].join("\n"), 3);
                    let end = (start - 1 + old.lines().count().max(1)).min(all.len());
                    let after = lines(&all[end..(end + 4).min(all.len())].join("\n"), 4);
                    (start, before, after)
                }
                None => (0, vec![], vec![]),
            };
            Some(json!({ "kind": "edit", "file": file, "path": rel, "line": line,
                "before": before, "old": lines(&old, 10), "new": lines(&new, 10), "after": after }))
        }
        "Write" => Some(json!({ "kind": "edit", "file": file, "path": rel, "line": 1, "old": [], "new": lines(&text(input, "content"), 10) })),
        "Bash" | "PowerShell" => Some(json!({ "kind": "command", "command": lines(&text(input, "command"), 6), "about": text(input, "description") })),
        "Read" => Some(json!({ "kind": "read", "file": file, "path": rel })),
        _ => None,
    }
}

/// A few words about what the tool works on: a file's name, a search, a command.
fn tool_detail(p: &Value) -> String {
    let input = p.get("tool_input").cloned().unwrap_or(Value::Null);
    let file = ["file_path", "notebook_path", "path"].iter().map(|k| text(&input, k)).find(|x| !x.is_empty());
    let raw = if let Some(f) = file {
        f.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or("").to_string()
    } else {
        ["description", "pattern", "command", "query", "url"].iter().map(|k| text(&input, k)).find(|x| !x.is_empty()).unwrap_or_default()
    };
    let one: String = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if one.chars().count() > 70 {
        format!("{}…", one.chars().take(69).collect::<String>())
    } else {
        one
    }
}

/// The start of Claude's last written answer, from the session transcript.
fn last_reply(path: &str) -> String {
    if path.is_empty() {
        return String::new();
    }
    let Ok(mut file) = std::fs::File::open(path) else { return String::new() };
    // The end of the file is enough.
    use std::io::{Seek, SeekFrom};
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let _ = file.seek(SeekFrom::Start(len.saturating_sub(400_000)));
    let mut tail = Vec::new();
    let _ = file.read_to_end(&mut tail);
    let tail = String::from_utf8_lossy(&tail);
    for line in tail.lines().rev() {
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        if v.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }
        let Some(parts) = v.pointer("/message/content").and_then(|c| c.as_array()) else { continue };
        let words: Vec<&str> = parts
            .iter()
            .filter(|p| p.get("type").and_then(|t| t.as_str()) == Some("text"))
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
            .collect();
        let joined = words.join(" ");
        let clean: String = joined
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .replace("**", "")
            .replace('`', "");
        if !clean.is_empty() {
            return clean.chars().take(220).collect();
        }
    }
    String::new()
}

// ── Opening the right window ─────────────────────────────────────────────────

/// Brings forward the window this session runs in (the Claude app, VS Code,
/// a terminal…); if none is found, opens the Claude app.
#[tauri::command]
pub fn claude_focus(sessions: tauri::State<Sessions>, session: String) {
    let chain = sessions.0.lock().unwrap().iter().rev().find(|(id, _)| *id == session || session.is_empty()).map(|(_, c)| c.clone());
    if let Some(chain) = chain {
        for pid in chain {
            if focus_pid(pid) {
                return;
            }
        }
    }
    let _ = crate::apps::open("shell:AppsFolder\\Claude_pzs8sxrjxfjjc!Claude");
}

#[cfg(windows)]
fn focus_pid(pid: u32) -> bool {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowTextLengthW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
        SetForegroundWindow, ShowWindow, GW_OWNER, SW_RESTORE,
    };
    struct Find {
        pid: u32,
        found: Option<HWND>,
    }
    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
        let find = &mut *(data.0 as *mut Find);
        let mut owner_pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut owner_pid));
        let top_level = GetWindow(hwnd, GW_OWNER).map(|o| o.is_invalid()).unwrap_or(true);
        if owner_pid == find.pid && IsWindowVisible(hwnd).as_bool() && top_level && GetWindowTextLengthW(hwnd) > 0 {
            find.found = Some(hwnd);
            return BOOL(0);
        }
        BOOL(1)
    }
    let mut find = Find { pid, found: None };
    unsafe {
        let _ = EnumWindows(Some(each), LPARAM(&mut find as *mut Find as isize));
        let Some(hwnd) = find.found else { return false };
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
        SetForegroundWindow(hwnd).as_bool()
    }
}

#[cfg(not(windows))]
fn focus_pid(_pid: u32) -> bool {
    false
}

/// Shows a pretend notice, from the settings' "Probar".
#[tauri::command]
pub fn claude_test(app: AppHandle, kind: String) {
    let ev = ClaudeEvent {
        kind: kind.clone(),
        tool: String::new(),
        snippet: None,
        session: String::new(),
        project: "Komori".into(),
        message: if kind == "done" {
            "Listo: terminé los cambios y la app ya está instalada. ¿Quieres que siga con la siguiente fase?".into()
        } else {
            "Claude necesita tu permiso para usar Bash".into()
        },
        questions: if kind == "question" {
            vec![Question {
                header: "Color".into(),
                question: "¿Qué color prefieres para la mascota?".into(),
                options: vec!["Fucsia".into(), "Menta".into(), "Lavanda".into()],
            }]
        } else {
            vec![]
        },
    };
    let _ = app.emit_to(island::LABEL, "claude-event", ev);
}

// ── Registering in Claude Code's settings ─────────────────────────────────────

const EVENTS: [(&str, Option<&str>); 5] = [
    ("UserPromptSubmit", None),
    ("Stop", None),
    ("Notification", None),
    // Every tool (not only AskUserQuestion): the progress page follows the steps.
    ("PreToolUse", None),
    ("SessionEnd", None),
];

fn claude_settings() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".claude").join("settings.json"))
}

fn is_ours(hook: &Value) -> bool {
    hook.get("command").and_then(|c| c.as_str()).map(|c| c.to_lowercase().contains("komori.exe\" --hook")).unwrap_or(false)
}

/// Is Komori registered in Claude Code's settings?
#[tauri::command]
pub fn claude_hooks_status() -> bool {
    let Some(path) = claude_settings() else { return false };
    let Ok(text) = std::fs::read_to_string(path) else { return false };
    let Ok(v) = serde_json::from_str::<Value>(&text) else { return false };
    v.get("hooks")
        .and_then(|h| h.as_object())
        .map(|h| h.values().flat_map(|groups| groups.as_array().into_iter().flatten()).any(|g| {
            g.get("hooks").and_then(|x| x.as_array()).map(|hs| hs.iter().any(is_ours)).unwrap_or(false)
        }))
        .unwrap_or(false)
}

/// Adds or removes Komori's entries, leaving everything else as it was.
#[tauri::command]
pub fn claude_hooks_set(on: bool) -> Result<bool, String> {
    let path = claude_settings().ok_or("No encuentro la carpeta de usuario")?;
    let original = std::fs::read_to_string(&path).unwrap_or_else(|_| "{}".into());
    let mut root: Value = serde_json::from_str(&original).map_err(|_| "El archivo de ajustes de Claude Code no es JSON válido; no lo toco.")?;
    let obj = root.as_object_mut().ok_or("Formato inesperado")?;
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    let hooks = hooks.as_object_mut().ok_or("Formato inesperado en hooks")?;

    // First remove ours everywhere (also old paths), then add fresh ones.
    for groups in hooks.values_mut() {
        if let Some(list) = groups.as_array_mut() {
            for g in list.iter_mut() {
                if let Some(hs) = g.get_mut("hooks").and_then(|x| x.as_array_mut()) {
                    hs.retain(|h| !is_ours(h));
                }
            }
            list.retain(|g| g.get("hooks").and_then(|x| x.as_array()).map(|hs| !hs.is_empty()).unwrap_or(true));
        }
    }
    hooks.retain(|_, groups| groups.as_array().map(|l| !l.is_empty()).unwrap_or(true));

    if on {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
        for (event, matcher) in EVENTS {
            let mut group = Map::new();
            if let Some(m) = matcher {
                group.insert("matcher".into(), json!(m));
            }
            group.insert("hooks".into(), json!([{ "type": "command", "command": format!("\"{exe}\" --hook {event}"), "timeout": 10 }]));
            let list = hooks.entry(event).or_insert_with(|| json!([]));
            if let Some(list) = list.as_array_mut() {
                list.push(Value::Object(group));
            }
        }
    }
    if hooks.is_empty() {
        obj.remove("hooks");
    }

    // Keep a copy of how it was before Komori first touched it.
    let backup = path.with_extension("json.antes-de-komori");
    if !backup.exists() && path.exists() {
        let _ = std::fs::write(&backup, &original);
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.komori-tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(claude_hooks_status())
}
