# Story 6.6: Windows 双版本打包（NSIS + Portable）

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 6-6 |
| Epic | Epic 6: Bug 修复与体验优化 |
| 前置依赖 | Story 6.3（图标替换）-- 已完成 |
| FRs 覆盖 | 无（构建配置优化，非功能性需求） |
| NFRs 关联 | 无 |

## User Story

As a 用户,
I want 在 Windows 上既有安装包也有免安装便携版,
So that 我可以根据使用场景选择合适的版本。

---

## Acceptance Criteria

### AC-1: NSIS 安装包产出

**Given** 在 Windows 环境执行 `pnpm tauri build`
**When** 构建完成
**Then** `src-tauri/target/release/bundle/nsis/` 目录下产出 NSIS 安装包（`*-setup.exe`）
**And** 安装包可正常双击运行安装流程

### AC-2: Portable 免安装版产出

**Given** 在 Windows 环境执行 `pnpm tauri build`
**When** 构建完成
**Then** `src-tauri/target/release/` 目录下存在可直接运行的 `Giga File Uploader.exe`（即 Portable 版本）
**And** 该 exe 无需安装，直接双击即可启动应用

### AC-3: Portable 版本兼容性 -- Win10 1803+ / Win11

**Given** 用户在 Win10 1803+ 或 Win11 上使用 Portable 版本
**When** 系统已预装 WebView2 运行时（Win10 1803+ 和 Win11 默认预装）
**Then** 应用正常启动并运行所有功能
**And** 不弹出 WebView2 安装提示（因系统已内置）

### AC-4: NSIS 安装包自动捆绑 WebView2

**Given** 用户在缺少 WebView2 运行时的 Windows 机器上运行 NSIS 安装包
**When** 安装过程检测到 WebView2 缺失
**Then** 安装程序自动下载并安装 WebView2 Evergreen Bootstrapper
**And** 安装完成后应用可正常启动

### AC-5: 构建配置变更不影响 macOS / Linux

**Given** `tauri.conf.json` 中新增了 Windows 特定的 `bundle.windows` 配置
**When** 在 macOS 或 Linux 上执行 `pnpm tauri build` 或 `pnpm tauri dev`
**Then** 构建正常完成，Windows 特定配置被忽略
**And** macOS 仍产出 `.dmg` 和 `.app` 格式

---

## Technical Design

### 现状分析

当前 `src-tauri/tauri.conf.json` 的 bundle 配置：

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- `"targets": "all"` 已经会在 Windows 上产出 NSIS 安装包和 MSI 安装包
- Portable exe 是 Tauri 构建过程的中间产物，始终存在于 `target/release/` 目录
- **缺失项：** 没有显式配置 NSIS 的 WebView2 安装行为（当前依赖 Tauri 默认值）

### 目标配置

在 `bundle` 节点下新增 `windows` 配置块，显式声明 NSIS 安装包的 WebView2 处理策略：

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "downloadBootstrapper"
      }
    }
  }
}
```

### 设计决策

1. **保留 `"targets": "all"` 而非改为 `["nsis"]`：** `"all"` 是跨平台安全的设置。在 macOS 上产出 dmg/app，在 Windows 上产出 nsis/msi。改为特定 target 会破坏其他平台的构建。MSI 是额外产出，不影响 NSIS 和 Portable。

2. **选择 `downloadBootstrapper` 而非 `embedBootstrapper`：** `downloadBootstrapper` 在安装时按需下载 WebView2（安装包体积小，约几 MB bootstrapper），适合大部分场景。`embedBootstrapper` 会增大安装包约 ~150MB。考虑到 Win10 1803+ 和 Win11 已预装 WebView2，绝大多数用户不会触发下载，因此优先选择小体积方案。

3. **Portable 版本无需额外配置：** Tauri 构建流程天然产出 raw exe（`target/release/Giga File Uploader.exe`），此文件即可作为 Portable 版本直接分发。它不包含 WebView2，依赖系统已安装的版本。

4. **不配置 NSIS 多语言：** 当前应用面向日文/中文用户群，NSIS 默认语言检测足够使用，无需额外配置 `displayLanguageSelector` 或 `languages`。

### 构建产出物分布（Windows）

```
src-tauri/target/release/
├── Giga File Uploader.exe          <-- Portable 版本（直接运行）
└── bundle/
    ├── nsis/
    │   └── Giga File Uploader_0.1.0_x64-setup.exe   <-- NSIS 安装包
    └── msi/
        └── Giga File Uploader_0.1.0_x64_en-US.msi   <-- MSI（额外产出，可忽略）
```

### WebView2 运行时覆盖策略

| 场景 | WebView2 状态 | 处理方式 |
|------|---------------|----------|
| Portable on Win11 | 系统预装 | 直接运行，无额外操作 |
| Portable on Win10 1803+ | 系统预装（2020年后通过 Windows Update 推送） | 直接运行，无额外操作 |
| Portable on 旧版 Win10 | 可能未安装 | 应用无法启动，需用户手动安装 WebView2 |
| NSIS on 任何 Windows | 不论是否安装 | 安装程序自动检测并按需下载安装 |

---

## Tasks

### Task 1: 在 tauri.conf.json 中添加 Windows NSIS 配置

**依赖:** 无

**Subtasks:**

1.1. 打开 `src-tauri/tauri.conf.json`
1.2. 在 `bundle` 对象中，`icon` 数组之后，新增 `"windows"` 配置块：
```json
"windows": {
  "nsis": {
    "installMode": "downloadBootstrapper"
  }
}
```
1.3. 确保 JSON 格式正确，无语法错误
1.4. 保留 `"targets": "all"` 不变

### Task 2: macOS 本地构建验证

**依赖:** Task 1

**Subtasks:**

2.1. 执行 `pnpm tauri build` 确认 macOS 构建不受新配置影响
2.2. 验证构建成功完成，无错误或警告（与 Windows 配置相关的警告可忽略）
2.3. 确认 `src-tauri/target/release/bundle/` 下产出 `.dmg` 和 `.app`

### Task 3: Windows 构建验证（手动 / CI）

**依赖:** Task 1

**Subtasks:**

3.1. 在 Windows 环境执行 `pnpm tauri build`
3.2. 确认 `src-tauri/target/release/Giga File Uploader.exe` 存在（Portable 版本）
3.3. 确认 `src-tauri/target/release/bundle/nsis/` 下存在 `*-setup.exe`（NSIS 安装包）
3.4. 双击 Portable exe 验证应用正常启动（需系统已有 WebView2）
3.5. 运行 NSIS 安装包验证安装流程正常

---

## Task 依赖顺序

```
Task 1 (tauri.conf.json 配置变更)
       |
       ├──> Task 2 (macOS 构建验证)
       |
       └──> Task 3 (Windows 构建验证 -- 手动/CI)
```

Task 2 和 Task 3 可并行执行，均仅依赖 Task 1。

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/tauri.conf.json` | 在 `bundle` 中添加 `windows.nsis` 配置块 |

### 禁止修改

- `src-tauri/src/` -- 不涉及 Rust 代码变更
- `src/` -- 不涉及前端代码变更
- `src-tauri/Cargo.toml` -- 不涉及依赖变更
- `package.json` -- 不涉及依赖变更
- `src-tauri/icons/` -- 图标文件不变
- `src-tauri/tauri.conf.json` 中除 `bundle.windows` 以外的配置项 -- 不应改动

---

## Technical Notes

### Tauri 2 Windows Bundle Targets

Tauri 2 在 Windows 上使用 `"targets": "all"` 时产出：
- **NSIS 安装包**：完整安装流程，支持自定义安装路径、开始菜单快捷方式、WebView2 自动安装
- **MSI 安装包**：Windows Installer 格式，企业部署场景适用
- **Portable exe**：`target/release/` 下的原始二进制文件，无需安装直接运行

### WebView2 installMode 选项

| 模式 | 说明 | 安装包增量 |
|------|------|------------|
| `downloadBootstrapper` | 安装时按需下载 WebView2 bootstrapper（推荐） | ~2MB |
| `embedBootstrapper` | 将 bootstrapper 嵌入安装包 | ~2MB |
| `offlineInstaller` | 嵌入完整离线安装包 | ~150MB |
| `skip` | 跳过 WebView2 安装（不推荐） | 0 |

### 变更量评估

本 Story 仅修改 `src-tauri/tauri.conf.json` 一个文件，新增约 5 行 JSON 配置。属于纯配置变更，无逻辑代码改动。

---

## Definition of Done

- [ ] `src-tauri/tauri.conf.json` 中 `bundle.windows.nsis.installMode` 设置为 `"downloadBootstrapper"`
- [ ] macOS 上 `pnpm tauri build` 正常完成（Windows 配置不影响 macOS 构建）
- [ ] Windows 上 `pnpm tauri build` 产出 NSIS 安装包（`*-setup.exe`）
- [ ] Windows 上构建同时产出 Portable exe（`target/release/Giga File Uploader.exe`）
- [ ] Portable 版本在 Win10 1803+ / Win11 上可正常运行
- [ ] NSIS 安装包在缺少 WebView2 的机器上自动下载安装 WebView2
- [ ] JSON 配置格式正确，无语法错误
