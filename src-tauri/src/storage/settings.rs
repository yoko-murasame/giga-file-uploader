use tauri_plugin_store::StoreExt;

use crate::error::AppError;
use crate::models::settings::AppSettings;

const STORE_FILE: &str = "settings.json";
const SETTINGS_KEY: &str = "settings";

/// Read application settings. Returns defaults if no settings saved.
pub fn get_settings(app: &tauri::AppHandle) -> crate::error::Result<AppSettings> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let settings = store
        .get(SETTINGS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(settings)
}

/// Save application settings. Persists to disk immediately.
pub fn save_settings(app: &tauri::AppHandle, settings: AppSettings) -> crate::error::Result<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    store.set(SETTINGS_KEY, serde_json::to_value(&settings)?);
    store
        .save()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::models::settings::AppSettings;

    /// Test that AppSettings JSON roundtrip preserves values.
    #[test]
    fn settings_json_roundtrip() {
        let original = AppSettings { retention_days: 60 };
        let json_val = serde_json::to_value(&original).unwrap();
        let restored: AppSettings = serde_json::from_value(json_val).unwrap();
        assert_eq!(restored.retention_days, 60);
    }

    /// Test that missing/None value falls back to default.
    #[test]
    fn missing_value_returns_default() {
        let result: Option<serde_json::Value> = None;
        let settings: AppSettings = result
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        assert_eq!(settings.retention_days, 7);
    }
}
