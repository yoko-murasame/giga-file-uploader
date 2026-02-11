# chrono 0.4 — Duration/TimeDelta & Utc API Verification

**Framework:** chrono 0.4
**Confidence:** HIGH
**Source:** Context7 — /websites/rs_chrono_chrono (official docs.rs + API docs)
**Researched:** 2026-02-11

---

## Duration vs TimeDelta

### Status: `chrono::Duration` is a type alias for `TimeDelta`

In chrono 0.4.x, `Duration` has been **replaced by `TimeDelta`** as the primary type. `chrono::Duration` still exists as a **type alias** for backwards compatibility but the canonical type is now `TimeDelta`.

### `Duration::days()` / `TimeDelta::days()`

Both are available. The methods live on `TimeDelta` and are accessible via the `Duration` alias:

```rust
// These are equivalent:
use chrono::TimeDelta;
let d = TimeDelta::days(7);       // Preferred (canonical)

use chrono::Duration;
let d = Duration::days(7);        // Still works (type alias)
```

**Signature:**
```rust
pub const fn days(days: i64) -> TimeDelta    // Panics on overflow
pub const fn try_days(days: i64) -> Option<TimeDelta>  // Safe, returns None on overflow
```

**Recommendation:** Use `TimeDelta::try_days()` in production code to avoid panics. `TimeDelta::days()` panics on out-of-bounds values.

### Full list of constructors

All available on `TimeDelta` (and via `Duration` alias):
- `weeks(i64)` / `try_weeks(i64)`
- `days(i64)` / `try_days(i64)`
- `hours(i64)` / `try_hours(i64)`
- `minutes(i64)` / `try_minutes(i64)`
- `seconds(i64)` / `try_seconds(i64)`
- `milliseconds(i64)` / `try_milliseconds(i64)`
- `microseconds(i64)` — infallible
- `nanoseconds(i64)` — infallible

---

## `Utc::now().to_rfc3339()`

**Confirmed available.** `DateTime<Utc>` implements `to_rfc3339()`:

```rust
use chrono::Utc;

let now = Utc::now();
let rfc3339 = now.to_rfc3339();
// Output: "2024-11-28T12:00:09+00:00"
```

### Additional RFC3339 options

```rust
use chrono::{Utc, SecondsFormat};

let dt = Utc::now();

// Default (auto fractional seconds)
dt.to_rfc3339();
// "2024-11-28T12:00:09+00:00"

// With millisecond precision, Z suffix
dt.to_rfc3339_opts(SecondsFormat::Millis, true);
// "2024-11-28T12:00:09.000Z"
```

### Other formatting methods also available

```rust
dt.to_rfc2822();                    // "Thu, 28 Nov 2024 12:00:09 +0000"
dt.format("%Y-%m-%d %H:%M:%S");    // Custom strftime
dt.to_string();                     // "2024-11-28 12:00:09 UTC"
```

---

## Summary

| API | Status | Notes |
|-----|--------|-------|
| `chrono::Duration::days()` | Available (alias) | Works via type alias to `TimeDelta` |
| `chrono::TimeDelta::days()` | Available (canonical) | Preferred. Panics on overflow. |
| `chrono::TimeDelta::try_days()` | Available | Safe alternative, returns `Option` |
| `Utc::now()` | Available | Returns `DateTime<Utc>` |
| `.to_rfc3339()` | Available | On any `DateTime<Tz>` |
| `.to_rfc3339_opts()` | Available | Control precision and Z suffix |
