---
project_name: 'giga-file-uploader'
user_name: 'Shaoyoko'
date: '2026-02-10'
sections_completed:
  ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 42
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

| Technology | Version | Purpose |
|---|---|---|
| Tauri | 2.10.2 | Desktop framework (Rust backend + WebView frontend) |
| React | 19.2.1 | Frontend UI |
| TypeScript | 5.x (strict mode) | Frontend language |
| Rust | stable | Backend language |
| Vite | 7.3.1 | Frontend build tool |
| Tailwind CSS | 4.0 | Styling (`@theme` design tokens, NOT `tailwind.config.js` legacy) |
| Radix UI Primitives | 1.4.3 | Accessible components (Dialog, Toast, Progress, Tabs) |
| Zustand | v5 | State management (3 stores only) |
| Vitest | 4.x | Frontend testing |
| React Testing Library | latest | Component testing |
| tauri-plugin-store | 2.4.2 | Local JSON key-value persistence |
| Lucide React | latest | Icon library |
| Framer Motion | latest | Drag-drop animations |
| tokio | latest | Rust async runtime |
| reqwest | latest | Rust HTTP client |
| ESLint + Prettier | latest | Code quality |
| Clippy + rustfmt | built-in | Rust code quality |

**Version Constraint:** Tailwind CSS 4.0 uses `@theme` directive in CSS, NOT the legacy `tailwind.config.js` approach. All theme tokens defined in `src/App.css`.

---

## Critical Implementation Rules

### Language-Specific Rules

**Rust:**

- Use `#[serde(rename_all = "camelCase")]` on ALL structs that cross the IPC boundary -- Rust uses snake_case internally but JSON payloads MUST be camelCase
- All errors use unified `AppError` type defined in `src-tauri/src/error.rs`, propagated via `?` operator
- Cross-thread communication: `tokio::sync::mpsc` channel; shared state: `Arc<Mutex<T>>` or `Arc<RwLock<T>>`
- No global mutable state -- pass dependencies via function parameters or Tauri managed state
- Module-level constants: `SCREAMING_SNAKE_CASE`

**TypeScript:**

- Path alias `@/` maps to `src/` -- use `@/` for ALL imports, NEVER use relative `../../` paths
- Import order: (1) React/external libs, (2) internal modules via `@/`, (3) type-only imports with `import type`
- Props types use `interface` (not `type`), named `{ComponentName}Props`
- Event handler naming: `handle{Event}` (e.g., `handleFilesDrop`, `handleCopyClick`)

### Framework-Specific Rules

**Tauri IPC:**

- Command names: `snake_case` (Rust convention, Tauri auto-maps)
- Event names: `namespace:action` format, all lowercase, colon-separated (e.g., `upload:progress`, `upload:file-complete`, `upload:error`, `upload:retry-warning`, `upload:all-complete`)
- Frontend invokes commands ONLY through `src/lib/tauri.ts` wrapper, NEVER directly via `invoke()`
- All I/O (file system, network, clipboard) delegated to Rust -- frontend does NOT access these directly

**React:**

- Function components + hooks only, NO class components
- Wrap list item components (`UploadFileItem`, `HistoryItem`) with `React.memo`
- Use Zustand selectors for precise state subscription: `useUploadStore(state => state.tasks[id]?.progress)` -- NEVER destructure entire store
- All state mutations go through Zustand store actions, components NEVER call `set` directly
- No router library -- navigation via Radix UI Tabs + `appStore` state

**Zustand v5:**

- Exactly 3 stores: `uploadStore`, `historyStore`, `appStore` -- do NOT create additional stores
- Store files named `use{Name}Store.ts` pattern but exported as `use{Name}Store`
- Stores do NOT cross-reference each other's internal state -- communicate via events or explicit function calls
- Store actions defined INSIDE the store, not externally

**Tailwind CSS 4.0:**

- Use `@theme` directive in `src/App.css` for design tokens -- NOT `tailwind.config.js`
- Component styling via Tailwind utility classes only -- NO separate CSS/SCSS files per component
- Radix UI primitives styled with Tailwind classes, no CSS-in-JS

### Testing Rules

- Frontend tests: co-located with source, suffix `.test.ts` / `.test.tsx` (e.g., `FileDropZone.test.tsx`)
- Rust tests: inline `#[cfg(test)] mod tests { ... }` for unit tests; `src-tauri/tests/` for integration tests
- Use Vitest + React Testing Library for frontend
- Use `cargo test` for Rust
- No barrel exports (`index.ts`) in component directories -- import components directly by filename

### Code Quality & Style Rules

- ESLint + Prettier for TypeScript, Clippy + rustfmt for Rust
- No barrel files (`index.ts`) anywhere -- each component/module imported by its direct path
- One component per file
- Components organized by feature domain: `upload/`, `history/`, `shared/`
- User-facing error messages in Chinese, warm tone ("..." not technical jargon)
- Log-level errors in English with technical details: `error!("HTTP request failed: status={}, url={}", status, url)`

### Development Workflow Rules

- Package manager: `pnpm` (NOT npm or yarn)
- Starter template: `pnpm create tauri-app giga-file-uploader --template react-ts`
- CI: GitHub Actions (`ci.yml`) -- lint + test + build
- All gigafile.nu API interaction code MUST reside in `src-tauri/src/api/` directory exclusively
- Upper-layer modules (`services/`, `commands/`) call `GigafileApi` trait, NEVER construct HTTP requests directly

### Critical Don't-Miss Rules

**Upload Engine Protocol (gigafile.nu reverse-engineered API):**

- Two-level chunking: 1GB logical shards -> 100MB upload chunks
- FIRST chunk of each shard MUST be sent serially to establish server-side Cookie session
- AFTER first chunk succeeds, remaining chunks can be sent in parallel (default 8 concurrent)
- Order preservation: use counter to ensure chunks "complete" in sequence
- Server discovery: extract active upload server from gigafile.nu homepage HTML BEFORE each upload session -- NEVER hardcode server URLs
- Cookie-based session: all chunks in a shard share the same Cookie jar

**Retry Strategy:**

- Exponential backoff: initial 200ms, max 30s
- Below 50 retries: completely silent to user (NFR10)
- Above 50 retries: emit `upload:retry-warning` event, let user decide
- Single file failure MUST NOT affect other file uploads (NFR12) -- each file has independent error isolation

**Progress Event Flow:**

```
Rust upload thread
  -> every 128KB update internal counter
  -> progress aggregator (debounce 50ms) consolidates all thread progress
  -> Tauri event emit to frontend
  -> Zustand store update
  -> React re-render (only changed file/shard components)
```

**Anti-Patterns (FORBIDDEN):**

- Do NOT call `invoke()` directly in components -- go through store actions
- Do NOT subscribe to entire Zustand store -- use precise selectors
- Do NOT make HTTP requests to gigafile.nu outside `src-tauri/src/api/` directory
- Do NOT use `index.ts` barrel exports
- Do NOT use relative import paths (`../../`) -- use `@/` alias
- Do NOT create separate CSS files for components -- use Tailwind classes
- Do NOT use `tailwind.config.js` -- Tailwind CSS 4.0 uses `@theme` in CSS
- Do NOT add loading spinners for history page (NFR5 requires <1s load)
- Do NOT use boolean flags for loading state -- use status enums (`'pending' | 'uploading' | 'completed' | 'error'`)

---

## Usage Guidelines

**For AI Agents:**

- Read this file AND `_bmad-output/planning-artifacts/architecture.md` before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- All gigafile.nu API code goes in `src-tauri/src/api/` only
- All state changes go through Zustand store actions only

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-02-10
