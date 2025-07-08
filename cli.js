#!/usr/bin/env node

const chalk = require('chalk');
const { redoOperation } = require('./core/redo');
const { undoOperation } = require('./core/undo');
const { listOperations } = require('./core/list');
const { previewOperation } = require('./core/preview');
const { deleteOperation } = require('./core/delete');
const { listSessions, switchSession, saveCurrentSession } = require('./core/sessions');

(async () => {
  const cmd = process.argv[2];

  function printUsage() {
    console.log(
      'Usage: ' + chalk.green('gcundo') + ' [' +
        [
          chalk.cyan('list'),
          chalk.cyan('preview') + ' ' + chalk.yellow('<index>'),
          chalk.cyan('undo') + ' ' + chalk.yellow('<index>'),
          chalk.cyan('redo') + ' ' + chalk.yellow('<index>')
        ].join(' | ') + ']'
    );
  }

  if (!cmd || cmd === '--help' || cmd === '-h') {
      printUsage();
      return;
    }

    switch (cmd) {
    case 'list':
      await listOperations();
      break;

    case 'undo':
      await undoOperation(parseInt(process.argv[3], 10) - 1);
      break;

    case 'preview':
      await previewOperation(parseInt(process.argv[3], 10) - 1);
      break;

    case 'redo':
      await redoOperation(parseInt(process.argv[3], 10) - 1);
      break;

    case 'delete':
      await deleteOperation(parseInt(process.argv[3], 10) - 1);
      break;

    case 'sessions':
      await listSessions();
      break;

    case 'session:save':
      await saveCurrentSession(process.argv[3]);
      break;

    case 'session:switch':
      await switchSession(process.argv[3]);
      break;

    default:
      printUsage();
  }
})();
