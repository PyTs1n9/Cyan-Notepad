use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // Workaround: RC.EXE (Windows Resource Compiler) cannot handle non-ASCII paths.
    // Copy the icon to a temp directory with an ASCII-only path to avoid build failures
    // when the project directory contains Unicode characters (e.g. Chinese folder names).
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let original_icon = PathBuf::from(&manifest_dir).join("icons").join("icon.ico");

    let mut attrs = tauri_build::Attributes::default();

    if original_icon.exists() {
        let temp_dir = env::temp_dir().join("cyan_notepad_build");
        let _ = fs::create_dir_all(&temp_dir);
        let temp_icon = temp_dir.join("icon.ico");
        let _ = fs::copy(&original_icon, &temp_icon);

        let windows = tauri_build::WindowsAttributes::new()
            .window_icon_path(&temp_icon);
        attrs = attrs.windows_attributes(windows);
    }

    tauri_build::try_build(attrs).expect("failed to run tauri build");
}
