#!/usr/bin/env node

const chalk = require('chalk');
const { redoOperation, redoLast } = require('./core/redo');
const { undoOperation, undoLast } = require('./core/undo');
const { listOperations } = require('./core/list');
const { previewOperation } = require('./core/preview');
const { deleteOperation } = require('./core/delete');
const { 
  getSessionStats, 
  getRecentActivity,
  getFileHistory,
  generateOperationSummary 
} = require('./core/sessions');
const { 
  logFileEdit, 
  logFileCreate, 
  logFileDelete, 
  logCommandExecution,
  OPERATION_TYPES,
  OPERATION_MODES 
} = require('./core/logger');
const FileSystemMonitor = require('./core/monitor');

(async () => {
  const cmd = process.argv[2];
  const arg = process.argv[3];

  function printUsage() {
    console.log(chalk.bold('gcundo - Sophisticated Undo/Redo for Gemini CLI\n'));
    console.log('Usage: ' + chalk.green('gcundo') + ' ' + chalk.cyan('<command>') + ' [options]\n');
    
    console.log(chalk.bold('Core Commands:'));
    console.log('  ' + chalk.cyan('list') + '                    List recent operations');
    console.log('  ' + chalk.cyan('undo') + ' ' + chalk.yellow('[id|index]') + '       Undo operation (last if no arg)');
    console.log('  ' + chalk.cyan('redo') + ' ' + chalk.yellow('[id|index]') + '       Redo operation (last undone if no arg)');
    console.log('  ' + chalk.cyan('preview') + ' ' + chalk.yellow('<id|index>') + '     Preview operation effects');
    console.log('  ' + chalk.cyan('delete') + ' ' + chalk.yellow('<id|index>') + '      Delete operation from log');
    
    console.log(chalk.bold('\nInformation Commands:'));
    console.log('  ' + chalk.cyan('stats') + '                    Show session statistics');
    console.log('  ' + chalk.cyan('recent') + '                   Show recent activity');
    console.log('  ' + chalk.cyan('history') + ' ' + chalk.yellow('<file>') + '       Show file modification history');
    
    console.log(chalk.bold('\nAutomatic Monitoring:'));
    console.log('  ' + chalk.cyan('monitor:start') + '             Start automatic filesystem monitoring');
    console.log('  ' + chalk.cyan('monitor:stop') + '              Stop automatic filesystem monitoring');
    console.log('  ' + chalk.cyan('monitor:status') + '            Show monitoring status');
    
    console.log(chalk.bold('\nAdvanced Logging (for manual integration):'));
    console.log('  ' + chalk.cyan('log:edit') + ' ' + chalk.yellow('<file>') + '       Log file edit operation');
    console.log('  ' + chalk.cyan('log:create') + ' ' + chalk.yellow('<file>') + '     Log file creation');
    console.log('  ' + chalk.cyan('log:delete') + ' ' + chalk.yellow('<file>') + '     Log file deletion');
    console.log('  ' + chalk.cyan('log:command') + ' ' + chalk.yellow('<cmd>') + '      Log command execution');
    
    console.log(chalk.bold('\nExamples:'));
    console.log('  ' + chalk.green('gcundo list') + '                     # List recent operations');
    console.log('  ' + chalk.green('gcundo undo') + '                      # Undo last operation');
    console.log('  ' + chalk.green('gcundo undo op_1234567890') + '        # Undo specific operation');
    console.log('  ' + chalk.green('gcundo redo 3') + '                    # Redo operation at index 3');
    console.log('  ' + chalk.green('gcundo monitor:start') + '             # Start automatic monitoring');
    console.log('  ' + chalk.green('gcundo log:edit src/index.js') + '     # Manually log file edit');
  }

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printUsage();
    return;
  }

  // Create monitor instance
  const monitor = new FileSystemMonitor();

  try {
    switch (cmd) {
      case 'list':
        await listOperations(arg);
        break;

      case 'undo':
        if (!arg) {
          // Undo last operation
          const result = await undoLast();
          console.log(chalk.green(`✓ Undone: ${generateOperationSummary(result.undone)}`));
          if (result.cascading?.length > 0) {
            console.log(chalk.yellow(`  Also undone ${result.cascading.length} cascading operations`));
          }
        } else {
          // Undo specific operation (by ID or index)
          const result = await undoOperation(arg);
          console.log(chalk.green(`✓ Undone: ${generateOperationSummary(result.undone)}`));
          if (result.cascading?.length > 0) {
            console.log(chalk.yellow(`  Also undone ${result.cascading.length} cascading operations`));
          }
        }
        break;

      case 'redo':
        if (!arg) {
          // Redo last undone operation
          const result = await redoLast();
          console.log(chalk.green(`✓ Redone: ${generateOperationSummary(result.redone)}`));
        } else {
          // Redo specific operation (by ID or index)
          const result = await redoOperation(arg);
          console.log(chalk.green(`✓ Redone: ${generateOperationSummary(result.redone)}`));
        }
        break;

      case 'preview':
        if (!arg) {
          console.log(chalk.red('Error: Preview requires an operation ID or index'));
          return;
        }
        await previewOperation(arg);
        break;

      case 'delete':
        if (!arg) {
          console.log(chalk.red('Error: Delete requires an operation ID or index'));
          return;
        }
        await deleteOperation(arg);
        break;

      case 'stats':
        const stats = getSessionStats();
        console.log(chalk.bold('Session Statistics:'));
        console.log(`  Total operations: ${stats.total}`);
        console.log(`  Active operations: ${stats.active}`);
        console.log(`  Undone operations: ${stats.undone}`);
        console.log(chalk.bold('\nBy Type:'));
        Object.entries(stats.byType).forEach(([type, counts]) => {
          if (counts.total > 0) {
            console.log(`  ${type}: ${counts.active}/${counts.total} active`);
          }
        });
        break;

      case 'recent':
        const activity = getRecentActivity(parseInt(arg) || 10);
        console.log(chalk.bold('Recent Activity:'));
        activity.forEach((op, i) => {
          const status = op.undoState === 'undone' ? chalk.gray('(undone)') : '';
          const timestamp = new Date(op.timestamp).toLocaleTimeString();
          console.log(`  ${i + 1}. [${timestamp}] ${op.summary} ${status}`);
        });
        break;

      case 'history':
        if (!arg) {
          console.log(chalk.red('Error: History requires a file path'));
          return;
        }
        const history = getFileHistory(arg);
        console.log(chalk.bold(`File History: ${arg}`));
        history.forEach((op, i) => {
          const status = op.undoState === 'undone' ? chalk.gray('(undone)') : '';
          const timestamp = new Date(op.timestamp).toLocaleTimeString();
          console.log(`  ${i + 1}. [${timestamp}] ${op.summary} ${status}`);
        });
        break;

      // Monitor commands
      case 'monitor:start':
        const startResult = await monitor.start();
        if (startResult) {
          console.log(chalk.green('Filesystem monitoring started'));
          console.log(chalk.gray('Use Ctrl+C to stop monitoring or run "gcundo monitor:stop"'));
          
          // Keep the process alive for monitoring
          process.on('SIGINT', async () => {
            console.log(chalk.yellow('\n📡 Stopping monitor...'));
            await monitor.stop();
            process.exit(0);
          });
          
          // Keep running until manually stopped
          await new Promise(() => {}); // Infinite wait
        }
        break;

      case 'monitor:stop':
        const stopResult = await monitor.stop();
        if (stopResult) {
          console.log(chalk.green('Filesystem monitoring stopped'));
        }
        break;

      case 'monitor:status':
        const status = monitor.getStatus();
        console.log(chalk.bold('Monitor Status:'));
        console.log(`  Active: ${status.isActive ? chalk.green('Yes') : chalk.red('No')}`);
        if (status.isActive) {
          console.log(`  Watching: ${status.config.watchPath}`);
          console.log(`  Files watched: ${status.stats.filesWatched}`);
          console.log(`  Operations logged: ${status.stats.operationsLogged}`);
          if (status.stats.uptime) {
            const uptimeStr = Math.floor(status.stats.uptime / 1000);
            console.log(`  Uptime: ${uptimeStr}s`);
          }
          if (status.stats.lastActivity) {
            const lastActivity = new Date(status.stats.lastActivity).toLocaleTimeString();
            console.log(`  Last activity: ${lastActivity}`);
          }
        }
        break;

      // Manual logging commands
      case 'log:edit':
        if (!arg) {
          console.log(chalk.red('Error: log:edit requires a file path'));
          return;
        }
        const editOptions = {
          oldString: process.argv[4],
          newString: process.argv[5],
          lineNumber: parseInt(process.argv[6])
        };
        
        if (editOptions.oldString && editOptions.newString) {
          // String-based edit
          const op = logFileEdit(arg, editOptions);
          console.log(chalk.green(`✓ Logged string-based edit: ${op.id}`));
        } else {
          console.log(chalk.yellow('Note: For string-based edits, use:'));
          console.log(chalk.cyan(`gcundo log:edit <file> "<oldString>" "<newString>" [lineNumber]`));
          console.log(chalk.yellow('For full-content edits, use the logger.js API directly'));
        }
        break;

      case 'log:create':
        if (!arg) {
          console.log(chalk.red('Error: log:create requires a file path'));
          return;
        }
        const createOp = logFileCreate(arg, process.argv[4] || '');
        console.log(chalk.green(`✓ Logged file creation: ${createOp.id}`));
        break;

      case 'log:delete':
        if (!arg) {
          console.log(chalk.red('Error: log:delete requires a file path'));
          return;
        }
        const deleteOp = logFileDelete(arg, process.argv[4] || '');
        console.log(chalk.green(`✓ Logged file deletion: ${deleteOp.id}`));
        break;

      case 'log:command':
        if (!arg) {
          console.log(chalk.red('Error: log:command requires a command'));
          return;
        }
        const cmdOp = logCommandExecution(arg, {
          workingDirectory: process.cwd(),
          exitCode: parseInt(process.argv[4]) || 0,
          output: process.argv[5] || ''
        });
        console.log(chalk.green(`✓ Logged command execution: ${cmdOp.id}`));
        break;

      // Legacy session commands (if needed)
      case 'sessions':
        console.log(chalk.yellow('Session management has been simplified in the enhanced version.'));
        console.log('All operations are tracked in a single log with undo state management.');
        break;

      default:
        console.log(chalk.red(`Unknown command: ${cmd}`));
        printUsage();
    }
  } catch (error) {
    console.log(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
})();
