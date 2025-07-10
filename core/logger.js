const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const logDir = path.resolve(__dirname, '..', 'logs');
const logPath = path.join(logDir, 'log.jsonl');

// Enhanced operation types matching ccundo sophistication
const OPERATION_TYPES = {
  FILE_CREATE: 'file_create',
  FILE_EDIT: 'file_edit', 
  FILE_DELETE: 'file_delete',
  COMMAND_EXECUTION: 'command_execution'
};

const OPERATION_MODES = {
  FULL_CONTENT: 'full_content',
  STRING_REPLACE: 'string_replace',
  FILE_CREATE: 'file_create',
  FILE_DELETE: 'file_delete',
  COMMAND: 'command'
};

const UNDO_STATES = {
  ACTIVE: 'active',
  UNDONE: 'undone'
};

function generateOperationId() {
  return `op_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Enhanced logging function with ccundo-style sophistication
function logOperation(operation) {
  const baseOp = {
    id: operation.id || generateOperationId(),
    timestamp: operation.timestamp || new Date().toISOString(),
    undoState: operation.undoState || UNDO_STATES.ACTIVE
  };

  // Validate and enhance operation based on type
  let enrichedOp;
  
  switch (operation.type) {
    case OPERATION_TYPES.FILE_EDIT:
      enrichedOp = {
        ...baseOp,
        type: OPERATION_TYPES.FILE_EDIT,
        file: operation.file,
        operation: operation.operation || OPERATION_MODES.FULL_CONTENT,
        ...(operation.operation === OPERATION_MODES.STRING_REPLACE ? {
          oldString: operation.oldString,
          newString: operation.newString,
          lineNumber: operation.lineNumber
        } : {
          before: operation.before,
          after: operation.after
        })
      };
      break;
      
    case OPERATION_TYPES.FILE_CREATE:
      enrichedOp = {
        ...baseOp,
        type: OPERATION_TYPES.FILE_CREATE,
        file: operation.file,
        operation: OPERATION_MODES.FILE_CREATE,
        after: operation.after || operation.content
      };
      break;
      
    case OPERATION_TYPES.FILE_DELETE:
      enrichedOp = {
        ...baseOp,
        type: OPERATION_TYPES.FILE_DELETE,
        file: operation.file,
        operation: OPERATION_MODES.FILE_DELETE,
        before: operation.before || operation.content
      };
      break;
      
    case OPERATION_TYPES.COMMAND_EXECUTION:
      enrichedOp = {
        ...baseOp,
        type: OPERATION_TYPES.COMMAND_EXECUTION,
        operation: OPERATION_MODES.COMMAND,
        command: operation.command,
        workingDirectory: operation.workingDirectory || process.cwd(),
        exitCode: operation.exitCode,
        output: operation.output
      };
      break;
      
    default:
      // Backward compatibility with old format
      enrichedOp = {
        ...baseOp,
        ...operation
      };
  }

  fs.ensureDirSync(logDir);
  fs.appendFileSync(logPath, JSON.stringify(enrichedOp) + '\n');
  
  return enrichedOp;
}

// Helper functions for different operation types
function logFileEdit(filePath, options = {}) {
  if (options.oldString && options.newString) {
    // String-based edit (ccundo style)
    return logOperation({
      type: OPERATION_TYPES.FILE_EDIT,
      file: filePath,
      operation: OPERATION_MODES.STRING_REPLACE,
      oldString: options.oldString,
      newString: options.newString,
      lineNumber: options.lineNumber
    });
  } else {
    // Full content edit (current gcundo style)
    return logOperation({
      type: OPERATION_TYPES.FILE_EDIT,
      file: filePath,
      operation: OPERATION_MODES.FULL_CONTENT,
      before: options.before,
      after: options.after
    });
  }
}

function logFileCreate(filePath, content) {
  return logOperation({
    type: OPERATION_TYPES.FILE_CREATE,
    file: filePath,
    after: content
  });
}

function logFileDelete(filePath, content) {
  return logOperation({
    type: OPERATION_TYPES.FILE_DELETE,
    file: filePath,
    before: content
  });
}

function logCommandExecution(command, options = {}) {
  return logOperation({
    type: OPERATION_TYPES.COMMAND_EXECUTION,
    command: command,
    workingDirectory: options.workingDirectory,
    exitCode: options.exitCode,
    output: options.output
  });
}

// Update operation undo state
function updateOperationUndoState(operationId, undoState) {
  // Read existing log
  if (!fs.existsSync(logPath)) return false;
  
  const lines = fs.readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());
    
  let updated = false;
  const updatedLines = lines.map(line => {
    try {
      const op = JSON.parse(line);
      if (op.id === operationId) {
        op.undoState = undoState;
        updated = true;
      }
      return JSON.stringify(op);
    } catch (e) {
      return line;
    }
  });
  
  if (updated) {
    fs.writeFileSync(logPath, updatedLines.join('\n') + '\n');
  }
  
  return updated;
}

module.exports = {
  logOperation,
  logFileEdit,
  logFileCreate, 
  logFileDelete,
  logCommandExecution,
  updateOperationUndoState,
  logPath,
  OPERATION_TYPES,
  OPERATION_MODES,
  UNDO_STATES
};
