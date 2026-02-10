# Tauri 2 File Dialog API (tauri-plugin-dialog)

**Framework:** Tauri v2 / tauri-plugin-dialog
**Topic:** Native file picker dialog
**Confidence:** High
**Source:** Context7 - v2.tauri.app official docs
**Researched:** 2026-02-11

## Overview

`tauri-plugin-dialog` provides a native file/directory picker dialog via the `open()` function. Selected paths are temporarily added to the filesystem and asset protocol scopes for the session.

## Installation

```bash
# Add the plugin to Cargo.toml (Rust side)
cargo add tauri-plugin-dialog

# Add the JS bindings
pnpm add @tauri-apps/plugin-dialog
```

Register in `lib.rs`:
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
```

## API - open()

```typescript
import { open } from '@tauri-apps/plugin-dialog';
```

### Select Multiple Files with Filter

```typescript
const selected = await open({
  multiple: true,
  filters: [{
    name: 'Image',
    extensions: ['png', 'jpeg']
  }]
});

if (Array.isArray(selected)) {
  // user selected multiple files - selected is string[]
} else if (selected === null) {
  // user cancelled the selection
} else {
  // user selected a single file - selected is string
}
```

### Select Directories

```typescript
import { open } from '@tauri-apps/plugin-dialog';
import { appDir } from '@tauri-apps/api/path';

const selected = await open({
  directory: true,
  multiple: true,
  defaultPath: await appDir(),
});
```

## OpenDialogOptions

| Option | Type | Description |
|--------|------|-------------|
| `multiple` | `boolean` | Allow selecting multiple files/directories |
| `directory` | `boolean` | Select directories instead of files |
| `filters` | `DialogFilter[]` | File type filters (name + extensions array) |
| `defaultPath` | `string` | Initial directory to open in |
| `title` | `string` | Dialog window title |
| `canCreateDirectories` | `boolean` | Allow creating new directories (macOS) |
| `recursive` | `boolean` | Recursive directory selection |

## Return Types

| Scenario | Return Type |
|----------|-------------|
| `multiple: false` (default), file selected | `string` (single path) |
| `multiple: true`, file(s) selected | `string[]` (array of paths) |
| User cancelled | `null` |

## Key Points

1. **Returns native file paths** (`string` or `string[]`) - same format as `onDragDropEvent` paths
2. **Scope is session-only** - selected paths are added to filesystem scope but cleared on app restart
3. **No additional permissions needed** - the dialog plugin handles scope grants automatically
4. **Since:** Tauri v2.0.0
5. **Source:** `@tauri-apps/plugin-dialog` (not core API - requires plugin installation)

## Integration with Upload Flow

For this project, the file picker serves as an alternative to drag-and-drop:

```typescript
import { open } from '@tauri-apps/plugin-dialog';

async function handleFilePickerClick() {
  const paths = await open({
    multiple: true,
    // No filters - gigafile.nu accepts all file types
  });

  if (paths === null) return; // cancelled

  const filePaths = Array.isArray(paths) ? paths : [paths];
  // Pass filePaths to uploadStore to create upload tasks
}
```
