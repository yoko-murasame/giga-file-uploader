# tauri-plugin-store v2 — Rust API Verification

**Framework:** tauri-plugin-store v2
**Confidence:** HIGH
**Source:** Context7 — /tauri-apps/plugins-workspace (official docs + README)
**Researched:** 2026-02-11

---

## StoreExt Trait

`tauri_plugin_store::StoreExt` is an extension trait on the Tauri `App` / `AppHandle`.

### `app.store("file.json")`

```rust
use tauri_plugin_store::StoreExt;

let store = app.store("app_data.json")?;
```

- **Returns:** `Result<Store<R>>` where `R` is the Tauri runtime type parameter (typically `tauri::Wry`).
- The `?` propagation confirms it returns a `Result`.
- This call **loads the store from disk** (or creates it if not exists).

### Store Methods (Rust side)

All Rust-side store methods are **synchronous** (blocking, no `async`/`.await`):

| Method | Signature | Notes |
|--------|-----------|-------|
| `store.get(key)` | `fn get(&self, key: &str) -> Option<serde_json::Value>` | Returns `Option`, not `Result` |
| `store.set(key, value)` | `fn set(&self, key: String, value: serde_json::Value)` | Takes `String` key, `serde_json::Value` value. No return value (unit). |
| `store.save()` | `fn save(&self) -> Result<()>` | Persists to disk. Returns `Result`. |
| `store.delete(key)` | `fn delete(&self, key: &str) -> bool` | Returns whether key existed |

### Important Notes

1. **Values must be `serde_json::Value`** — use `serde_json::json!()` macro for construction. This ensures compatibility with JavaScript bindings.
2. **The `Store<R>` type parameter** `R` is the Tauri runtime generic (e.g., `tauri::Wry`). In practice, you rarely need to specify it explicitly as it's inferred from the app handle.
3. **JavaScript side is fully async** — `store.get()`, `store.set()`, `store.save()` all return Promises. Only the Rust side is synchronous.

### Verified Code Example (from official README)

```rust
use tauri_plugin_store::StoreExt;
use serde_json::json;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let store = app.store("app_data.json")?;
            store.set("a".to_string(), json!("b"));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```
