const { updateOperationUndoState, UNDO_STATES } = require('./logger');
const { 
  getUndoneOperations, 
  getOperationById, 
  getActiveOperations 
} = require('./sessions');
const { performRedo } = require('./undo');

// Redo operation by ID or index
async function redoOperation(operationIdOrIndex) {
  let operation;
  
  // Check if it's an operation ID (starts with 'op_') or an index
  if (typeof operationIdOrIndex === 'string' && operationIdOrIndex.startsWith('op_')) {
    // Operation ID
    operation = getOperationById(operationIdOrIndex);
    if (!operation) {
      throw new Error(`Operation not found: ${operationIdOrIndex}`);
    }
  } else {
    // Index (convert to 0-based)
    const index = parseInt(operationIdOrIndex, 10);
    if (isNaN(index)) {
      throw new Error(`Invalid operation identifier: ${operationIdOrIndex}`);
    }
    
    const undoneOps = getUndoneOperations()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    if (index < 0 || index >= undoneOps.length) {
      throw new Error(`Invalid operation index: ${index + 1}. Available: 1-${undoneOps.length}`);
    }
    
    operation = undoneOps[index];
  }

  if (operation.undoState === UNDO_STATES.ACTIVE) {
    throw new Error(`Operation ${operation.id} is already active`);
  }

  await performRedo(operation);
  
  return { redone: operation };
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

// Redo multiple operations by their IDs
async function redoMultiple(operationIds) {
  const results = [];
  
  for (const id of operationIds) {
    try {
      const result = await redoOperation(id);
      results.push({ success: true, ...result });
    } catch (error) {
      results.push({ success: false, id, error: error.message });
    }
  }
  
  return results;
}

// Redo all undone operations (use with caution)
async function redoAll() {
  const undoneOps = getUndoneOperations()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Redo in chronological order
  
  if (undoneOps.length === 0) {
    throw new Error('No operations to redo');
  }
  
  const results = [];
  
  for (const operation of undoneOps) {
    try {
      await performRedo(operation);
      results.push({ success: true, redone: operation });
    } catch (error) {
      results.push({ success: false, operation: operation.id, error: error.message });
      // Stop on first error to maintain consistency
      break;
    }
  }
  
  return { redone: results.filter(r => r.success).length, results };
}

module.exports = {
  redoOperation,
  redoLast,
  redoMultiple,
  redoAll
};
