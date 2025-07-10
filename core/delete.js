const chalk = require('chalk');
const fs = require('fs-extra');
const { 
  getOperationById, 
  getActiveOperations, 
  getUndoneOperations,
  loadOperations,
  generateOperationSummary 
} = require('./sessions');
const { logPath } = require('./logger');
const path = require('path');

// Delete operation by ID or index
async function deleteOperation(operationIdOrIndex) {
  let operation;
  
  // Resolve operation by ID or index
  if (typeof operationIdOrIndex === 'string' && operationIdOrIndex.startsWith('op_')) {
    operation = getOperationById(operationIdOrIndex);
    if (!operation) {
      throw new Error(`Operation not found: ${operationIdOrIndex}`);
    }
  } else {
    const index = parseInt(operationIdOrIndex, 10);
    if (isNaN(index)) {
      throw new Error(`Invalid operation identifier: ${operationIdOrIndex}`);
    }
    
    const allOps = loadOperations()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    if (index < 0 || index >= allOps.length) {
      throw new Error(`Invalid operation index: ${index + 1}. Available: 1-${allOps.length}`);
    }
    
    operation = allOps[index];
  }

  // Confirm deletion
  console.log(chalk.yellow('⚠️  Warning: Deleting operation from log'));
  console.log(`Operation: ${generateOperationSummary(operation)} (${operation.id})`);
  console.log(`Timestamp: ${new Date(operation.timestamp).toLocaleString()}`);
  
  // Remove the operation from the log
  await removeOperationFromLog(operation.id);
  
  console.log(chalk.green(`✓ Operation deleted: ${operation.id}`));
  
  return { deleted: operation };
}

// Remove operation from the log file
async function removeOperationFromLog(operationId) {
  if (!fs.existsSync(logPath)) {
    throw new Error('No log file found');
  }
  
  const lines = fs.readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());
  
  // Filter out the operation to delete
  const filteredLines = lines.filter(line => {
    try {
      const op = JSON.parse(line);
      return op.id !== operationId;
    } catch (e) {
      // Keep malformed lines (shouldn't happen but be safe)
      return true;
    }
  });
  
  if (filteredLines.length === lines.length) {
    throw new Error(`Operation ${operationId} not found in log`);
  }
  
  // Create backup before modifying
  await createLogBackup();
  
  // Write the filtered log
  fs.writeFileSync(logPath, filteredLines.join('\n') + (filteredLines.length > 0 ? '\n' : ''));
}

// Delete multiple operations by their IDs
async function deleteMultiple(operationIds) {
  const results = [];
  
  for (const id of operationIds) {
    try {
      const result = await deleteOperation(id);
      results.push({ success: true, ...result });
    } catch (error) {
      results.push({ success: false, id, error: error.message });
    }
  }
  
  return results;
}

// Delete all undone operations (cleanup)
async function deleteAllUndone() {
  const undoneOps = getUndoneOperations();
  
  if (undoneOps.length === 0) {
    throw new Error('No undone operations to delete');
  }
  
  console.log(chalk.yellow(`⚠️  Warning: Deleting ${undoneOps.length} undone operations`));
  
  const results = [];
  
  for (const operation of undoneOps) {
    try {
      await removeOperationFromLog(operation.id);
      results.push({ success: true, deleted: operation });
    } catch (error) {
      results.push({ success: false, operation: operation.id, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(chalk.green(`✓ Deleted ${successCount} undone operations`));
  
  return { deleted: successCount, results };
}

// Delete operations older than a certain date
async function deleteOlderThan(date) {
  const cutoffDate = new Date(date);
  const allOps = loadOperations();
  
  const oldOps = allOps.filter(op => new Date(op.timestamp) < cutoffDate);
  
  if (oldOps.length === 0) {
    throw new Error(`No operations found older than ${cutoffDate.toLocaleDateString()}`);
  }
  
  console.log(chalk.yellow(`⚠️  Warning: Deleting ${oldOps.length} operations older than ${cutoffDate.toLocaleDateString()}`));
  
  const results = [];
  
  for (const operation of oldOps) {
    try {
      await removeOperationFromLog(operation.id);
      results.push({ success: true, deleted: operation });
    } catch (error) {
      results.push({ success: false, operation: operation.id, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(chalk.green(`✓ Deleted ${successCount} old operations`));
  
  return { deleted: successCount, results };
}

// Delete operations by file path
async function deleteOperationsByFile(filePath) {
  const allOps = loadOperations();
  const fileOps = allOps.filter(op => op.file === filePath);
  
  if (fileOps.length === 0) {
    throw new Error(`No operations found for file: ${filePath}`);
  }
  
  console.log(chalk.yellow(`⚠️  Warning: Deleting ${fileOps.length} operations for file: ${filePath}`));
  
  const results = [];
  
  for (const operation of fileOps) {
    try {
      await removeOperationFromLog(operation.id);
      results.push({ success: true, deleted: operation });
    } catch (error) {
      results.push({ success: false, operation: operation.id, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(chalk.green(`✓ Deleted ${successCount} operations for ${filePath}`));
  
  return { deleted: successCount, results };
}

// Create backup of log file before deletion
async function createLogBackup() {
  if (!fs.existsSync(logPath)) return;
  
  const backupDir = path.resolve(__dirname, '..', 'backups');
  await fs.ensureDir(backupDir);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `log.${timestamp}.bak`);
  
  await fs.copyFile(logPath, backupPath);
}

// Compact log file (remove gaps, reformat)
async function compactLog() {
  const operations = loadOperations();
  
  if (operations.length === 0) {
    console.log(chalk.yellow('Log is empty, nothing to compact'));
    return;
  }
  
  // Create backup
  await createLogBackup();
  
  // Sort operations by timestamp and rewrite the log
  const sortedOps = operations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  const compactedLines = sortedOps.map(op => JSON.stringify(op));
  fs.writeFileSync(logPath, compactedLines.join('\n') + '\n');
  
  console.log(chalk.green(`✓ Log compacted: ${operations.length} operations`));
  
  return { compacted: operations.length };
}

// Validate log file integrity
async function validateLog() {
  if (!fs.existsSync(logPath)) {
    console.log(chalk.yellow('No log file found'));
    return { valid: true, issues: [] };
  }
  
  const lines = fs.readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());
  
  const issues = [];
  const validOps = [];
  
  lines.forEach((line, index) => {
    try {
      const op = JSON.parse(line);
      
      // Check required fields
      if (!op.id) {
        issues.push(`Line ${index + 1}: Missing operation ID`);
      }
      if (!op.timestamp) {
        issues.push(`Line ${index + 1}: Missing timestamp`);
      }
      if (!op.type) {
        issues.push(`Line ${index + 1}: Missing operation type`);
      }
      
      // Check timestamp format
      if (op.timestamp && isNaN(new Date(op.timestamp))) {
        issues.push(`Line ${index + 1}: Invalid timestamp format`);
      }
      
      validOps.push(op);
    } catch (error) {
      issues.push(`Line ${index + 1}: Invalid JSON - ${error.message}`);
    }
  });
  
  console.log(chalk.bold('Log Validation Results:'));
  console.log(`  Total lines: ${lines.length}`);
  console.log(`  Valid operations: ${validOps.length}`);
  console.log(`  Issues found: ${issues.length}`);
  
  if (issues.length > 0) {
    console.log(chalk.red('\nIssues:'));
    issues.forEach(issue => {
      console.log(`  ${chalk.red('•')} ${issue}`);
    });
  } else {
    console.log(chalk.green('  ✓ Log file is valid'));
  }
  
  return { 
    valid: issues.length === 0, 
    issues, 
    totalLines: lines.length, 
    validOps: validOps.length 
  };
}

module.exports = {
  deleteOperation,
  deleteMultiple,
  deleteAllUndone,
  deleteOlderThan,
  deleteOperationsByFile,
  compactLog,
  validateLog,
  createLogBackup
};
