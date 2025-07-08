const fs = require('fs');
const { logPath } = require('./logger');

async function listOperations() {
  if (!fs.existsSync(logPath)) {
    console.log('No operations logged yet.');
    return;
  }

  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
  const ops = lines.map(line => JSON.parse(line));

  console.log('Operations:\n');
  ops.forEach((op, i) => {
    console.log(`${i + 1}. [${op.type}] ${op.file || op.command}`);
  });
}

module.exports = { listOperations };
