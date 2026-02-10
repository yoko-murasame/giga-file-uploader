/**
 * Antigravity Platform Handler (Placeholder)
 * Future implementation for Antigravity IDE integration.
 *
 * @module bso/_module-installer/platform-specifics/antigravity
 */

/**
 * Install Agent activation files for Antigravity.
 * Currently a placeholder — logs a message and returns true.
 */
async function installAgents({ projectRoot, srcDir, agentFiles, logger }) {
  logInfo(logger, '  Antigravity: Agent 安装暂未实现具体配置，后续版本支持');
  return true;
}

/**
 * Install Command files for Antigravity.
 * Currently a placeholder — logs a message and returns true.
 */
async function installCommands({ projectRoot, srcPath, commandFile, logger }) {
  logInfo(logger, '  Antigravity: Command 安装暂未实现具体配置，后续版本支持');
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
