---
name: precise-git-commit
id: U3
description: "Safe, precise git commits with per-file staging, sensitive file safeguard, configurable commit patterns, and post-Story squash support"
module: bso
agent: shared
type: utility
version: 1.1.0
status: validated
created: 2026-02-07
updated: 2026-02-07
---

# Workflow Specification: precise-git-commit

**Module:** bso
**Status:** Implemented — workflow.md created and validated
**Created:** 2026-02-07
**Updated:** 2026-02-07

---

## Workflow Overview

**Goal:** Safe, precise git commits with per-file staging, sensitive file protection, and squash support.

**Description:** Per-file git add (never bulk), sensitive file pattern detection, commit message from configured patterns, post-commit verification, and post-Story squash when configured.

**Workflow Type:** Utility (U3)

---

## Planned Steps

| Step | Name | Goal |
|------|------|------|
| 1 | Diff Snapshot | Capture current git diff (staged + unstaged), validate files exist in diff |
| 2 | Sensitive Scan | Check changed files against sensitive patterns (.env, credentials, keys, tokens, certs, SSH, AWS) |
| 3 | Per-File Stage | git add each file individually (never git add -A) |
| 4 | Commit | Commit with pattern from git_commit_patterns config |
| 5 | Post-Commit Verification | Compare post-commit diff with pre-commit snapshot, detect unexpected changes |
| 6 | Squash Decision | If Story reaches 'done' + git_squash_strategy == per_story, proceed to squash |
| 7 | Squash Execute | Squash all Story commits into one clean commit via git reset --soft |

---

## Workflow Inputs

### Required Inputs

- `mode`: Operation mode — `"commit"` or `"squash"`
- `project_root`: Project root directory (must be a git repository)

### Commit Mode Required

- `files`: List of file paths to commit (absolute paths)
- `commit_type`: One of `story_created` | `story_revised` | `dev_complete` | `review_complete` | `fix_complete`
- `story_key`: Story identifier (format: `{epic}-{story}`, e.g., "3-1")
- `session_id`: Sprint session tracking ID

### Commit Mode Optional

- `title`: Story title (used in commit message template)
- `round`: Review round number (for `review_complete` / `fix_complete`)
- `description`: Fix description (for `fix_complete`)
- `extra_message`: Additional text appended to commit message

### Squash Mode Required

- `story_key`: Story identifier to squash
- `title`: Story title (used in squash commit message)
- `session_id`: Sprint session tracking ID

### Squash Mode Optional

- `squash_strategy`: Override `git_squash_strategy` from config (`per_story` | `per_phase` | `none`)

---

## Workflow Outputs

### Return Value

```yaml
status: "success" | "blocked" | "failure"
mode: "commit" | "squash"
session_id: "sprint-2026-02-07-001"
results:
  # commit mode:
  commit_hash: "abc1234"
  commit_message: "docs: Story 3.1: ..."
  files_staged: ["/path/to/file1"]
  files_skipped: []
  # squash mode:
  squash_strategy: "per_story"
  commits_squashed: 5
  final_commit_hash: "def5678"
  final_commit_message: "feat: Story 3.1: ..."
sensitive_files_detected: []
errors: []
warnings: []
```

---

## Sensitive File Patterns

- `.env`, `.env.*`
- `*credentials*`, `*secrets*`, `*password*`
- `*token*` (exclude: `*tokenize*`, `*tokenizer*`, `*.md`)
- `*.pem`, `*.key` (exclude: `*.keyboard*`, `package-lock.json`), `*.p12`, `*.pfx`, `*.jks`, `*.keystore`
- SSH keys: `id_rsa`, `id_ed25519`, `id_dsa`
- AWS / Cloud: `*aws_access_key*`, `*.tfvars`
- If detected: BLOCK commit immediately, return `status: "blocked"` to caller

---

## Error Handling

| Scenario | Step | Severity | Status Returned |
|----------|------|----------|-----------------|
| Not a git repository | 1 | Fatal | `failure` |
| git diff command failed | 1 | Fatal | `failure` |
| Sensitive file detected | 2 | Critical | `blocked` |
| All files failed to stage | 3 | Fatal | `failure` |
| Partial files failed to stage | 3 | Warning | `success` (with warnings) |
| Pre-commit hook failed | 4 | Fatal | `failure` |
| Nothing to commit | 4 | Warning | `failure` |
| Unexpected changes after commit | 5 | Warning | `success` (with warnings) |
| Squash commit range invalid | 6 | Warning | `success` (with warnings) |
| Git reset --soft failed | 7 | Fatal | `failure` |
| Code changes lost during squash | 7 | Critical | `failure` |

---

## Agent Integration

### Primary Agent

Shared utility — no dedicated Agent. Called inline by multiple Agent workflows.

### Callers

| Caller | Scenario | commit_type |
|--------|----------|-------------|
| Story Creator (C2) | Story document created | `story_created` |
| Story Creator (C2) | Story document revised | `story_revised` |
| Dev Runner (C4) | Development complete | `dev_complete` |
| Review Runner (C5) | Code review report complete | `review_complete` |
| Review Runner (C5) | Fix applied after review | `fix_complete` |
| Orchestrator | Story reaches done, execute squash | `squash` |

---

_Spec created on 2026-02-07 via BMAD Module workflow_
_Updated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode (YOLO auto-fix)_
