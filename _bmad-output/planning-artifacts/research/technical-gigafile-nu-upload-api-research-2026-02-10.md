---
stepsCompleted: [discovery, research, analysis, report]
inputDocuments: []
workflowType: 'research'
lastStep: 4
research_type: 'technical'
research_topic: 'gigafile.nu 上传 API 逆向工程分析'
research_goals: '研究 gigafile.nu 平台的上传接口机制，以及相关开源项目对其 API 的逆向实现'
user_name: 'Shaoyoko'
date: '2026-02-10'
web_research_enabled: true
source_verification: true
---

# 技术研究报告：gigafile.nu 上传 API 逆向工程分析

**日期：** 2026-02-10
**作者：** Shaoyoko
**研究类型：** 技术研究（逆向 API 分析）

---

## 目录

1. [研究概述](#研究概述)
2. [gigafile.nu 平台概况](#gigafilenu-平台概况)
3. [核心 API 端点](#核心-api-端点)
4. [上传流程完整解析](#上传流程完整解析)
5. [下载流程解析](#下载流程解析)
6. [开源项目分析](#开源项目分析)
7. [关键技术细节](#关键技术细节)
8. [依赖与技术栈](#依赖与技术栈)
9. [总结与建议](#总结与建议)
10. [来源引用](#来源引用)

---

## 研究概述

本研究针对日本大文件传输服务 **gigafile.nu** 的上传/下载 API 进行技术逆向分析。gigafile.nu 本身不提供官方公开 API 文档，但开源社区通过逆向工程其 Web 前端交互，已实现了完整的程序化上传/下载客户端。

本报告的核心数据来源为开源项目 **fireattack/gfile**（PyPI 包名 `gigafile`，当前版本 3.2.5），这是目前最活跃且维护最好的 gigafile.nu 第三方客户端。

---

## gigafile.nu 平台概况

- **服务类型：** 日本大文件传输/托管服务
- **官方网站：** https://gigafile.nu/
- **特点：** 无需注册、免费使用、支持超大文件上传
- **文件保留期限：** 可选，最长 100 天
- **语言：** 日语界面（无英文版）
- **URL 格式：** `https://{数字编号}.gigafile.nu/{文件ID}`

> [High Confidence] 平台无官方 API 文档，所有接口信息均来自开源逆向工程项目。

---

## 核心 API 端点

通过对开源代码的分析，gigafile.nu 的核心 API 端点如下：

### 1. 服务器发现端点

```
GET https://gigafile.nu/
```

- **用途：** 获取当前可用的上传服务器主机名
- **机制：** 从返回的 HTML 页面中，通过正则表达式提取 JavaScript 变量
- **正则：** `r'var server = "(.+?)"'`
- **返回示例：** 返回一个服务器域名，如 `46.gigafile.nu`

### 2. 分块上传端点

```
POST https://{server}/upload_chunk.php
```

- **用途：** 上传文件的每一个分块
- **Content-Type：** `multipart/form-data`（由 MultipartEncoder 自动生成 boundary）
- **请求字段（Form Data）：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | string | 上传会话唯一标识符（UUID v1 hex，32字符） |
| `name` | string | 原始文件名 |
| `chunk` | string | 当前分块编号（从 0 开始） |
| `chunks` | string | 总分块数 |
| `lifetime` | string | 文件保留天数，固定为 `"100"` |
| `file` | binary | 文件分块二进制数据，MIME 类型为 `application/octet-stream`，字段名为 `"blob"` |

- **响应格式：** JSON
- **成功响应（最后一个分块）：** 包含 `url` 字段，即文件下载页面 URL
- **成功响应（中间分块）：** `{"status": 0}` 表示成功
- **失败响应：** `status` 非 0

### 3. 下载页面端点

```
GET https://{数字}.gigafile.nu/{文件ID}
```

- **用途：** 访问文件下载页面，获取文件信息和下载链接
- **返回：** HTML 页面，需解析提取文件名、大小、下载文件 ID

### 4. 文件下载端点

```
GET https://{数字}.gigafile.nu/download.php?file={文件ID}
```

- **可选参数：** `&dlkey={密码}` — 用于密码保护的文件
- **返回：** 文件二进制流
- **重要 Header：** `Content-Length` 提供文件大小用于完整性校验

---

## 上传流程完整解析

### 流程图

```
1. 生成 UUID token（会话ID）
          |
2. GET gigafile.nu → 正则提取 server 变量
          |
3. 计算分块: chunks = ceil(filesize / chunk_size)
          |
4. 串行上传第 0 块（首块）→ 建立 Cookie/会话
          |
5. 并行上传第 1 ~ (chunks-1) 块（多线程）
          |
6. 最后一块响应返回 { url: "下载页面URL" }
          |
7. [可选] 验证：GET download.php → 对比 Content-Length
          |
8. 输出下载页面 URL
```

### 详细步骤

#### Step 1: 生成上传会话 Token

```python
token = uuid.uuid1().hex  # 32字符十六进制字符串
```

每次上传生成唯一的 UUID v1 token，作为所有分块的关联标识。

#### Step 2: 服务器发现

```python
server = re.search(r'var server = "(.+?)"', session.get('https://gigafile.nu/').text)[1]
```

从 gigafile.nu 首页的 JavaScript 代码中动态获取当前活跃的上传服务器。服务器编号可能随时间变化。

#### Step 3: 文件分块

```
默认分块大小: 100MB（CLI 默认）/ 10MB（API 默认）
分块数量 = ceil(文件总大小 / 分块大小)
内存占用 = chunk_size x thread_num
```

文件不会一次性读入内存，而是按 `chunk_copy_size`（默认 1MB）逐步读取到 BytesIO 缓冲区。

#### Step 4: 首块串行上传

**关键设计：** 第一个分块（chunk 0）必须串行上传，用于在服务器端建立上传会话和 Cookie。

#### Step 5: 并行分块上传

使用 `concurrent.futures.ThreadPoolExecutor` 并行上传剩余分块：

- **默认线程数：** 8（CLI）/ 4（API）
- **顺序控制机制：** 通过 `self.current_chunk` 计数器确保分块按顺序完成（而非按顺序开始）
- **重试机制：** 上传失败时自动重试（无限次），使用 `requests` 的 Retry 适配器（5次重试，0.2s 退避因子）
- **进度追踪：** 128KB 为单位更新进度条

#### Step 6: 获取下载链接

最后一个上传成功的分块响应中包含 `url` 字段，即文件下载页面地址。

#### Step 7: 上传验证（可选）

通过访问 `download.php` 获取 `Content-Length` header，与本地文件大小对比，验证上传完整性。

---

## 下载流程解析

### 单文件下载

1. 访问下载页面 URL → 获取 Cookie
2. 用 BeautifulSoup 解析 HTML，提取文件信息
3. 构造下载 URL：`{domain}/download.php?file={file_id}`
4. 如有密码，追加 `&dlkey={key}`
5. 流式下载（`iter_content`），按 `chunk_copy_size` 分段写入
6. 下载后对比 `Content-Length` 校验完整性

### 多文件（Matomete）下载

gigafile.nu 支持"matomete"（まとめて，即"打包"）模式，一个 URL 包含多个文件：

- 检测 `#contents_matomete` 元素判断是否为多文件页面
- 遍历 `.matomete_file` 元素提取每个文件的名称、大小、ID
- 文件 ID 从 `onclick` 属性中用正则提取：`r"download\(\d+, *'(.+?)'"`
- 逐个下载每个文件

### aria2 加速下载

支持通过 aria2c 命令行工具加速下载：
- 默认参数：`-x10 -s10`（10 连接、10 分段）
- 自动传递 Cookie header

---

## 开源项目分析

### 项目对比

| 特性 | Sraq-Zit/gfile（原版） | fireattack/gfile（改进版） |
|------|------------------------|--------------------------|
| PyPI 包名 | gigafile | gigafile（同名，已接管） |
| 最新版本 | 较旧 | **3.2.5**（2025年7月） |
| 许可证 | GPL-3.0 | GPL-3.0 |
| 多线程上传 | 有 Bug | **已修复**，保序完成 |
| 下载文件名 | 有 Bug | **已修复** |
| 默认线程数 | 4 | **8** |
| 默认分块大小 | 10MB | **100MB** |
| aria2 支持 | 无 | **有** |
| 密码文件 | 无 | **支持 `--key`** |
| 上传验证 | 无 | **支持 Content-Length 校验** |
| 维护状态 | 不活跃 | **活跃维护** |

### 推荐

**fireattack/gfile** 是当前推荐使用的版本，它修复了原版的关键 Bug 并增加了重要功能。

---

## 关键技术细节

### 会话管理

```python
session = requests.Session()
retry = Retry(total=5, backoff_factor=0.2, status_forcelist=None)
adapter = HTTPAdapter(max_retries=retry)
session.mount('http://', adapter)
session.mount('https://', adapter)
```

- 基于 `requests.Session()` 维持 Cookie
- 配置 5 次重试，0.2 秒退避因子
- 所有请求共享同一 Session

### 分块上传并发控制

```python
# 首块串行（建立会话）
self.upload_chunk(0, chunks)

# 剩余块并行
with ThreadPoolExecutor(max_workers=self.thread_num) as ex:
    futures = {ex.submit(self.upload_chunk, i, chunks): i for i in range(1, chunks)}
```

**保序机制：** 虽然分块并行上传，但通过 `self.current_chunk` 计数器确保每个分块在其前一个分块完成后才真正"完成"：

```python
# 在上传数据生成器中等待顺序
while True:
    if offset < size:
        yield form_data_binary[offset:offset + update_tick]
        offset += update_tick
    else:
        if chunk_no != self.current_chunk:
            time.sleep(0.01)  # 等待前一个分块完成
        else:
            break
```

### 进度追踪

- 使用 `tqdm` 进度条
- 每个线程一个独立进度条
- 128KB（`1024 * 128`）为更新粒度
- 使用 `requests_toolbelt.StreamingIterator` 实现流式上传进度

### 文件名安全处理

```python
filename = re.sub(r'[\\/:*?"<>|]', '_', web_name)
```

下载时对文件名中的特殊字符进行替换。

---

## 依赖与技术栈

| 依赖包 | 最低版本 | 用途 |
|--------|---------|------|
| `requests` | >=2.25.1 | HTTP 客户端 |
| `requests_toolbelt` | >=0.9.1 | MultipartEncoder + StreamingIterator |
| `tqdm` | >=4.61.2 | 进度条显示 |
| `beautifulsoup4` | >=4 | HTML 页面解析 |

**可选依赖：**
- `aria2c` — 加速下载（外部命令行工具）

---

## 总结与建议

### 关键发现

1. **gigafile.nu 无官方 API**：所有接口均通过 Web 前端逆向获得，随时可能变更
2. **核心机制简单直接**：分块上传 + UUID 会话关联 + 服务器动态发现
3. **上传端点唯一**：`/upload_chunk.php` 处理所有分块，通过 `chunk`/`chunks` 字段区分
4. **服务器动态分配**：每次上传前需从首页获取当前活跃服务器
5. **首块必须串行**：建立服务端会话的关键步骤
6. **文件保留 100 天**：通过 `lifetime` 字段控制

### 对 giga-file-uploader 项目的建议

基于本研究，构建自己的 gigafile.nu 上传器需要实现以下核心能力：

1. **服务器发现**：从 `gigafile.nu` 首页动态提取上传服务器
2. **分块上传**：实现 `multipart/form-data` 格式的分块上传到 `/upload_chunk.php`
3. **并发控制**：首块串行 + 后续块并行，保证顺序完成
4. **会话管理**：Cookie 持久化，重试逻辑
5. **完整性校验**：上传后通过 Content-Length 验证

### 风险提示

- **接口不稳定风险**：非官方 API，平台更新可能导致接口变更
- **合规风险**：需遵守 gigafile.nu 的服务条款
- **依赖 HTML 结构**：下载功能依赖 HTML 解析，页面改版会导致失败

---

## 来源引用

1. [fireattack/gfile - GitHub](https://github.com/fireattack/gfile) — 当前活跃维护的 gigafile.nu Python 客户端（GPL-3.0）
2. [gigafile - PyPI](https://pypi.org/project/gigafile/) — PyPI 包页面，版本 3.2.5
3. [Sraq-Zit/gfile - GitHub](https://github.com/Sraq-Zit/gfile) — 原版 gigafile.nu Python 客户端
4. [gigafile.nu](https://gigafile.nu/) — gigafile.nu 官方网站
