const chalk = require('chalk');
const path = require('path');
const { 
  getActiveOperations, 
  getUndoneOperations, 
  loadOperations,
  generateOperationSummary,
  getOperationsByType 
} = require('./sessions');
const { OPERATION_TYPES, UNDO_STATES } = require('./logger');

// Enhanced operation listing with sophisticated filtering
async function listOperations(filter) {
  let operations;
  let title = 'Recent Operations';
  
  // Determine which operations to show based on filter
  switch (filter) {
    case 'all':
      operations = loadOperations();
      title = 'All Operations';
      break;
    case 'undone':
      operations = getUndoneOperations();
      title = 'Undone Operations';
      break;
    case 'active':
    default:
      operations = getActiveOperations();
      title = 'Active Operations';
      break;
  }

  if (operations.length === 0) {
    console.log(chalk.yellow(`No ${filter || 'active'} operations found.`));
    return;
  }

  // Sort by timestamp (newest first)
  operations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  console.log(chalk.bold(`\n${title}:\n`));

  // Display operations in a formatted table
  operations.forEach((op, index) => {
    displayOperation(op, index + 1);
  });

  // Show summary statistics
  displaySummary(operations);
}

// Display a single operation with rich formatting
function displayOperation(operation, displayIndex) {
  const timestamp = new Date(operation.timestamp).toLocaleString();
  const summary = generateOperationSummary(operation);
  
  // Color coding based on operation type and state
  let typeColor = chalk.cyan;
  let statusMarker = '●';
  let statusColor = chalk.green;
  
  switch (operation.type) {
    case OPERATION_TYPES.FILE_CREATE:
      typeColor = chalk.green;
      break;
    case OPERATION_TYPES.FILE_DELETE:
      typeColor = chalk.red;
      break;
    case OPERATION_TYPES.FILE_EDIT:
      typeColor = chalk.yellow;
      break;
    case OPERATION_TYPES.COMMAND_EXECUTION:
      typeColor = chalk.magenta;
      break;
  }
  
  if (operation.undoState === UNDO_STATES.UNDONE) {
    statusColor = chalk.gray;
    statusMarker = '○';
  }
  
  // Format the line
  const indexStr = chalk.dim(`${displayIndex}.`.padEnd(4));
  const timeStr = chalk.dim(`[${timestamp}]`);
  const typeStr = typeColor(`[${operation.type}]`);
  const statusStr = statusColor(statusMarker);
  const idStr = chalk.gray(`(${operation.id})`);
  
  console.log(`${indexStr}${statusStr} ${timeStr} ${typeStr} ${summary} ${idStr}`);
  
  // Show additional details for complex operations
  if (operation.operation === 'string_replace') {
    const oldStr = truncateString(operation.oldString, 40);
    const newStr = truncateString(operation.newString, 40);
    console.log(chalk.dim(`      ↳ Replace: "${oldStr}" → "${newStr}"`));
    if (operation.lineNumber) {
      console.log(chalk.dim(`        Line: ${operation.lineNumber}`));
    }
  }
  
  if (operation.type === OPERATION_TYPES.COMMAND_EXECUTION) {
    console.log(chalk.dim(`      ↳ Command: ${operation.command}`));
    if (operation.workingDirectory && operation.workingDirectory !== process.cwd()) {
      console.log(chalk.dim(`        Working Dir: ${operation.workingDirectory}`));
    }
    if (operation.exitCode !== undefined && operation.exitCode !== 0) {
      console.log(chalk.red(`        Exit Code: ${operation.exitCode}`));
    }
  }
}

// Display summary statistics
function displaySummary(operations) {
  const typeStats = {};
  let activeCount = 0;
  let undoneCount = 0;
  
  operations.forEach(op => {
    // Count by type
    if (!typeStats[op.type]) {
      typeStats[op.type] = 0;
    }
    typeStats[op.type]++;
    
    // Count by status
    if (op.undoState === UNDO_STATES.UNDONE) {
      undoneCount++;
    } else {
      activeCount++;
    }
  });
  
  console.log(chalk.dim('\n─'.repeat(60)));
  console.log(chalk.bold('Summary:'));
  console.log(`  Total: ${operations.length} operations`);
  console.log(`  Active: ${chalk.green(activeCount)} | Undone: ${chalk.gray(undoneCount)}`);
  
  if (Object.keys(typeStats).length > 1) {
    console.log('\nBy Type:');
    Object.entries(typeStats).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  }
}

// List operations by file
async function listOperationsByFile(filePath) {
  const allOps = loadOperations();
  const fileOps = allOps.filter(op => op.file === filePath);
  
  if (fileOps.length === 0) {
    console.log(chalk.yellow(`No operations found for file: ${filePath}`));
    return;
  }
  
  // Sort chronologically 
  fileOps.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  console.log(chalk.bold(`\nOperations for: ${filePath}\n`));
  
  fileOps.forEach((op, index) => {
    displayOperation(op, index + 1);
  });
  
  displaySummary(fileOps);
}

// List operations by type
async function listOperationsByType(operationType) {
  if (!Object.values(OPERATION_TYPES).includes(operationType)) {
    console.log(chalk.red(`Invalid operation type: ${operationType}`));
    console.log(chalk.yellow(`Valid types: ${Object.values(OPERATION_TYPES).join(', ')}`));
    return;
  }
  
  const operations = getOperationsByType(operationType, false); // include undone
  
  if (operations.length === 0) {
    console.log(chalk.yellow(`No operations found of type: ${operationType}`));
    return;
  }
  
  // Sort by timestamp (newest first)
  operations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  console.log(chalk.bold(`\nOperations of type: ${operationType}\n`));
  
  operations.forEach((op, index) => {
    displayOperation(op, index + 1);
  });
  
  displaySummary(operations);
}

// Utility function to truncate strings for display
function truncateString(str, maxLength = 50) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

// List operations with pagination
async function listOperationsPaged(pageSize = 10, page = 1) {
  const operations = getActiveOperations()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  const totalPages = Math.ceil(operations.length / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageOps = operations.slice(startIndex, endIndex);
  
  if (pageOps.length === 0) {
    console.log(chalk.yellow('No operations found on this page.'));
    return;
  }
  
  console.log(chalk.bold(`\nOperations (Page ${page} of ${totalPages}):\n`));
  
  pageOps.forEach((op, index) => {
    displayOperation(op, startIndex + index + 1);
  });
  
  if (totalPages > 1) {
    console.log(chalk.dim(`\nShowing ${startIndex + 1}-${Math.min(endIndex, operations.length)} of ${operations.length} operations`));
    if (page < totalPages) {
      console.log(chalk.cyan(`Use 'gcundo list --page ${page + 1}' for next page`));
    }
  }
}

module.exports = {
  listOperations,
  listOperationsByFile,
  listOperationsByType,
  listOperationsPaged,
  displayOperation
};
