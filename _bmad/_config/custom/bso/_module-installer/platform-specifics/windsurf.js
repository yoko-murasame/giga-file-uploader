/**
 * Windsurf Platform Handler (Placeholder)
 * Future implementation for Windsurf IDE integration.
 *
 * @module bso/_module-installer/platform-specifics/windsurf
 */

/**
 * Install Agent activation files for Windsurf.
 * Currently a placeholder — logs a message and returns true.
 */
async function installAgents({ projectRoot, srcDir, agentFiles, logger }) {
  logInfo(logger, '  Windsurf: Agent 安装暂未实现具体配置，后续版本支持');
  return true;
}

/**
 * Install Command files for Windsurf.
 * Currently a placeholder — logs a message and returns true.
 */
async function installCommands({ projectRoot, srcPath, commandFile, logger }) {
  logInfo(logger, '  Windsurf: Command 安装暂未实现具体配置，后续版本支持');
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
