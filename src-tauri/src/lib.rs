use tauri::Manager;

pub mod api;
pub mod commands;
pub mod error;
pub mod models;
pub mod services;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let upload_state = commands::upload::UploadState::new(app.handle().clone());
            app.manage(upload_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::files::resolve_dropped_paths,
            commands::upload::start_upload,
            commands::upload::cancel_upload,
            commands::history::get_history,
            commands::history::delete_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
