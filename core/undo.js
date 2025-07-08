const fs = require('fs-extra');
const chalk = require('chalk');
const path = require('path');
const os = require('os');
const { logPath } = require('./logger');

// Cascading undo: revert the selected operation *and all operations after it*
// For every operation reverted we:
// 1. Backup the current file (if it exists) to ~/.gcundo/backups/{id}-undo.bak
// 2. Perform the appropriate filesystem action depending on op.type
//    - file_edit   : restore the `before` content
//    - file_create : delete the file
//    - file_delete : recreate the file with `before` content
// 3. If the type is unknown we print a fallback message
// 4. When finished we print: "Cascading undo completed from index N." (N = received index)
// NOTE: We iterate **backwards** from the newest operation down to the provided index
async function undoOperation(index) {
  // Ensure the log exists
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

  // Iterate from newest operation to the selected index (inclusive)
  for (let i = ops.length - 1; i >= index; i--) {
    const op = ops[i];
    const filePath = path.resolve(op.file);

    // 1. Backup current state if the file exists (ignore errors silently)
    if (await fs.pathExists(filePath)) {
      try {
        await fs.copy(filePath, path.join(backupDir, `${op.id}-undo.bak`));
      } catch (copyErr) {
        console.log(chalk.red(`Error: Failed to backup ${op.file} - ${copyErr.message}`));
      }
    }

    // 2. Perform undo action based on operation type
    try {
      switch (op.type) {
        case 'file_edit':
          await fs.outputFile(filePath, op.before, 'utf-8');
          console.log(`Reverted changes to: ${op.file}`);
          break;
        case 'file_create':
          if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            console.log(`Deleted file created earlier: ${op.file}`);
          }
          break;
        case 'file_delete':
          await fs.outputFile(filePath, op.before, 'utf-8');
          console.log(`Restored deleted file: ${op.file}`);
          break;
        default:
          console.log(`Undo not supported for operation type: ${op.type}.`);
      }
    } catch (fileErr) {
      console.log(chalk.red(`Error: Failed to undo operation on ${op.file} - ${fileErr.message}`));
    }
  }

  // 4. Final log
  console.log(`Cascading undo completed from index ${index}.`);
}

module.exports = { undoOperation };
