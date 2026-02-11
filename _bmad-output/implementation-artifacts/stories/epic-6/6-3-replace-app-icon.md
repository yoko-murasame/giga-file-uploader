# Story 6.3: 应用图标替换

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 6-3 |
| Epic | Epic 6: Bug 修复与体验优化 |
| 前置依赖 | 无（独立任务，不依赖其他 Story） |
| FRs 覆盖 | 无（体验优化，非功能性需求） |
| NFRs 关联 | 无 |

## User Story

As a 用户,
I want 应用使用自定义品牌图标而非 Tauri 默认图标,
So that 应用在桌面、任务栏和 Dock 中具有专业的视觉识别度。

---

## Acceptance Criteria

### AC-1: 源文件格式转换 -- JPEG 转真正 PNG

**Given** 根目录下存在 `icon_candidate.png`（实际为 JPEG 格式，640x640）
**When** 执行图标生成流程
**Then** 使用 `sips -s format png icon_candidate.png --out src-tauri/app-icon.png` 将 JPEG 转换为真正的 PNG 格式
**And** 转换后的文件为合法 PNG 格式（`file` 命令输出应包含 `PNG image data`）
**And** 转换后的图像尺寸保持 640x640 不变

### AC-2: 使用 Tauri CLI 生成所有尺寸图标

**Given** AC-1 中已生成真正的 PNG 格式源文件
**When** 执行 `pnpm tauri icon src-tauri/app-icon.png`
**Then** 生成以下所有尺寸的图标文件到 `src-tauri/icons/` 目录：
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`（256x256 实际像素）
- `icon.ico`（Windows 图标）
- `icon.icns`（macOS 图标）
**And** `src-tauri/icons/` 下所有原有 Tauri 默认图标文件被替换

### AC-3: macOS 运行验证 -- Dock 和窗口标题栏显示自定义图标

**Given** AC-2 中图标已替换
**When** 在 macOS 上运行 `pnpm tauri dev`
**Then** Dock 中显示自定义图标（非 Tauri 默认齿轮/方块图标）
**And** 窗口标题栏显示自定义图标

### AC-4: 临时文件清理

**Given** 图标生成流程完成
**When** 所有图标文件已就位
**Then** 删除中间产物 `src-tauri/app-icon.png`（仅 `src-tauri/icons/` 下的最终图标文件保留）
**And** 根目录的 `icon_candidate.png` 和 `icon_candidate.svg` 原始文件保留不动

---

## Technical Design

### 现状分析

当前 `src-tauri/icons/` 下存在 Tauri 初始化时生成的默认图标：

```
src-tauri/icons/
├── 32x32.png
├── 128x128.png
├── 128x128@2x.png
├── icon.icns
└── icon.ico
```

根目录存在两个候选图标文件：
- `icon_candidate.png` -- 640x640，**实际为 JPEG 格式**（`file` 命令确认：`JPEG image data, baseline, precision 8, 640x640, components 3`）
- `icon_candidate.svg` -- SVG 矢量格式

`pnpm tauri icon` 命令要求输入为**真正的 PNG 格式**文件。直接使用 `icon_candidate.png` 会失败或产生损坏的图标，因此必须先进行格式转换。

### 执行方案

本 Story 为纯运维/资源替换任务，不涉及代码逻辑变更。执行流程为线性的命令序列：

1. **格式转换**：使用 macOS 内置 `sips` 工具将 JPEG 转为真正 PNG
2. **图标生成**：使用 `pnpm tauri icon` 自动生成所有平台所需的图标尺寸
3. **清理**：删除中间产物
4. **验证**：确认图标文件完整性

### 关键工具

| 工具 | 用途 |
|------|------|
| `sips -s format png` | macOS 内置图像格式转换，将 JPEG 转为 PNG |
| `pnpm tauri icon <path>` | Tauri CLI 图标生成，从单个 PNG 源文件生成所有平台图标 |
| `file <path>` | 验证文件实际格式 |

### 设计决策

1. **使用 `sips` 而非 ImageMagick**：`sips` 是 macOS 内置工具，无需额外安装依赖。当前开发环境为 macOS（Darwin 25.2.0），`sips` 可用且可靠。

2. **使用 PNG 源而非 SVG**：`pnpm tauri icon` 默认接受 PNG 输入。虽然存在 `icon_candidate.svg`，但 PNG 640x640 已足够生成所有所需尺寸（最大 256x256），使用 PNG 流程更简单。

3. **中间文件放在 `src-tauri/` 下**：转换后的 PNG 临时放在 `src-tauri/app-icon.png`，与目标目录 `src-tauri/icons/` 同级，路径清晰。完成后删除。

4. **不修改 `tauri.conf.json`**：Tauri 默认从 `src-tauri/icons/` 读取图标文件，文件名保持不变（32x32.png, 128x128.png 等），因此无需修改配置。

---

## Tasks

### Task 1: 将 JPEG 转换为真正的 PNG 格式

**依赖:** 无

**Subtasks:**

1.1. 执行 `sips -s format png icon_candidate.png --out src-tauri/app-icon.png`，将根目录的 JPEG 文件转换为真正的 PNG 格式
1.2. 执行 `file src-tauri/app-icon.png` 验证输出包含 `PNG image data`
1.3. 执行 `sips -g pixelWidth -g pixelHeight src-tauri/app-icon.png` 验证尺寸为 640x640

### Task 2: 使用 Tauri CLI 生成所有尺寸图标

**依赖:** Task 1

**Subtasks:**

2.1. 执行 `pnpm tauri icon src-tauri/app-icon.png`
2.2. 验证 `src-tauri/icons/` 下存在以下文件：`32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.ico`、`icon.icns`
2.3. 执行 `file src-tauri/icons/32x32.png` 验证为合法 PNG 格式
2.4. 执行 `file src-tauri/icons/icon.icns` 验证为合法 icns 格式

### Task 3: 清理中间产物

**依赖:** Task 2

**Subtasks:**

3.1. 执行 `rm src-tauri/app-icon.png` 删除中间产物
3.2. 确认 `icon_candidate.png` 和 `icon_candidate.svg` 仍在根目录

### Task 4: macOS 运行验证（手动）

**依赖:** Task 3

**Subtasks:**

4.1. 执行 `pnpm tauri dev`
4.2. 目视确认 Dock 图标为自定义图标
4.3. 目视确认窗口标题栏图标为自定义图标

---

## Task 依赖顺序

```
Task 1 (JPEG -> PNG 转换) --> Task 2 (tauri icon 生成)
                                      |
                                      v
                               Task 3 (清理中间产物)
                                      |
                                      v
                               Task 4 (macOS 运行验证 -- 手动)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/icons/32x32.png` | 替换为自定义图标 |
| `src-tauri/icons/128x128.png` | 替换为自定义图标 |
| `src-tauri/icons/128x128@2x.png` | 替换为自定义图标 |
| `src-tauri/icons/icon.ico` | 替换为自定义图标 |
| `src-tauri/icons/icon.icns` | 替换为自定义图标 |

### 禁止修改

- `src-tauri/tauri.conf.json` -- 图标路径和文件名不变，无需修改配置
- `icon_candidate.png` -- 原始源文件保留不动
- `icon_candidate.svg` -- 原始源文件保留不动
- `src/` -- 不涉及前端代码变更
- `src-tauri/src/` -- 不涉及 Rust 代码变更
- `src-tauri/Cargo.toml` -- 不涉及依赖变更
- `package.json` -- 不涉及依赖变更

---

## Technical Notes

### sips 命令参考

```bash
# JPEG -> PNG 格式转换（macOS 内置）
sips -s format png icon_candidate.png --out src-tauri/app-icon.png

# 验证转换结果
file src-tauri/app-icon.png
# 期望输出: src-tauri/app-icon.png: PNG image data, 640 x 640, ...

# 查看图像尺寸
sips -g pixelWidth -g pixelHeight src-tauri/app-icon.png
```

### pnpm tauri icon 命令参考

```bash
# 从 PNG 源文件生成所有平台图标
pnpm tauri icon src-tauri/app-icon.png

# 该命令会自动生成：
# src-tauri/icons/32x32.png        (32x32)
# src-tauri/icons/128x128.png      (128x128)
# src-tauri/icons/128x128@2x.png   (256x256)
# src-tauri/icons/icon.ico          (Windows multi-size)
# src-tauri/icons/icon.icns         (macOS multi-size)
```

### 注意事项

- `pnpm tauri icon` 可能还会生成额外的 PNG 尺寸文件（如 `StoreLogo.png`、`Square*Logo.png` 等 Windows Store 相关图标），这些额外文件可以保留，不影响功能。
- 如果 `pnpm tauri icon` 命令不可用（Tauri CLI 版本问题），可使用 `npx tauri icon` 作为备选。

---

## Definition of Done

- [ ] `icon_candidate.png`（JPEG）已转换为真正的 PNG 格式
- [ ] 转换后 PNG 尺寸为 640x640
- [ ] `pnpm tauri icon` 成功执行，无错误
- [ ] `src-tauri/icons/32x32.png` 已替换为自定义图标
- [ ] `src-tauri/icons/128x128.png` 已替换为自定义图标
- [ ] `src-tauri/icons/128x128@2x.png` 已替换为自定义图标
- [ ] `src-tauri/icons/icon.ico` 已替换为自定义图标
- [ ] `src-tauri/icons/icon.icns` 已替换为自定义图标
- [ ] 中间产物 `src-tauri/app-icon.png` 已删除
- [ ] `icon_candidate.png` 和 `icon_candidate.svg` 原始文件保留
- [ ] macOS 上 `pnpm tauri dev` Dock 显示自定义图标
- [ ] macOS 上窗口标题栏显示自定义图标
