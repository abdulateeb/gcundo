const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { logPath } = require('./logger');

async function previewOperation(index) {
  if (!fs.existsSync(logPath)) {
    console.log('No log file found.');
    return;
  }

  const lines = fs.readFileSync(logPath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const ops = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);

  if (index < 0 || index >= ops.length) {
    console.log('Invalid operation index.');
    return;
  }

  const op = ops[index];

  console.log(`\n${chalk.cyan('Previewing Operation')}: ${chalk.yellow(op.id)}`);
  console.log(`${chalk.green('Type')}: ${op.type}`);
  console.log(`${chalk.green('File')}: ${op.file}`);
  console.log(`${chalk.green('Timestamp')}: ${op.timestamp}`);

  if (op.type === 'file_edit') {
    console.log(`\n${chalk.bold('Before')}:\n${chalk.red(op.before)}`);
    console.log(`\n${chalk.bold('After')}:\n${chalk.green(op.after)}`);
  } else if (op.type === 'file_create') {
    console.log(`\n${chalk.bold('Created Content')}:\n${chalk.green(op.after)}`);
  } else if (op.type === 'file_delete') {
    console.log(`\n${chalk.bold('Deleted Content')}:\n${chalk.red(op.before)}`);
  } else {
    console.log('Preview not supported for this operation type.');
  }
}

module.exports = { previewOperation };
