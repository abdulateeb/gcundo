const fs = require('fs-extra');
const path = require('path');
const { logPath, OPERATION_TYPES, UNDO_STATES } = require('./logger');

// Enhanced operation loading with undo state filtering
function loadOperations() {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const lines = fs.readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());

  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (error) {
      console.warn('Failed to parse operation:', line);
      return null;
    }
  }).filter(op => op !== null);
}

// Get only active (non-undone) operations
function getActiveOperations() {
  return loadOperations().filter(op => 
    op.undoState === UNDO_STATES.ACTIVE || !op.undoState // backward compatibility
  );
}

// Get undone operations for redo functionality
function getUndoneOperations() {
  return loadOperations().filter(op => 
    op.undoState === UNDO_STATES.UNDONE
  );
}

// Enhanced operation filtering by file
function getOperationsForFile(filePath, activeOnly = true) {
  const operations = activeOnly ? getActiveOperations() : loadOperations();
  return operations.filter(op => {
    // Handle different operation types
    switch (op.type) {
      case OPERATION_TYPES.FILE_EDIT:
      case OPERATION_TYPES.FILE_CREATE:
      case OPERATION_TYPES.FILE_DELETE:
        return op.file === filePath;
      case OPERATION_TYPES.COMMAND_EXECUTION:
        // Commands don't target specific files
        return false;
      default:
        // Backward compatibility
        return op.file === filePath;
    }
  });
}

// Get operations by type
function getOperationsByType(operationType, activeOnly = true) {
  const operations = activeOnly ? getActiveOperations() : loadOperations();
  return operations.filter(op => op.type === operationType);
}

// Enhanced operation retrieval with sophisticated filtering
function getLastOperations(count = 10, activeOnly = true) {
  const operations = activeOnly ? getActiveOperations() : loadOperations();
  return operations
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, count);
}

// Get operation by ID
function getOperationById(operationId) {
  const operations = loadOperations();
  return operations.find(op => op.id === operationId);
}

// Get operations in chronological order for cascading undo
function getOperationsAfter(targetOperation) {
  const operations = getActiveOperations();
  const targetTime = new Date(targetOperation.timestamp);
  
  return operations
    .filter(op => new Date(op.timestamp) > targetTime)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// Enhanced session statistics
function getSessionStats() {
  const allOperations = loadOperations();
  const activeOperations = getActiveOperations();
  const undoneOperations = getUndoneOperations();
  
  const stats = {
    total: allOperations.length,
    active: activeOperations.length,
    undone: undoneOperations.length,
    byType: {}
  };
  
  // Count by operation type
  Object.values(OPERATION_TYPES).forEach(type => {
    stats.byType[type] = {
      total: allOperations.filter(op => op.type === type).length,
      active: activeOperations.filter(op => op.type === type).length,
      undone: undoneOperations.filter(op => op.type === type).length
    };
  });
  
  return stats;
}

// Get file modification history
function getFileHistory(filePath) {
  const fileOperations = getOperationsForFile(filePath, false); // include undone operations
  return fileOperations
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(op => ({
      id: op.id,
      timestamp: op.timestamp,
      type: op.type,
      operation: op.operation,
      undoState: op.undoState,
      summary: generateOperationSummary(op)
    }));
}

// Generate human-readable operation summary
function generateOperationSummary(operation) {
  switch (operation.type) {
    case OPERATION_TYPES.FILE_CREATE:
      return `Created file`;
    case OPERATION_TYPES.FILE_DELETE:
      return `Deleted file`;
    case OPERATION_TYPES.FILE_EDIT:
      if (operation.operation === 'string_replace') {
        return `Replaced "${operation.oldString.substring(0, 30)}..." with "${operation.newString.substring(0, 30)}..."`;
      } else {
        return `Modified file content`;
      }
    case OPERATION_TYPES.COMMAND_EXECUTION:
      return `Executed: ${operation.command}`;
    default:
      return `${operation.type} operation`;
  }
}

// Check if file has any tracked operations
function hasFileOperations(filePath) {
  return getOperationsForFile(filePath).length > 0;
}

// Get recent activity summary for CLI display
function getRecentActivity(count = 5) {
  return getLastOperations(count).map(op => ({
    id: op.id,
    timestamp: op.timestamp,
    type: op.type,
    file: op.file,
    summary: generateOperationSummary(op),
    undoState: op.undoState
  }));
}

module.exports = {
  loadOperations,
  getActiveOperations,
  getUndoneOperations,
  getOperationsForFile,
  getOperationsByType,
  getLastOperations,
  getOperationById,
  getOperationsAfter,
  getSessionStats,
  getFileHistory,
  generateOperationSummary,
  hasFileOperations,
  getRecentActivity
};
