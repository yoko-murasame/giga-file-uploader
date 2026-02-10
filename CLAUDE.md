# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Giga File Uploader — a Tauri 2 desktop app for uploading files to gigafile.nu. Rust backend handles file I/O, chunked uploads, and network; React frontend provides the UI.

## Commands

```bash
# Install dependencies
pnpm install

# Frontend dev server (port 1420)
pnpm dev

# Full Tauri desktop app (frontend + Rust backend)
pnpm tauri dev

# Build production
pnpm build          # frontend only
pnpm tauri build    # full desktop app

# Tests
pnpm test           # Vitest (frontend, single run)
pnpm test:watch     # Vitest (watch mode)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests

# Run a single frontend test file
pnpm vitest run src/stores/appStore.test.ts

# Lint & format
pnpm lint           # ESLint
pnpm format         # Prettier (write)
pnpm format:check   # Prettier (check only)
cd src-tauri && cargo clippy   # Rust lint
cd src-tauri && cargo fmt      # Rust format
```

## Architecture

### Three-Layer Stack

```
Frontend (React/TS)  ──invoke()──>  Commands (Rust)  ──>  Services (Rust)
     │                                   │                      │
  Zustand stores                   Parameter parsing      Business logic
  UI components                    IPC boundary            (upload engine,
                                                           chunk manager,
                                                           retry, progress)
                                                                │
                                                    ┌───────────┼───────────┐
                                                  API layer          Storage layer
                                              (gigafile.nu HTTP)   (tauri-plugin-store)
```

### Frontend (`src/`)

- **Navigation**: Radix UI Tabs + `appStore.currentTab` (no router library)
- **State**: Zustand v5 with exactly 3 stores: `appStore`, `uploadStore`, `historyStore`. No additional stores.
- **Components**: organized by feature domain — `upload/`, `history/`, `shared/`
- **Tauri IPC**: all calls go through `src/lib/tauri.ts`, never call `invoke()` directly in components
- **Styling**: Tailwind CSS 4.0 with `@theme` tokens in `src/App.css` (not `tailwind.config.js`)

### Backend (`src-tauri/src/`)

- `lib.rs` — Tauri app builder, plugin registration, command handler registration
- `error.rs` — unified `AppError` enum (Network/Api/Storage/Io/Internal), used across all modules
- `commands/` — Tauri IPC handlers (thin layer, no business logic)
- `services/` — business logic (upload engine, chunk manager, retry, progress)
- `api/` — `GigafileApi` trait; ALL HTTP interactions with gigafile.nu live here exclusively
- `models/` — shared data structures
- `storage/` — local persistence via tauri-plugin-store

### Upload Protocol (gigafile.nu)

- Two-level chunking: 1GB logical shards -> 100MB upload chunks
- First chunk of each shard sent serially (establishes Cookie session), then parallel (default 8 concurrent)
- Server URL discovered dynamically from gigafile.nu homepage HTML before each session
- Progress: Rust threads -> aggregator (50ms debounce) -> Tauri event -> Zustand -> React

## Key Rules

### TypeScript

- Path alias `@/` = `src/` — always use `@/`, never relative `../../`
- Import order: (1) React/external, (2) internal `@/`, (3) `import type`
- Props interfaces named `{ComponentName}Props`
- Event handlers named `handle{Event}`
- Zustand: use precise selectors (`useUploadStore(s => s.tasks[id]?.progress)`), never destructure entire store
- State mutations only through store actions, components never call `set` directly
- No barrel exports (`index.ts`) — import by direct filename
- One component per file, wrap list items with `React.memo`
- No separate CSS files per component — Tailwind classes only
- Use status enums (`'pending' | 'uploading' | 'completed' | 'error'`), not boolean flags

### Rust

- `#[serde(rename_all = "camelCase")]` on all IPC-boundary structs
- All errors use `AppError` with `?` propagation
- Tauri command names: `snake_case`; event names: `namespace:action` lowercase
- No global mutable state — use function params or Tauri managed state
- Concurrency: `tokio::sync::mpsc` for channels, `Arc<Mutex<T>>` / `Arc<RwLock<T>>` for shared state
- gigafile.nu HTTP code must stay in `src-tauri/src/api/` only

### Testing

- Frontend: co-located `.test.ts` / `.test.tsx` files, Vitest + React Testing Library
- Rust: inline `#[cfg(test)] mod tests` for unit tests, `src-tauri/tests/` for integration
- Test setup: `src/test/setup.ts` (imports `@testing-library/jest-dom`)

### Code Quality

- Package manager: `pnpm` only
- ESLint + Prettier (TS), Clippy + rustfmt (Rust)
- User-facing messages in Chinese; log/error messages in English
- Retry: silent below 50 retries, emit `upload:retry-warning` above 50
- Single file failure must not affect other uploads (independent error isolation)

## BMAD Project Context

Detailed architecture and planning artifacts are in `_bmad-output/`:
- `project-context.md` — comprehensive rules for AI agents
- `planning-artifacts/architecture.md` — full system architecture
- `planning-artifacts/prd.md` — product requirements
- `planning-artifacts/epics.md` — epic/story breakdown
- `implementation-artifacts/` — individual story specs
