const fs = require('fs-extra');
const chalk = require('chalk');
const path = require('path');
const os = require('os');
const { logPath } = require('./logger');

// Cascading redo: re-apply the selected operation *and all operations after it*
// For every operation re-applied we:
// 1. Backup the current file (if it exists) to ~/.gcundo/backups/{id}-redo.bak
// 2. Perform the appropriate filesystem action depending on op.type
//    - file_edit   : write the `after` content
//    - file_create : write the `after` content (or empty string if undefined)
//    - file_delete : delete the file if it exists
// 3. Skip unsupported types with a fallback message
// 4. When finished log: "Cascading redo completed from index N."
async function redoOperation(index) {
  // Ensure log exists
  if (!await fs.pathExists(logPath)) {
    console.log(chalk.red('Error: No log file found.'));
    return;
  }

  const lines = (await fs.readFile(logPath, 'utf-8'))
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  let ops;
  try {
    ops = lines.map(line => JSON.parse(line));
  } catch (parseErr) {
    console.log(chalk.red('Error: Malformed JSON in log file.'));
    return;
  }

  // Validate index
  if (index < 0 || index >= ops.length) {
    console.log(chalk.red('Error: Invalid operation index.'));
    return;
  }

  // Prepare backup directory once
  const backupDir = path.join(os.homedir(), '.gcundo', 'backups');
  await fs.ensureDir(backupDir);

  // Iterate forward from selected index to the latest operation
  for (let i = index; i < ops.length; i++) {
    const op = ops[i];
    const filePath = path.resolve(op.file);

    // 1. Backup current state if the file exists
    if (await fs.pathExists(filePath)) {
      try {
        await fs.copy(filePath, path.join(backupDir, `${op.id}-redo.bak`));
      } catch (copyErr) {
        console.log(chalk.red(`Error: Failed to backup ${op.file} - ${copyErr.message}`));
      }
    }

    // 2. Re-apply operation
    try {
      switch (op.type) {
        case 'file_edit':
          await fs.outputFile(filePath, op.after, 'utf-8');
          console.log(`Re-applied changes to: ${op.file}`);
          break;
        case 'file_create':
          await fs.outputFile(filePath, op.after || '', 'utf-8');
          console.log(`Recreated file: ${op.file}`);
          break;
        case 'file_delete':
          if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            console.log(`Deleted file again: ${op.file}`);
          }
          break;
        default:
          console.log(`Redo not supported for operation type: ${op.type}.`);
      }
    } catch (fileErr) {
      console.log(chalk.red(`Error: Failed to redo operation on ${op.file} - ${fileErr.message}`));
    }
  }

  // 3. Final log
  console.log(`Cascading redo completed from index ${index}.`);
}

module.exports = { redoOperation };
