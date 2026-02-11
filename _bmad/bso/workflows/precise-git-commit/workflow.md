---
name: precise-git-commit
id: U3
description: "Safe, precise git commits with per-file staging, sensitive file safeguard, configurable commit patterns, and post-Story squash support"
module: bso
agent: shared
type: utility
version: 1.1.0
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Precise Git Commit Workflow (U3)

> BSO Utility Workflow -- 安全、精确的 Git 提交工具。逐文件暂存（禁止批量 add）、敏感文件拦截、基于配置的 commit message 模板、以及 Story 完成时的 squash 压缩。被 Story Creator、Dev Runner、Review Runner 等多个 Agent 共享调用。

## Purpose

提供统一的 Git 提交入口，确保所有 BSO Agent 的 Git 操作符合安全规范。核心保障三项安全策略：

1. **敏感文件拦截 (Principle 21):** 每次提交前扫描变更文件，拦截 `.env`、凭据、密钥等敏感文件
2. **逐文件暂存:** 永远不使用 `git add -A` 或 `git add .`，逐文件 `git add` 确保精确控制
3. **Squash 压缩 (Principle 28):** Story 达到 `done` 状态时，按配置策略将中间提交压缩为干净的最终提交

## Primary Agent

**Shared** -- 共享 utility，无独立 Agent。作为内联函数被多个 Agent workflow 调用。

## Callers

| Caller | 调用场景 | commit_type |
|--------|---------|------------|
| story-creation (C2) | Story 文档创建后提交 | `story_created` |
| story-creation (C2) | Story 文档修订后提交 | `story_revised` |
| dev-execution (C4) | 开发完成后提交代码 | `dev_complete` |
| code-review (C5) | Code Review 完成后提交报告 | `review_complete` |
| code-review (C5) | Fix 修复后提交代码 | `fix_complete` |
| slave-orchestration (C6) | Batch 完成后提交 sprint-status.yaml | `status_update` |
| Orchestrator | Story 到达 done，执行 squash | `squash` |

---

## Input Schema

```yaml
inputs:
  required:
    mode: "commit" | "squash"                  # 操作模式
    project_root: "/path/to/project"           # 项目根目录
  # commit 模式 required:
  commit_mode_required:
    files: ["/path/to/file1", "/path/to/file2"]  # 要提交的文件列表（绝对路径）
    commit_type: "story_created" | "story_revised" | "dev_complete" | "review_complete" | "fix_complete" | "status_update"
    story_key: "3-1"                           # Story 标识符
    session_id: "sprint-2026-02-07-001"        # 会话 ID
  # commit 模式 optional:
  commit_mode_optional:
    title: "项目管理CRUD"                       # Story 标题（用于 commit message 模板）
    round: 1                                   # Review 轮次（review_complete / fix_complete 使用）
    description: "修复分页查询参数传递"           # Fix 描述（fix_complete 使用）
    extra_message: ""                          # 附加到 commit message 的额外信息
  # squash 模式 required:
  squash_mode_required:
    story_key: "3-1"                           # 要 squash 的 Story 标识符
    title: "项目管理CRUD"                       # Story 标题（用于 squash 后的 commit message）
    session_id: "sprint-2026-02-07-001"        # 会话 ID
  squash_mode_optional:
    squash_strategy: "per_story"               # 覆盖 config 中的 git_squash_strategy
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `mode` | 值为 "commit" 或 "squash" | abort, error: "Invalid mode" |
| `project_root` | 目录存在且为 Git 仓库 | abort, error: "Not a git repository" |
| `files` | commit 模式下非空数组 | abort, error: "No files specified for commit" |
| `commit_type` | commit 模式下为合法枚举值 | abort, error: "Invalid commit_type" |
| `story_key` | 匹配格式 `\d+-\d+` | abort, error: "Invalid story_key format" |

---

## Output Schema

### Return Value

```yaml
return:
  status: "success" | "blocked" | "failure"
  mode: "commit" | "squash"
  session_id: "sprint-2026-02-07-001"
  results:
    # commit 模式:
    commit_hash: "abc1234"
    commit_message: "docs: Story 3.1: 项目管理CRUD 创建开发文档"
    files_staged: ["/path/to/file1", "/path/to/file2"]
    files_skipped: []                          # 被敏感检查跳过的文件
    # squash 模式:
    squash_strategy: "per_story"
    commits_squashed: 5
    final_commit_hash: "def5678"
    final_commit_message: "feat: Story 3.1: 项目管理CRUD"
  sensitive_files_detected: []                 # 检测到的敏感文件列表
  errors: []
  warnings: []
```

### Status Value Mapping

| Status | 含义 | 触发条件 |
|--------|-----|---------|
| `success` | 提交/squash 成功 | 所有操作完成无异常 |
| `blocked` | 提交被敏感文件拦截 | 检测到敏感文件模式匹配 |
| `failure` | 操作失败 | Git 操作异常、文件不存在等 |

---

## Sensitive File Patterns

以下文件模式将触发提交拦截（Principle 21: Git Commit Safeguard）：

### Pattern List

```yaml
sensitive_patterns:
  # 环境变量文件
  - pattern: ".env"
    type: "exact"
    description: "Environment variables file"
  - pattern: ".env.*"
    type: "glob"
    description: "Environment-specific config (.env.local, .env.production)"

  # 凭据和密钥文件
  - pattern: "*credentials*"
    type: "glob"
    description: "Credential files (credentials.json, credentials.yaml, etc.)"
  - pattern: "*secrets*"
    type: "glob"
    description: "Secret files (secrets.yaml, client_secrets.json, etc.)"
  - pattern: "*password*"
    type: "glob"
    description: "Password files"
  - pattern: "*token*"
    type: "glob"
    description: "Token files (access_token, refresh_token, etc.)"
    exclude: ["*tokenize*", "*tokenizer*", "*.md"]  # 排除误报

  # 证书和密钥
  - pattern: "*.pem"
    type: "extension"
    description: "PEM certificate/key files"
  - pattern: "*.key"
    type: "extension"
    description: "Private key files"
    exclude: ["*.keyboard*", "package-lock.json"]  # 排除误报
  - pattern: "*.p12"
    type: "extension"
    description: "PKCS#12 certificate files"
  - pattern: "*.pfx"
    type: "extension"
    description: "PFX certificate files"
  - pattern: "*.jks"
    type: "extension"
    description: "Java KeyStore files"
  - pattern: "*.keystore"
    type: "extension"
    description: "Keystore files"

  # SSH 密钥
  - pattern: "id_rsa"
    type: "exact"
    description: "SSH private key"
  - pattern: "id_ed25519"
    type: "exact"
    description: "SSH ED25519 private key"
  - pattern: "id_dsa"
    type: "exact"
    description: "SSH DSA private key"

  # AWS / Cloud 凭据
  - pattern: "*aws_access_key*"
    type: "glob"
    description: "AWS access key"
  - pattern: "*.tfvars"
    type: "extension"
    description: "Terraform variable files (may contain secrets)"
```

### Detection Logic

- 对变更文件列表中的每个文件路径，逐一匹配上述模式
- 匹配算法: 仅检查文件名（basename），不检查目录路径
- `exclude` 列表用于减少误报（如 `tokenizer.js` 不应被 `*token*` 拦截）
- 检测到敏感文件 --> 立即停止，不执行任何 `git add`

---

## Commit Message Patterns

基于 `config.yaml` 的 `git_commit_patterns` 配置生成 commit message：

```yaml
# From config.yaml:
git_commit_patterns:
  story_created: "docs: Story {epic}.{story}: {title} 创建开发文档"
  story_revised: "docs: Story {epic}.{story}: {title} 修订开发文档"
  dev_complete: "feat: Story {epic}.{story}: {title}"
  review_complete: "docs: Story {epic}.{story}: code review [round {round}]"
  fix_complete: "fix: Story {epic}.{story}: [review {round}] {description}"
```

### Template Variable Mapping

| Variable | Source | Example |
|----------|--------|---------|
| `{epic}` | `story_key` 的 `-` 前部分 | `3` |
| `{story}` | `story_key` 的 `-` 后部分 | `1` |
| `{title}` | Input `title` 参数 | `项目管理CRUD` |
| `{round}` | Input `round` 参数 | `2` |
| `{description}` | Input `description` 参数 | `修复分页查询参数传递` |

### Squash Commit Message

当 `git_squash_strategy: per_story` 时，squash 后的最终 commit message：
```
feat: Story {epic}.{story}: {title}
```

当 `git_squash_strategy: per_phase` 时，保留每个阶段一个 commit（不执行 squash，已自然满足）。

---

## Workflow Steps

### Step 1: Diff Snapshot

**Goal:** 快照当前 Git diff，建立提交前的变更基线，防止中间变更泄漏。

**Actions:**
1. 执行 `git diff --name-only` 获取未暂存变更文件列表
2. 执行 `git diff --cached --name-only` 获取已暂存变更文件列表
3. 合并两个列表，记录为 `pre_commit_diff_snapshot`
4. 验证 `files` 参数中的所有文件都在 diff 中出现：
   - 文件在 diff 中 --> 正常
   - 文件不在 diff 中（可能是新文件或已暂存）：
     a. 执行 `git status --porcelain {file}` 检查文件状态
     b. 新文件（`??`）--> 正常，待 `git add`
     c. 文件无变更 --> 从提交列表移除，记录警告: "File {file} has no changes, skipped"
5. 将快照信息存入内存（不写文件），用于 Step 5 的 post-commit 验证

**On Success:** diff 快照完成，继续 Step 2
**On Failure:**
- 非 Git 仓库 --> abort, status: "failure", error: "Not a git repository"
- git diff 命令执行失败 --> abort, status: "failure", error: "Git diff failed"

---

### Step 2: Sensitive File Scan

**Goal:** 扫描提交文件列表，检测敏感文件模式匹配（Principle 21: Git Commit Safeguard）。

**Actions:**
1. 遍历 `files` 列表中的每个文件
2. 提取文件名（basename）
3. 逐一匹配 Sensitive File Patterns 中的所有模式：
   a. **exact 匹配:** 文件名完全等于模式
   b. **glob 匹配:** 使用 glob 语法匹配（`*credentials*` 匹配 `my-credentials.json`）
   c. **extension 匹配:** 文件扩展名匹配（`.pem` 匹配 `server.pem`）
4. 匹配后检查 `exclude` 列表：
   - 文件名匹配 exclude 中的任何模式 --> 排除误报，继续
5. 收集所有匹配的敏感文件：
   ```yaml
   sensitive_files_detected:
     - file: "/path/to/.env.local"
       pattern: ".env.*"
       type: "glob"
       description: "Environment-specific config"
   ```
6. **判定:**
   - 检测到敏感文件 --> 立即返回 `blocked`，不执行任何 `git add`
   - 未检测到 --> 继续 Step 3

**On Success (clean):** 无敏感文件，继续 Step 3
**On Blocked:**
```yaml
return:
  status: "blocked"
  mode: "commit"
  sensitive_files_detected:
    - file: "/path/to/.env.local"
      pattern: ".env.*"
  message: "Commit blocked: sensitive file detected. Remove sensitive files from commit list and retry."
  errors:
    - type: "sensitive_file_detected"
      files: [".env.local"]
```

---

### Step 3: Per-File Staging

**Goal:** 逐文件执行 `git add`，确保精确控制暂存范围。

**Actions:**
1. **重要约束:** 永远不执行 `git add -A`、`git add .` 或 `git add --all`
2. 对 `files` 列表中的每个文件逐一执行：
   ```bash
   git add "/absolute/path/to/file"
   ```
3. 每次 `git add` 后验证：
   - 执行 `git status --porcelain {file}` 检查文件状态
   - 状态为 `A ` (added) 或 `M ` (modified, staged) --> 暂存成功
   - 状态未变 --> 记录警告
4. 记录暂存结果：
   ```yaml
   files_staged: ["/path/to/file1", "/path/to/file2"]
   files_skipped: ["/path/to/file3"]  # 暂存失败的文件
   ```
5. 如果有任何文件暂存失败：
   - 部分失败 --> 记录警告，继续提交已暂存的文件
   - 全部失败 --> abort, status: "failure"

**On Success:** 全部文件暂存成功，继续 Step 4
**On Partial:** 部分文件暂存，记录警告，继续 Step 4
**On Failure:** 全部暂存失败 --> status: "failure", error: "All files failed to stage"

---

### Step 4: Commit Execution

**Goal:** 使用配置的 commit message 模板执行 git commit。

**Actions:**
1. 根据 `commit_type` 从 `git_commit_patterns` 中获取模板
2. 替换模板变量：
   - 解析 `story_key` 为 `{epic}` 和 `{story}`
   - 填入 `{title}`, `{round}`, `{description}` 等参数
3. 如果有 `extra_message`，追加到 commit message 末尾
4. 执行 git commit：
   ```bash
   git commit -m "$(cat <<'EOF'
   docs: Story 3.1: 项目管理CRUD 创建开发文档
   EOF
   )"
   ```
5. 提取 commit hash：
   ```bash
   git rev-parse HEAD
   ```
6. 验证 commit 成功：
   - commit hash 非空
   - `git log -1 --oneline` 显示正确的 commit message

**On Success:** commit 完成，继续 Step 5
```yaml
results:
  commit_hash: "abc1234"
  commit_message: "docs: Story 3.1: 项目管理CRUD 创建开发文档"
```
**On Failure:**
- pre-commit hook 失败 --> status: "failure", error: "Pre-commit hook failed: {detail}"
- nothing to commit --> status: "failure", error: "Nothing to commit (working tree clean after staging)"
- Git 操作异常 --> status: "failure", error detail

---

### Step 5: Post-Commit Verification

**Goal:** 验证提交后的 Git 状态，确保无意外变更泄漏。

**Actions:**
1. 执行 `git diff --name-only` 获取提交后的未暂存变更
2. 与 Step 1 的 `pre_commit_diff_snapshot` 比较：
   - 从快照中移除已提交的文件 --> 剩余应与当前 diff 一致
   - 如果出现快照中没有的新变更 --> 记录警告: "Unexpected changes detected after commit"
3. 验证 commit history：
   - `git log -1 --format=%H` 应与 Step 4 记录的 commit hash 匹配
4. 如果是 `commit` 模式，到此结束，返回结果
5. 如果调用方指定需要 squash 检查 --> 记录提示，squash 由独立调用处理

**On Success:** 返回 `success`
**On Warning:** 有意外变更但 commit 本身成功 --> 返回 `success`，附带 warnings

---

### Step 6: Squash Decision (squash 模式)

**Goal:** 在 Story 到达 `done` 状态时，根据 `git_squash_strategy` 配置决定是否执行 squash。

**Actions:**
1. 读取 `git_squash_strategy` 配置（或使用 `squash_strategy` 输入覆盖）：
   - `per_story` --> 执行 squash，继续 Step 7
   - `per_phase` --> 不执行 squash（每阶段已是独立 commit），返回 `success`
   - `none` --> 不执行 squash，返回 `success`
2. 如果 `per_story`:
   a. 搜索当前 Story 的所有相关 commit：
      - 使用 `git log --oneline --grep="Story {epic}.{story}"` 查找
      - 收集所有匹配的 commit hash
   b. 计算需要 squash 的 commit 数量
   c. 如果只有 1 个 commit --> 无需 squash，返回 `success`
   d. 如果有多个 commit --> 继续 Step 7

**On Squash Needed:** 继续 Step 7
**On No Squash:** 返回 `success`
**On Strategy None/Per-Phase:** 返回 `success`

---

### Step 7: Squash Execution

**Goal:** 将 Story 的所有中间 commit 压缩为一个干净的最终 commit。

**Actions:**
1. 确定 squash 范围：
   - 找到 Story 第一个相关 commit 的前一个 commit（squash 基准点）
   - 使用 `git log` 验证范围内的所有 commit 都属于当前 Story
2. 执行 soft reset：
   ```bash
   git reset --soft {base_commit_hash}
   ```
3. 创建 squash commit：
   - 使用 `dev_complete` 模板作为最终 commit message：
     ```
     feat: Story {epic}.{story}: {title}
     ```
   - 执行 `git commit -m "..."`
4. 验证 squash 结果：
   - `git log --oneline` 确认 squash commit 存在
   - `git diff {base_commit_hash}..HEAD --stat` 确认代码变更未丢失
5. 记录 squash 结果：
   ```yaml
   results:
     squash_strategy: "per_story"
     commits_squashed: 5
     final_commit_hash: "def5678"
     final_commit_message: "feat: Story 3.1: 项目管理CRUD"
   ```

**On Success:** 返回 `success`
**On Failure:**
- reset 失败 --> status: "failure", error: "Git reset --soft failed"
  - **恢复策略:** `git reset --soft HEAD` 恢复到 reset 前状态
- squash commit 失败 --> status: "failure", error detail
- 变更丢失检测 --> status: "failure", error: "Code changes lost during squash"
  - **恢复策略:** 使用 `git reflog` 找回丢失的 commit

---

## Error Handling Matrix

| Error Scenario | Detection Point | Severity | Action | Status Returned |
|---------------|----------------|----------|--------|----------------|
| 非 Git 仓库 | Step 1 | Fatal | 立即终止 | `failure` |
| git diff 命令失败 | Step 1 | Fatal | 终止 | `failure` |
| 敏感文件检测到 | Step 2 | Critical | 立即停止，不执行 git add | `blocked` |
| 全部文件暂存失败 | Step 3 | Fatal | 终止 | `failure` |
| 部分文件暂存失败 | Step 3 | Warning | 继续提交已暂存文件 | `success` (with warnings) |
| Pre-commit hook 失败 | Step 4 | Fatal | 终止，提示修复 | `failure` |
| Nothing to commit | Step 4 | Warning | 终止，无需提交 | `failure` |
| Commit 后意外变更 | Step 5 | Warning | 记录警告，继续 | `success` (with warnings) |
| Squash commit 范围无效 | Step 6 | Warning | 跳过 squash | `success` (with warnings) |
| Git reset --soft 失败 | Step 7 | Fatal | 恢复到 reset 前状态 | `failure` |
| Squash 后代码变更丢失 | Step 7 | Critical | 使用 reflog 恢复 | `failure` |

### Timeout Configuration

- git diff/status 操作: 30 秒
- git add (per file): 10 秒
- git commit: 60 秒（pre-commit hook 可能耗时）
- git reset --soft: 10 秒
- Squash 整体操作: 120 秒

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项:

```yaml
# Git commit patterns (Step 4: commit message 模板)
git_commit_patterns:
  story_created                               # Story 创建提交
  story_revised                               # Story 修订提交
  dev_complete                                # 开发完成提交
  review_complete                             # Review 完成提交
  fix_complete                                # Fix 修复提交

# Git squash strategy (Step 6-7: squash 决策和执行)
git_squash_strategy                           # per_story | per_phase | none

# 间接依赖（由调用方上下文传入）:
# defaults.auto_clear_git_track              # Story Creator 使用
# status_file_search_paths                   # 定位 sprint-status.yaml 以确认 Story 状态
```

---

## Workflow Sequence Diagram

### Commit Flow

```
Caller (C2/C4/C5)                 Precise Git Commit (U3)
    |                                       |
    |--- commit(files, type, key) --------->|
    |                                       |
    |                               Step 1: Diff Snapshot
    |                                 git diff --name-only
    |                                 validate files in diff
    |                                       |
    |                               Step 2: Sensitive File Scan
    |                                 match patterns (.env, *.pem, etc.)
    |                                       |
    |                                 [sensitive detected] --> return(blocked)
    |                                 [clean]
    |                                       |
    |                               Step 3: Per-File Staging
    |                                 git add file1
    |                                 git add file2
    |                                 ...
    |                                       |
    |                               Step 4: Commit Execution
    |                                 git commit -m "{pattern}"
    |                                 extract commit hash
    |                                       |
    |                               Step 5: Post-Commit Verification
    |                                 compare diff with snapshot
    |                                 verify commit hash
    |                                       |
    |<--- return(success, hash) ------------|
```

### Squash Flow

```
Orchestrator                      Precise Git Commit (U3)
    |                                       |
    |--- squash(story_key, title) --------->|
    |                                       |
    |                               Step 6: Squash Decision
    |                                 read git_squash_strategy
    |                                 find Story commits
    |                                       |
    |                                 [none/per_phase] --> return(success)
    |                                 [per_story + >1 commits]
    |                                       |
    |                               Step 7: Squash Execution
    |                                 git reset --soft {base}
    |                                 git commit -m "feat: Story..."
    |                                 verify no changes lost
    |                                       |
    |<--- return(success, squash_info) -----|
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | 降级优于报错 | Step 3: 部分文件暂存失败时继续提交已成功的文件 |
| 11 | 原子状态文件写入 | Step 7: Squash 失败时通过 reset --soft HEAD 恢复原始状态 |
| 17 | 执行可见性 | 每个 step 记录详细的操作日志和结果 |
| 21 | Git Commit Safeguard | Step 2: 全量敏感文件模式扫描，检测到即拦截 |
| 28 | Git Squash 策略 | Step 6-7: 按 per_story / per_phase / none 三种策略执行 squash |
| 30 | Review Persona 独立性 | 不同 caller 使用相同的 commit 接口，确保一致的安全标准 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: precise-git-commit.spec.md + config.yaml + module-brief-bso.md + C2 template_
