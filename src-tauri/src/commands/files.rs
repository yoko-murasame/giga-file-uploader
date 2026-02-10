//! File resolution command for drag-and-drop support.
//!
//! Resolves dropped paths into a flat list of file entries. Directories are
//! recursively traversed. Hidden files and known system files are filtered out.

use crate::error::AppError;
use crate::models::file::FileEntry;
use std::path::Path;

/// System file names that should be filtered out regardless of location.
const SYSTEM_FILES: &[&str] = &[".DS_Store", "Thumbs.db", "desktop.ini"];

/// Directory names that should be skipped during recursive traversal.
const SYSTEM_DIRS: &[&str] = &["__MACOSX"];

/// Returns true if the given file/directory name should be excluded.
fn is_hidden_or_system(name: &str) -> bool {
    name.starts_with('.') || SYSTEM_FILES.contains(&name) || SYSTEM_DIRS.contains(&name)
}

/// Adds a single file entry without filtering (used for user-provided top-level paths).
fn add_file_entry(path: &Path, entries: &mut Vec<FileEntry>) -> Result<(), AppError> {
    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return Ok(()),
    };
    let metadata = std::fs::metadata(path)?;
    entries.push(FileEntry {
        file_name: name.to_string(),
        file_path: path.to_string_lossy().to_string(),
        file_size: metadata.len(),
    });
    Ok(())
}

/// Recursively collects file entries from a directory's contents.
///
/// Hidden and system files/directories are filtered out during traversal.
/// This is only applied to children discovered during recursion, not to
/// user-provided top-level paths.
fn collect_dir_contents(dir: &Path, entries: &mut Vec<FileEntry>) -> Result<(), AppError> {
    let read_dir = std::fs::read_dir(dir)?;
    for entry in read_dir {
        let entry = entry?;
        let child = entry.path();
        let name = match child.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        if is_hidden_or_system(name) {
            continue;
        }
        if child.is_file() {
            add_file_entry(&child, entries)?;
        } else if child.is_dir() {
            collect_dir_contents(&child, entries)?;
        }
    }
    Ok(())
}

/// Resolves dropped file/directory paths into a flat list of file entries.
///
/// - Regular files are returned directly.
/// - Directories are recursively traversed.
/// - Hidden files (names starting with `.`) and system files
///   (`.DS_Store`, `Thumbs.db`, `desktop.ini`, `__MACOSX`) are filtered out.
/// - Returns an error if any path does not exist.
#[tauri::command]
pub async fn resolve_dropped_paths(paths: Vec<String>) -> Result<Vec<FileEntry>, String> {
    tokio::task::spawn_blocking(move || resolve_paths_inner(paths))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

fn resolve_paths_inner(paths: Vec<String>) -> crate::error::Result<Vec<FileEntry>> {
    let mut entries = Vec::new();
    for path_str in &paths {
        let path = Path::new(path_str);
        if !path.exists() {
            return Err(AppError::Io(format!("Path does not exist: {}", path_str)));
        }
        if path.is_file() {
            add_file_entry(path, &mut entries)?;
        } else if path.is_dir() {
            collect_dir_contents(path, &mut entries)?;
        }
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_empty_paths_returns_empty() {
        let result = resolve_paths_inner(vec![]);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_single_file_path() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "hello").unwrap();

        let result = resolve_paths_inner(vec![file_path.to_string_lossy().to_string()]);
        assert!(result.is_ok());

        let entries = result.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].file_name, "test.txt");
        assert_eq!(entries[0].file_size, 5);
    }

    #[test]
    fn test_directory_recursive_traversal() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.txt"), "aaa").unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        fs::write(sub.join("b.txt"), "bb").unwrap();

        let result = resolve_paths_inner(vec![dir.path().to_string_lossy().to_string()]);
        assert!(result.is_ok());

        let entries = result.unwrap();
        assert_eq!(entries.len(), 2);
        let names: Vec<&str> = entries.iter().map(|e| e.file_name.as_str()).collect();
        assert!(names.contains(&"a.txt"));
        assert!(names.contains(&"b.txt"));
    }

    #[test]
    fn test_hidden_files_filtered() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("visible.txt"), "yes").unwrap();
        fs::write(dir.path().join(".hidden"), "no").unwrap();
        fs::write(dir.path().join(".DS_Store"), "no").unwrap();

        let result = resolve_paths_inner(vec![dir.path().to_string_lossy().to_string()]);
        let entries = result.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].file_name, "visible.txt");
    }

    #[test]
    fn test_system_files_filtered() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("real.txt"), "yes").unwrap();
        fs::write(dir.path().join("Thumbs.db"), "no").unwrap();
        fs::write(dir.path().join("desktop.ini"), "no").unwrap();

        let result = resolve_paths_inner(vec![dir.path().to_string_lossy().to_string()]);
        let entries = result.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].file_name, "real.txt");
    }

    #[test]
    fn test_system_dirs_filtered() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("real.txt"), "data").unwrap();
        let macosx = dir.path().join("__MACOSX");
        fs::create_dir(&macosx).unwrap();
        fs::write(macosx.join("junk.txt"), "junk").unwrap();

        let result = resolve_paths_inner(vec![dir.path().to_string_lossy().to_string()]);
        let entries = result.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].file_name, "real.txt");
    }

    #[test]
    fn test_nonexistent_path_returns_error() {
        let result = resolve_paths_inner(vec!["/nonexistent/path/xyz".to_string()]);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("does not exist"), "Error: {}", err);
    }

    #[test]
    fn test_mixed_files_and_directories() {
        let dir = tempfile::tempdir().unwrap();
        let file1 = dir.path().join("standalone.txt");
        fs::write(&file1, "solo").unwrap();
        let subdir = dir.path().join("folder");
        fs::create_dir(&subdir).unwrap();
        fs::write(subdir.join("nested.txt"), "nested").unwrap();

        let result = resolve_paths_inner(vec![
            file1.to_string_lossy().to_string(),
            subdir.to_string_lossy().to_string(),
        ]);
        let entries = result.unwrap();
        assert_eq!(entries.len(), 2);
        let names: Vec<&str> = entries.iter().map(|e| e.file_name.as_str()).collect();
        assert!(names.contains(&"standalone.txt"));
        assert!(names.contains(&"nested.txt"));
    }

    #[test]
    fn test_is_hidden_or_system() {
        assert!(is_hidden_or_system(".hidden"));
        assert!(is_hidden_or_system(".DS_Store"));
        assert!(is_hidden_or_system("Thumbs.db"));
        assert!(is_hidden_or_system("desktop.ini"));
        assert!(is_hidden_or_system("__MACOSX"));
        assert!(!is_hidden_or_system("normal.txt"));
        assert!(!is_hidden_or_system("my_file.rs"));
    }
}
