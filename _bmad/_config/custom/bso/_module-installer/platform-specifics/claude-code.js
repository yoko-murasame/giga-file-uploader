/**
 * Claude Code Platform Handler
 * Handles Agent activation and Command installation for Claude Code IDE.
 * Strictly follows install.md Step 3 and Step 5 specifications.
 * Uses ONLY Node.js built-in modules (no fs-extra, no chalk).
 *
 * @module bso/_module-installer/platform-specifics/claude-code
 */

const path = require('node:path');
const fs = require('node:fs/promises');

// --- fs helpers (same pattern as installer.js) ---

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

// 6 Agents with bso- prefix for activation (strict match with install.md)
const AGENT_FILES = [
  'story-creator.md',
  'story-reviewer.md',
  'dev-runner.md',
  'review-runner.md',
  'e2e-inspector.md',
  'knowledge-researcher.md',
];

// 1 Command
const COMMAND_FILE = 'auto-dev-sprint.md';

/**
 * Install Agent activation files to .claude/agents/bso-{name}.md
 * Per install.md Step 3: each agent gets a bso- prefix in the activation directory.
 * All 6 agents are installed unconditionally.
 *
 * @param {Object} options
 * @param {string} options.projectRoot - Project root absolute path
 * @param {string} options.srcDir - Source directory containing agent .md files
 * @param {string[]} options.agentFiles - List of agent filenames
 * @param {Object} options.logger - Logger instance
 * @returns {Promise<boolean>}
 */
async function installAgents({ projectRoot, srcDir, agentFiles = AGENT_FILES, logger }) {
  const activationDir = path.join(projectRoot, '.claude', 'agents');
  await ensureDir(activationDir);

  let installedCount = 0;

  for (const agentFile of agentFiles) {
    const srcPath = path.join(srcDir, agentFile);
    // Add bso- prefix for activation
    const destPath = path.join(activationDir, `bso-${agentFile}`);

    if (!await pathExists(srcPath)) {
      logMsg(logger, 'error', `  Agent 源文件不存在: ${srcPath}`);
      return false;
    }

    await copyFile(srcPath, destPath);
    installedCount++;
    logMsg(logger, 'info', `  激活: bso-${agentFile} → .claude/agents/`);
  }

  logMsg(logger, 'success', `  Claude Code: ${installedCount} 个 Agent 已激活`);
  return true;
}

/**
 * Install Command file to .claude/commands/bso/auto-dev-sprint.md
 * Per install.md Step 5.
 *
 * @param {Object} options
 * @param {string} options.projectRoot - Project root absolute path
 * @param {string} options.srcPath - Source path of the command file
 * @param {string} options.commandFile - Command filename
 * @param {Object} options.logger - Logger instance
 * @returns {Promise<boolean>}
 */
async function installCommands({ projectRoot, srcPath, commandFile = COMMAND_FILE, logger }) {
  const destDir = path.join(projectRoot, '.claude', 'commands', 'bso');
  await ensureDir(destDir);

  const destPath = path.join(destDir, commandFile);

  if (!await pathExists(srcPath)) {
    logMsg(logger, 'error', `  Command 源文件不存在: ${srcPath}`);
    return false;
  }

  await copyFile(srcPath, destPath);
  logMsg(logger, 'success', `  Claude Code: ${commandFile} → .claude/commands/bso/`);
  return true;
}

// --- Logging Helper ---

function logMsg(logger, level, msg) {
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

module.exports = { installAgents, installCommands };
