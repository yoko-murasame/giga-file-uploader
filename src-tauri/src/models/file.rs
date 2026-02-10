//! File entry model for drag-and-drop file resolution.

/// Represents a resolved file entry returned to the frontend.
///
/// Used by the `resolve_dropped_paths` command to return file metadata
/// after recursively resolving dropped paths (files and directories).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
}
