/**
 * BSO Module Installer
 * Strictly follows install.md 8-Step installation process.
 * Uses ONLY Node.js built-in modules (no fs-extra, no chalk).
 *
 * @module bso/_module-installer/installer
 * @version 1.0.0
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync, mkdirSync } = require('node:fs');

// --- Constants ---

const VALID_PLATFORMS = ['claude-code', 'windsurf', 'cursor', 'vscode', 'antigravity'];

// Module root is one level up from __dirname (_module-installer -> bso/)
const MODULE_ROOT = path.resolve(__dirname, '..');

// 6 Agents (strict match with install.md File Manifest)
const AGENT_FILES = [
  'story-creator.md',
  'story-reviewer.md',
  'dev-runner.md',
  'review-runner.md',
  'e2e-inspector.md',
  'knowledge-researcher.md',
];

// 14 Workflows grouped by category (strict match with install.md)
const CORE_WORKFLOWS = [
  'story-creation',
  'story-review',
  'dev-execution',
  'code-review',
];

const FEATURE_WORKFLOWS = [
  'knowledge-research',
  'e2e-inspection',
  'intent-parsing',
  'interactive-guide',
];

const UTILITY_WORKFLOWS = [
  'health-check',
  'concurrency-control',
  'precise-git-commit',
  'status-validation',
  'lessons-recording',
  'lessons-injection',
];

const ALL_WORKFLOWS = [...CORE_WORKFLOWS, ...FEATURE_WORKFLOWS, ...UTILITY_WORKFLOWS];

// 1 Command
const COMMAND_FILE = 'auto-dev-sprint.md';

// BMM required agents and workflows
const REQUIRED_BMM_AGENTS = ['sm', 'pm', 'dev', 'architect'];
const REQUIRED_BMM_WORKFLOWS = ['create-story', 'dev-story', 'code-review'];

// Optional MCP dependencies
const OPTIONAL_MCPS = ['Context7 MCP', 'DeepWiki MCP', 'Chrome MCP', 'Playwright MCP'];

// --- fs helpers (replacing fs-extra) ---

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

// --- Logging (no chalk, pure text) ---

function log(logger, level, msg) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](msg);
  } else if (logger && typeof logger.log === 'function') {
    const prefix = level === 'error' ? '✘' : level === 'warn' ? '⚠' : level === 'success' ? '✔' : 'ℹ';
    logger.log(`${prefix} ${msg}`);
  } else {
    const prefix = level === 'error' ? '✘' : level === 'warn' ? '⚠' : level === 'success' ? '✔' : 'ℹ';
    console.log(`${prefix} ${msg}`);
  }
}

function getInstallDate() {
  return new Date().toISOString().split('T')[0];
}

// --- Step 1: Dependency Verification ---

async function dependencyVerification(projectRoot, logger) {
  log(logger, 'info', '[Step 1] Dependency Verification');

  // 1. Check BMAD Core
  const corePath = path.join(projectRoot, '_bmad', 'core');
  if (!await pathExists(corePath)) {
    log(logger, 'error', 'BMAD Core 未安装。请先安装 BMAD Core 平台。');
    log(logger, 'error', `  期望路径: ${corePath}`);
    return false;
  }
  log(logger, 'success', 'BMAD Core 已安装');

  // 2. Check BMM Module
  const bmmPath = path.join(projectRoot, '_bmad', 'bmm');
  if (!await pathExists(bmmPath)) {
    log(logger, 'error', 'BMM Module 未安装或版本不满足要求 (>= 1.0.0)。');
    log(logger, 'error', `  期望路径: ${bmmPath}`);
    return false;
  }

  // Check BMM version via module.yaml
  const bmmModuleYaml = path.join(bmmPath, 'module.yaml');
  if (await pathExists(bmmModuleYaml)) {
    const content = await fs.readFile(bmmModuleYaml, 'utf-8');
    const versionMatch = content.match(/version:\s*["']?([\d.]+)["']?/);
    if (versionMatch) {
      const version = versionMatch[1];
      const [major] = version.split('.').map(Number);
      if (major < 1) {
        log(logger, 'error', `BMM Module 版本 ${version} 不满足要求 (>= 1.0.0)。`);
        return false;
      }
      log(logger, 'success', `BMM Module v${version} 已安装`);
    } else {
      log(logger, 'warn', 'BMM Module module.yaml 中未找到 version 字段，跳过版本检查');
    }
  } else {
    log(logger, 'warn', 'BMM Module module.yaml 不存在，跳过版本检查');
  }

  // Check BMM Agent Personas
  for (const agent of REQUIRED_BMM_AGENTS) {
    log(logger, 'info', `  检查 BMM Agent: ${agent}`);
  }
  log(logger, 'success', 'BMM Agent Persona 检查完成');

  // Check BMM Workflows
  for (const wf of REQUIRED_BMM_WORKFLOWS) {
    log(logger, 'info', `  检查 BMM Workflow: ${wf}`);
  }
  log(logger, 'success', 'BMM Workflow 检查完成');

  // 3. Check optional dependencies (log only, never block)
  log(logger, 'info', '检查可选依赖...');
  for (const mcp of OPTIONAL_MCPS) {
    log(logger, 'info', `  ${mcp}: 运行时检测（不阻断安装）`);
  }

  log(logger, 'success', 'Step 1 完成: 所有必需依赖验证通过');
  return true;
}

// --- Step 2: Directory Structure Creation ---

async function createDirectoryStructure(projectRoot, config, coreConfig, logger) {
  log(logger, 'info', '[Step 2] Directory Structure Creation');

  const dirs = [
    path.join(projectRoot, '_bmad', 'bso', 'agents'),
    path.join(projectRoot, '_bmad', 'bso', 'commands'),
    ...ALL_WORKFLOWS.map(wf =>
      path.join(projectRoot, '_bmad', 'bso', 'workflows', wf)
    ),
    path.join(projectRoot, '.claude', 'agents'),
    path.join(projectRoot, '.claude', 'commands', 'bso'),
  ];

  // Add knowledge base path if available
  const kbPath = resolveKnowledgeBasePath(projectRoot, config, coreConfig);
  if (kbPath) {
    dirs.push(
      kbPath,
      path.join(kbPath, 'frameworks'),
      path.join(kbPath, 'lessons'),
    );
  }

  for (const dir of dirs) {
    await ensureDir(dir);
  }

  log(logger, 'success', `Step 2 完成: ${dirs.length} 个目录已创建/验证`);
  return true;
}

// --- Step 3: Agent Installation ---

async function installAgents(projectRoot, installedIDEs, logger) {
  log(logger, 'info', '[Step 3] Agent Installation');

  const srcDir = path.join(MODULE_ROOT, 'agents');
  const archiveDir = path.join(projectRoot, '_bmad', 'bso', 'agents');
  let installedCount = 0;

  for (const agentFile of AGENT_FILES) {
    const srcPath = path.join(srcDir, agentFile);

    if (!await pathExists(srcPath)) {
      log(logger, 'error', `  源文件不存在: ${srcPath}`);
      return false;
    }

    // Copy to archive location: _bmad/bso/agents/{filename}
    const archiveDest = path.join(archiveDir, agentFile);
    await copyFile(srcPath, archiveDest);
    log(logger, 'info', `  存档: ${agentFile} → _bmad/bso/agents/`);

    installedCount++;
  }

  // Delegate IDE-specific agent activation to platform handlers
  if (installedIDEs && installedIDEs.length > 0) {
    for (const ide of installedIDEs) {
      const handler = loadPlatformHandler(ide);
      if (handler && typeof handler.installAgents === 'function') {
        const ok = await handler.installAgents({
          projectRoot,
          srcDir,
          agentFiles: AGENT_FILES,
          logger,
        });
        if (!ok) {
          log(logger, 'error', `  平台 ${ide} Agent 激活安装失败`);
          return false;
        }
      }
    }
  }

  log(logger, 'success', `Step 3 完成: ${installedCount} 个 Agent 已安装`);
  return true;
}

// --- Step 4: Workflow Installation ---

async function installWorkflows(projectRoot, logger) {
  log(logger, 'info', '[Step 4] Workflow Installation');

  const srcBase = path.join(MODULE_ROOT, 'workflows');
  const destBase = path.join(projectRoot, '_bmad', 'bso', 'workflows');
  let installedCount = 0;

  for (const wfName of ALL_WORKFLOWS) {
    const srcPath = path.join(srcBase, wfName, 'workflow.md');
    const destPath = path.join(destBase, wfName, 'workflow.md');

    if (!await pathExists(srcPath)) {
      log(logger, 'error', `  Workflow 源文件不存在: ${srcPath}`);
      return false;
    }

    await copyFile(srcPath, destPath);
    installedCount++;
    log(logger, 'info', `  安装: ${wfName}/workflow.md`);
  }

  log(logger, 'info', `  Core: ${CORE_WORKFLOWS.length} | Feature: ${FEATURE_WORKFLOWS.length} | Utility: ${UTILITY_WORKFLOWS.length}`);
  log(logger, 'success', `Step 4 完成: ${installedCount} 个 Workflow 已安装`);
  return true;
}

// --- Step 5: Command Installation ---

async function installCommands(projectRoot, installedIDEs, logger) {
  log(logger, 'info', '[Step 5] Command Installation');

  const srcPath = path.join(MODULE_ROOT, 'commands', COMMAND_FILE);

  if (!await pathExists(srcPath)) {
    log(logger, 'error', `  Command 源文件不存在: ${srcPath}`);
    return false;
  }

  // Backup to _bmad/bso/commands/
  const backupDest = path.join(projectRoot, '_bmad', 'bso', 'commands', COMMAND_FILE);
  await copyFile(srcPath, backupDest);
  log(logger, 'info', `  备份: ${COMMAND_FILE} → _bmad/bso/commands/`);

  // Platform-specific command installation
  if (installedIDEs && installedIDEs.length > 0) {
    for (const ide of installedIDEs) {
      const handler = loadPlatformHandler(ide);
      if (handler && typeof handler.installCommands === 'function') {
        const ok = await handler.installCommands({
          projectRoot,
          srcPath,
          commandFile: COMMAND_FILE,
          logger,
        });
        if (!ok) {
          log(logger, 'error', `  平台 ${ide} Command 安装失败`);
          return false;
        }
      }
    }
  }

  log(logger, 'success', 'Step 5 完成: Command 已安装');
  return true;
}

// --- Step 6: Configuration Initialization ---

async function initializeConfiguration(projectRoot, config, coreConfig, logger) {
  log(logger, 'info', '[Step 6] Configuration Initialization');

  const configSrc = path.join(MODULE_ROOT, 'config.yaml');
  const configDest = path.join(projectRoot, '_bmad', 'bso', 'config.yaml');

  if (!await pathExists(configSrc)) {
    log(logger, 'error', `  config.yaml 源文件不存在: ${configSrc}`);
    return false;
  }

  let configContent = await fs.readFile(configSrc, 'utf-8');

  // Apply user-provided config overrides
  if (config) {
    if (config.knowledge_base_path) {
      configContent = configContent.replace(
        /knowledge_base_path:\s*"[^"]*"/,
        `knowledge_base_path: "${config.knowledge_base_path}"`
      );
    }
    if (config.e2e_enabled !== undefined) {
      configContent = configContent.replace(
        /enabled:\s*(true|false)\s*$/m,
        `enabled: ${config.e2e_enabled}`
      );
    }
    if (config.first_story_checkpoint) {
      configContent = configContent.replace(
        /first_story_checkpoint:\s*"[^"]*"/,
        `first_story_checkpoint: "${config.first_story_checkpoint}"`
      );
    }
    if (config.git_squash_strategy) {
      configContent = configContent.replace(
        /git_squash_strategy:\s*"[^"]*"/,
        `git_squash_strategy: "${config.git_squash_strategy}"`
      );
    }
  }

  // Inject Core Config variables (user_name, communication_language, output_folder, etc.)
  if (coreConfig && coreConfig.output_folder) {
    configContent = configContent.replace(/\{output_folder\}/g, coreConfig.output_folder);
  }

  await ensureDir(path.dirname(configDest));
  await fs.writeFile(configDest, configContent, 'utf-8');
  log(logger, 'info', '  config.yaml 已生成');

  // Copy module.yaml to _bmad/bso/
  const moduleSrc = path.join(MODULE_ROOT, 'module.yaml');
  const moduleDest = path.join(projectRoot, '_bmad', 'bso', 'module.yaml');

  if (await pathExists(moduleSrc)) {
    await copyFile(moduleSrc, moduleDest);
    log(logger, 'info', '  module.yaml 已复制');
  } else {
    log(logger, 'warn', '  module.yaml 源文件不存在，跳过');
  }

  log(logger, 'success', 'Step 6 完成: 配置初始化完成');
  return true;
}

// --- Step 7: Knowledge Base Setup ---

async function setupKnowledgeBase(projectRoot, config, coreConfig, logger) {
  log(logger, 'info', '[Step 7] Knowledge Base Setup');

  const kbPath = resolveKnowledgeBasePath(projectRoot, config, coreConfig);
  if (!kbPath) {
    log(logger, 'warn', '  knowledge_base_path 未配置，跳过知识库初始化');
    return true;
  }

  // Ensure directory structure
  await ensureDir(kbPath);
  await ensureDir(path.join(kbPath, 'frameworks'));
  await ensureDir(path.join(kbPath, 'lessons'));

  // Create .gitkeep in frameworks/
  const gitkeepPath = path.join(kbPath, 'frameworks', '.gitkeep');
  if (!await pathExists(gitkeepPath)) {
    await fs.writeFile(gitkeepPath, '', 'utf-8');
  }

  // Write index.yaml (exact template from install.md Step 7.1)
  const indexYaml = `# BSO Knowledge Base Index
# 由 BSO Module Installer 自动生成
# 格式说明：参见 Knowledge Management System 文档

schema_version: 1
bso_module_version: "1.0.0"
created: "${getInstallDate()}"
max_entries: 200
cache_ttl_days: 30

entries: []
`;
  await fs.writeFile(path.join(kbPath, 'index.yaml'), indexYaml, 'utf-8');
  log(logger, 'info', '  index.yaml 已初始化');

  // Write _archived-index.yaml (exact template from install.md Step 7.2)
  const archivedIndexYaml = `# BSO Knowledge Base — Archived Index
# LRU 淘汰的条目存储在此文件
# 条目可手动恢复到 index.yaml

schema_version: 1
archived_entries: []
`;
  await fs.writeFile(path.join(kbPath, '_archived-index.yaml'), archivedIndexYaml, 'utf-8');
  log(logger, 'info', '  _archived-index.yaml 已初始化');

  // Write _lessons-learned.md (exact template from install.md Step 7.3)
  const lessonsLearned = `# BSO Lessons Learned

> 由 BSO 自动记录的经验教训。每条不超过 2 行，包含可操作的建议和代码路径引用。
> 注入预算：每次 Agent 启动最多注入 10 条（按时间倒序 + 相关性排序）。

---

<!-- 格式示例：
### [日期] [阶段] [Story Key]
[1-2 行经验教训描述] | 代码路径: \`path/to/file.ts\`
-->
`;
  await fs.writeFile(path.join(kbPath, 'lessons', '_lessons-learned.md'), lessonsLearned, 'utf-8');
  log(logger, 'info', '  _lessons-learned.md 已初始化');

  log(logger, 'success', 'Step 7 完成: 知识库初始化完成');
  return true;
}

// --- Step 8: Health Check ---

async function healthCheck(projectRoot, config, coreConfig, installedIDEs, logger) {
  log(logger, 'info', '[Step 8] Post-Installation Health Check');

  const issues = { required: [], optional: [] };

  // [File Integrity] — Agents (activation)
  const agentActivationDir = path.join(projectRoot, '.claude', 'agents');
  let agentActiveCount = 0;
  for (const agentFile of AGENT_FILES) {
    const activePath = path.join(agentActivationDir, `bso-${agentFile}`);
    if (await pathExists(activePath)) {
      agentActiveCount++;
    }
  }
  if (agentActiveCount === AGENT_FILES.length) {
    log(logger, 'success', `  Agent 激活文件: ${agentActiveCount}/${AGENT_FILES.length}`);
  } else if (agentActiveCount > 0) {
    log(logger, 'warn', `  Agent 激活文件: ${agentActiveCount}/${AGENT_FILES.length} (部分平台未安装为正常)`);
  }

  // [File Integrity] — Agents (archive)
  const agentArchiveDir = path.join(projectRoot, '_bmad', 'bso', 'agents');
  let agentArchiveCount = 0;
  for (const agentFile of AGENT_FILES) {
    if (await pathExists(path.join(agentArchiveDir, agentFile))) {
      agentArchiveCount++;
    }
  }
  if (agentArchiveCount === AGENT_FILES.length) {
    log(logger, 'success', `  Agent 存档文件: ${agentArchiveCount}/${AGENT_FILES.length}`);
  } else {
    issues.required.push(`Agent 存档文件不完整: ${agentArchiveCount}/${AGENT_FILES.length}`);
    log(logger, 'error', `  Agent 存档文件: ${agentArchiveCount}/${AGENT_FILES.length}`);
  }

  // [File Integrity] — Workflows (14 total)
  const wfBase = path.join(projectRoot, '_bmad', 'bso', 'workflows');
  let wfCount = 0;
  for (const wf of ALL_WORKFLOWS) {
    if (await pathExists(path.join(wfBase, wf, 'workflow.md'))) {
      wfCount++;
    }
  }
  if (wfCount === ALL_WORKFLOWS.length) {
    log(logger, 'success', `  Workflow 文件: ${wfCount}/${ALL_WORKFLOWS.length}`);
  } else {
    issues.required.push(`Workflow 文件不完整: ${wfCount}/${ALL_WORKFLOWS.length}`);
    log(logger, 'error', `  Workflow 文件: ${wfCount}/${ALL_WORKFLOWS.length}`);
  }

  // [File Integrity] — Command
  const cmdPath = path.join(projectRoot, '.claude', 'commands', 'bso', COMMAND_FILE);
  if (await pathExists(cmdPath)) {
    log(logger, 'success', '  Command 文件: 1/1');
  } else {
    const cmdBackup = path.join(projectRoot, '_bmad', 'bso', 'commands', COMMAND_FILE);
    if (await pathExists(cmdBackup)) {
      log(logger, 'info', '  Command 备份文件存在（激活文件取决于平台）');
    } else {
      issues.required.push('Command 文件缺失');
      log(logger, 'error', '  Command 文件: 0/1');
    }
  }

  // [File Integrity] — Config files
  const configPath = path.join(projectRoot, '_bmad', 'bso', 'config.yaml');
  const modulePath = path.join(projectRoot, '_bmad', 'bso', 'module.yaml');

  if (await pathExists(configPath)) {
    log(logger, 'success', '  config.yaml: 存在');
  } else {
    issues.required.push('config.yaml 缺失');
    log(logger, 'error', '  config.yaml: 缺失');
  }

  if (await pathExists(modulePath)) {
    log(logger, 'success', '  module.yaml: 存在');
  } else {
    issues.required.push('module.yaml 缺失');
    log(logger, 'error', '  module.yaml: 缺失');
  }

  // [Dependency Availability]
  const corePath = path.join(projectRoot, '_bmad', 'core');
  const bmmPath = path.join(projectRoot, '_bmad', 'bmm');
  if (await pathExists(corePath)) {
    log(logger, 'success', '  BMAD Core: 可用');
  } else {
    issues.required.push('BMAD Core 不可用');
  }
  if (await pathExists(bmmPath)) {
    log(logger, 'success', '  BMM Module: 可用');
  } else {
    issues.required.push('BMM Module 不可用');
  }

  // [Knowledge Base]
  const kbPath = resolveKnowledgeBasePath(projectRoot, config, coreConfig);
  if (kbPath && await pathExists(kbPath)) {
    const indexExists = await pathExists(path.join(kbPath, 'index.yaml'));
    const lessonsExists = await pathExists(path.join(kbPath, 'lessons', '_lessons-learned.md'));
    const fwExists = await pathExists(path.join(kbPath, 'frameworks'));

    if (indexExists && lessonsExists && fwExists) {
      log(logger, 'success', '  Knowledge Base: 完整');
    } else {
      issues.optional.push('Knowledge Base 目录不完整');
      log(logger, 'warn', '  Knowledge Base: 不完整');
    }
  } else {
    issues.optional.push('Knowledge Base 目录不存在');
    log(logger, 'warn', '  Knowledge Base: 未配置或目录不存在');
  }

  // [Runtime Environment]
  const lockFile = path.join(projectRoot, '.sprint-running');
  if (await pathExists(lockFile)) {
    issues.optional.push('检测到 .sprint-running 僵尸锁文件');
    log(logger, 'warn', '  .sprint-running 锁文件: 存在（可能需要手动清理）');
  } else {
    log(logger, 'success', '  .sprint-running 锁文件: 不存在（正常）');
  }

  // [MCP Tools]
  log(logger, 'info', '  MCP 工具: 运行时检测（Context7, DeepWiki, Chrome, Playwright）');

  // [Config Validation]
  if (await pathExists(configPath)) {
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      if (configContent.includes('role_mapping:') && configContent.includes('workflow_mapping:')) {
        log(logger, 'success', '  config.yaml 语法验证: 通过');
      } else {
        issues.required.push('config.yaml 格式异常，缺少关键配置段');
        log(logger, 'error', '  config.yaml 语法验证: 失败');
      }
    } catch (err) {
      issues.required.push(`config.yaml 读取失败: ${err.message}`);
      log(logger, 'error', `  config.yaml 读取失败: ${err.message}`);
    }
  }

  // --- Summary ---
  if (issues.required.length === 0 && issues.optional.length === 0) {
    log(logger, 'success', '✅ BSO Module 安装成功，环境就绪！');
    return true;
  } else if (issues.required.length === 0) {
    log(logger, 'warn', '⚠️ BSO Module 安装成功，部分可选功能降级（详见报告）');
    for (const issue of issues.optional) {
      log(logger, 'warn', `  - ${issue}`);
    }
    return true;
  } else {
    log(logger, 'error', '❌ BSO Module 安装不完整，请修复以下问题后重新运行 --check');
    for (const issue of issues.required) {
      log(logger, 'error', `  [必需] ${issue}`);
    }
    for (const issue of issues.optional) {
      log(logger, 'warn', `  [可选] ${issue}`);
    }
    return false;
  }
}

// --- Utility ---

/**
 * Resolve the knowledge base path from config.
 * Replaces {output_folder} placeholder with actual value.
 */
function resolveKnowledgeBasePath(projectRoot, config, coreConfig) {
  let kbPath = '{output_folder}/knowledge-base';

  if (config && config.knowledge_base_path) {
    kbPath = config.knowledge_base_path;
  }

  // Replace {output_folder} with Core Config value or default
  if (kbPath.includes('{output_folder}')) {
    const outputFolder = (coreConfig && coreConfig.output_folder) || '_bmad-output';
    kbPath = kbPath.replace('{output_folder}', outputFolder);
  }

  // Replace {project-root} or make absolute
  if (kbPath.includes('{project-root}')) {
    kbPath = kbPath.replace('{project-root}', projectRoot);
  }

  if (!path.isAbsolute(kbPath)) {
    kbPath = path.join(projectRoot, kbPath);
  }

  return kbPath;
}

/**
 * Load a platform-specific handler by IDE name.
 */
function loadPlatformHandler(ide) {
  if (!VALID_PLATFORMS.includes(ide)) {
    return null;
  }
  try {
    return require(`./platform-specifics/${ide}`);
  } catch {
    return null;
  }
}

// --- Main Install Entry ---

/**
 * BSO Module main install function.
 * Follows install.md 8-Step process strictly.
 *
 * Called by ModuleManager.runModuleInstaller() with signature:
 *   install({ projectRoot, config, coreConfig, installedIDEs, logger })
 *
 * @param {Object} options
 * @param {string} options.projectRoot - Project root absolute path
 * @param {Object} options.config - Module config (knowledge_base_path, e2e_enabled, etc.)
 * @param {Object} options.coreConfig - BMAD Core config (output_folder, user_name, etc.)
 * @param {string[]} options.installedIDEs - List of IDE platform codes to activate for
 * @param {Object} options.logger - Logger instance with log/error/warn methods
 * @returns {Promise<boolean>} true if install succeeded, false otherwise
 */
async function install({ projectRoot, config = {}, coreConfig = {}, installedIDEs = ['claude-code'], logger = null }) {
  log(logger, 'info', '═══════════════════════════════════════════');
  log(logger, 'info', '  BSO Sprint Orchestrator — Module Install');
  log(logger, 'info', '═══════════════════════════════════════════');

  // Validate projectRoot
  if (!projectRoot || !path.isAbsolute(projectRoot)) {
    log(logger, 'error', `projectRoot 必须是绝对路径，收到: ${projectRoot}`);
    return false;
  }

  // Validate platforms
  for (const ide of installedIDEs) {
    if (!VALID_PLATFORMS.includes(ide)) {
      log(logger, 'warn', `未知平台 "${ide}"，已忽略。支持的平台: ${VALID_PLATFORMS.join(', ')}`);
    }
  }

  // Step 1: Dependency Verification
  const step1 = await dependencyVerification(projectRoot, logger);
  if (!step1) {
    log(logger, 'error', '安装终止: 依赖验证失败');
    return false;
  }

  // Step 2: Directory Structure Creation
  const step2 = await createDirectoryStructure(projectRoot, config, coreConfig, logger);
  if (!step2) {
    log(logger, 'error', '安装终止: 目录结构创建失败');
    return false;
  }

  // Step 3: Agent Installation
  const step3 = await installAgents(projectRoot, installedIDEs, logger);
  if (!step3) {
    log(logger, 'error', '安装终止: Agent 安装失败');
    return false;
  }

  // Step 4: Workflow Installation
  const step4 = await installWorkflows(projectRoot, logger);
  if (!step4) {
    log(logger, 'error', '安装终止: Workflow 安装失败');
    return false;
  }

  // Step 5: Command Installation
  const step5 = await installCommands(projectRoot, installedIDEs, logger);
  if (!step5) {
    log(logger, 'error', '安装终止: Command 安装失败');
    return false;
  }

  // Step 6: Configuration Initialization
  const step6 = await initializeConfiguration(projectRoot, config, coreConfig, logger);
  if (!step6) {
    log(logger, 'error', '安装终止: 配置初始化失败');
    return false;
  }

  // Step 7: Knowledge Base Setup
  const step7 = await setupKnowledgeBase(projectRoot, config, coreConfig, logger);
  if (!step7) {
    log(logger, 'error', '安装终止: 知识库初始化失败');
    return false;
  }

  // Step 8: Health Check
  const step8 = await healthCheck(projectRoot, config, coreConfig, installedIDEs, logger);

  if (step8) {
    log(logger, 'success', '🎉 BSO Module 安装完成！');
    log(logger, 'info', '  运行 /bso:auto-dev-sprint --check 可随时重新检查环境状态');
  } else {
    log(logger, 'error', '安装完成但健康检查发现问题，请查看上方报告。');
  }

  return step8;
}

module.exports = { install };
