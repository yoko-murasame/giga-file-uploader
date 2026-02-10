//! Local persistence layer using tauri-plugin-store.
//!
//! This module handles local persistence of upload history records and user settings
//! via a JSON key-value store. Data is written to disk immediately to ensure crash
//! safety (NFR11).

// TODO: Story 4.1 - pub mod history; (add_record, get_all, delete_record)
// TODO: Story 5.1 - pub mod settings; (get/save settings)

#[cfg(test)]
mod tests {
    #[test]
    fn module_loads() {
        // Verify the storage module can be loaded successfully.
    }
}
