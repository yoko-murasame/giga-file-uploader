# React HTML5 Drag and Drop for File Upload

**Framework:** React + TypeScript
**Topic:** HTML5 drag and drop events for file upload UI
**Confidence:** High
**Source:** WebSearch - multiple authoritative sources
**Researched:** 2026-02-11

## Overview

HTML5 drag and drop API provides native browser events for implementing drag-and-drop file upload interfaces. In a Tauri app context, this is used for **visual feedback** (hover states, drop zone highlighting), while actual file path resolution comes from Tauri's `onDragDropEvent`.

## Core Events

| Event | Fires When | Key Actions |
|-------|-----------|-------------|
| `dragenter` | Dragged item enters a valid drop target | Set `isDragging = true`, visual feedback |
| `dragover` | Continuously while dragged item is over target | **Must** call `e.preventDefault()` to allow drop |
| `dragleave` | Dragged item leaves the drop target | Set `isDragging = false`, remove visual feedback |
| `drop` | Item is released over a valid drop target | **Must** call `e.preventDefault()`, process files |

## Important: preventDefault() is Required

Both `dragover` and `drop` events MUST call `e.preventDefault()` to override the browser's default behavior. Without this, the browser will navigate to the dropped file instead of allowing your handler to process it.

## React Implementation Pattern

```typescript
import { useState, useCallback, DragEvent } from 'react';

interface DropZoneProps {
  onFileDrop?: (files: File[]) => void;
  children: React.ReactNode;
}

function DropZone({ onFileDrop, children }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFileDrop?.(files);
    }
  }, [onFileDrop]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={isDragging ? 'drop-zone-active' : 'drop-zone'}
    >
      {children}
    </div>
  );
}
```

## The dragenter/dragleave Counter Pattern

A critical gotcha: `dragenter` and `dragleave` fire for **every child element** inside the drop zone. Without a counter, the `isDragging` state flickers as the cursor moves over child elements.

**Solution:** Use a `dragCounter` ref:
- Increment on every `dragenter`
- Decrement on every `dragleave`
- Only set `isDragging = false` when counter reaches 0
- Reset counter to 0 on `drop`

## Tauri-Specific Considerations

In a Tauri v2 app, the HTML5 drag events and Tauri's `onDragDropEvent` fire simultaneously when files are dragged from the OS:

1. **Use HTML5 events for visual feedback** (`isDragging` state for styling the drop zone)
2. **Use Tauri `onDragDropEvent` for file path capture** (provides native `string[]` paths)
3. **Do NOT use `e.dataTransfer.files`** from the HTML5 drop event in Tauri - these are sandboxed browser File objects, not native paths. The Tauri event gives you the actual filesystem paths needed for the Rust backend.

### Recommended Hybrid Pattern for Tauri

```typescript
// Visual feedback via HTML5 events (on the React component)
// File path capture via Tauri API (in a useEffect hook)

// The HTML5 events handle: isDragging state for CSS classes
// The Tauri event handles: actual file paths -> uploadStore.addFiles(paths)
```

## Best Practices Summary

1. Always `preventDefault()` on `dragover` and `drop`
2. Use drag counter ref pattern to prevent flickering on child elements
3. Provide clear visual feedback (border color, background change, icon) when `isDragging`
4. In Tauri: rely on `onDragDropEvent` for paths, HTML5 events only for visual state
5. `useCallback` for all event handlers to prevent unnecessary re-renders
6. Reset all drag state in the `drop` handler
