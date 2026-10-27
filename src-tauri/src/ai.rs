// The island's chat. Three ways to talk to a model:
//   anthropic — Claude through the Messages API, with the user's key;
//   openai    — any OpenAI-compatible server (OpenAI, LM Studio, OpenRouter…);
//   ollama    — a local Ollama, no key at all.
// Answers stream back to the island as events ("chat-chunk", "chat-done",
// "chat-error"). Keys come from the Credential Manager and stay in Rust.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::secrets;

const ANTHROPIC: &str = "https://api.anthropic.com/v1";

#[derive(Deserialize, Serialize, Clone)]
pub struct Msg {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub id: String,
    pub provider: String,
    pub model: String,
    /// Server address for openai / ollama.
    pub base: Option<String>,
    pub system: Option<String>,
    pub messages: Vec<Msg>,
}

/// Chats that are running, so "Detener" can stop them.
pub struct Chats(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl Chats {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

#[derive(Serialize, Clone)]
struct Chunk<'a> {
    id: &'a str,
    text: &'a str,
}

#[derive(Serialize, Clone)]
struct Done<'a> {
    id: &'a str,
    /// "end", "stopped", "length" or "refusal".
    reason: &'a str,
}

#[derive(Serialize, Clone)]
struct Fail<'a> {
    id: &'a str,
    message: String,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        // Long answers stream for a while; only a silent connection is a failure.
        .timeout_read(Duration::from_secs(120))
        .build()
}

fn clean_base(base: Option<&str>, fallback: &str) -> String {
    let b = base.map(str::trim).filter(|b| !b.is_empty()).unwrap_or(fallback);
    b.trim_end_matches('/').to_string()
}

/// A readable message from an HTTP error.
fn explain(err: ureq::Error, who: &str) -> String {
    match err {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            let detail = serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| {
                    v.pointer("/error/message")
                        .or_else(|| v.get("error"))
                        .and_then(|m| m.as_str().map(str::to_string))
                })
                .unwrap_or_default();
            let what = match code {
                401 | 403 => "La clave no es válida o no tiene permiso.".to_string(),
                404 => "No encontré ese modelo o esa dirección.".to_string(),
                429 => "Demasiadas peticiones o sin saldo; prueba en un rato.".to_string(),
                500..=599 => format!("{who} tiene problemas ahora mismo."),
                _ => format!("{who} respondió con un error ({code})."),
            };
            if detail.is_empty() { what } else { format!("{what} {detail}") }
        }
        ureq::Error::Transport(t) => format!("No pude conectar con {who}: {t}"),
    }
}

// ── Models ───────────────────────────────────────────────────────────────────

/// The models a provider offers (also a cheap way to check a key or a server).
#[tauri::command]
pub async fn ai_models(provider: String, base: Option<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || models(&provider, base.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

fn models(provider: &str, base: Option<&str>) -> Result<Vec<String>, String> {
    let a = agent();
    let mut ids: Vec<String> = match provider {
        "anthropic" => {
            let key = secrets::get("anthropic").ok_or("Falta la clave de Claude")?;
            let v: Value = a
                .get(&format!("{ANTHROPIC}/models?limit=100"))
                .set("x-api-key", &key)
                .set("anthropic-version", "2023-06-01")
                .call()
                .map_err(|e| explain(e, "Claude"))?
                .into_json()
                .map_err(|e| e.to_string())?;
            v["data"].as_array().into_iter().flatten().filter_map(|m| m["id"].as_str().map(String::from)).collect()
        }
        "openai" => {
            let url = format!("{}/models", clean_base(base, "https://api.openai.com/v1"));
            let mut req = a.get(&url);
            if let Some(key) = secrets::get("openai") {
                req = req.set("Authorization", &format!("Bearer {key}"));
            }
            let v: Value = req.call().map_err(|e| explain(e, "el servidor"))?.into_json().map_err(|e| e.to_string())?;
            v["data"].as_array().into_iter().flatten().filter_map(|m| m["id"].as_str().map(String::from)).collect()
        }
        "ollama" => {
            let url = format!("{}/api/tags", clean_base(base, "http://localhost:11434"));
            let v: Value = a
                .get(&url)
                .call()
                .map_err(|e| match e {
                    ureq::Error::Transport(_) => "Ollama no está abierto en este PC (o la dirección no es correcta).".to_string(),
                    other => explain(other, "Ollama"),
                })?
                .into_json()
                .map_err(|e| e.to_string())?;
            v["models"].as_array().into_iter().flatten().filter_map(|m| m["name"].as_str().map(String::from)).collect()
        }
        _ => return Err("Proveedor desconocido".into()),
    };
    if provider != "anthropic" {
        ids.sort();
    }
    Ok(ids)
}

// ── Chatting ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn ai_chat(app: AppHandle, chats: tauri::State<Chats>, request: ChatRequest) -> Result<(), String> {
    if request.messages.is_empty() || request.model.trim().is_empty() {
        return Err("Falta el mensaje o el modelo".into());
    }
    let stop = Arc::new(AtomicBool::new(false));
    chats.0.lock().unwrap().insert(request.id.clone(), stop.clone());
    std::thread::spawn(move || {
        let id = request.id.clone();
        let result = match request.provider.as_str() {
            "anthropic" => anthropic(&app, &request, &stop),
            "openai" => openai(&app, &request, &stop),
            "ollama" => ollama(&app, &request, &stop),
            _ => Err("Proveedor desconocido".into()),
        };
        match result {
            Ok(reason) => {
                let reason = if stop.load(Ordering::Relaxed) { "stopped" } else { reason };
                let _ = app.emit("chat-done", Done { id: &id, reason });
            }
            Err(message) => {
                let _ = app.emit("chat-error", Fail { id: &id, message });
            }
        }
        if let Some(chats) = tauri::Manager::try_state::<Chats>(&app) {
            chats.0.lock().unwrap().remove(&id);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn ai_stop(chats: tauri::State<Chats>, id: String) {
    if let Some(flag) = chats.0.lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}

fn send_chunk(app: &AppHandle, id: &str, text: &str) {
    if !text.is_empty() {
        let _ = app.emit("chat-chunk", Chunk { id, text });
    }
}

/// Claude, Messages API with server-sent events.
fn anthropic(app: &AppHandle, r: &ChatRequest, stop: &AtomicBool) -> Result<&'static str, String> {
    let key = secrets::get("anthropic").ok_or("Falta la clave de Claude: agrégala en Ajustes → IA.")?;
    let messages: Vec<Value> = r.messages.iter().map(|m| json!({ "role": m.role, "content": m.content })).collect();
    let mut body = json!({
        "model": r.model,
        "max_tokens": 64000,
        "stream": true,
        "messages": messages,
    });
    if let Some(system) = r.system.as_deref().filter(|s| !s.trim().is_empty()) {
        body["system"] = json!(system);
    }
    let mut req = agent()
        .post(&format!("{ANTHROPIC}/messages"))
        .set("x-api-key", &key)
        .set("anthropic-version", "2023-06-01")
        .set("content-type", "application/json");
    // On the models that can decline a request, let the API retry it on a
    // suitable model instead of just stopping.
    if r.model.starts_with("claude-opus-5") || r.model.starts_with("claude-fable-5") {
        req = req.set("anthropic-beta", "server-side-fallback-2026-07-01");
        body["fallbacks"] = json!("default");
    }
    let resp = req.send_json(body).map_err(|e| explain(e, "Claude"))?;
    let mut reason = "end";
    for line in BufReader::new(resp.into_reader()).lines() {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        let line = line.map_err(|e| format!("Se cortó la conexión: {e}"))?;
        let Some(data) = line.strip_prefix("data:") else { continue };
        let Ok(v) = serde_json::from_str::<Value>(data.trim()) else { continue };
        match v["type"].as_str() {
            Some("content_block_delta") if v["delta"]["type"] == "text_delta" => {
                send_chunk(app, &r.id, v["delta"]["text"].as_str().unwrap_or(""));
            }
            Some("message_delta") => match v["delta"]["stop_reason"].as_str() {
                Some("max_tokens") => reason = "length",
                Some("refusal") => reason = "refusal",
                _ => {}
            },
            Some("error") => {
                return Err(v["error"]["message"].as_str().unwrap_or("Claude devolvió un error").to_string());
            }
            Some("message_stop") => break,
            _ => {}
        }
    }
    Ok(reason)
}

/// OpenAI-compatible chat completions with server-sent events.
fn openai(app: &AppHandle, r: &ChatRequest, stop: &AtomicBool) -> Result<&'static str, String> {
    let url = format!("{}/chat/completions", clean_base(r.base.as_deref(), "https://api.openai.com/v1"));
    let mut messages: Vec<Value> = Vec::new();
    if let Some(system) = r.system.as_deref().filter(|s| !s.trim().is_empty()) {
        messages.push(json!({ "role": "system", "content": system }));
    }
    messages.extend(r.messages.iter().map(|m| json!({ "role": m.role, "content": m.content })));
    let mut req = agent().post(&url).set("content-type", "application/json");
    // Local servers often need no key at all.
    if let Some(key) = secrets::get("openai") {
        req = req.set("Authorization", &format!("Bearer {key}"));
    }
    let resp = req
        .send_json(json!({ "model": r.model, "messages": messages, "stream": true }))
        .map_err(|e| explain(e, "el servidor"))?;
    let mut reason = "end";
    for line in BufReader::new(resp.into_reader()).lines() {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        let line = line.map_err(|e| format!("Se cortó la conexión: {e}"))?;
        let Some(data) = line.strip_prefix("data:") else { continue };
        let data = data.trim();
        if data == "[DONE]" {
            break;
        }
        let Ok(v) = serde_json::from_str::<Value>(data) else { continue };
        if let Some(msg) = v.pointer("/error/message").and_then(|m| m.as_str()) {
            return Err(msg.to_string());
        }
        send_chunk(app, &r.id, v.pointer("/choices/0/delta/content").and_then(|t| t.as_str()).unwrap_or(""));
        if v.pointer("/choices/0/finish_reason").and_then(|f| f.as_str()) == Some("length") {
            reason = "length";
        }
    }
    Ok(reason)
}

/// Ollama's own chat API: one JSON object per line.
fn ollama(app: &AppHandle, r: &ChatRequest, stop: &AtomicBool) -> Result<&'static str, String> {
    let url = format!("{}/api/chat", clean_base(r.base.as_deref(), "http://localhost:11434"));
    let mut messages: Vec<Value> = Vec::new();
    if let Some(system) = r.system.as_deref().filter(|s| !s.trim().is_empty()) {
        messages.push(json!({ "role": "system", "content": system }));
    }
    messages.extend(r.messages.iter().map(|m| json!({ "role": m.role, "content": m.content })));
    let resp = agent()
        .post(&url)
        .send_json(json!({ "model": r.model, "messages": messages, "stream": true }))
        .map_err(|e| match e {
            ureq::Error::Transport(_) => "Ollama no está abierto en este PC.".to_string(),
            other => explain(other, "Ollama"),
        })?;
    for line in BufReader::new(resp.into_reader()).lines() {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        let line = line.map_err(|e| format!("Se cortó la conexión: {e}"))?;
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        if let Some(err) = v["error"].as_str() {
            return Err(err.to_string());
        }
        send_chunk(app, &r.id, v.pointer("/message/content").and_then(|t| t.as_str()).unwrap_or(""));
        if v["done"].as_bool() == Some(true) {
            break;
        }
    }
    Ok("end")
}
