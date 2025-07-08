const fs = require('fs-extra');
const path = require('path');const os = require('os');

const configDir = path.join(os.homedir(), '.gcundo');
const sessionsDir = path.join(configDir, 'sessions');
const logPath = path.join(configDir, 'log.jsonl');
const sessionStatePath = path.join(configDir, 'current-session.txt');

// Ensure required directories
fs.ensureDirSync(sessionsDir);

// Helper to get session path
function getSessionPath(name) {
  return path.join(sessionsDir, `${name}.jsonl`);
}

// List all sessions
async function listSessions() {
  const files = await fs.readdir(sessionsDir);
  const current = await getCurrentSession();
  if (!files.length) {
    console.log('No sessions found.');
    return;
  }
  console.log('Available sessions:\n');
  for (const file of files) {
    const sessionName = path.basename(file, '.jsonl');
    const mark = sessionName === current ? '*' : ' ';
    console.log(`${mark} ${sessionName}`);
  }
}

// Save current log.jsonl as a named session
async function saveCurrentSession(name) {
  if (!name) {
    console.log('Please provide a session name.');
    return;
  }
  const dest = getSessionPath(name);
  if (!fs.existsSync(logPath)) {
    console.log('No current session to save.');
    return;
  }
  await fs.copyFile(logPath, dest);
  await fs.writeFile(sessionStatePath, name);
  console.log(`Saved session as: ${name}`);
}

// Switch to a session
async function switchSession(name) {
  const source = getSessionPath(name);
  if (!fs.existsSync(source)) {
    console.log(`Session not found: ${name}`);
    return;
  }
  await fs.copyFile(source, logPath);
  await fs.writeFile(sessionStatePath, name);
  console.log(`Switched to session: ${name}`);
}

// Get current session name
async function getCurrentSession() {
  try {
    return (await fs.readFile(sessionStatePath, 'utf-8')).trim();
  } catch {
    return null;
  }
}

module.exports = {
  listSessions,
  switchSession,
  saveCurrentSession,
  getCurrentSession,
};
