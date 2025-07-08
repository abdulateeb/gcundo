const fs = require('fs-extra');
const chalk = require('chalk');
const path = require('path');
const { logPath } = require('./logger');

/**
 * Delete a single operation from the log by its index.
 * Useful for sanitising malformed or obsolete entries so that
 * cascading undo/redo remains consistent.
 *
 * @param {number} index - Index (0-based) of the operation to remove.
 */
async function deleteOperation(index) {
  try {
    if (!fs.existsSync(logPath)) {
      console.log(chalk.red('Error: No log file found.'));
      return;
    }

    const lines = fs.readFileSync(logPath, 'utf-8')
      .split('\n')
      .filter(line => line.trim().length > 0);

    if (index < 0 || index >= lines.length) {
      console.log(chalk.red('Error: Invalid operation index.'));
      return;
    }

    let removed;
    try {
      removed = JSON.parse(lines[index]);
    } catch (jsonErr) {
      console.log(chalk.red(`Error: Malformed JSON at index ${index}.`));
      return;
    }

    const remaining = lines.filter((_, i) => i !== index);
    try {
      fs.writeFileSync(logPath, remaining.join('\n') + '\n');
    } catch (writeErr) {
      console.log(chalk.red(`Error: Failed to write log file - ${writeErr.message}`));
      return;
    }

    console.log(`Deleted operation [${removed.type}] on ${removed.file}`);
  } catch (err) {
    console.log(chalk.red(`Error: ${err.message}`));
  }
}

module.exports = { deleteOperation };
