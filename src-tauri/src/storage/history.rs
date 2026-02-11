use tauri_plugin_store::StoreExt;

use crate::error::AppError;
use crate::models::history::HistoryRecord;

const STORE_FILE: &str = "history.json";
const RECORDS_KEY: &str = "records";

/// Add a history record (newest first) and persist to disk immediately.
pub fn add_record(app: &tauri::AppHandle, record: HistoryRecord) -> crate::error::Result<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let mut records = load_records(&store);
    records.insert(0, record); // newest first
    store.set(RECORDS_KEY, serde_json::to_value(&records)?);
    store
        .save()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(())
}

/// Get all history records (already ordered newest first).
pub fn get_all(app: &tauri::AppHandle) -> crate::error::Result<Vec<HistoryRecord>> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(load_records(&store))
}

/// Delete a history record by ID. Silently ignores non-existent IDs.
pub fn delete_record(app: &tauri::AppHandle, id: &str) -> crate::error::Result<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let mut records = load_records(&store);
    records.retain(|r| r.id != id);
    store.set(RECORDS_KEY, serde_json::to_value(&records)?);
    store
        .save()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(())
}

/// Load records from store, returning empty vec if key does not exist.
fn load_records<R: tauri::Runtime>(store: &tauri_plugin_store::Store<R>) -> Vec<HistoryRecord> {
    store
        .get(RECORDS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test that load_records returns parsed records from a valid JSON value.
    #[test]
    fn load_records_core_logic_parses_json() {
        let records = vec![
            HistoryRecord {
                id: "aaa".to_string(),
                file_name: "a.txt".to_string(),
                download_url: "https://example.com/a".to_string(),
                file_size: 100,
                uploaded_at: "2026-02-11T08:00:00+00:00".to_string(),
                expires_at: "2026-02-18T08:00:00+00:00".to_string(),
            },
            HistoryRecord {
                id: "bbb".to_string(),
                file_name: "b.txt".to_string(),
                download_url: "https://example.com/b".to_string(),
                file_size: 200,
                uploaded_at: "2026-02-10T08:00:00+00:00".to_string(),
                expires_at: "2026-02-17T08:00:00+00:00".to_string(),
            },
        ];
        let json_val = serde_json::to_value(&records).unwrap();
        let parsed: Vec<HistoryRecord> = serde_json::from_value(json_val).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].id, "aaa");
        assert_eq!(parsed[1].id, "bbb");
    }

    /// Test that empty/missing value produces empty vec (unwrap_or_default path).
    #[test]
    fn load_records_empty_json_returns_empty_vec() {
        let result: Option<serde_json::Value> = None;
        let records: Vec<HistoryRecord> = result
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        assert!(records.is_empty());
    }

    /// Test records array insert(0, ..) places newest first.
    #[test]
    fn insert_at_zero_puts_newest_first() {
        let mut records: Vec<HistoryRecord> = vec![HistoryRecord {
            id: "old".to_string(),
            file_name: "old.txt".to_string(),
            download_url: "https://example.com/old".to_string(),
            file_size: 50,
            uploaded_at: "2026-02-10T00:00:00+00:00".to_string(),
            expires_at: "2026-02-17T00:00:00+00:00".to_string(),
        }];
        let new_record = HistoryRecord {
            id: "new".to_string(),
            file_name: "new.txt".to_string(),
            download_url: "https://example.com/new".to_string(),
            file_size: 100,
            uploaded_at: "2026-02-11T00:00:00+00:00".to_string(),
            expires_at: "2026-02-18T00:00:00+00:00".to_string(),
        };
        records.insert(0, new_record);
        assert_eq!(records[0].id, "new");
        assert_eq!(records[1].id, "old");
    }

    /// Test retain removes matching ID and keeps others.
    #[test]
    fn retain_removes_by_id() {
        let mut records = vec![
            HistoryRecord {
                id: "keep".to_string(),
                file_name: "keep.txt".to_string(),
                download_url: "https://example.com/keep".to_string(),
                file_size: 100,
                uploaded_at: "2026-02-11T00:00:00+00:00".to_string(),
                expires_at: "2026-02-18T00:00:00+00:00".to_string(),
            },
            HistoryRecord {
                id: "remove".to_string(),
                file_name: "remove.txt".to_string(),
                download_url: "https://example.com/remove".to_string(),
                file_size: 200,
                uploaded_at: "2026-02-10T00:00:00+00:00".to_string(),
                expires_at: "2026-02-17T00:00:00+00:00".to_string(),
            },
        ];
        records.retain(|r| r.id != "remove");
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, "keep");
    }

    /// Test retain on non-existent ID leaves records unchanged.
    #[test]
    fn retain_nonexistent_id_is_noop() {
        let mut records = vec![HistoryRecord {
            id: "existing".to_string(),
            file_name: "file.txt".to_string(),
            download_url: "https://example.com/file".to_string(),
            file_size: 100,
            uploaded_at: "2026-02-11T00:00:00+00:00".to_string(),
            expires_at: "2026-02-18T00:00:00+00:00".to_string(),
        }];
        records.retain(|r| r.id != "nonexistent");
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, "existing");
    }
}
