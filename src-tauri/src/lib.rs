#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashSet,
    fs::{self, File},
    io,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use futures_util::{stream, StreamExt, TryStreamExt};
use reqwest::Url;
use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;
use tempfile::{NamedTempFile, TempDir};
use tokio::{fs::File as AsyncFile, io::AsyncWriteExt};
use zip::{write::FileOptions, CompressionMethod, ZipWriter};

const MAX_TOTAL_BYTES: u64 = 300 * 1024 * 1024;
const MAX_CONCURRENT_DOWNLOADS: usize = 4;

#[derive(Debug, Clone, Deserialize)]
struct RepositoryEntry {
    name: String,
    url: String,
}

struct DownloadedEntry {
    entry: RepositoryEntry,
    temporary_file: NamedTempFile,
}

#[tauri::command]
fn open_downloads_folder(app: AppHandle) -> Result<(), String> {
    let folder = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    app.opener()
        .open_path(folder.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_pdf_to_downloads(
    app: AppHandle,
    file_name: String,
    bytes: Vec<u8>,
    reveal: Option<bool>,
) -> Result<String, String> {
    let safe_name = Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && name.to_lowercase().ends_with(".pdf"))
        .ok_or_else(|| "اسم ملف PDF غير صالح".to_string())?;
    let folder = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let path = folder.join(safe_name);
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    if reveal.unwrap_or(true) {
        open_downloads_folder(app)?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn write_export_to_directory(
    directory: String,
    file_name: String,
    contents: String,
) -> Result<String, String> {
    let folder = Path::new(&directory)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !folder.is_dir() {
        return Err("المجلد المختار غير متاح".to_string());
    }
    let safe_name = Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && name.to_lowercase().ends_with(".sql"))
        .ok_or_else(|| "اسم ملف SQL غير صالح".to_string())?;
    let path = folder.join(safe_name);
    fs::write(&path, contents.as_bytes()).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn validate_output_path(file_path: &str) -> Result<(PathBuf, PathBuf), String> {
    let requested = Path::new(file_path.trim());
    if file_path.trim().is_empty() {
        return Err("مسار ZIP فارغ".to_string());
    }
    if requested
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("zip"))
        != Some(true)
    {
        return Err("يجب أن ينتهي مسار ZIP بالامتداد .zip".to_string());
    }
    let file_name = requested
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && *name != "." && *name != "..")
        .ok_or_else(|| "اسم ملف ZIP غير صالح".to_string())?;
    let parent = requested.parent().unwrap_or_else(|| Path::new("."));
    let parent = parent
        .canonicalize()
        .map_err(|error| format!("مجلد ZIP غير متاح: {error}"))?;
    if !parent.is_dir() {
        return Err("مجلد ZIP غير متاح".to_string());
    }
    let output = parent.join(file_name);
    if fs::symlink_metadata(&output)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("مسار ZIP يشير إلى رابط رمزي غير مسموح".to_string());
    }
    if output.is_dir() {
        return Err("مسار ZIP يشير إلى مجلد".to_string());
    }
    Ok((output, parent))
}

fn validate_entry_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.ends_with('/')
        || name.ends_with('\\')
        || name.contains('\\')
        || name.contains('\0')
        || name.contains(':')
    {
        return Err(format!("اسم entry غير صالح: {name}"));
    }
    let path = Path::new(name);
    if path.is_absolute() {
        return Err(format!("اسم entry مطلق وغير مسموح: {name}"));
    }
    for component in path.components() {
        match component {
            Component::Normal(value) if value != "." && value != ".." => {}
            _ => return Err(format!("اسم entry يحتوي مساراً غير آمن: {name}")),
        }
    }
    Ok(())
}

fn validate_url(url: &str) -> Result<Url, String> {
    let url = Url::parse(url).map_err(|error| format!("رابط تنزيل غير صالح: {error}"))?;
    if url.scheme() != "https"
        || url
            .host_str()
            .map(|host| host.eq_ignore_ascii_case("res.cloudinary.com"))
            != Some(true)
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("يسمح بالتنزيل فقط عبر HTTPS من res.cloudinary.com".to_string());
    }
    Ok(url)
}

fn reserve_bytes(total: &AtomicU64, amount: u64) -> Result<(), String> {
    total
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
            current
                .checked_add(amount)
                .filter(|next| *next <= MAX_TOTAL_BYTES)
        })
        .map(|_| ())
        .map_err(|_| "يتجاوز حجم المستودع الحد الأقصى 300 MiB".to_string())
}

async fn download_entry(
    client: reqwest::Client,
    entry: RepositoryEntry,
    temporary_dir: PathBuf,
    total: Arc<AtomicU64>,
) -> Result<DownloadedEntry, String> {
    let url = validate_url(&entry.url)?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("فشل تنزيل {}: {error}", entry.name))?;
    if !response.status().is_success() {
        return Err(format!(
            "فشل تنزيل {}: HTTP {}",
            entry.name,
            response.status()
        ));
    }
    let declared_size = response.content_length();
    if declared_size.is_some_and(|size| size > MAX_TOTAL_BYTES) {
        return Err(format!("حجم {} يتجاوز الحد الأقصى 300 MiB", entry.name));
    }
    if let Some(size) = declared_size {
        reserve_bytes(&total, size)?;
    }

    let temporary_file =
        NamedTempFile::new_in(&temporary_dir).map_err(|error| error.to_string())?;
    let mut destination = AsyncFile::from_std(
        temporary_file
            .as_file()
            .try_clone()
            .map_err(|error| error.to_string())?,
    );
    let mut downloaded = 0u64;
    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|error| format!("فشل تنزيل {}: {error}", entry.name))?;
        let chunk_size =
            u64::try_from(chunk.len()).map_err(|_| "حجم تنزيل غير صالح".to_string())?;
        let next_size = downloaded
            .checked_add(chunk_size)
            .ok_or_else(|| "حجم تنزيل غير صالح".to_string())?;
        if declared_size.is_some_and(|size| next_size > size) {
            return Err(format!("الحجم الفعلي لـ {} أكبر من المعلن", entry.name));
        }
        if declared_size.is_none() {
            reserve_bytes(&total, chunk_size)?;
        }
        destination
            .write_all(&chunk)
            .await
            .map_err(|error| error.to_string())?;
        downloaded = next_size;
    }
    destination
        .flush()
        .await
        .map_err(|error| error.to_string())?;
    if let Some(size) = declared_size {
        if downloaded != size {
            return Err(format!("اكتمل تنزيل {} بحجم غير متوقع", entry.name));
        }
    }
    Ok(DownloadedEntry {
        entry,
        temporary_file,
    })
}

#[tauri::command]
async fn download_repository_zip(
    file_path: String,
    entries: Vec<RepositoryEntry>,
) -> Result<String, String> {
    let (output, parent) = validate_output_path(&file_path)?;
    if entries.is_empty() {
        return Err("لا توجد ملفات لإنشاء ZIP".to_string());
    }
    let mut names = HashSet::with_capacity(entries.len());
    for entry in &entries {
        validate_entry_name(&entry.name)?;
        if !names.insert(entry.name.clone()) {
            return Err(format!("اسم entry مكرر: {}", entry.name));
        }
        validate_url(&entry.url)?;
    }

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(1800))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())?;
    let temporary_dir = TempDir::new().map_err(|error| error.to_string())?;
    let total = Arc::new(AtomicU64::new(0));
    let temporary_path = temporary_dir.path().to_path_buf();
    let mut downloaded = stream::iter(entries.into_iter().enumerate().map(|(index, entry)| {
        let client = client.clone();
        let temporary_path = temporary_path.clone();
        let total = Arc::clone(&total);
        async move {
            download_entry(client, entry, temporary_path, total)
                .await
                .map(|result| (index, result))
        }
    }))
    .buffer_unordered(MAX_CONCURRENT_DOWNLOADS)
    .try_collect::<Vec<_>>()
    .await?;
    downloaded.sort_by_key(|(index, _)| *index);

    let mut archive = NamedTempFile::new_in(&parent).map_err(|error| error.to_string())?;
    {
        let mut writer = ZipWriter::new(archive.as_file_mut());
        let options = FileOptions::default().compression_method(CompressionMethod::Stored);
        for (_, item) in downloaded {
            writer
                .start_file(&item.entry.name, options)
                .map_err(|error| error.to_string())?;
            let mut source =
                File::open(item.temporary_file.path()).map_err(|error| error.to_string())?;
            io::copy(&mut source, &mut writer).map_err(|error| error.to_string())?;
        }
        writer.finish().map_err(|error| error.to_string())?;
    }
    archive
        .as_file_mut()
        .sync_all()
        .map_err(|error| error.to_string())?;
    archive.persist(&output).map_err(|error| {
        let _ = fs::remove_file(error.file.path());
        error.error.to_string()
    })?;
    Ok(output.to_string_lossy().to_string())
}

fn restore_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// Closing the native window hides it so background uploads can continue; the tray always provides a restore path.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "إظهار Avenmedia", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(
                app,
                "quit",
                "إنهاء Avenmedia بالكامل (يوقف الرفع)",
                true,
                None::<&str>,
            )?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let icon = app
                .default_window_icon()
                .cloned()
                .expect("default window icon is required");
            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => restore_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        restore_main_window(&tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_downloads_folder,
            save_pdf_to_downloads,
            write_export_to_directory,
            download_repository_zip
        ])
        .run(tauri::generate_context!())
        .expect("error while running PhotoMedia ERP");
}

#[cfg(test)]
mod tests {
    use super::{validate_entry_name, validate_url};

    #[test]
    fn rejects_unsafe_archive_names() {
        assert!(validate_entry_name("../secret.jpg").is_err());
        assert!(validate_entry_name("folder\\secret.jpg").is_err());
        assert!(validate_entry_name("folder/secret.jpg").is_ok());
    }

    #[test]
    fn only_accepts_cloudinary_https_urls() {
        assert!(validate_url("https://res.cloudinary.com/demo/image/upload/a.jpg").is_ok());
        assert!(validate_url("http://res.cloudinary.com/demo/a.jpg").is_err());
        assert!(validate_url("https://example.com/a.jpg").is_err());
    }
}
