const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const { 
  getOperationById, 
  getActiveOperations, 
  getUndoneOperations,
  generateOperationSummary,
  getOperationsAfter 
} = require('./sessions');
const { OPERATION_TYPES, OPERATION_MODES, UNDO_STATES } = require('./logger');

// Preview what an undo operation would do
async function previewOperation(operationIdOrIndex, action = 'undo') {
  let operation;
  
  // Resolve operation by ID or index
  if (typeof operationIdOrIndex === 'string' && operationIdOrIndex.startsWith('op_')) {
    operation = getOperationById(operationIdOrIndex);
    if (!operation) {
      console.log(chalk.red(`Operation not found: ${operationIdOrIndex}`));
      return;
    }
  } else {
    const index = parseInt(operationIdOrIndex, 10);
    if (isNaN(index)) {
      console.log(chalk.red(`Invalid operation identifier: ${operationIdOrIndex}`));
      return;
    }
    
    const operations = action === 'undo' ? 
      getActiveOperations().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) :
      getUndoneOperations().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    if (index < 0 || index >= operations.length) {
      console.log(chalk.red(`Invalid operation index: ${index + 1}. Available: 1-${operations.length}`));
      return;
    }
    
    operation = operations[index];
  }

  console.log(chalk.bold(`\nPreview ${action.toUpperCase()} Operation:\n`));
  
  // Show the operation details
  console.log(chalk.cyan('Target Operation:'));
  console.log(`  ID: ${operation.id}`);
  console.log(`  Type: ${operation.type}`);
  console.log(`  Timestamp: ${new Date(operation.timestamp).toLocaleString()}`);
  console.log(`  Summary: ${generateOperationSummary(operation)}`);
  console.log(`  Status: ${operation.undoState === UNDO_STATES.UNDONE ? chalk.gray('undone') : chalk.green('active')}`);
  
  if (operation.file) {
    console.log(`  File: ${operation.file}`);
  }

  // Show cascading effects for undo
  if (action === 'undo' && operation.undoState === UNDO_STATES.ACTIVE) {
    const cascadingOps = getOperationsAfter(operation);
    if (cascadingOps.length > 0) {
      console.log(chalk.yellow('\nCascading Effects:'));
      console.log(chalk.yellow(`${cascadingOps.length} subsequent operations will also be undone:`));
      cascadingOps.reverse().forEach((op, i) => {
        console.log(`  ${i + 1}. ${generateOperationSummary(op)} (${op.id})`);
      });
    }
  }

  // Show detailed effects based on operation type
  console.log(chalk.bold('\nDetailed Effects:'));
  await previewOperationEffects(operation, action);
  
  // Show file status
  if (operation.file) {
    await showFileStatus(operation.file);
  }
  
  console.log(chalk.dim('\nNote: This is a preview only. No changes have been made.'));
}

// Preview the specific effects of an operation
async function previewOperationEffects(operation, action) {
  switch (operation.type) {
    case OPERATION_TYPES.FILE_EDIT:
      await previewFileEditEffects(operation, action);
      break;
    case OPERATION_TYPES.FILE_CREATE:
      await previewFileCreateEffects(operation, action);
      break;
    case OPERATION_TYPES.FILE_DELETE:
      await previewFileDeleteEffects(operation, action);
      break;
    case OPERATION_TYPES.COMMAND_EXECUTION:
      previewCommandExecutionEffects(operation, action);
      break;
    default:
      console.log(chalk.yellow(`  Preview not available for operation type: ${operation.type}`));
  }
}

// Preview file edit effects
async function previewFileEditEffects(operation, action) {
  const filePath = operation.file;
  const exists = await fs.pathExists(filePath);
  
  console.log(`  File Edit Operation on: ${filePath}`);
  console.log(`  File currently exists: ${exists ? chalk.green('Yes') : chalk.red('No')}`);
  
  if (operation.operation === OPERATION_MODES.STRING_REPLACE) {
    // String-based edit preview
    console.log(`  Edit Type: String replacement`);
    console.log(`  Old Text: "${chalk.red(operation.oldString)}"`);
    console.log(`  New Text: "${chalk.green(operation.newString)}"`);
    if (operation.lineNumber) {
      console.log(`  Line Number: ${operation.lineNumber}`);
    }
    
    if (action === 'undo') {
      console.log(`  ${chalk.yellow('Undo Effect:')} Replace "${operation.newString}" back to "${operation.oldString}"`);
    } else {
      console.log(`  ${chalk.cyan('Redo Effect:')} Replace "${operation.oldString}" with "${operation.newString}"`);
    }
  } else {
    // Full content edit preview
    console.log(`  Edit Type: Full content replacement`);
    
    if (action === 'undo' && operation.before) {
      console.log(`  ${chalk.yellow('Undo Effect:')} Restore previous content (${operation.before.length} characters)`);
    } else if (action === 'redo' && operation.after) {
      console.log(`  ${chalk.cyan('Redo Effect:')} Apply new content (${operation.after.length} characters)`);
    }
  }
}

// Preview file creation effects
async function previewFileCreateEffects(operation, action) {
  const filePath = operation.file;
  const exists = await fs.pathExists(filePath);
  
  console.log(`  File Creation Operation: ${filePath}`);
  console.log(`  File currently exists: ${exists ? chalk.green('Yes') : chalk.red('No')}`);
  
  if (action === 'undo') {
    if (exists) {
      console.log(`  ${chalk.yellow('Undo Effect:')} Delete the file`);
      console.log(`  ${chalk.red('Warning:')} File will be backed up before deletion`);
    } else {
      console.log(`  ${chalk.gray('Undo Effect:')} File already doesn't exist - no action needed`);
    }
  } else {
    const contentLength = operation.after ? operation.after.length : 0;
    console.log(`  ${chalk.cyan('Redo Effect:')} Create file with ${contentLength} characters`);
    if (!exists) {
      console.log(`  ${chalk.green('Safe:')} File doesn't currently exist`);
    } else {
      console.log(`  ${chalk.yellow('Warning:')} Will overwrite existing file`);
    }
  }
}

// Preview file deletion effects
async function previewFileDeleteEffects(operation, action) {
  const filePath = operation.file;
  const exists = await fs.pathExists(filePath);
  
  console.log(`  File Deletion Operation: ${filePath}`);
  console.log(`  File currently exists: ${exists ? chalk.green('Yes') : chalk.red('No')}`);
  
  if (action === 'undo') {
    if (operation.before) {
      console.log(`  ${chalk.yellow('Undo Effect:')} Restore file with ${operation.before.length} characters`);
      if (exists) {
        console.log(`  ${chalk.yellow('Warning:')} Will overwrite existing file`);
      } else {
        console.log(`  ${chalk.green('Safe:')} File doesn't currently exist`);
      }
    } else {
      console.log(`  ${chalk.red('Error:')} No backup content available to restore file`);
    }
  } else {
    console.log(`  ${chalk.cyan('Redo Effect:')} Delete the file`);
    if (exists) {
      console.log(`  ${chalk.red('Warning:')} File will be backed up before deletion`);
    } else {
      console.log(`  ${chalk.gray('Redo Effect:')} File already doesn't exist - no action needed`);
    }
  }
}

// Preview command execution effects
function previewCommandExecutionEffects(operation, action) {
  console.log(`  Command Execution: ${operation.command}`);
  if (operation.workingDirectory) {
    console.log(`  Working Directory: ${operation.workingDirectory}`);
  }
  if (operation.exitCode !== undefined) {
    console.log(`  Exit Code: ${operation.exitCode}`);
  }
  
  console.log(`  ${chalk.yellow('Note:')} Command operations cannot be automatically ${action}done`);
  console.log(`  ${chalk.cyan('Effect:')} Operation will be marked as ${action}done for tracking only`);
  
  if (action === 'redo') {
    console.log(`  ${chalk.blue('Manual Action:')} You may need to re-run: ${operation.command}`);
  }
}

// Show current file status
async function showFileStatus(filePath) {
  console.log(chalk.bold('\nFile Status:'));
  
  if (!await fs.pathExists(filePath)) {
    console.log(`  ${chalk.red('✗')} File does not exist: ${filePath}`);
    return;
  }
  
  try {
    const stats = await fs.stat(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    
    console.log(`  ${chalk.green('✓')} File exists: ${filePath}`);
    console.log(`  Size: ${stats.size} bytes (${content.length} characters)`);
    console.log(`  Modified: ${stats.mtime.toLocaleString()}`);
    
    // Show first few lines for context
    const lines = content.split('\n');
    const previewLines = lines.slice(0, 3);
    if (previewLines.length > 0) {
      console.log(`  Content preview:`);
      previewLines.forEach((line, i) => {
        console.log(`    ${i + 1}: ${line.substring(0, 60)}${line.length > 60 ? '...' : ''}`);
      });
      if (lines.length > 3) {
        console.log(`    ... (${lines.length - 3} more lines)`);
      }
    }
  } catch (error) {
    console.log(`  ${chalk.red('Error')} reading file: ${error.message}`);
  }
}

// Preview redo operation
async function previewRedo(operationIdOrIndex) {
  await previewOperation(operationIdOrIndex, 'redo');
}

module.exports = {
  previewOperation,
  previewRedo,
  previewOperationEffects,
  showFileStatus
};