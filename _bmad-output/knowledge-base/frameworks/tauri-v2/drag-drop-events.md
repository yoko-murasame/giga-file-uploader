# Tauri 2 File Drag and Drop API

**Framework:** Tauri v2
**Topic:** File drag and drop event handling
**Confidence:** High
**Source:** Context7 - v2.tauri.app official docs
**Researched:** 2026-02-11

## Overview

Tauri v2 provides native file drag-and-drop support via the `onDragDropEvent` method on the Webview object. This API intercepts OS-level file drag events before they reach the web layer, providing native file paths (not browser File objects).

## API

```typescript
import { getCurrentWebview } from "@tauri-apps/api/webview";

const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
  if (event.payload.type === 'over') {
    console.log('User hovering', event.payload.position);
  } else if (event.payload.type === 'drop') {
    console.log('User dropped', event.payload.paths);
  } else if (event.payload.type === 'cancel') {
    console.log('File drop cancelled');
  }
});

// MUST call unlisten when component unmounts to avoid memory leaks
unlisten();
```

## Event Payload Types

| Type | Description | Payload Properties |
|------|-------------|-------------------|
| `over` | User is hovering files over the webview | `position: { x: number, y: number }` |
| `drop` | User dropped files on the webview | `paths: string[]` (native file paths) |
| `cancel` | User cancelled the drag-drop operation | (none) |

## Key Points

1. **Import source:** `@tauri-apps/api/webview` (core API, no plugin needed)
2. **Returns native file paths** (`string[]`), not browser `File` objects - these are absolute filesystem paths
3. **Unlisten is mandatory** - the returned function must be called on component unmount to prevent memory leaks
4. **Known limitation:** When the debugger panel is open, the drop position may be inaccurate. Detach the debugger for correct position data.
5. **Scope:** The paths returned are already accessible to the Rust backend - no additional filesystem scope grants needed for reading

## React Integration Pattern

```typescript
import { useEffect } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

function useFileDrop(onDrop: (paths: string[]) => void, onHover?: (hovering: boolean) => void) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'over') {
        onHover?.(true);
      } else if (event.payload.type === 'drop') {
        onHover?.(false);
        onDrop(event.payload.paths);
      } else {
        onHover?.(false);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [onDrop, onHover]);
}
```

## Difference from HTML5 Drag and Drop

- **Tauri `onDragDropEvent`**: Intercepts OS-level file drags, provides native file paths. Works for files dragged FROM the OS file manager INTO the app window.
- **HTML5 drag events**: Handle in-browser drag operations (element-to-element). For files, provides `File` objects via `dataTransfer.files`, but these are sandboxed browser objects, not native paths.
- **For this project**: Use Tauri's `onDragDropEvent` for the primary file drop functionality since we need native file paths to pass to the Rust backend for upload.
