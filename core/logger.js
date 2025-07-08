const fs = require('fs-extra');
const path = require('path');

const logDir = path.resolve(__dirname, '..', 'logs');
const logPath = path.join(logDir, 'log.jsonl');

function logOperation(op) {
  const enrichedOp = {
    ...op,
    id: `op_${Date.now()}`,
    timestamp: new Date().toISOString()
  };

  fs.ensureDirSync(logDir);
  fs.appendFileSync(logPath, JSON.stringify(enrichedOp) + '\n');
}

module.exports = {
  logOperation,
  logPath
};
