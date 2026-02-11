use crate::models::settings::AppSettings;
use crate::storage::settings;

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    settings::get_settings(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(settings_data: AppSettings, app: tauri::AppHandle) -> Result<(), String> {
    settings::save_settings(&app, settings_data).map_err(|e| e.to_string())
}
