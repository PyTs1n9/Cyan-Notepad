//! Native window background colour for the first frame.
//!
//! The window is undecorated and `tauri.conf.json` sets no `backgroundColor`,
//! so Tauri paints the surface itself before any of the renderer's CSS is
//! applied. That default is white, which means every launch from the dark theme
//! flashes white for a frame or two.
//!
//! The colour is *not* mirrored here from a theme table. The palette lives in
//! `src/index.css`, and a custom palette is derived at runtime, so only the
//! renderer can say what the background actually resolved to. It therefore
//! writes one hex string next to the storage pointer, and startup reads that
//! back. A missing or unreadable file is normal (first launch, older install)
//! and simply leaves the platform default in place.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::window::Color;
use tauri::{AppHandle, Manager};

const BG_FILE: &str = "window-bg.json";

#[derive(Serialize, Deserialize)]
struct WindowBackground {
    color: String,
}

fn file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(dir.join(BG_FILE))
}

/// `#rrggbb` → opaque `Color`. The alpha channel is ignored on Windows, so a
/// fixed 255 keeps the value meaningful on the platforms that do honour it.
fn parse_hex(value: &str) -> Option<Color> {
    let bytes = value.trim().as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' {
        return None;
    }
    let mut channel = [0u8; 3];
    for (index, slot) in channel.iter_mut().enumerate() {
        let high = (bytes[1 + index * 2] as char).to_digit(16)?;
        let low = (bytes[2 + index * 2] as char).to_digit(16)?;
        *slot = (high * 16 + low) as u8;
    }
    Some(Color(channel[0], channel[1], channel[2], 255))
}

/// Applies the colour persisted by the previous session. Called from `setup`,
/// which runs before the first paint is flushed to the screen.
pub fn apply_persisted(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(path) = file_path(app) else {
        return;
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return;
    };
    let Ok(parsed) = serde_json::from_str::<WindowBackground>(&raw) else {
        return;
    };
    let Some(color) = parse_hex(&parsed.color) else {
        return;
    };
    let _ = window.set_background_color(Some(color));
}

/// Persists the renderer's resolved `--color-bg-primary` and applies it to the
/// window that is already on screen, so a theme switch does not leave a stale
/// colour behind for the next launch.
#[tauri::command]
pub fn set_window_background(app: AppHandle, hex: String) -> Result<(), String> {
    let trimmed = hex.trim();
    let color = parse_hex(trimmed).ok_or_else(|| format!("invalid colour: {trimmed}"))?;

    let path = file_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let body = serde_json::to_string(&WindowBackground {
        color: trimmed.to_ascii_lowercase(),
    })
    .map_err(|error| error.to_string())?;
    fs::write(&path, body).map_err(|error| error.to_string())?;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window
        .set_background_color(Some(color))
        .map_err(|error| error.to_string())
}
