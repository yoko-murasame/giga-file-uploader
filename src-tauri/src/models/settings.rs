use serde::{Deserialize, Serialize};

/// Application-level settings persisted to settings.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// File retention days on gigafile.nu: 3/5/7/14/30/60/100
    pub retention_days: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self { retention_days: 7 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_camel_case_key() {
        let settings = AppSettings { retention_days: 14 };
        let json = serde_json::to_string(&settings).unwrap();
        assert!(
            json.contains("retentionDays"),
            "Expected camelCase key 'retentionDays' in JSON, got: {}",
            json
        );
        assert!(
            !json.contains("retention_days"),
            "Should not contain snake_case key 'retention_days' in JSON, got: {}",
            json
        );
    }

    #[test]
    fn serde_roundtrip() {
        let original = AppSettings { retention_days: 30 };
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.retention_days, 30);
    }

    #[test]
    fn default_retention_days_is_7() {
        let settings = AppSettings::default();
        assert_eq!(settings.retention_days, 7);
    }
}
