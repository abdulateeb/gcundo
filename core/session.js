const fs = require('fs-extra');
const path = require('path');
const { logPath } = require('./logger');

/**
 * Load all operations logged in logs/log.jsonl.
 * @returns {Promise<Array<object>>} Array of operation objects.
 */
async function loadOperations() {
  // If the log file does not exist yet, return empty list
  if (!await fs.pathExists(logPath)) {
    return [];
  }

  const data = await fs.readFile(logPath, 'utf-8');
  return data
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (err) {
        // Skip malformed lines silently
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Persist the provided operations array back to logs/log.jsonl.
 * Each operation is stringified onto its own line.
 * @param {Array<object>} ops Array of operation objects to store.
 * @returns {Promise<void>}
 */
async function saveOperations(ops) {
  if (!Array.isArray(ops)) {
    throw new TypeError('saveOperations expects an array');
  }

  const dir = path.dirname(logPath);
  await fs.ensureDir(dir);

  const content = ops.map(op => JSON.stringify(op)).join('\n') + '\n';
  await fs.writeFile(logPath, content, 'utf-8');
}

// Simple in-memory session identifier (placeholder for future use)
let _sessionId = null;
function getCurrentSessionId() {
  if (!_sessionId) {
    _sessionId = process.env.GCUNDO_SESSION_ID || `session_${Date.now()}`;
  }
  return _sessionId;
}

module.exports = {
  loadOperations,
  saveOperations,
  // getCurrentSessionId is intentionally not exported yet; expose when needed
};
