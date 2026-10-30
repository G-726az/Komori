//! Files dropped on the island, received by WebView2 itself.
//!
//! Tauri's own drag-and-drop relies on a drop target on the window around the
//! webview, but the windows the cursor is really over belong to WebView2's
//! process, and drags from the desktop or the classic Explorer folders don't
//! find their way to it (the "no" cursor). So the island turns Tauri's handling
//! off (`dragDropEnabled: false`) and lets WebView2 take the drop like a
//! browser does. The page accepts it (shared/bridge.ts) and passes the dropped
//! files back with `chrome.webview.postMessageWithAdditionalObjects`; here each
//! one gives its real path, and the island hears a "file-drag" drop.

#[cfg(windows)]
pub fn install(app: &tauri::AppHandle) {
    use tauri::Emitter;
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2File, ICoreWebView2WebMessageReceivedEventArgs2};
    use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
    use wv2_core::{Interface, PWSTR};

    let Some(win) = crate::island::window(app) else { return };
    let handle = app.clone();
    let _ = win.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let handler = WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
            // Only our drop carries files; anything else (Tauri's own messages) is left alone.
            let Some(args) = args else { return Ok(()) };
            let Ok(args) = args.cast::<ICoreWebView2WebMessageReceivedEventArgs2>() else { return Ok(()) };
            let Ok(files) = args.AdditionalObjects() else { return Ok(()) };
            let mut count = 0u32;
            files.Count(&mut count)?;
            let mut paths = Vec::new();
            for i in 0..count.min(200) {
                let Ok(file) = files.GetValueAtIndex(i)?.cast::<ICoreWebView2File>() else { continue };
                let mut raw = PWSTR::null();
                if file.Path(&mut raw).is_ok() {
                    let path = take_pwstr(raw);
                    if !path.is_empty() {
                        paths.push(path);
                    }
                }
            }
            if !paths.is_empty() {
                let _ = handle.emit_to(crate::island::LABEL, "file-drag", serde_json::json!({ "type": "drop", "paths": paths }));
            }
            Ok(())
        }));
        let mut token = Default::default();
        let _ = core.add_WebMessageReceived(&handler, &mut token);
    });
}

#[cfg(not(windows))]
pub fn install(_app: &tauri::AppHandle) {}
