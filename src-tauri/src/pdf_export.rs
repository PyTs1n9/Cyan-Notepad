//! PDF export through the WebView2 printing engine.
//!
//! The renderer mounts a dedicated print sheet and asks this command to write it
//! to disk. `PrintToPdf` is asynchronous, so the completion callback reports back
//! through a channel and the command waits with a timeout instead of guessing.

use tauri::WebviewWindow;

const EXPORT_TIMEOUT_SECS: u64 = 60;

#[tauri::command]
pub async fn export_pdf(window: WebviewWindow, path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || print_to_pdf(&window, &path))
            .await
            .map_err(|error| format!("PDF export task failed: {error}"))?
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, path);
        Err("PDF export is only available on Windows".to_string())
    }
}

#[cfg(target_os = "windows")]
fn print_to_pdf(window: &WebviewWindow, path: &str) -> Result<(), String> {
    use std::sync::mpsc;
    use std::time::Duration;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7;
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, PCWSTR};

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();

    window
        .with_webview(move |webview| {
            let result = (|| -> Result<(), String> {
                let controller = webview.controller();
                let core = unsafe { controller.CoreWebView2() }
                    .map_err(|error| format!("WebView2 is not available: {error}"))?;
                let core = core.cast::<ICoreWebView2_7>().map_err(|_| {
                    "The installed WebView2 runtime is too old for PDF export (requires 92+)"
                        .to_string()
                })?;

                let settings = create_print_settings(&webview);
                let handler_tx = tx.clone();
                let handler = PrintToPdfCompletedHandler::create(Box::new(
                    move |error_code, is_successful| {
                        let _ = handler_tx.send(match error_code {
                            Ok(()) if is_successful => Ok(()),
                            Ok(()) => Err("PDF export was cancelled by WebView2".to_string()),
                            Err(error) => Err(format!("PDF export failed: {error}")),
                        });
                        Ok(())
                    },
                ));

                // Safety: the layout is already mounted, and the path pointer
                // stays valid because WebView2 copies it before returning.
                unsafe {
                    core.PrintToPdf(PCWSTR(wide_path.as_ptr()), settings.as_ref(), &handler)
                        .map_err(|error| format!("Could not start PDF export: {error}"))
                }
            })();

            if let Err(error) = result {
                let _ = tx.send(Err(error));
            }
        })
        .map_err(|error| format!("Could not reach the window: {error}"))?;

    match rx.recv_timeout(Duration::from_secs(EXPORT_TIMEOUT_SECS)) {
        Ok(result) => result,
        Err(_) => Err("PDF export timed out".to_string()),
    }
}

/// A4 with printable margins, background colours kept so shaded code blocks and
/// highlight marks survive the export. Falls back to WebView2 defaults when the
/// runtime predates `ICoreWebView2Environment6`.
#[cfg(target_os = "windows")]
fn create_print_settings(
    webview: &tauri::webview::PlatformWebview,
) -> Option<webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2PrintSettings> {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment6;
    use windows::core::Interface;

    const PAGE_WIDTH_INCHES: f64 = 8.27;
    const PAGE_HEIGHT_INCHES: f64 = 11.69;
    const MARGIN_INCHES: f64 = 0.55;

    let environment = webview.environment().cast::<ICoreWebView2Environment6>().ok()?;
    let settings = unsafe { environment.CreatePrintSettings() }.ok()?;

    unsafe {
        let _ = settings.SetPageWidth(PAGE_WIDTH_INCHES);
        let _ = settings.SetPageHeight(PAGE_HEIGHT_INCHES);
        let _ = settings.SetMarginTop(MARGIN_INCHES);
        let _ = settings.SetMarginBottom(MARGIN_INCHES);
        let _ = settings.SetMarginLeft(MARGIN_INCHES);
        let _ = settings.SetMarginRight(MARGIN_INCHES);
        let _ = settings.SetShouldPrintBackgrounds(true);
        let _ = settings.SetShouldPrintHeaderAndFooter(false);
    }

    Some(settings)
}
