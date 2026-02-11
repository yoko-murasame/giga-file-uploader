use crate::api::v1;

#[tauri::command]
pub async fn check_network() -> Result<bool, String> {
    Ok(v1::check_connectivity().await)
}
