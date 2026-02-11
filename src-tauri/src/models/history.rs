use serde::{Deserialize, Serialize};

/// A single upload history record persisted to local storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    /// Unique identifier (UUID v4 hex, 32 chars).
    pub id: String,
    /// Original file name.
    pub file_name: String,
    /// Download URL from gigafile.nu.
    pub download_url: String,
    /// File size in bytes.
    pub file_size: u64,
    /// Upload timestamp in ISO 8601 format (e.g., "2026-02-11T08:30:00+00:00").
    pub uploaded_at: String,
    /// Expiration timestamp in ISO 8601 format, calculated as uploaded_at + lifetime days.
    pub expires_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_record() -> HistoryRecord {
        HistoryRecord {
            id: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4".to_string(),
            file_name: "test.zip".to_string(),
            download_url: "https://46.gigafile.nu/abc123".to_string(),
            file_size: 1024,
            uploaded_at: "2026-02-11T08:30:00+00:00".to_string(),
            expires_at: "2026-02-18T08:30:00+00:00".to_string(),
        }
    }

    #[test]
    fn serde_camel_case_keys() {
        let record = sample_record();
        let json = serde_json::to_value(&record).unwrap();
        assert!(json.get("id").is_some());
        assert!(json.get("fileName").is_some());
        assert!(json.get("downloadUrl").is_some());
        assert!(json.get("fileSize").is_some());
        assert!(json.get("uploadedAt").is_some());
        assert!(json.get("expiresAt").is_some());
        // Ensure snake_case keys are NOT present
        assert!(json.get("file_name").is_none());
        assert!(json.get("download_url").is_none());
        assert!(json.get("file_size").is_none());
        assert!(json.get("uploaded_at").is_none());
        assert!(json.get("expires_at").is_none());
    }

    #[test]
    fn serde_roundtrip() {
        let record = sample_record();
        let json_str = serde_json::to_string(&record).unwrap();
        let deserialized: HistoryRecord = serde_json::from_str(&json_str).unwrap();
        assert_eq!(record.id, deserialized.id);
        assert_eq!(record.file_name, deserialized.file_name);
        assert_eq!(record.download_url, deserialized.download_url);
        assert_eq!(record.file_size, deserialized.file_size);
        assert_eq!(record.uploaded_at, deserialized.uploaded_at);
        assert_eq!(record.expires_at, deserialized.expires_at);
    }
}
