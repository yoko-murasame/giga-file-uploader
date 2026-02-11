//! Business logic layer.
//!
//! This module contains the core business logic for the application, including
//! the upload engine, chunk manager, retry engine, and progress aggregator.
//! Called by the `commands` layer; delegates HTTP interactions to the `api` layer
//! and persistence to the `storage` layer.

pub mod chunk_manager;
pub mod progress;
pub mod retry_engine;
pub mod upload_engine;

#[cfg(test)]
mod tests {
    #[test]
    fn module_loads() {
        // Verify the services module can be loaded successfully.
    }
}
