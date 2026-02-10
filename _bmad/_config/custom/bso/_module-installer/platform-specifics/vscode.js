/**
 * VS Code Platform Handler (Placeholder)
 * Future implementation for VS Code IDE integration.
 *
 * @module bso/_module-installer/platform-specifics/vscode
 */

/**
 * Install Agent activation files for VS Code.
 * Currently a placeholder — logs a message and returns true.
 */
async function installAgents({ projectRoot, srcDir, agentFiles, logger }) {
  logInfo(logger, '  VS Code: Agent 安装暂未实现具体配置，后续版本支持');
  return true;
}

/**
 * Install Command files for VS Code.
 * Currently a placeholder — logs a message and returns true.
 */
async function installCommands({ projectRoot, srcPath, commandFile, logger }) {
  logInfo(logger, '  VS Code: Command 安装暂未实现具体配置，后续版本支持');
  return true;
}

function logInfo(logger, msg) {
  if (logger && typeof logger.info === 'function') {
    logger.info(msg);
  } else {
    console.log(`ℹ ${msg}`);
  }
}

module.exports = { installAgents, installCommands };
