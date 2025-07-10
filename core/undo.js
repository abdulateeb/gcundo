const fs = require('fs-extra');
const path = require('path');
const { updateOperationUndoState, OPERATION_TYPES, OPERATION_MODES, UNDO_STATES } = require('./logger');
const { 
  getActiveOperations, 
  getUndoneOperations, 
  getOperationById, 
  getOperationsAfter 
} = require('./sessions');

// Enhanced undo with sophisticated operation handling
async function undoOperation(operationId) {
  const operation = getOperationById(operationId);
  if (!operation) {
    throw new Error(`Operation not found: ${operationId}`);
  }

  if (operation.undoState === UNDO_STATES.UNDONE) {
    throw new Error(`Operation ${operationId} is already undone`);
  }

  // Get operations that need to be undone due to cascading
  const cascadingOps = getOperationsAfter(operation);
  
  // Undo cascading operations first (in reverse order)
  for (const cascadingOp of cascadingOps.reverse()) {
    if (cascadingOp.undoState === UNDO_STATES.ACTIVE) {
      await performUndo(cascadingOp);
    }
  }
  
  // Undo the target operation
  await performUndo(operation);
  
  return {
    undone: operation,
    cascading: cascadingOps.filter(op => op.undoState === UNDO_STATES.ACTIVE)
  };
}

// Enhanced redo with sophisticated operation handling
async function redoOperation(operationId) {
  const operation = getOperationById(operationId);
  if (!operation) {
    throw new Error(`Operation not found: ${operationId}`);
  }

  if (operation.undoState === UNDO_STATES.ACTIVE) {
    throw new Error(`Operation ${operationId} is already active`);
  }

  await performRedo(operation);
  
  return { redone: operation };
}

// Perform the actual undo based on operation type
async function performUndo(operation) {
  try {
    switch (operation.type) {
      case OPERATION_TYPES.FILE_EDIT:
        await undoFileEdit(operation);
        break;
      case OPERATION_TYPES.FILE_CREATE:
        await undoFileCreate(operation);
        break;
      case OPERATION_TYPES.FILE_DELETE:
        await undoFileDelete(operation);
        break;
      case OPERATION_TYPES.COMMAND_EXECUTION:
        await undoCommandExecution(operation);
        break;
      default:
        // Backward compatibility with old format
        await undoLegacyOperation(operation);
    }
    
    // Mark operation as undone
    updateOperationUndoState(operation.id, UNDO_STATES.UNDONE);
    
  } catch (error) {
    throw new Error(`Failed to undo operation ${operation.id}: ${error.message}`);
  }
}

// Perform the actual redo based on operation type
async function performRedo(operation) {
  try {
    switch (operation.type) {
      case OPERATION_TYPES.FILE_EDIT:
        await redoFileEdit(operation);
        break;
      case OPERATION_TYPES.FILE_CREATE:
        await redoFileCreate(operation);
        break;
      case OPERATION_TYPES.FILE_DELETE:
        await redoFileDelete(operation);
        break;
      case OPERATION_TYPES.COMMAND_EXECUTION:
        await redoCommandExecution(operation);
        break;
      default:
        // Backward compatibility with old format
        await redoLegacyOperation(operation);
    }
    
    // Mark operation as active
    updateOperationUndoState(operation.id, UNDO_STATES.ACTIVE);
    
  } catch (error) {
    throw new Error(`Failed to redo operation ${operation.id}: ${error.message}`);
  }
}

// Undo file edit operations
async function undoFileEdit(operation) {
  const filePath = operation.file;
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (operation.operation === OPERATION_MODES.STRING_REPLACE) {
    // Handle string-based edit (ccundo style)
    await undoStringReplace(operation);
  } else {
    // Handle full content edit (current gcundo style)
    await undoFullContentEdit(operation);
  }
}

// Undo string replacement operation
async function undoStringReplace(operation) {
  const filePath = operation.file;
  const currentContent = await fs.readFile(filePath, 'utf-8');
  
  // Replace newString back to oldString
  const restoredContent = currentContent.replace(operation.newString, operation.oldString);
  
  if (restoredContent === currentContent) {
    console.warn(`Warning: String replacement undo may not have applied correctly for ${filePath}`);
  }
  
  await createBackup(filePath);
  await fs.writeFile(filePath, restoredContent);
}

// Undo full content edit operation
async function undoFullContentEdit(operation) {
  const filePath = operation.file;
  
  if (!operation.before) {
    throw new Error(`No 'before' content available for operation ${operation.id}`);
  }
  
  await createBackup(filePath);
  await fs.writeFile(filePath, operation.before);
}

// Redo file edit operations
async function redoFileEdit(operation) {
  const filePath = operation.file;
  
  if (operation.operation === OPERATION_MODES.STRING_REPLACE) {
    // Handle string-based edit
    await redoStringReplace(operation);
  } else {
    // Handle full content edit
    await redoFullContentEdit(operation);
  }
}

// Redo string replacement operation
async function redoStringReplace(operation) {
  const filePath = operation.file;
  const currentContent = await fs.readFile(filePath, 'utf-8');
  
  // Replace oldString back to newString
  const redoneContent = currentContent.replace(operation.oldString, operation.newString);
  
  await createBackup(filePath);
  await fs.writeFile(filePath, redoneContent);
}

// Redo full content edit operation
async function redoFullContentEdit(operation) {
  const filePath = operation.file;
  
  if (!operation.after) {
    throw new Error(`No 'after' content available for operation ${operation.id}`);
  }
  
  await createBackup(filePath);
  await fs.writeFile(filePath, operation.after);
}

// Undo file creation
async function undoFileCreate(operation) {
  const filePath = operation.file;
  
  if (fs.existsSync(filePath)) {
    await createBackup(filePath);
    await fs.remove(filePath);
  }
}

// Redo file creation
async function redoFileCreate(operation) {
  const filePath = operation.file;
  
  if (!operation.after) {
    throw new Error(`No content available for file creation: ${operation.id}`);
  }
  
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, operation.after);
}

// Undo file deletion
async function undoFileDelete(operation) {
  const filePath = operation.file;
  
  if (!operation.before) {
    throw new Error(`No content available to restore deleted file: ${operation.id}`);
  }
  
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, operation.before);
}

// Redo file deletion
async function redoFileDelete(operation) {
  const filePath = operation.file;
  
  if (fs.existsSync(filePath)) {
    await createBackup(filePath);
    await fs.remove(filePath);
  }
}

// Command execution undo (limited - mainly for logging)
async function undoCommandExecution(operation) {
  console.warn(`Cannot automatically undo command execution: ${operation.command}`);
  console.warn(`This operation has been marked as undone for tracking purposes only.`);
  // Commands cannot be automatically undone - this is for state tracking only
}

// Command execution redo (limited - mainly for logging)
async function redoCommandExecution(operation) {
  console.warn(`Cannot automatically redo command execution: ${operation.command}`);
  console.warn(`You may need to manually re-run: ${operation.command}`);
  // Commands cannot be automatically redone - this is for state tracking only
}

// Backward compatibility for old operation format
async function undoLegacyOperation(operation) {
  if (operation.type === 'file_edit' && operation.before) {
    await createBackup(operation.file);
    await fs.writeFile(operation.file, operation.before);
  } else if (operation.type === 'file_create') {
    if (fs.existsSync(operation.file)) {
      await createBackup(operation.file);
      await fs.remove(operation.file);
    }
  } else if (operation.type === 'file_delete' && operation.before) {
    await fs.ensureDir(path.dirname(operation.file));
    await fs.writeFile(operation.file, operation.before);
  }
}

// Backward compatibility for old operation format redo
async function redoLegacyOperation(operation) {
  if (operation.type === 'file_edit' && operation.after) {
    await createBackup(operation.file);
    await fs.writeFile(operation.file, operation.after);
  } else if (operation.type === 'file_create' && operation.after) {
    await fs.ensureDir(path.dirname(operation.file));
    await fs.writeFile(operation.file, operation.after);
  } else if (operation.type === 'file_delete') {
    if (fs.existsSync(operation.file)) {
      await createBackup(operation.file);
      await fs.remove(operation.file);
    }
  }
}

// Create backup before modifying files
async function createBackup(filePath) {
  if (!fs.existsSync(filePath)) return;
  
  const backupDir = path.resolve(__dirname, '..', 'backups');
  await fs.ensureDir(backupDir);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.bak`);
  
  await fs.copyFile(filePath, backupPath);
}

// Undo the last operation
async function undoLast() {
  const activeOps = getActiveOperations();
  if (activeOps.length === 0) {
    throw new Error('No operations to undo');
  }
  
  // Get the most recent operation
  const lastOp = activeOps.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  return await undoOperation(lastOp.id);
}

// Redo the last undone operation  
async function redoLast() {
  const undoneOps = getUndoneOperations();
  if (undoneOps.length === 0) {
    throw new Error('No operations to redo');
  }
  
  // Get the most recently undone operation
  const lastUndone = undoneOps.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  return await redoOperation(lastUndone.id);
}

module.exports = {
  undoOperation,
  redoOperation,
  undoLast,
  redoLast,
  performUndo,
  performRedo,
  createBackup
};
