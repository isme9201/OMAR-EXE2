#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The desktop entrypoint stays silent on Windows and delegates to the shared Tauri library.
fn main() {
    photomedia_erp_lib::run();
}
