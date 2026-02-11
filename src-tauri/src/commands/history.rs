use crate::models::history::HistoryRecord;
use crate::storage::history;

#[tauri::command]
pub fn get_history(app: tauri::AppHandle) -> Result<Vec<HistoryRecord>, String> {
    history::get_all(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_history(id: String, app: tauri::AppHandle) -> Result<(), String> {
    history::delete_record(&app, &id).map_err(|e| e.to_string())
}
