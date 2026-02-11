//! Data models for the giga-file-uploader application.
//!
//! This module contains shared data structure definitions used across the application,
//! including upload task models, history records, and configuration types.

pub mod file;

pub mod upload;
pub mod history;
pub mod settings;

#[cfg(test)]
mod tests {
    #[test]
    fn module_loads() {
        // Verify the models module can be loaded successfully.
    }
}
