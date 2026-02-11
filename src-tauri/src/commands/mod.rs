//! Tauri IPC command handlers.
//!
//! This module is the entry point for frontend `invoke()` calls. Command handlers
//! perform parameter parsing and forward to the `services` layer for business logic.
//! Commands should not contain business logic directly.

pub mod files;

pub mod upload;
pub mod history;
// TODO: Story 5.1 - pub mod settings; (get_settings, save_settings)

#[cfg(test)]
mod tests {
    #[test]
    fn module_loads() {
        // Verify the commands module can be loaded successfully.
    }
}
