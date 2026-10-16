#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::Path};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn open_downloads_folder(app: AppHandle) -> Result<(), String> {
    let folder = app.path().download_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    app.opener()
        .open_path(folder.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_pdf_to_downloads(app: AppHandle, file_name: String, bytes: Vec<u8>, reveal: Option<bool>) -> Result<String, String> {
    let safe_name = Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && name.to_lowercase().ends_with(".pdf"))
        .ok_or_else(|| "اسم ملف PDF غير صالح".to_string())?;
    let folder = app.path().download_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let path = folder.join(safe_name);
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    if reveal.unwrap_or(true) {
        open_downloads_folder(app)?;
    }
    Ok(path.to_string_lossy().to_string())
}

// Editorial Atelier desktop reminder: native chrome should stay quiet and make the production workspace the focus.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_downloads_folder, save_pdf_to_downloads])
        .run(tauri::generate_context!())
        .expect("error while running PhotoMedia ERP");
}
